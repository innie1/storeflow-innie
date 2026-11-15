import { StoreData, FlowNotification } from '@/types/store';
import { allowedNotifications } from '@/lib/notification-gate';
import { wasEverOwed } from '@/lib/store-data';
import { heldBundleDebtIds } from '@/lib/owed';

// ─── Customer Repayment Insights ──────────────────────────────────────────────
export interface CustomerRepaymentInsight {
  customerKey: string;
  customerName: string;
  customerPhone?: string;
  totalDebts: number;           // number of pending records (all-time)
  completedDebts: number;       // fully paid records
  activeDebts: number;          // still pending
  avgDebtSize: number;          // average total per debt (₦)
  largestDebt: number;
  avgDaysToClear: number | null;      // avg days from createdAt → last payment (only for cleared)
  avgDaysBetweenPayments: number | null; // cadence across all events
  onTimeRate: number | null;     // % of cleared debts paid on/before dueDate (null if no due dates)
  reliabilityScore: number;      // 0-100 composite
  currentBalance: number;        // outstanding balance right now
  lastPaymentDate?: string;      // ISO of latest event
  predictedNextPaymentDate?: string; // ISO — only if activeDebts > 0
  predictedFullClearDate?: string;   // ISO — only if activeDebts > 0
  sampleSize: number;            // total payment events used
}

export interface RepaymentInsightsSummary {
  customers: CustomerRepaymentInsight[];
  overallAvgDaysToClear: number | null;
  overallAvgDebtSize: number;
  overallReliability: number;
  mostReliable?: CustomerRepaymentInsight;
  riskiest?: CustomerRepaymentInsight;
}

export function getRepaymentInsights(store: StoreData): RepaymentInsightsSummary {
  // Bundles paid in full on the day are not debts, and scoring them as
  // repayments filled this with customers who never owed anything.
  // Nor is a balance on clothes still in the shop: that customer has not
  // been asked to pay yet, so there is no repayment habit to read from it.
  const held = heldBundleDebtIds(store);
  const all = (store.pendingPayments || []).filter(wasEverOwed).filter(payment => !held.has(payment.id));
  const groups = new Map<string, typeof all>();
  all.forEach(p => {
    // Group by phone number when available — it's a much more reliable
    // unique identifier than name. Grouping by name alone (the previous
    // behavior) meant two different customers who happen to share a common
    // first name (e.g. two different "John"s) would have their debt
    // histories silently merged into one — corrupting both people's
    // reliability scores and payment predictions. Falls back to name only
    // when no phone number was ever recorded for that debt.
    const normalizedPhone = p.customerPhone?.replace(/[^0-9]/g, '');
    const key = normalizedPhone || (p.customerName || 'unknown').trim().toLowerCase();
    if (!key) return;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  });

  const customers: CustomerRepaymentInsight[] = [];

  groups.forEach((records, key) => {
    const name = records[0].customerName;
    const phone = records.find(r => r.customerPhone)?.customerPhone;
    const completed = records.filter(r => r.status === 'paid');
    const active = records.filter(r => r.status === 'pending');

    const totalOfDebts = records.reduce((s, r) => s + r.total, 0);
    const avgDebtSize = totalOfDebts / records.length;
    const largestDebt = Math.max(...records.map(r => r.total));

    // Days-to-clear per completed debt
    const clearDurations: number[] = [];
    completed.forEach(r => {
      const events = (r.events || []).filter(e => e.amount > 0);
      if (events.length === 0) return;
      const created = new Date(r.createdAt).getTime();
      const last = Math.max(...events.map(e => new Date(e.date).getTime()));
      const days = Math.max(0, (last - created) / 86400000);
      clearDurations.push(days);
    });
    const avgDaysToClear = clearDurations.length
      ? Math.round((clearDurations.reduce((s, x) => s + x, 0) / clearDurations.length) * 10) / 10
      : null;

    // Cadence between successive events (across all records)
    const eventTimes: number[] = [];
    records.forEach(r => {
      (r.events || []).forEach(e => eventTimes.push(new Date(e.date).getTime()));
      eventTimes.push(new Date(r.createdAt).getTime()); // treat debt origination as anchor
    });
    eventTimes.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < eventTimes.length; i++) {
      const g = (eventTimes[i] - eventTimes[i - 1]) / 86400000;
      if (g > 0.01) gaps.push(g);
    }
    const avgDaysBetweenPayments = gaps.length
      ? Math.round((gaps.reduce((s, x) => s + x, 0) / gaps.length) * 10) / 10
      : null;

    // On-time rate on cleared debts with dueDate
    const withDue = completed.filter(r => r.dueDate);
    const onTime = withDue.filter(r => {
      const events = (r.events || []).filter(e => e.amount > 0);
      if (!events.length) return false;
      const last = Math.max(...events.map(e => new Date(e.date).getTime()));
      return last <= new Date(r.dueDate!).getTime();
    });
    const onTimeRate = withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null;

    // Currently outstanding
    const currentBalance = active.reduce((s, r) => s + r.balance, 0);

    // Last payment date across everything
    const allEvents = records.flatMap(r => r.events || []).filter(e => e.amount > 0);
    const lastPaymentDate = allEvents.length
      ? new Date(Math.max(...allEvents.map(e => new Date(e.date).getTime()))).toISOString()
      : undefined;

    // Predict next payment
    let predictedNextPaymentDate: string | undefined;
    let predictedFullClearDate: string | undefined;
    if (active.length > 0 && avgDaysBetweenPayments) {
      const anchorTime = lastPaymentDate
        ? new Date(lastPaymentDate).getTime()
        : Math.max(...active.map(r => new Date(r.createdAt).getTime()));
      const next = anchorTime + avgDaysBetweenPayments * 86400000;
      predictedNextPaymentDate = new Date(Math.max(next, Date.now() - 86400000)).toISOString();

      // Estimate installment size from historical events
      const avgInstallment = allEvents.length
        ? allEvents.reduce((s, e) => s + e.amount, 0) / allEvents.length
        : currentBalance;
      const installmentsNeeded = avgInstallment > 0 ? Math.ceil(currentBalance / avgInstallment) : 1;
      const clearTime = anchorTime + installmentsNeeded * avgDaysBetweenPayments * 86400000;
      predictedFullClearDate = new Date(clearTime).toISOString();
    }

    // Reliability composite (0-100)
    //   recovery ratio (60%) + on-time (25%) + completion ratio (15%)
    const paidSum = allEvents.reduce((s, e) => s + e.amount, 0);
    const originated = records.reduce((s, r) => s + r.total, 0);
    const recovery = originated > 0 ? paidSum / originated : 0;
    const completion = records.length > 0 ? completed.length / records.length : 0;
    const onTimeNorm = onTimeRate === null ? 0.6 : onTimeRate / 100;
    const reliabilityScore = Math.round((recovery * 0.6 + onTimeNorm * 0.25 + completion * 0.15) * 100);

    customers.push({
      customerKey: key,
      customerName: name,
      customerPhone: phone,
      totalDebts: records.length,
      completedDebts: completed.length,
      activeDebts: active.length,
      avgDebtSize: Math.round(avgDebtSize),
      largestDebt,
      avgDaysToClear,
      avgDaysBetweenPayments,
      onTimeRate,
      reliabilityScore,
      currentBalance,
      lastPaymentDate,
      predictedNextPaymentDate,
      predictedFullClearDate,
      sampleSize: allEvents.length,
    });
  });

  // Sort: active first (highest balance), then by reliability
  customers.sort((a, b) => {
    if ((b.activeDebts > 0 ? 1 : 0) !== (a.activeDebts > 0 ? 1 : 0)) {
      return (b.activeDebts > 0 ? 1 : 0) - (a.activeDebts > 0 ? 1 : 0);
    }
    return b.currentBalance - a.currentBalance;
  });

  const clearDurationsAll: number[] = [];
  customers.forEach(c => { if (c.avgDaysToClear !== null) clearDurationsAll.push(c.avgDaysToClear); });
  const overallAvgDaysToClear = clearDurationsAll.length
    ? Math.round((clearDurationsAll.reduce((s, x) => s + x, 0) / clearDurationsAll.length) * 10) / 10
    : null;
  const overallAvgDebtSize = customers.length
    ? Math.round(customers.reduce((s, c) => s + c.avgDebtSize, 0) / customers.length)
    : 0;
  const overallReliability = customers.length
    ? Math.round(customers.reduce((s, c) => s + c.reliabilityScore, 0) / customers.length)
    : 0;

  const withHistory = customers.filter(c => c.sampleSize >= 2);
  const mostReliable = withHistory.length
    ? [...withHistory].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0]
    : undefined;
  const riskiest = withHistory.length
    ? [...withHistory].sort((a, b) => a.reliabilityScore - b.reliabilityScore)[0]
    : undefined;

  return { customers, overallAvgDaysToClear, overallAvgDebtSize, overallReliability, mostReliable, riskiest };
}

// ─── Debt & Recurring Bill Reminders ────────────────────────────────────────
// Two independent sources feed into the same reminder stream:
//  1. Recurring bills the merchant set up themselves (rent, subscriptions)
//     with a nextDueDate that auto-advances once marked paid.
//  2. Loans/debts already tracked in ROI Tracker that have a dueDate set.
// Both start reminding 3 days before due, keep reminding at most once a
// day if it slips past due (so it doesn't get buried and forgotten), and
// go quiet again once paid/repaid.
export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function dueLabel(days: number): string {
  if (days > 0) return `due in ${days} day${days === 1 ? '' : 's'}`;
  if (days === 0) return 'due today';
  return `overdue by ${-days} day${-days === 1 ? '' : 's'}`;
}

export function checkDebtExpenseReminders(store: StoreData): StoreData | null {
  let changed = false;
  const newNotifications: FlowNotification[] = [];
  const now = new Date().toISOString();

  const remindedToday = (last?: string) => !!last && (Date.now() - new Date(last).getTime() < 86400000);

  const bills = (store.recurringBills || []).map(bill => {
    if (!bill.active) return bill;
    const days = daysUntil(bill.nextDueDate);
    if (days > 3 || remindedToday(bill.lastReminderDate)) return bill;
    changed = true;
    newNotifications.push({
      id: `bill-${bill.id}-${bill.nextDueDate}`,
      icon: '💸',
      text: `${bill.label} is ${dueLabel(days)} — ₦${bill.amount.toLocaleString()}`,
      tone: days < 0 ? 'danger' : days === 0 ? 'warning' : 'info',
      date: now,
      read: false,
      title: 'Bill Reminder',
      description: `${bill.label} (₦${bill.amount.toLocaleString()}) is ${dueLabel(days)}. Mark it paid from Expenses once settled.`,
      actionLabel: 'View Expenses',
      actionTab: 'expenses',
      category: 'alert',
    });
    return { ...bill, lastReminderDate: now };
  });

  const loans = (store.loans || []).map(loan => {
    if (loan.status !== 'active' || !loan.dueDate) return loan;
    const days = daysUntil(loan.dueDate);
    if (days > 3 || remindedToday(loan.lastReminderDate)) return loan;
    changed = true;
    newNotifications.push({
      id: `loan-${loan.id}-${loan.dueDate}`,
      icon: '🏦',
      text: `Loan repayment to ${loan.source} is ${dueLabel(days)} — ₦${loan.amount.toLocaleString()} remaining`,
      tone: days < 0 ? 'danger' : days === 0 ? 'warning' : 'info',
      date: now,
      read: false,
      title: 'Loan Repayment Reminder',
      description: `₦${loan.amount.toLocaleString()} owed to ${loan.source} is ${dueLabel(days)}.`,
      actionLabel: 'View Loans',
      actionTab: 'roi',
      category: 'alert',
    });
    return { ...loan, lastReminderDate: now };
  });

  if (!changed) return null;

  return {
    ...store,
    recurringBills: bills,
    loans,
    flowNotifications: [...allowedNotifications(store, newNotifications), ...(store.flowNotifications || [])],
  };
}
