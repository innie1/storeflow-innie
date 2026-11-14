import { queueStoreSync } from '@/lib/store-cloud-sync';
import { StoreData, DEFAULT_MANAGER_SETTINGS, SavingsGoal } from '@/types/store';
import { backfillAttribution } from '@/lib/attribution-backfill';
import { fileExpensesByName } from '@/lib/expense-names';
import { backfillCustomerBook } from '@/lib/customer-backfill';
import { createAutoBackupSnapshot } from '@/lib/backup-system';
import { TRASH_RETENTION_MS, STORE_PREFIX } from './keys';
import { syncProductPerformance } from './inventory-movements';
import { generateId, generateStoreUniqueCode, ensureStoreId } from './ids';
import { upsertStoreIndex } from './store-index';
import { sumOperatingExpenses } from './money';
import { shopStorage } from '@/lib/shop-storage';

export function recalculateSavings(store: StoreData): StoreData {
  const goals = getSavingsGoals(store);
  if (goals.length === 0) return store;
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = store.sales.reduce((sum, s) => sum + s.profit, 0);

  const updatedGoals = goals.map(g => {
    if (g.autoSaveEnabled) return g; // auto-save goals track `saved` via runScheduledSavingsDeduction instead
    let saved = g.saved || 0;
    if (g.autoSaveAmount && g.autoSaveAmount > 0) {
      // Fixed Cash mode, no schedule: `saved` is tracked manually/elsewhere — just enforce the cap below, don't overwrite it from revenue.
    } else {
      const base = (g.source || 'profit') === 'profit' ? totalProfit : totalRevenue;
      saved = Math.round(((g.percentage || 0) / 100) * base * 100) / 100;
    }
    if (g.amount && g.amount > 0) saved = Math.min(saved, g.amount);
    return { ...g, saved };
  });

  return withSyncedGoals(store, updatedGoals);
}

export function syncStoreData(store: StoreData): StoreData {
  if (!store) return store;
  const profile = store.profile || {
    storeType: store.category || 'retail',
    location: '',
    phone: '',
    email: '',
  };
  if (!profile.uniqueCode) {
    profile.uniqueCode = generateStoreUniqueCode();
  }
  const settings = store.managerSettings || { ...DEFAULT_MANAGER_SETTINGS };

  if (store.storeName) {
    settings.receiptStoreName = store.storeName;
  } else if (settings.receiptStoreName) {
    store.storeName = settings.receiptStoreName;
  }

  if (profile.phone) {
    settings.receiptPhone = profile.phone;
  } else if (settings.receiptPhone) {
    profile.phone = settings.receiptPhone;
  }

  if (profile.location) {
    settings.receiptAddress = profile.location;
  } else if (settings.receiptAddress) {
    profile.location = settings.receiptAddress;
  }

  if (store.category) {
    profile.storeType = store.category;
  } else if (profile.storeType) {
    store.category = profile.storeType as any;
  }

  if (store.cashBalance === undefined) {
    const totalSalesCash = store.sales.filter(s => s.paymentMethod === 'cash' || !s.paymentMethod).reduce((sum, s) => sum + s.total, 0);
    const totalSalesBank = store.sales.filter(s => s.paymentMethod && s.paymentMethod !== 'cash').reduce((sum, s) => sum + s.total, 0);
    // Reconstructing an older store's cash balance, so this one DOES include
    // stock purchases: that money genuinely left the account.
    const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
    const totalInvest = (store.investments || []).reduce((sum, i) => sum + i.amount, 0);
    const totalWithdrawn = (store.withdrawals || []).reduce((sum, w) => sum + w.amount, 0);

    store.cashBalance = Math.max(0, totalInvest + totalSalesCash - totalExpenses - totalWithdrawn);
    store.bankBalance = Math.max(0, totalSalesBank);
    store.walletBalance = 0;
    store.otherAssets = 0;
    store.liabilities = 0;
  } else {
    if (store.bankBalance === undefined) store.bankBalance = 0;
    if (store.walletBalance === undefined) store.walletBalance = 0;
    if (store.otherAssets === undefined) store.otherAssets = 0;
    if (store.liabilities === undefined) store.liabilities = 0;
  }

  store.profile = profile;
  store.managerSettings = settings;

  return recalculateSavings(store);
}

// Returns every active savings goal. Falls back to wrapping the legacy
// single `savingsGoal` field into a one-item array so old stores keep
// working exactly as before until they add a second plan.
export function getSavingsGoals(store: StoreData): SavingsGoal[] {
  if (store.savingsGoals && store.savingsGoals.length > 0) return store.savingsGoals;
  if (store.savingsGoal && store.savingsGoal.amount > 0) return [{ ...store.savingsGoal, id: store.savingsGoal.id || 'legacy' }];
  return [];
}

export function withSyncedGoals(store: StoreData, goals: SavingsGoal[]): StoreData {
  return { ...store, savingsGoals: goals, savingsGoal: goals[0] };
}

export function addSavingsGoal(store: StoreData, goal: Omit<SavingsGoal, 'id'>): StoreData {
  const newGoal: SavingsGoal = { ...goal, id: generateId() };
  const updated = withSyncedGoals(store, [...getSavingsGoals(store), newGoal]);
  saveStore(updated);
  return updated;
}

export function updateSavingsGoalById(store: StoreData, id: string, patch: Partial<SavingsGoal>): StoreData {
  const updated = withSyncedGoals(store, getSavingsGoals(store).map(g => g.id === id ? { ...g, ...patch } : g));
  saveStore(updated);
  return updated;
}

export function deleteSavingsGoalById(store: StoreData, id: string): StoreData {
  const updated = withSyncedGoals(store, getSavingsGoals(store).filter(g => g.id !== id));
  saveStore(updated);
  return updated;
}

// Runs every active, auto-save-enabled goal independently against the same
// net-income base — they're parallel budget envelopes (e.g. "10% to rent
// fund" + "5% to equipment fund"), not a sequential stack that eats into
// each other's share.
/** Above this many missed deposits in one run, report the total instead. */
export const CATCH_UP_NOTIFICATION_LIMIT = 3;

export function runScheduledSavingsDeduction(store: StoreData): StoreData {
  const goals = getSavingsGoals(store);
  const dueGoals = goals.filter(g => g.autoSaveEnabled);
  if (dueGoals.length === 0) return store;

  const nowTime = new Date();

  // A goal that has never run starts counting from now, not from the day the
  // shop opened. Nothing stamped this when auto-save was switched on, so the
  // first run back-filled every scheduled date since createdAt: switching on
  // "save daily" in a shop open 100 days made 100 deposits at once, with 100
  // notifications behind them.
  const unstarted = goals.filter(g => g.autoSaveEnabled && !g.lastDeductionTime);
  if (unstarted.length > 0) {
    const started = goals.map(g =>
      g.autoSaveEnabled && !g.lastDeductionTime
        ? { ...g, lastDeductionTime: nowTime.toISOString() }
        : g,
    );
    // Nothing is due yet by definition, so record the start and stop here.
    return withSyncedGoals(store, started);
  }
  let flowNotifications = store.flowNotifications || [];
  let memoryTimeline = store.memoryTimeline || [];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const updatedGoals = goals.map(goal => {
    if (!goal.autoSaveEnabled) return goal;

    const lastTime = goal.lastDeductionTime ? new Date(goal.lastDeductionTime) : new Date(store.createdAt || nowTime.toISOString());
    if (lastTime.getTime() >= nowTime.getTime()) return goal;

    const occurrences: Date[] = [];
    const current = new Date(lastTime.getTime());
    const [hStr, mStr] = (goal.timeOfDay || "00:00").split(":");
    const schedHours = parseInt(hStr, 10) || 0;
    const schedMinutes = parseInt(mStr, 10) || 0;

    current.setHours(schedHours, schedMinutes, 0, 0);
    if (current.getTime() <= lastTime.getTime()) {
      current.setDate(current.getDate() + 1);
    }

    while (current.getTime() <= nowTime.getTime()) {
      let isDue = false;
      if (goal.frequency === 'daily') {
        isDue = true;
      } else if (goal.frequency === 'weekly') {
        const targetDay = goal.dayOfWeek || 'Monday';
        if (DAYS[current.getDay()] === targetDay) isDue = true;
      } else if (goal.frequency === 'monthly') {
        const targetDayOfMonth = goal.dayOfMonth || 1;
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        const adjustedTarget = Math.min(targetDayOfMonth, daysInMonth);
        if (current.getDate() === adjustedTarget) isDue = true;
      }
      if (isDue) occurrences.push(new Date(current.getTime()));
      current.setDate(current.getDate() + 1);
      current.setHours(schedHours, schedMinutes, 0, 0);
    }

    if (occurrences.length === 0) return goal;

    let currentSaved = goal.saved || 0;
    // Each deposit covers the stretch since the one before it, starting at the
    // last recorded deduction.
    let windowStart = lastTime.getTime();
    let depositedThisRun = 0;
    let depositsThisRun = 0;

    occurrences.forEach(occurrence => {
      const hasTarget = goal.amount && goal.amount > 0;
      if (hasTarget && currentSaved >= goal.amount) return; // target already hit — stop depositing

      const windowEnd = occurrence.getTime();

      let deductionAmount = 0;
      if (goal.autoSaveAmount && goal.autoSaveAmount > 0) {
        deductionAmount = goal.autoSaveAmount;
      } else if (goal.percentage && goal.percentage > 0) {
        // Against what the shop earned in THIS period, not across its whole
        // life. Reading the lifetime figure every time meant a daily 10% goal
        // set aside 10% of everything the shop had ever earned, every day —
        // ₦995m on a shop that had taken ₦100m.
        let revenue = 0;
        let profit = 0;
        for (const sale of store.sales) {
          const t = new Date(sale.date).getTime();
          if (t > windowStart && t <= windowEnd) {
            revenue += Number(sale.total) || 0;
            profit += Number(sale.profit) || 0;
          }
        }
        // Restocking should not shrink what a merchant sets aside for a goal.
        const expenses = sumOperatingExpenses(store, date => {
          const t = new Date(date).getTime();
          return t > windowStart && t <= windowEnd;
        });
        // The goal says which figure it saves out of; the auto-save path used
        // to ignore it and always use net income.
        const base = (goal.source || 'profit') === 'revenue' ? revenue : profit - expenses;
        deductionAmount = (goal.percentage / 100) * base;
      }

      windowStart = windowEnd;
      deductionAmount = Math.round(Math.max(0, deductionAmount) * 100) / 100;
      if (hasTarget) {
        // don't overshoot the target on the final deposit
        deductionAmount = Math.min(deductionAmount, goal.amount - currentSaved);
      }
      if (deductionAmount > 0) {
        currentSaved += deductionAmount;
        depositedThisRun += deductionAmount;
        depositsThisRun++;
        const deductionMsg = `Auto-saved ₦${deductionAmount.toLocaleString()} to ${goal.label || 'Savings'}`;

        // A phone left closed for a month catches up on reopening. One line
        // per missed day buries every other notification, so those are
        // summarised into a single entry below instead.
        if (occurrences.length > CATCH_UP_NOTIFICATION_LIMIT) return;

        flowNotifications = [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          text: deductionMsg,
          icon: '🏦',
          tone: 'success',
          date: occurrence.toISOString(),
          read: false,
          title: 'Automated Savings',
          description: deductionMsg,
          actionLabel: 'View Savings',
          actionTab: 'dashboard'
        }, ...flowNotifications];

        memoryTimeline = [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          type: 'milestone',
          title: 'Automated Savings',
          date: occurrence.toISOString(),
          description: deductionMsg
        }, ...memoryTimeline];
      }
    });

    if (depositsThisRun > 0 && occurrences.length > CATCH_UP_NOTIFICATION_LIMIT) {
      const summary = `Auto-saved ₦${depositedThisRun.toLocaleString()} to ${goal.label || 'Savings'} across ${depositsThisRun} missed deposits`;
      flowNotifications = [{
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        text: summary,
        icon: '🏦',
        tone: 'success',
        date: nowTime.toISOString(),
        read: false,
        title: 'Automated Savings',
        description: summary,
        actionLabel: 'View Savings',
        actionTab: 'dashboard'
      }, ...flowNotifications];
      memoryTimeline = [{
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        type: 'milestone',
        title: 'Automated Savings',
        date: nowTime.toISOString(),
        description: summary
      }, ...memoryTimeline];
    }

    return { ...goal, saved: currentSaved, lastDeductionTime: occurrences[occurrences.length - 1].toISOString() };
  });

  const updated = withSyncedGoals(store, updatedGoals);
  updated.flowNotifications = flowNotifications;
  updated.memoryTimeline = memoryTimeline;
  return updated;
}

/**
 * Move anyone left on the retired 'admin' role over to manager.
 *
 * 'admin' was offered in the staff form and implemented nowhere: it had no
 * case in isTabAllowed, so it fell to `default: return false` and reached no
 * tabs at all. Manager is what it was always meant to be, and is the role that
 * exists. Runs on load so a staff member created before this cannot be locked
 * out of the app by the role being dropped.
 */
export function retireAdminRole(store: any): any {
  const staff = store?.staffMembers;
  if (!Array.isArray(staff) || !staff.some((member: any) => member?.role === 'admin')) return store;
  const migrated = {
    ...store,
    staffMembers: staff.map((member: any) => (
      member?.role === 'admin' ? { ...member, role: 'manager' } : member
    )),
  };
  // Written back, or the record on disk keeps saying 'admin' forever and only
  // the copy in memory is ever right. A plain setItem rather than saveStore:
  // this is a one-off correction, not a change worth a cloud sync and a backup
  // on every load.
  try {
    if (typeof localStorage !== 'undefined' && migrated.accessCode) {
      shopStorage.setItem(STORE_PREFIX + migrated.accessCode, JSON.stringify(migrated));
    }
  } catch { /* private mode: the in-memory copy is still correct */ }
  return migrated;
}

export function loadStore(code: string): StoreData | null {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null;
  const journal = localStorage.getItem('storeflow_transfer_journal');
  if (journal) {
    const pair = JSON.parse(journal);
    for (const value of [pair.source, pair.destination]) shopStorage.setItem(STORE_PREFIX + value.accessCode, JSON.stringify(value));
    localStorage.removeItem('storeflow_transfer_journal');
    saveStore(pair.source, { cloudBase: pair.sourceBase });
    saveStore(pair.destination, { cloudBase: pair.destinationBase });
  }
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
    return null;
  }
  const data = shopStorage.getItem(STORE_PREFIX + code.toUpperCase());
  if (!data) return null;
  let store = JSON.parse(data);

  store = retireAdminRole(store);
  store = ensureStoreId(store);
  /*
   * Everyone the shop has actually served gets a real customer record.
   *
   * Here rather than in each screen: the count sits on the simple home, the
   * full dashboard, the customer page, the export, the analytics and in what
   * Flow says, and teaching six places to read around the same gap is how one
   * of them keeps disagreeing with the others.
   */
  const backfilled = backfillCustomerBook(store, generateId);
  /*
   * Written down when it changed something.
   *
   * The links onto the bundles are written as they are made, so leaving the
   * new customer records unsaved would be the worst of both: bundles pointing
   * at people the book has never heard of, and the check that starts this off
   * seeing them as already linked and never looking again.
   */
  const migratedCustomers = backfilled !== store;
  store = backfilled;
  // Names for sales and expenses made before the records kept one, read back
  // from the activity history (attribution-backfill.ts). Worked out on every
  // open rather than forced into a save, so it can never be the reason a sync
  // clashes; it is kept whenever the shop is next saved anyway.
  store = backfillAttribution(store);
  // Expenses saved on a button nobody pressed - a light bill under Rent -
  // filed by their names. The same way: on every open, kept at the next save.
  store = fileExpensesByName(store);
  store = runScheduledSavingsDeduction(store);
  store = syncStoreData(store);
  store = syncProductPerformance(store);

  upsertStoreIndex(store);
  if (migratedCustomers) saveStore(store);
  return store;
}

let warnedStorageFull = 0;
/** Said at most once a minute, so a burst of saves is one message, not ten. */
function warnStorageFull(): void {
  if (Date.now() - warnedStorageFull < 60_000) return;
  warnedStorageFull = Date.now();
  void import('@/components/Toast').then(({ showToast }) => showToast(
    "Not saved: this phone has no room left for the shop's records. Make a backup in Settings, under Data & Storage, then contact support.",
    'error',
    9000,
  )).catch(() => {});
}

export function saveStore(store: StoreData, options?: { skipCloudSync?: boolean; cloudBase?: StoreData }): void {
  const before = options?.cloudBase ? JSON.stringify(options.cloudBase) : typeof localStorage !== 'undefined' ? shopStorage.getItem(STORE_PREFIX + store.accessCode) : null;
  const synced = syncStoreData(store);
  const scheduled = runScheduledSavingsDeduction(synced);
  Object.assign(store, scheduled);

  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const trash = (store.trash || []).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  store.trash = trash;

  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
    try {
      shopStorage.setItem(STORE_PREFIX + store.accessCode, JSON.stringify(store));
    } catch (error) {
      /*
       * The phone would not keep it, almost always because the browser's
       * storage for this app is full. This threw with nothing said: the tap
       * simply did nothing, and a shopkeeper had no way to know the sale was
       * not kept. It still stops here - carrying on as though it had saved
       * would be worse - but now it says why, and what to do.
       */
      warnStorageFull();
      throw error;
    }
  }
  if (store.managerSettings?.autoBackupsEnabled !== false) {
    createAutoBackupSnapshot().catch(() => {});
  }

  // Never for a worker's slim copy: it is not the shop, and sending it as the
  // shop would overwrite the owner's records with a copy missing most of them.
  if (!options?.skipCloudSync && !store.staffDevice && (store.storeId || store.managerSettings?.multiDeviceSync)) {
    queueStoreSync(store, before ? JSON.parse(before) : undefined);
  }
}
