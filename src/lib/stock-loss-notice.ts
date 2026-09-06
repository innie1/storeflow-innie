import type { StoreData } from '@/types/store';

/**
 * Tells the merchant, occasionally, that stock has gone missing.
 *
 * Shrinkage was recorded by stock counts and then never mentioned anywhere —
 * it only showed up as a line inside the leak detector, which a merchant has
 * to go looking for. It is worth raising on its own, because unlike a thin
 * margin it usually means something happening in the shop right now.
 *
 * "Occasionally" is the whole design. A shortfall does not become more true by
 * being repeated, so this raises the subject at most once a week, says nothing
 * at all until the loss is worth the interruption, and stops entirely once the
 * merchant acknowledges it. Acknowledging a specific shortfall silences that
 * shortfall — a later, different one can still speak up.
 */

/** How long to stay quiet after raising this, acknowledged or not. */
const COOLDOWN_DAYS = 7;

/** Shortfalls older than this are history, not news. */
const LOOKBACK_DAYS = 30;

/**
 * Don't interrupt over a rounding error. A shortfall has to be worth at least
 * this share of what the shop earns in a day before it is worth saying.
 */
const MIN_SHARE_OF_DAILY_PROFIT = 0.25;

const STORAGE_KEY = 'storeflow_stock_loss_notice';

interface NoticeState {
  /** Identifies the exact set of shortfalls last raised. */
  signature: string;
  /** When it was last raised. */
  raisedAt: string;
  /** Set once the merchant has said they understand. */
  acknowledged?: boolean;
}

export interface StockLossNotice {
  /** Stable id, so acknowledging it can be matched back. */
  id: string;
  title: string;
  body: string;
  units: number;
  value: number;
}

function readState(): NoticeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NoticeState) : null;
  } catch {
    return null;
  }
}

function writeState(state: NoticeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode, or storage full — the notice simply repeats next week */
  }
}

/**
 * Marks the current shortfall as understood, so it stops being raised.
 *
 * Returns the signature of what was acknowledged. The caller writes that onto
 * the store record, because the push sender runs on the server and cannot see
 * this device's localStorage — without it, saying "I understand" would silence
 * the in-app notice while the phone kept buzzing about the same shortfall.
 */
export function acknowledgeStockLoss(): string | null {
  const state = readState();
  if (!state) return null;
  writeState({ ...state, acknowledged: true });
  return state.signature;
}

/** Forgets everything, for tests and for a merchant switching stores. */
export function resetStockLossNotice() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}

/**
 * Returns the notice to raise, or null when there is nothing worth saying.
 * Calling this does not itself record anything; call `markStockLossRaised`
 * once the notice has actually been shown.
 */
export function getStockLossNotice(store: StoreData, now = Date.now()): StockLossNotice | null {
  const since = now - LOOKBACK_DAYS * 86400000;
  const shortfalls = (store.stockCountAudits || []).filter(
    a => a.variance < 0 && new Date(a.date).getTime() >= since,
  );
  if (shortfalls.length === 0) return null;

  const products = store.products || [];
  const priced = products.filter(p => !p.discontinued && p.costPrice > 0);
  const avgCost = priced.length
    ? priced.reduce((sum, p) => sum + p.costPrice, 0) / priced.length
    : 0;

  const units = shortfalls.reduce((sum, a) => sum + Math.abs(a.variance), 0);
  const value = shortfalls.reduce((sum, a) => {
    const match = products.find(p => p.name === a.product);
    return sum + Math.abs(a.variance) * (match?.costPrice || avgCost);
  }, 0);
  if (value <= 0) return null;

  // Worth an interruption? Compare against what the shop actually earns.
  const profit30 = (store.sales || [])
    .filter(s => new Date(s.date).getTime() >= since)
    .reduce((sum, s) => sum + (Number(s.profit) || 0), 0);
  const dailyProfit = profit30 / LOOKBACK_DAYS;
  if (dailyProfit > 0 && value < dailyProfit * MIN_SHARE_OF_DAILY_PROFIT) return null;

  // The exact shortfalls this is about. A new one changes the signature, so
  // acknowledging today's does not silence next month's.
  const signature = shortfalls
    .map(a => `${a.id}:${a.variance}`)
    .sort()
    .join('|');

  const state = readState();
  if (state?.signature === signature) {
    if (state.acknowledged) return null;
    const age = now - new Date(state.raisedAt).getTime();
    if (age < COOLDOWN_DAYS * 86400000) return null;
  }

  const money = `₦${Math.round(value).toLocaleString()}`;
  return {
    id: `stock-loss-${signature.length}-${Math.round(value)}`,
    title: 'Stock has gone missing',
    body: `${units} unit${units === 1 ? '' : 's'} unaccounted for since your last counts, worth about ${money}.`,
    units,
    value: Math.round(value),
  };
}

/** Records that the notice was shown, starting the quiet period. */
export function markStockLossRaised(store: StoreData, now = Date.now()) {
  const since = now - LOOKBACK_DAYS * 86400000;
  const shortfalls = (store.stockCountAudits || []).filter(
    a => a.variance < 0 && new Date(a.date).getTime() >= since,
  );
  if (shortfalls.length === 0) return;
  const signature = shortfalls
    .map(a => `${a.id}:${a.variance}`)
    .sort()
    .join('|');
  const previous = readState();
  writeState({
    signature,
    raisedAt: new Date(now).toISOString(),
    // A different shortfall is a different subject, so it starts unacknowledged.
    acknowledged: previous?.signature === signature ? previous.acknowledged : false,
  });
}
