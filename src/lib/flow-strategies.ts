import type { Customer, StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { getCustomerActivitySignals } from '@/lib/business-insights';
import { whatsappUrl } from '@/lib/flow-message-orders';

/**
 * Flow's strategy engine.
 *
 * The app could already tell a merchant what had happened. It could not tell
 * them what to *do* about it — the closest thing was a line on the Customers
 * page reading "0 inactive clients", with no way to act on it even when the
 * number was not zero.
 *
 * A strategy is a piece of shopkeeping advice with evidence behind it and a
 * button attached: who it is about, why it is being raised now, and the one
 * action that resolves it. They are written as data so that adding a new play
 * is one entry in STRATEGIES rather than new machinery.
 *
 * Everything here is derived from the store the merchant already has on the
 * device. Nothing is fetched, so none of this costs anything to run.
 */

export type StrategyId =
  | 'collect-phone-numbers'
  | 'win-back-regular'
  | 'thank-a-regular'
  | 'chase-uncollected';

export interface StrategyAction {
  label: string;
  /** A link to open — tel: or a WhatsApp deep link. */
  href?: string;
  /** Or a tab to move to, when the fix lives inside the app. */
  tab?: string;
}

export interface Strategy {
  id: StrategyId;
  /** Higher wins when several apply. */
  priority: number;
  /** The headline, in the merchant's terms. */
  title: string;
  /** Why Flow is raising it, with the actual numbers in it. */
  body: string;
  actions: StrategyAction[];
  /** Days before this strategy may be raised again once acted on or dismissed. */
  cooldownDays: number;
  /** Short enough for a phone notification. */
  notification: string;
}

const DAY = 24 * 60 * 60 * 1000;

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / DAY)) : null;
}

function hasPhone(customer: Partial<Customer> | null | undefined): boolean {
  return String(customer?.phone || '').replace(/\D/g, '').length >= 7;
}

/* ------------------------------------------------------------------ *
 * Detectors                                                          *
 * ------------------------------------------------------------------ */

/**
 * A phone number is the whole difference between a customer and a stranger who
 * once paid you. This is the advice a service business needs earliest and gets
 * least, so it is raised while the habit is still forming.
 */
function detectPhoneGap(store: StoreData): Strategy | null {
  const customers = (store.customers || []).filter(Boolean);
  if (customers.length < 3) return null;
  const missing = customers.filter(customer => !hasPhone(customer));
  if (missing.length === 0) return null;

  const share = missing.length / customers.length;
  if (share < 0.25) return null;

  return {
    id: 'collect-phone-numbers',
    priority: 40,
    title: 'Ask for phone numbers',
    body: `${missing.length} of your ${customers.length} customers have no phone number saved. `
      + 'A number is the only way to tell someone their clothes are ready, or to bring them back '
      + 'when things go quiet. Ask for it while they are still at the counter.',
    actions: [{ label: 'Open customers', tab: 'customers' }],
    cooldownDays: 14,
    notification: `${missing.length} customers have no phone number. Ask for it at the counter — it is how you bring them back.`,
  };
}

/** Someone who used to come regularly and has stopped. */
function detectWinBack(store: StoreData): Strategy | null {
  const signals = getCustomerActivitySignals(store);
  const lapsed = signals
    .filter(signal => signal.kind === 'inactive' || signal.kind === 'slowing')
    .filter(signal => hasPhone(signal.customer))
    .sort((a, b) => Number(b.customer.totalPurchases || 0) - Number(a.customer.totalPurchases || 0));

  const top = lapsed[0];
  if (!top) return null;

  const away = daysSince(top.customer.lastPurchaseDate);
  if (away === null || away < 21) return null;

  const name = String(top.customer.name || 'This customer');
  const shop = String(store.storeName || 'us');
  const spent = Number(top.customer.totalPurchases || 0);
  const offer = `Hello ${name}, we have missed you at ${shop}. `
    + 'Bring your next load in this week and we will take 10% off as a thank you for being a regular.';

  return {
    id: 'win-back-regular',
    priority: 70,
    title: `${name} has not been in for ${away} days`,
    body: spent > 0
      ? `${name} used to come regularly and has spent ₦${spent.toLocaleString()} with you. `
        + 'A regular going quiet is usually a small thing — a bad week, or somebody nearer. '
        + 'One message is often all it takes.'
      : `${name} used to come regularly and has gone quiet. One message is often all it takes.`,
    actions: [
      { label: 'Call', href: `tel:${String(top.customer.phone || '').replace(/\s/g, '')}` },
      { label: 'WhatsApp', href: whatsappUrl(String(top.customer.phone || ''), top.message) },
      { label: 'Offer 10% off', href: whatsappUrl(String(top.customer.phone || ''), offer) },
    ],
    cooldownDays: 10,
    notification: `${name} has not been in for ${away} days. Want to send a message?`,
  };
}

/** The opposite nudge: keep the good ones close. */
function detectThankRegular(store: StoreData): Strategy | null {
  const signals = getCustomerActivitySignals(store);
  const best = signals
    .filter(signal => signal.kind === 'frequent' && hasPhone(signal.customer))
    .sort((a, b) => Number(b.customer.totalPurchases || 0) - Number(a.customer.totalPurchases || 0))[0];
  if (!best) return null;

  const name = String(best.customer.name || 'Your best customer');
  const spent = Number(best.customer.totalPurchases || 0);
  if (spent < 20_000) return null;

  return {
    id: 'thank-a-regular',
    priority: 20,
    title: `Say thank you to ${name}`,
    body: `${name} has spent ₦${spent.toLocaleString()} with you and keeps coming back. `
      + 'Regulars are the cheapest growth there is, and almost nobody tells them they are noticed.',
    actions: [
      { label: 'WhatsApp', href: whatsappUrl(String(best.customer.phone || ''), best.message) },
    ],
    cooldownDays: 30,
    notification: `${name} is one of your best customers. A short thank-you goes a long way.`,
  };
}

/** Finished work nobody has come back for, with money still owed on it. */
function detectUncollected(store: StoreData): Strategy | null {
  // Records live in their own localStorage bucket, not on the store: there is
  // no `store.laundryRecords`, so reading it meant this strategy could never
  // fire however much finished work was sitting on the shelf.
  const accessCode = String(store.accessCode || '');
  const records = (accessCode ? getLocalLaundryRecords(accessCode) : [])
    .filter(record => record && record.workflowStage !== 'collected');
  const overdue = records.filter(record => {
    const due = daysSince(record.promisedFor);
    return due !== null && due >= 2;
  });
  if (overdue.length === 0) return null;

  const withPhone = overdue.find(record => hasPhone({ phone: record.customerPhone }));
  const actions: StrategyAction[] = [{ label: 'Open records', tab: 'laundry-records' }];
  if (withPhone) {
    const name = String(withPhone.customerName || 'there');
    actions.unshift({
      label: `WhatsApp ${name}`,
      href: whatsappUrl(
        String(withPhone.customerPhone || ''),
        `Hello ${name}, your order at ${store.storeName || 'our shop'} is ready for collection. `
        + 'Please let us know when you can come by.',
      ),
    });
  }

  return {
    id: 'chase-uncollected',
    priority: 85,
    title: `${overdue.length} order${overdue.length > 1 ? 's' : ''} past the promised day`,
    body: 'Finished work sitting on the shelf is money you have already done and not been paid for, '
      + 'and it takes up the space the next job needs. A reminder usually moves it.',
    actions,
    cooldownDays: 3,
    notification: `${overdue.length} order${overdue.length > 1 ? 's are' : ' is'} past the promised day and still not collected.`,
  };
}

const DETECTORS: ((store: StoreData) => Strategy | null)[] = [
  detectUncollected,
  detectWinBack,
  detectPhoneGap,
  detectThankRegular,
];

/* ------------------------------------------------------------------ *
 * Cooldowns                                                          *
 * ------------------------------------------------------------------ */

const COOLDOWN_KEY = 'storeflow_strategy_cooldowns';

type Cooldowns = Partial<Record<StrategyId, number>>;

function readCooldowns(): Cooldowns {
  try {
    return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}') as Cooldowns;
  } catch {
    return {};
  }
}

/**
 * Put a strategy away for a while.
 *
 * Called when the merchant acts on one or dismisses it. Advice repeated daily
 * stops being advice, so every strategy carries its own cooldown: three days
 * for uncollected work, a fortnight for the phone-number habit.
 */
export function snoozeStrategy(id: StrategyId, cooldownDays: number): void {
  try {
    const current = readCooldowns();
    current[id] = Date.now() + cooldownDays * DAY;
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(current));
  } catch {
    // Private mode: the strategy will simply come round again.
  }
}

/** For tests, and for a merchant who clears their data. */
export function clearStrategyCooldowns(): void {
  try { localStorage.removeItem(COOLDOWN_KEY); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ *
 * The engine                                                         *
 * ------------------------------------------------------------------ */

/** Every strategy that currently applies, most urgent first. */
export function activeStrategies(store: StoreData): Strategy[] {
  if (!store) return [];
  const cooldowns = readCooldowns();
  const now = Date.now();
  return DETECTORS
    .map(detect => {
      try { return detect(store); } catch { return null; }
    })
    .filter((strategy): strategy is Strategy => !!strategy)
    .filter(strategy => !(cooldowns[strategy.id] && cooldowns[strategy.id]! > now))
    .sort((a, b) => b.priority - a.priority);
}

/** The one worth the merchant's attention right now, if any. */
export function topStrategy(store: StoreData): Strategy | null {
  return activeStrategies(store)[0] || null;
}
