import { StoreData, TabId } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { getPendingSummary } from '@/lib/store-data';
import type { AutoFixSpec } from '@/lib/auto-fix';
import type { ProductFocus } from '@/lib/product-focus';
import { daysAgo, isStoreOnboarding } from './dates';
import { dailySeries } from './forecast';
import { inventoryIntelligence } from './stock';
import { expenseAnalysis } from './costs';
import { healthScore } from './health';

// ─── Structured Get Advice report ─────────────────────────────────────────────
//
// The report used to be a fixed run of five markdown sections in a fixed order,
// so a sold-out product was reported below a paragraph saying expenses were
// fine. Sections now carry what they found and how bad it is, and the caller
// sorts on that — a store with nothing wrong reads completely differently to a
// store that is losing sales today.

export type FlowReportTone = 'critical' | 'warning' | 'good' | 'neutral';

export interface FlowReportAction {
  label: string;
  goTo?: TabId;
  autoFix?: AutoFixSpec;
  /** Set when the action concerns exactly one product — see ProductFocus. */
  focus?: ProductFocus;
}

export interface FlowReportSection {
  id: string;
  emoji: string;
  heading: string;
  tone: FlowReportTone;
  /** Sorted on, high to low. Derived from the finding, never from the wording. */
  rank: number;
  /** One line saying what this section found, before any detail. */
  summary: string;
  detail: string[];
  items?: { name: string; note: string }[];
  actions?: FlowReportAction[];
}

export interface FlowReport {
  intro: string;
  /** The single most urgent finding, or null when nothing needs attention. */
  headline: FlowReportSection | null;
  sections: FlowReportSection[];
  onboarding?: string;
}

export function buildFlowReport(store: StoreData): FlowReport {
  if (isStoreOnboarding(store)) {
    return {
      intro: '',
      headline: null,
      sections: [],
      onboarding: 'Get your store ready for business. We are helping you set everything up before monitoring performance.',
    };
  }

  const h = healthScore(store);
  const pending = getPendingSummary(store);
  const forecasts = inventoryIntelligence(store);

  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const profit7 = last7.reduce((s, d) => s + d.profit, 0);

  // Restock spend is money turned into resellable stock, not a cost leak, so it
  // stays out of the expense ratio.
  const exp7 = (store.expenses || [])
    .filter(e => e.category !== 'Restock' && new Date(e.date) >= daysAgo(6))
    .reduce((s, e) => s + e.amount, 0);
  const ea = expenseAnalysis(store, ['Restock']);

  const threshold = getLowStockThreshold();
  const live = store.products.filter(p => !p.discontinued);
  const outOfStock = live.filter(p => p.quantity === 0);
  const lowStock = live.filter(p => p.quantity > 0 && p.quantity <= threshold);
  const margin = rev7 > 0 ? (profit7 / rev7) * 100 : 0;
  const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;

  const sections: FlowReportSection[] = [];

  // ── Sales ──
  {
    const detail: string[] = [];
    let tone: FlowReportTone = 'neutral';
    let rank = 20;
    let summary: string;

    if (rev7 === 0) {
      summary = 'No sales recorded this week.';
      detail.push('If you have been opening the shop, record every sale so I can track your revenue. If foot traffic is genuinely low, a weekend promotion is worth trying.');
      tone = 'warning';
      rank = 72;
    } else {
      summary = `${money(rev7)} in revenue this week.`;
      if (revPrev > 0) {
        const growth = ((rev7 - revPrev) / revPrev) * 100;
        if (growth < -10) {
          detail.push(`Down ${Math.abs(growth).toFixed(1)}% on last week (${money(revPrev)}).`);
          tone = 'warning';
          rank = Math.max(rank, 68);
        } else if (growth > 10) {
          detail.push(`Up ${growth.toFixed(1)}% on last week.`);
          tone = 'good';
        } else {
          detail.push('Level with last week.');
        }
      }
      if (margin <= 0) {
        detail.push(`You are selling at a negative margin — ${money(profit7)} profit on ${money(rev7)} of sales. Check your cost prices before you sell any more.`);
        tone = 'critical';
        rank = 96;
      } else if (margin < 15) {
        detail.push(`Net margin is thin at ${margin.toFixed(1)}%. You may be pricing too close to cost, or paying too much wholesale.`);
        tone = 'warning';
        rank = Math.max(rank, 66);
      } else {
        detail.push(`Margin is healthy at ${margin.toFixed(1)}% (${money(profit7)} profit).`);
        if (tone !== 'warning') tone = 'good';
      }
    }

    // Point at whatever the finding actually calls for, rather than one
    // generic link: nothing sold means record a sale, a bad margin means look
    // at prices.
    const salesAction: FlowReportAction = rev7 === 0
      ? { label: 'Record a sale', goTo: 'sales' as TabId }
      : margin < 15
        ? { label: 'Review prices', goTo: 'inventory' as TabId }
        : { label: 'Sales history', goTo: 'history' as TabId };

    sections.push({
      id: 'sales', emoji: '📊', heading: 'Sales & margin', tone, rank, summary, detail,
      actions: [salesAction],
    });
  }

  // ── Inventory ──
  {
    const critical = forecasts.filter(f => f.urgency === 'critical' || f.product.quantity === 0);
    const detail: string[] = [];
    const actions: FlowReportAction[] = [];
    let tone: FlowReportTone = 'good';
    let rank = 15;
    let summary: string;

    if (live.length === 0) {
      summary = 'No products in your inventory yet.';
      detail.push('Add your products so I can track stock levels and tell you what to reorder.');
      tone = 'warning'; rank = 74;
      actions.push({ label: 'Add products', goTo: 'inventory' as TabId });
    } else if (outOfStock.length > 0) {
      summary = `${outOfStock.length} product${outOfStock.length === 1 ? '' : 's'} sold out — you are losing sales right now.`;
      tone = 'critical'; rank = 100;
      if (lowStock.length > 0) detail.push(`${lowStock.length} more ${lowStock.length === 1 ? 'is' : 'are'} below ${threshold} units.`);
    } else if (lowStock.length > 0) {
      summary = `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} running low.`;
      tone = 'warning'; rank = 70;
    } else {
      summary = `All stocked above ${threshold} units.`;
    }

    const listed = [...outOfStock, ...lowStock].slice(0, 6);
    const items = listed.map(p => ({
      name: p.name,
      note: p.quantity === 0 ? 'Sold out' : `${p.quantity} left`,
    }));

    if (critical.length > 0) {
      actions.push({ label: 'Go to Inventory', goTo: 'inventory' as TabId });
      actions.push({
        label: 'Auto Fix',
        autoFix: {
          type: 'generate_purchase_order',
          summary: critical.length === 1
            ? `Create a draft purchase order for ${critical[0].restockQty} units of ${critical[0].product.name}`
            : `Create a draft purchase order covering all ${critical.length} critical products`,
          payload: { items: critical.map(f => ({ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice })) },
        },
      });
    } else if (lowStock.length > 0) {
      actions.push({ label: 'Go to Inventory', goTo: 'inventory' as TabId });
    }

    sections.push({
      id: 'inventory', emoji: '📦', heading: 'Stock', tone, rank, summary, detail,
      items: items.length ? items : undefined,
      actions: actions.length ? actions : undefined,
    });
  }

  // ── Expenses ──
  {
    const detail: string[] = [];
    let tone: FlowReportTone = 'neutral';
    let rank = 18;
    let summary: string;

    if (exp7 <= 0) {
      summary = 'No expenses recorded this week.';
      detail.push('Without expenses logged, the profit above only subtracts cost of goods, so it flatters the real number.');
      tone = 'neutral'; rank = 40;
    } else {
      const ratio = rev7 > 0 ? (exp7 / rev7) * 100 : 0;
      summary = `${money(exp7)} spent this week` + (rev7 > 0 ? `, ${ratio.toFixed(0)}% of revenue.` : '.');
      if (rev7 > 0 && ratio > 100) {
        detail.push('You are spending more than you are selling. Freeze anything non-essential.');
        tone = 'critical'; rank = 92;
      } else if (rev7 > 0 && ratio > 40) {
        detail.push('That is a high share of revenue.');
        if (ea.trendPct > 10) detail.push(`The rise is driven by ${ea.largestCategory}.`);
        tone = 'warning'; rank = 62;
      } else if (rev7 > 0) {
        detail.push('Well controlled.');
        tone = 'good';
      }
    }

    sections.push({
      id: 'expenses', emoji: '🧾', heading: 'Expenses', tone, rank, summary, detail,
      actions: [{ label: 'Open Expenses', goTo: 'expenses' as TabId }],
    });
  }

  // ── Money owed ──
  {
    const detail: string[] = [];
    let tone: FlowReportTone = 'good';
    let rank = 12;
    let summary: string;

    if (pending.totalOwed > 0) {
      summary = `Customers owe you ${money(pending.totalOwed)} across ${pending.list.length} payment${pending.list.length === 1 ? '' : 's'}.`;
      if (pending.overdue.length > 0) {
        const overdueAmount = pending.overdue.reduce((s, p) => s + p.balance, 0);
        detail.push(`${pending.overdue.length} ${pending.overdue.length === 1 ? 'is' : 'are'} overdue, worth ${money(overdueAmount)}. That is working capital you cannot restock with.`);
        tone = 'warning'; rank = 76;
      } else {
        detail.push('None overdue yet. Collect on the due dates to keep cash moving.');
        tone = 'neutral'; rank = 25;
      }
    } else {
      summary = 'Nobody owes you anything.';
    }

    sections.push({
      id: 'debts', emoji: '💳', heading: 'Money owed to you', tone, rank, summary, detail,
      actions: pending.totalOwed > 0 ? [{ label: 'Chase payments', goTo: 'pending' as TabId }] : undefined,
    });
  }

  sections.sort((a, b) => b.rank - a.rank);

  const worst = sections[0];
  const headline = worst && (worst.tone === 'critical' || worst.tone === 'warning') ? worst : null;

  const intro = headline
    ? `Health score ${h.overall}/100. The thing worth your attention first:`
    : `Health score ${h.overall}/100. Nothing is going wrong right now — here is where things stand.`;

  return { intro, headline, sections };
}

export function generateFlowReport(store: StoreData): string {
  if (isStoreOnboarding(store)) {
    return "Get your store ready for business. We are helping you set everything up before monitoring performance.";
  }
  const h = healthScore(store);
  const stock = inventoryIntelligence(store);
  const pending = getPendingSummary(store);

  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const profit7 = last7.reduce((s, d) => s + d.profit, 0);
  // "Expense Audit" below is about controllable operating costs (rent,
  // utilities, salaries, etc.). Restock spend is money converted into
  // resellable inventory, not a cost leak — exclude it so a big, healthy
  // restock doesn't get flagged as "dangerously high" spending.
  const exp7 = (store.expenses || [])
    .filter(e => e.category !== 'Restock' && new Date(e.date) >= daysAgo(6))
    .reduce((s, e) => s + e.amount, 0);

  const outOfStock = store.products.filter(p => !p.discontinued && p.quantity === 0);
  const threshold = getLowStockThreshold();
  const lowStock = store.products.filter(p => !p.discontinued && p.quantity > 0 && p.quantity <= threshold);

  const ea = expenseAnalysis(store, ['Restock']);

  let text = `Hi, I'm Flow, your business assistant. Here is a tailored analysis for ${store.storeName}. \n\n`;

  // 1. Overall Health & Performance Assessment
  text += `### 📊 Store Performance Summary\n`;
  if (h.overall >= 80) {
    text += `Your store is performing exceptionally well with a health score of **${h.overall}/100** (Great). `;
  } else if (h.overall >= 60) {
    text += `Your store is in healthy standing with a score of **${h.overall}/100**. Operations are stable, but we can optimize. `;
  } else if (h.overall >= 40) {
    text += `Your store performance is average (**${h.overall}/100**). Some financial and inventory metrics are falling behind. `;
  } else {
    text += `⚠️ **Critical Warning:** Your store is underperforming with a health score of **${h.overall}/100** (Needs Immediate Attention). `;
  }

  // Revenue & Profit Trend Analysis
  if (rev7 === 0) {
    text += `You have logged **zero sales** this week. If you've been opening the shop, make sure to record every sale on StoreFlow so I can track your revenue. If foot traffic is low, consider running a weekend promotion. \n\n`;
  } else {
    const margin = rev7 > 0 ? (profit7 / rev7) * 100 : 0;
    text += `This week, you generated **₦${rev7.toLocaleString()}** in revenue. `;
    if (revPrev > 0) {
      const growth = ((rev7 - revPrev) / revPrev) * 100;
      if (growth < -10) {
        text += `This is a significant **decline of ${Math.abs(growth).toFixed(1)}%** compared to last week (₦${revPrev.toLocaleString()}). `;
      } else if (growth > 10) {
        text += `This is a strong **growth of ${growth.toFixed(1)}%** compared to last week! `;
      } else {
        text += `This is stable compared to last week. `;
      }
    }

    if (margin < 15 && margin > 0) {
      text += `However, your net profit margin is thin at **${margin.toFixed(1)}%**. You might be pricing your items too close to their cost price, or facing high wholesale prices. Check the 'Analysis' tab to see which products have low margins. \n\n`;
    } else if (margin <= 0 && rev7 > 0) {
      text += `Critically, you are operating at a **negative profit margin** on sales this week. Review product costs immediately! \n\n`;
    } else {
      text += `Your profit margin is healthy at **${margin.toFixed(1)}%** (₦${profit7.toLocaleString()} profit). \n\n`;
    }
  }

  // 2. Inventory Health (Zero stock / Low stock)
  text += `### 📦 Inventory Diagnostics\n`;
  if (store.products.length === 0) {
    text += `You currently have **0 products** registered in your inventory. To get started, go to the Inventory page and add your products so I can track stock levels. \n\n`;
  } else if (outOfStock.length > 0 || lowStock.length > 0) {
    if (outOfStock.length > 0) {
      const oosNames = outOfStock.slice(0, 3).map(p => p.name).join(', ');
      text += `🚨 **Out of Stock:** You have **${outOfStock.length} product(s) completely sold out** (${oosNames}${outOfStock.length > 3 ? '...' : ''}). When products are at zero, you are actively losing sales. Restock these immediately. \n`;
    }
    if (lowStock.length > 0) {
      const lowNames = lowStock.slice(0, 3).map(p => p.name).join(', ');
      text += `⚠️ **Low Stock:** There are **${lowStock.length} product(s) running low** (below ${threshold} units), including: ${lowNames}. \n`;
    }
    text += `Go to the Marketplace tab to find local suppliers or place quick orders. \n\n`;
  } else {
    text += `Your inventory is fully stocked! All registered products are above the low stock threshold of ${threshold} units. Keep it up! 👍 \n\n`;
  }

  // 3. Expense Control
  text += `### 🧾 Expense Audit\n`;
  if (exp7 > 0) {
    text += `Your recorded expenses total **₦${exp7.toLocaleString()}** this week. `;
    if (rev7 > 0) {
      const expRatio = (exp7 / rev7) * 100;
      if (expRatio > 40) {
        text += `This represents **${expRatio.toFixed(0)}% of your weekly revenue**, which is dangerously high. `;
        if (ea.trendPct > 10) {
          text += `Your monthly spending spike is driven by the **${ea.largestCategory}** category. Audit this category immediately to plug financial leaks. `;
        }
      } else {
        text += `Expenses are well-controlled, taking up only ${expRatio.toFixed(0)}% of your revenue. `;
      }
    }
    text += `\n\n`;
  } else {
    text += `You have **no expenses recorded** this week. Keeping accurate expense logs is crucial for knowing your true net profit. \n\n`;
  }

  // 4. Debt & Cash Flow
  text += `### 💳 Outstanding Debts & Cash Flow\n`;
  if (pending.totalOwed > 0) {
    text += `Customers owe your store **₦${pending.totalOwed.toLocaleString()}** across ${pending.list.length} pending payment(s). `;
    if (pending.overdue.length > 0) {
      text += `Of these, **${pending.overdue.length} payment(s) are overdue**. This is tying up your working capital, making it harder to restock. I suggest sending a WhatsApp reminder directly from the 'Pending' tab to collect these funds. \n\n`;
    } else {
      text += `These balances are not yet overdue. Make sure to collect them on the due dates to maintain healthy cash flow. \n\n`;
    }
  } else {
    text += `Your outstanding customer debt is zero! This is excellent for your cash flow. \n\n`;
  }

  // 5. Tailored Priority Recommendations
  text += `### ⚡ Priority Recommendations\n`;
  let recsAdded = 0;

  if (outOfStock.length > 0) {
    text += `${recsAdded + 1}. **Restock Out-of-Stock Items:** Focus on replenishing ${outOfStock.slice(0, 2).map(p => p.name).join(' and ')} immediately.\n`;
    recsAdded++;
  }
  if (rev7 === 0) {
    text += `${recsAdded + 1}. **Record Sales Activity:** Open your shop and start logging sales daily to generate actionable forecasts.\n`;
    recsAdded++;
  }
  if (pending.overdue.length > 0) {
    const overdueAmount = pending.overdue.reduce((s, p) => s + p.balance, 0);
    text += `${recsAdded + 1}. **Collect Overdue Debts:** Call or message the overdue customer(s) to recover ₦${overdueAmount.toLocaleString()}.\n`;
    recsAdded++;
  }
  if (exp7 > rev7 && rev7 > 0) {
    text += `${recsAdded + 1}. **Reduce Overhead:** Your expenses are outstripping your sales. Freeze non-essential purchases.\n`;
    recsAdded++;
  }
  if (recsAdded === 0) {
    text += `1. **Maintain Steady Operations:** Keep doing what you're doing! Consider setting a higher savings goal or expanding your product listings in the Marketplace.\n`;
  }

  return text;
}
