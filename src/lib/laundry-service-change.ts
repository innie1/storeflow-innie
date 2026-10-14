import type { FlowNotification, Product, StoreData } from '@/types/store';
import type { LaundryGarmentSelection } from '@/lib/laundry-intake';
import type { LocalLaundryRecord } from '@/lib/laundry-offline';
import { calculateLaundryPriceLines } from '@/lib/laundry-pricing';
import { getStoredServicePricing } from '@/lib/service-pricing';
import { repriceLaundryDebt } from '@/lib/laundry-money';

/**
 * Changing the service on a bundle after it was taken in.
 *
 * Clothes tagged "Full service" that only came for ironing were priced as
 * full service, and nothing on the bundle could be changed once it was in.
 * Now the bundle can be moved to the right service: priced again from the
 * price list exactly as intake prices it, with the reason, and who did it.
 * The owner's phone tells the owner and corrects what the customer owes.
 */

export const SERVICE_CHANGE_REASONS = ['Tagged wrong at intake', 'Customer changed their mind', 'Clothes need different care'];

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/** The services a bundle can be moved to: the shop's, still offered. */
export function laundryServices(store: StoreData): Product[] {
  return (store.products || []).filter(service => service.isService && !service.discontinued);
}

function meta(order: any): Record<string, any> {
  if (order?.service_metadata && typeof order.service_metadata === 'object') return order.service_metadata;
  try { return JSON.parse(order?.notes || '{}') || {}; } catch { return {}; }
}

/** The clothes in a bundle, as a cloud or local order carries them. */
export function bundleGarments(order: any): LaundryGarmentSelection[] {
  const lines = meta(order).garment_lines;
  const fromLines = Array.isArray(lines)
    ? lines.map((line: any) => ({ garmentType: String(line?.garmentType || line?.garment_type || '').trim(), quantity: Number(line?.quantity) || 0 }))
    : [];
  const items: any[] = Array.isArray(order?.order_items) ? order.order_items : [];
  const fromItems = items
    .filter(item => !item?.metadata?.charge_line)
    .map(item => ({ garmentType: String(item?.item_name || '').trim(), quantity: Number(item?.quantity) || 0 }));
  return (fromLines.length ? fromLines : fromItems).filter(item => item.garmentType && item.quantity > 0);
}

export interface ServiceChangeQuote {
  service: Product;
  pricing: string;
  billingQuantity: number;
  garments: LaundryGarmentSelection[];
  /** The price list's price for the new service, delivery included. */
  total: number;
}

/** What the bundle would cost on another service, by the price list. */
export function quoteServiceChange(store: StoreData, order: any, service: Product): ServiceChangeQuote {
  const m = meta(order);
  const garments = bundleGarments(order);
  const billingQuantity = Number(m.billing_quantity) || 1;
  const priced = calculateLaundryPriceLines(store, service, garments, billingQuantity);
  const byType = new Map(priced.lines.map(line => [line.garmentType, line]));
  return {
    service,
    pricing: getStoredServicePricing(service),
    billingQuantity,
    garments: garments.map(item => ({ ...item, unitPrice: byType.get(item.garmentType)?.unitPrice || 0, subtotal: byType.get(item.garmentType)?.subtotal || 0 })),
    total: priced.total + Math.max(0, Number(m.delivery_fee) || 0),
  };
}

const KEEP = 200;
const RECENT_MS = 14 * 86_400_000;
const keyOf = (record: LocalLaundryRecord, at: string) => `${record.clientRef}@${at}`;

function notice(record: LocalLaundryRecord, change: NonNullable<LocalLaundryRecord['serviceChanges']>[number], now: Date): FlowNotification {
  const priced = change.fromTotal !== change.toTotal ? ` · ${money(change.fromTotal)} → ${money(change.toTotal)}` : '';
  const line = `${record.tagCode} · ${record.customerName}: ${change.from || 'service'} → ${change.to}${priced}`;
  return {
    id: `service-change-${record.clientRef}-${Date.parse(change.at)}`,
    icon: '🔁',
    tone: change.toTotal < change.fromTotal ? 'warning' : 'info',
    date: now.toISOString(),
    read: false,
    title: `${change.by || 'Someone'} changed a bundle's service`,
    text: line,
    description: `${line}. Why: ${change.reason}`,
    actionLabel: 'View',
    actionTab: 'laundry-records',
  } as FlowNotification;
}

/**
 * On the owner's phone, from bundles it already holds: what the customer owes
 * follows each changed price, and the owner is told once about every change
 * somebody else made. Null when nothing is new.
 */
export function noticeServiceChanges(store: StoreData, records: LocalLaundryRecord[], now: Date = new Date()): StoreData | null {
  const seen = new Set(store.serviceChangesNoticed || []);
  let next = store;
  const told: string[] = [];
  const notices: FlowNotification[] = [];
  for (const record of records) {
    const changes = record.serviceChanges || [];
    if (!changes.length || !record.clientRef) continue;
    const latest = changes[changes.length - 1];
    if (latest.toTotal === record.total) next = repriceLaundryDebt(next, record.clientRef, record.total, latest.to);
    for (const change of changes) {
      const key = keyOf(record, change.at);
      if (seen.has(key)) continue;
      told.push(key);
      if (String(change.role || '').toLowerCase() === 'owner') continue;
      if (now.getTime() - (Date.parse(change.at) || 0) > RECENT_MS) continue;
      notices.push(notice(record, change, now));
    }
  }
  if (next === store && !told.length) return null;
  return {
    ...next,
    ...(notices.length ? { flowNotifications: [...notices, ...(next.flowNotifications || [])] } : {}),
    ...(told.length ? { serviceChangesNoticed: [...(store.serviceChangesNoticed || []), ...told].slice(-KEEP) } : {}),
  };
}

/** Sent with the bundle as the cloud now has it, so the list shows the change at once. */
export const BUNDLE_REPLACED_EVENT = 'storeflow:bundle-replaced';
