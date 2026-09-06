import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Savings and shrinkage had a receiving end but no sender.
 *
 * The service worker knew how to draw those notifications and give them an
 * "I understand" button, and the app raised both in its own tray — but
 * send-flow-reminders only had streak, sales and debt. With the app closed the
 * phone stayed silent, so "your savings was deducted" only ever reached a
 * merchant who was already looking at the app.
 *
 * These two are per-store facts rather than broadcasts, so unlike the generic
 * reminders they read each shop's own record and send it different words.
 */

const fn = readSource('supabase/functions/send-flow-reminders/index.ts');
const sw = readSource('src/sw.ts');
const lib = readSource('src/lib/stock-loss-notice.ts');

const branch = fn.slice(
  fn.indexOf('if (reminderType === "savings" || reminderType === "stock_loss")'),
  fn.indexOf('// EXISTING MODES'),
);

describe('both senders exist', () => {
  it('accepts the two new reminder types', () => {
    expect(fn).toContain('"savings"');
    expect(fn).toContain('"stock_loss"');
    expect(branch.length).toBeGreaterThan(500);
  });

  it('reads each shop\'s own record rather than broadcasting one message', () => {
    expect(branch).toContain('.from("stores")');
    expect(branch).toContain('byStoreId[sub.store_id]');
  });

  it('tells the merchant the actual figures', () => {
    // "Your savings was deducted" with no number means opening the app to
    // learn anything, which defeats telling them.
    expect(branch).toContain('saved so far');
    expect(branch).toContain('unaccounted for');
  });
});

describe('the notification arrives with the right buttons', () => {
  it('sends a category the service worker understands', () => {
    expect(branch).toContain('category: reminderType');
  });

  it('and the service worker actually matches those strings', () => {
    // The sender says "stock_loss"; a check for "stock loss" with a space
    // would silently never match and the buttons would fall back to a plain
    // "open".
    const categoryOf = sw.slice(sw.indexOf('function categoryOf'), sw.indexOf('function quietNow'));
    expect(categoryOf).toContain("raw.includes('stock_loss')");
    expect(categoryOf).toContain("raw.includes('saving')");
    expect('stock_loss'.includes('stock_loss')).toBe(true);
    expect('savings'.includes('saving')).toBe(true);
  });

  it('gives both an "I understand" button', () => {
    const build = sw.slice(sw.indexOf('function buildActions'), sw.indexOf('function notificationUrl'));
    expect(build).toContain("category === 'savings' || category === 'stock_loss'");
    expect(build).toContain('I understand');
  });
});

describe('it does not become a nuisance', () => {
  it('says nothing outside waking hours', () => {
    expect(branch).toContain('hour < 8 || hour >= 21');
  });

  it('will not mention the same shrinkage twice in a week', () => {
    expect(branch).toContain('7 * 86400000');
  });

  it('stays quiet once the merchant has acknowledged that shortfall', () => {
    expect(branch).toContain('stockLossAcknowledgedSignature');
  });

  it('only reports a deposit it has not already reported', () => {
    expect(branch).toContain('lastSavingsPushAt');
    expect(branch).toContain('at <= lastTold');
  });

  it('does not silence a subject when the send failed', () => {
    // Recording "already told them" on a failed push would swallow it for a
    // week and the merchant would never hear about it.
    expect(branch).toContain('deliveredStoreIds');
    expect(branch).toContain("r.status === \"fulfilled\"");
  });
});

describe('the two implementations of the same rule agree', () => {
  it('uses the same thresholds as the in-app notice', () => {
    // The client decides when to raise it in the tray; the edge function
    // decides when to push it. They are different runtimes reading the same
    // data, so the numbers have to match or a merchant gets one and not the
    // other.
    expect(lib).toContain('LOOKBACK_DAYS = 30');
    expect(branch).toContain('30 * 86400000');

    expect(lib).toContain('MIN_SHARE_OF_DAILY_PROFIT = 0.25');
    expect(branch).toContain('dailyProfit * 0.25');

    expect(lib).toContain('COOLDOWN_DAYS = 7');
    expect(branch).toContain('7 * 86400000');
  });

  it('carries an acknowledgement from the phone to the server', () => {
    // The app records "understood" in localStorage, which the sender cannot
    // see. Without this the tray would go quiet while the phone kept buzzing
    // about the same shortfall.
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain('stockLossAcknowledgedSignature: signature');
    expect(readSource('src/types/store.ts')).toContain('stockLossAcknowledgedSignature?: string');
    expect(lib).toContain('export function acknowledgeStockLoss(): string | null');
  });

  it('identifies a shortfall the same way in both', () => {
    // Same signature, so acknowledging in one place is understood by the other.
    expect(lib).toContain('`${a.id}:${a.variance}`');
    expect(branch).toContain('`${a.id}:${a.variance}`');
  });
});
