import { StoreData, FlowNotification } from '@/types/store';
import { allowedNotifications, wantsNotification } from '@/lib/notification-gate';
import { isServiceFirstBusiness, resolveBusinessType } from '@/lib/business-runtime';
import { laundryFlow } from '@/lib/laundry-flow';
import { dailySeries } from './forecast';
import { analyzeSales } from './sales';
import { inventoryIntelligence } from './stock';
import { flowBundles } from './advice';

// ─── Flow Personality — Greeting ───────────────────────────────────────────────
export function flowGreeting(store: StoreData): string {
  const hour = new Date().getHours();
  const name = store.storeName;
  // A laundry does not "sell" and does not "log sales": it records work.
  const isService = isServiceFirstBusiness(store);
  const workNoun = isService ? 'work' : 'sales';
  const series7 = dailySeries(store, 7);
  const rev7 = series7.reduce((s, d) => s + d.revenue, 0);
  const todaySales = store.sales.filter(s => s.date.startsWith(new Date().toISOString().split('T')[0])).length;

  const greetings: Record<string, string[]> = {
    morning: [
      `Good morning! Let's make today great for ${name}.`,
      isService ? `Morning! ${name} is open — let's get to work.` : `Morning! Your store is ready — let's sell.`,
      `Rise and shine! It's a new day to grow ${name}.`,
    ],
    afternoon: [
      `Good afternoon. How's ${name} doing today?`,
      `Afternoon check-in — keep the momentum going!`,
      todaySales > 0 ? `Nice work — ${todaySales} ${isService ? 'job' : 'sale'}${todaySales > 1 ? 's' : ''} so far today. Keep it up!` : `Afternoon! No ${workNoun} logged yet — let's change that.`,
    ],
    evening: [
      rev7 > 0 ? `Evening! Your store made ₦${rev7.toLocaleString()} this week.` : `Evening! Record your ${workNoun} so I can help you track progress.`,
      `Good evening. Let's review how the day went.`,
    ],
    night: [
      `Night shift? I'm here. ${name} is in good hands.`,
      `Late night. Make sure everything is tallied for today.`,
    ],
  };

  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const pool = greetings[period];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Restock Quality Check ──────────────────────────────────────────────────
// Restocking is buying inventory to resell for profit — a healthy, expected
// action, not overspending. It should only ever prompt caution when the
// merchant is pouring money into a specific product that isn't actually
// selling. This inspects the most recent restock batch and reacts to what
// was actually restocked, instead of a blanket "spending is high" warning
// that fires just because a restock created a big expense entry.
export function latestRestockBatch(store: StoreData): { productNames: string[]; total: number; date: string } | null {
  const restocks = store.restocks || [];
  if (restocks.length === 0) return null;
  const latest = restocks[0]; // newest first
  const batch = latest.batchId ? restocks.filter(r => r.batchId === latest.batchId) : [latest];
  return {
    productNames: [...new Set(batch.map(r => r.productName))],
    total: batch.reduce((s, r) => s + r.total, 0),
    date: latest.date,
  };
}

export function restockQualityNote(store: StoreData): FlowNotification | null {
  const batch = latestRestockBatch(store);
  if (!batch) return null;
  // Feedback on a restock should feel immediate — only react to what just
  // happened, not a restock from days ago.
  if (Date.now() - new Date(batch.date).getTime() > 2 * 86400000) return null;

  const analysis = analyzeSales(store);
  const neverSoldNames = new Set(analysis.neverSold.map(p => p.name));
  const slowMoverNames = new Set(analysis.slowMovers.map(p => p.name));
  const fastMoverNames = new Set(analysis.fastMovers.map(p => p.name));

  const deadRestocked = batch.productNames.filter(n => neverSoldNames.has(n));
  const slowRestocked = batch.productNames.filter(n => slowMoverNames.has(n) && !deadRestocked.includes(n));
  const fastRestocked = batch.productNames.filter(n => fastMoverNames.has(n));

  const now = new Date().toISOString();
  const batchKey = new Date(batch.date).getTime();

  if (deadRestocked.length > 0) {
    return {
      id: `restock-dead-${batchKey}`,
      icon: '😴',
      text: `You restocked ${deadRestocked[0]}${deadRestocked.length > 1 ? ` and ${deadRestocked.length - 1} other item(s)` : ''} that hasn't been selling. Consider holding off until demand picks up.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Restock Check',
      description: `${deadRestocked.join(', ')} ${deadRestocked.length > 1 ? "haven't" : "hasn't"} sold in a while. Restocking dead stock ties up cash — a discount to move it might work better than buying more.`,
      actionLabel: 'View Inventory',
      actionTab: 'inventory',
    };
  }

  if (slowRestocked.length > 0 && fastRestocked.length === 0) {
    return {
      id: `restock-slow-${batchKey}`,
      icon: '🤔',
      text: `${slowRestocked[0]} has been moving slowly. Worth watching demand before restocking it again.`,
      tone: 'info',
      date: now,
      read: false,
      title: 'Restock Check',
      description: `${slowRestocked.join(', ')} sold fewer than 3 units in the last 30 days.`,
      actionLabel: 'View Inventory',
      actionTab: 'inventory',
    };
  }

  // Default (and the common case): this was a healthy restock of products
  // that actually sell — this deserves a positive note, not a warning.
  return {
    id: `restock-good-${batchKey}`,
    icon: '✅',
    text: `Nice restocking! ₦${batch.total.toLocaleString()} in fresh stock ready to sell.`,
    tone: 'success',
    date: now,
    read: false,
    title: 'Restock Complete',
    description: `You restocked ${batch.productNames.slice(0, 3).join(', ')}${batch.productNames.length > 3 ? ` +${batch.productNames.length - 3} more` : ''}. Buying stock to resell is good for business.`,
    actionLabel: 'View Inventory',
    actionTab: 'inventory',
  };
}

export interface RestockScoreResult {
  score: number; // 0-100, higher is better
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  totalSpend90d: number;
  wastedSpend90d: number;
  goodSpend90d: number;
  wastedItems: { name: string; spend: number }[];
}

// ─── Weekly Auto Restock Draft ──────────────────────────────────────────────
// Instead of requiring a merchant to remember to open Smart Restock every
// week, this generates a notification once every 7 days (if there's
// actually anything worth restocking) pointing them straight at a fresh
// draft. Tapping it opens Smart Restock Engine directly (see actionParam
// 'openRestock', handled in Index.tsx/Inventory.tsx) rather than just the
// Inventory tab, so there's nothing extra to remember or click through.
export function checkWeeklyRestockDraft(store: StoreData): StoreData | null {
  const settings = store.managerSettings;
  if (!settings?.enabled) return null; // respect the manager/AI features toggle

  const last = settings.lastAutoRestockDraftDate ? new Date(settings.lastAutoRestockDraftDate).getTime() : 0;
  const sevenDays = 7 * 86400000;
  if (Date.now() - last < sevenDays) return null;

  const needsRestock = inventoryIntelligence(store);
  if (needsRestock.length === 0) {
    // Nothing to restock right now — don't nag, but still push the clock
    // forward so we check again in another 7 days rather than every load.
    return {
      ...store,
      managerSettings: { ...settings, lastAutoRestockDraftDate: new Date().toISOString() },
    };
  }

  const topNames = needsRestock.slice(0, 3).map(f => f.product.name).join(', ');
  const notification: FlowNotification = {
    id: `weekly-restock-${Date.now()}`,
    icon: '📦',
    text: `Your weekly restock draft is ready — ${needsRestock.length} product${needsRestock.length > 1 ? 's' : ''} could use restocking.`,
    tone: 'info',
    date: new Date().toISOString(),
    read: false,
    title: 'Weekly Restock Draft',
    description: `Including ${topNames}${needsRestock.length > 3 ? ` and ${needsRestock.length - 3} more` : ''}. Tap to review and approve a buy list.`,
    actionLabel: 'Review Draft',
    actionTab: 'inventory',
    actionParam: 'openRestock',
    category: 'recommendation',
  };

  // A shop that switched recommendations off does not get one anyway.
  if (!wantsNotification(store, 'recommendation')) return null;

  return {
    ...store,
    managerSettings: { ...settings, lastAutoRestockDraftDate: new Date().toISOString() },
    flowNotifications: [notification, ...(store.flowNotifications || [])],
  };
}

// ─── Cash Balance Breakdown ─────────────────────────────────────────────────
// Cash/Bank/Wallet balances are a running ledger, not one single event, so
// "why is it this number" has no single answer — it's built from every sale
// payment, expense, restock, loan, investment, and withdrawal ever
// recorded. This reconstructs the contributing totals directly from the
// same source records the app's own balance math reads, so it's an honest,
// independently-checkable answer rather than a vague description.
//
// Two known limits, called out in the UI rather than hidden: loan
// repayments aren't logged as discrete historical events (only the
// loan's remaining balance is tracked), so they can't be totaled after
// the fact; and restocking funded with "new money" currently still draws
// from existing cash/bank/wallet first if there's enough there, so it
// shows up under Restocking like any other restock rather than being kept
// separate.
export interface CashBalanceBreakdown {
  cashSales: number;
  bankSales: number;
  loansReceived: number;
  investmentsAdded: number;
  expensesPaid: number;
  restockSpend: number;
  withdrawals: number;
}

export function cashBalanceBreakdown(store: StoreData): CashBalanceBreakdown {
  let cashSales = 0;
  let bankSales = 0;
  (store.sales || []).forEach(s => {
    if (s.paymentMethod === 'cash' || !s.paymentMethod) cashSales += s.total;
    else if (s.paymentMethod === 'pos' || s.paymentMethod === 'transfer') bankSales += s.total;
    else if (s.paymentMethod === 'mixed') { cashSales += s.total / 2; bankSales += s.total / 2; }
  });

  const loansReceived = (store.loans || []).reduce((sum, l) => sum + l.amount, 0);
  const investmentsAdded = (store.investments || []).reduce((sum, i) => sum + i.amount, 0);
  const expensesPaid = (store.expenses || []).filter(e => e.source !== 'restock').reduce((sum, e) => sum + e.amount, 0);
  const restockSpend = (store.restocks || []).reduce((sum, r) => sum + r.total, 0);
  const withdrawals = (store.withdrawals || []).reduce((sum, w) => sum + w.amount, 0);

  return { cashSales, bankSales, loansReceived, investmentsAdded, expensesPaid, restockSpend, withdrawals };
}

// ─── Restock Score (90-day) ─────────────────────────────────────────────────
// Gives merchants one number for "am I restocking well?" — what % of the
// money spent restocking over the last 90 days went into products that
// actually sell, versus products that were already dead stock or slow
// movers when they got restocked again. Reuses the same neverSold/slowMovers
// classification as restockQualityNote() so the two stay consistent.
export function restockScore(store: StoreData): RestockScoreResult {
  const cutoff = Date.now() - 90 * 86400000;
  const restocks = (store.restocks || []).filter(r => new Date(r.date).getTime() >= cutoff);

  if (restocks.length === 0) {
    return { score: 100, label: 'Excellent', totalSpend90d: 0, wastedSpend90d: 0, goodSpend90d: 0, wastedItems: [] };
  }

  const analysis = analyzeSales(store);
  const neverSoldNames = new Set(analysis.neverSold.map(p => p.name));
  const slowMoverNames = new Set(analysis.slowMovers.map(p => p.name));

  let totalSpend = 0;
  let wastedSpend = 0;
  const wastedMap: Record<string, number> = {};

  restocks.forEach(r => {
    const spend = r.total ?? r.quantity * r.costPrice;
    totalSpend += spend;
    const isDead = neverSoldNames.has(r.productName);
    const isSlow = !isDead && slowMoverNames.has(r.productName);
    if (isDead || isSlow) {
      // Dead stock counts as fully wasted spend; a slow mover is only
      // half-weighted since it's still selling, just not quickly.
      const weightedWaste = spend * (isDead ? 1 : 0.5);
      wastedSpend += weightedWaste;
      wastedMap[r.productName] = (wastedMap[r.productName] || 0) + spend;
    }
  });

  const goodSpend = Math.max(0, totalSpend - wastedSpend);
  const score = totalSpend > 0 ? Math.max(0, Math.min(100, Math.round(100 - (wastedSpend / totalSpend) * 100))) : 100;
  const label: RestockScoreResult['label'] =
    score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention';

  const wastedItems = Object.entries(wastedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, spend]) => ({ name, spend }));

  return { score, label, totalSpend90d: totalSpend, wastedSpend90d: wastedSpend, goodSpend90d: goodSpend, wastedItems };
}

// ─── Notifications Generator ───────────────────────────────────────────────────
/**
 * Once a week, what came in and what was paid. Named for its week, so it
 * arrives once and stays read. Not from a worker's phone, which holds only the
 * money it took itself, and only with something to report.
 */
export function laundryFlowNote(store: StoreData, now: string): FlowNotification | null {
  if (resolveBusinessType(store) !== 'laundry' || store.staffDevice) return null;
  const flow = laundryFlow(store, flowBundles(store), '7d');
  if (flow.bundles === 0) return null;
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
  /*
   * A line, not a paragraph, and named for the stretch it really counts.
   *
   * It was titled "this week" while counting the last seven days, so on a
   * Friday it said ₦37,750 received while Home's "This week" (Monday to
   * Sunday) said ₦31,750 - two figures for one week as far as anybody could
   * tell. It also ran to four sentences in a panel meant to be glanced at.
   */
  const title = `Last 7 days: ${flow.bundles} ${flow.bundles === 1 ? 'bundle' : 'bundles'} came in`;
  const line = `Worth ₦${Math.round(flow.broughtIn).toLocaleString()}. ₦${Math.round(flow.moneyIn).toLocaleString()} received, ₦${Math.round(flow.owedOnThese).toLocaleString()} not paid yet.`;
  return {
    id: `laundry-flow-${week}`,
    icon: '🧺',
    text: line,
    tone: flow.paidShare < 50 ? 'warning' : 'info',
    date: now,
    read: false,
    title,
    description: line,
    actionLabel: 'See bundles',
    actionTab: 'laundry-records',
    category: 'insight',
  };
}

/** Raised from anywhere in the app, not only once somebody opens the Manager screen. */
export function checkLaundryFlowNote(store: StoreData): StoreData | null {
  const note = laundryFlowNote(store, new Date().toISOString());
  if (!note || (store.flowNotifications || []).some(existing => existing.id === note.id)) return null;
  const allowed = allowedNotifications(store, [note]);
  if (!allowed.length) return null;
  return { ...store, flowNotifications: [...allowed, ...(store.flowNotifications || [])] };
}
