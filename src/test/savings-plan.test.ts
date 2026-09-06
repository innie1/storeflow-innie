import { describe, expect, it } from 'vitest';
import { runScheduledSavingsDeduction } from '@/lib/store-data';
import type { SavingsGoal, StoreData } from '@/types/store';

/**
 * Auto-save credited amounts the shop had never earned.
 *
 * Switching on "save 10% daily" in a shop open 100 days deposited
 * ₦995,000,000 on the spot — ten times everything the shop had ever taken.
 * Two faults compounded:
 *
 *   - nothing stamped `lastDeductionTime` when auto-save was switched on, so
 *     the first run back-filled every scheduled date since the shop was
 *     created: 100 deposits, and 100 notifications behind them;
 *   - every one of those deposits took its percentage of *lifetime* net
 *     income rather than what had been earned since the previous deposit, so
 *     a daily 10% goal set aside 10% of everything, every day.
 *
 * Even the simple case was wrong: "save ₦5,000 daily" deposited ₦500,000.
 *
 * It is not a display-only number. `savingsSaved` is subtracted from net
 * income in Manager, Inventory and the Smart Restock budget, so a phantom
 * balance drives all three wildly negative.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const DAILY_SALES = 10;
const SALE_TOTAL = 100_000;
const SALE_PROFIT = 20_000;
const TRADING_DAYS = 100;

function storeWith(goal: Partial<SavingsGoal>, openedDaysAgo = TRADING_DAYS): StoreData {
  const sales: any[] = [];
  for (let day = 0; day < TRADING_DAYS; day++) {
    for (let i = 0; i < DAILY_SALES; i++) {
      sales.push({
        id: `s-${day}-${i}`, productId: 'p', productName: 'Rice', quantity: 1,
        unitPrice: SALE_TOTAL, total: SALE_TOTAL, profit: SALE_PROFIT, date: daysAgo(day),
      });
    }
  }
  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(openedDaysAgo),
    products: [{ id: 'p', name: 'Rice', category: 'x', costPrice: 80000, sellingPrice: 100000, quantity: 50 } as any],
    sales: sales as any,
    expenses: [],
    savingsGoals: [{
      id: 'g1', label: 'Rent', amount: 0, saved: 0, source: 'profit', percentage: 0,
      autoSaveEnabled: true, timeOfDay: '00:00', frequency: 'daily', ...goal,
    }] as SavingsGoal[],
  } as StoreData;
}

const goalOf = (s: StoreData) => (s.savingsGoals || [])[0] as SavingsGoal;

describe('switching auto-save on does not back-date deposits', () => {
  it('starts the clock instead of paying out for every day since the shop opened', () => {
    const after = runScheduledSavingsDeduction(storeWith({ percentage: 10 }));
    expect(goalOf(after).saved).toBe(0);
    expect(goalOf(after).lastDeductionTime).toBeTruthy();
  });

  it('does not bury the merchant in notifications on that first run', () => {
    const after = runScheduledSavingsDeduction(storeWith({ percentage: 10 }));
    expect((after.flowNotifications || []).length).toBe(0);
    expect((after.memoryTimeline || []).length).toBe(0);
  });

  it('a fixed-amount goal does not pay out 100 days at once either', () => {
    const after = runScheduledSavingsDeduction(storeWith({ autoSaveAmount: 5000 }));
    expect(goalOf(after).saved).toBe(0);
  });
});

describe('a deposit covers the period since the last one', () => {
  it('takes its percentage of two days of profit, not of everything ever earned', () => {
    // Started two days ago, so two daily deposits are due.
    const store = storeWith({ percentage: 10, lastDeductionTime: daysAgo(2) });
    const saved = goalOf(runScheduledSavingsDeduction(store)).saved;

    const dailyProfit = DAILY_SALES * SALE_PROFIT;          // ₦200,000
    const lifetimeProfit = dailyProfit * TRADING_DAYS;      // ₦20,000,000

    // At most two days' worth, nowhere near a share of the lifetime figure.
    expect(saved).toBeGreaterThan(0);
    expect(saved).toBeLessThanOrEqual(dailyProfit * 0.1 * 2 + 1);
    expect(saved).toBeLessThan(lifetimeProfit * 0.1);
  });

  it('pays a fixed amount once per scheduled day', () => {
    const store = storeWith({ autoSaveAmount: 5000, lastDeductionTime: daysAgo(3) });
    expect(goalOf(runScheduledSavingsDeduction(store)).saved).toBeLessThanOrEqual(15_000);
  });

  it('never sets aside more than the shop earned in the period', () => {
    const store = storeWith({ percentage: 100, lastDeductionTime: daysAgo(5) });
    const saved = goalOf(runScheduledSavingsDeduction(store)).saved;
    const earnedInFiveDays = DAILY_SALES * SALE_PROFIT * 5;
    expect(saved).toBeLessThanOrEqual(earnedInFiveDays + 1);
  });
});

describe('the goal saves out of the figure it was set to', () => {
  it('uses revenue when the goal says revenue', () => {
    // Several days back, so whole days of sales fall inside the windows
    // rather than between the fixture's exact 24-hour timestamps.
    const base = { percentage: 10, lastDeductionTime: daysAgo(5) };
    const fromRevenue = goalOf(runScheduledSavingsDeduction(storeWith({ ...base, source: 'revenue' }))).saved;
    const fromProfit = goalOf(runScheduledSavingsDeduction(storeWith({ ...base, source: 'profit' }))).saved;
    // Revenue is five times profit here, so the two must differ.
    expect(fromRevenue).toBeGreaterThan(fromProfit);
  });
});

describe('a long catch-up is reported once, not once per missed day', () => {
  it('summarises rather than posting thirty notifications', () => {
    const store = storeWith({ autoSaveAmount: 1000, lastDeductionTime: daysAgo(30) });
    const after = runScheduledSavingsDeduction(store);
    expect(goalOf(after).saved).toBeGreaterThan(0);
    expect((after.flowNotifications || []).length).toBe(1);
    expect((after.flowNotifications || [])[0].description).toMatch(/missed deposits/);
  });

  it('still lists them individually when only a couple were missed', () => {
    const store = storeWith({ autoSaveAmount: 1000, lastDeductionTime: daysAgo(2) });
    const after = runScheduledSavingsDeduction(store);
    expect((after.flowNotifications || []).length).toBeGreaterThan(0);
    expect((after.flowNotifications || []).length).toBeLessThanOrEqual(3);
  });
});

describe('a target still caps the balance', () => {
  it('does not overshoot the goal amount', () => {
    const store = storeWith({ autoSaveAmount: 5000, amount: 12_000, lastDeductionTime: daysAgo(10) });
    expect(goalOf(runScheduledSavingsDeduction(store)).saved).toBeLessThanOrEqual(12_000);
  });
});
