import type { FlowNotification, StoreData } from '@/types/store';
import type { LocalLaundryRecord } from '@/lib/laundry-offline';

/**
 * Tells the owner when a bundle was charged under the price list.
 *
 * At intake the total is a box anybody can type in - a regular gets a
 * discount, a big load gets a round number. That is fine, but the owner
 * never knew: a bundle charged ₦1,500 against a list price of ₦2,000 looked
 * like any other. The intake now keeps the list price on the bundle when the
 * charge was lower, and the owner's phone - reading bundles it already holds,
 * so nothing extra is asked of the cloud - says so once per bundle.
 *
 * The owner's own price changes are not reported back to them.
 */

const KEEP = 200;
const RECENT_MS = 14 * 86_400_000;

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

export function priceCutsToNotice(store: StoreData, records: LocalLaundryRecord[], now: Date = new Date()): LocalLaundryRecord[] {
  const seen = new Set(store.priceCutsNoticed || []);
  return records.filter(record =>
    record.clientRef
    && !seen.has(record.clientRef)
    && Number(record.listPrice) > Number(record.total) + 0.5
    // Somebody named, who is not the owner: a bundle that says nobody is
    // one from before names were kept.
    && !!record.recordedByName
    && String(record.recordedByRole || '').toLowerCase() !== 'owner'
    && now.getTime() - (Date.parse(record.createdAt) || 0) < RECENT_MS,
  );
}

function notice(record: LocalLaundryRecord, now: Date): FlowNotification {
  const who = record.recordedByName;
  const list = Number(record.listPrice) || 0;
  const line = `${record.tagCode} · ${record.customerName}: ${money(record.total)} instead of ${money(list)}`;
  return {
    id: `price-cut-${record.clientRef}`,
    icon: '🏷️',
    tone: 'warning',
    date: now.toISOString(),
    read: false,
    title: `${who} charged under the price list`,
    text: line,
    description: `${line} - ${money(list - record.total)} less than your price list.`,
    actionLabel: 'View',
    actionTab: 'laundry-records',
  } as FlowNotification;
}

/** The shop with a notice for each new under-priced bundle, or null when there are none. */
export function noticePriceCuts(store: StoreData, records: LocalLaundryRecord[], now: Date = new Date()): StoreData | null {
  const fresh = priceCutsToNotice(store, records, now);
  if (!fresh.length) return null;
  return {
    ...store,
    flowNotifications: [...fresh.map(record => notice(record, now)), ...(store.flowNotifications || [])],
    priceCutsNoticed: [...(store.priceCutsNoticed || []), ...fresh.map(record => record.clientRef)].slice(-KEEP),
  };
}
