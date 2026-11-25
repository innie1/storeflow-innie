import type { FlowNotification, Product, ServiceChangeRequest, ServiceFields, StoreData } from '@/types/store';
import { recordActivityLog } from '@/lib/activity-log';
import { addLaundryGarmentType, getLaundryPricingConfig, publishLaundryPricingToTemplate, renameLaundryGarmentType, setLaundryGarmentPrice } from '@/lib/laundry-pricing';

/**
 * A manager's change to a service or its prices, waiting for the owner.
 *
 * A manager may open the Price List and change it on their own phone, but
 * the shop's prices are the owner's to decide. So what a manager's phone
 * sends is only a request (staff_save_services keeps it, untouched, in
 * serviceChangeRequests); the owner is told, sees what it was and what it
 * would be, and nothing changes until they tap Approve. Reject leaves the
 * shop exactly as it was.
 */

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const noticeId = (id: string) => `service-change-${id}`;

/** Only the owner decides the shop's prices. */
export function canApproveServiceChanges(user: { role?: string } | null | undefined): boolean {
  return String(user?.role || '').toLowerCase() === 'owner';
}

export function pendingServiceChanges(store: Pick<StoreData, 'serviceChangeRequests'>): ServiceChangeRequest[] {
  return (store.serviceChangeRequests || []).filter(request => request.status === 'pending');
}

/** Each change in a line: "Pillowcase: ₦300 → ₦250". */
export function serviceChangeLines(request: Pick<ServiceChangeRequest, 'before' | 'proposed' | 'isNew'>): string[] {
  const { before, proposed } = request;
  const lines: string[] = [];
  if (request.isNew) lines.push(`New service: ${proposed.name || 'unnamed'}${proposed.sellingPrice !== undefined ? `, ${money(proposed.sellingPrice)}` : ''}`);
  else {
    if (proposed.name !== undefined && proposed.name !== before.name) lines.push(`Name: ${before.name || '-'} → ${proposed.name}`);
    if (proposed.sellingPrice !== undefined && proposed.sellingPrice !== before.sellingPrice) {
      lines.push(`Starting price: ${before.sellingPrice !== undefined ? money(before.sellingPrice) : '-'} → ${money(proposed.sellingPrice)}`);
    }
    if (proposed.discontinued !== undefined && proposed.discontinued !== !!before.discontinued) lines.push(proposed.discontinued ? 'Turned off' : 'Turned on');
    if (proposed.turnaround !== undefined && proposed.turnaround !== (before.turnaround || '')) lines.push(`Ready in: ${before.turnaround || '-'} → ${proposed.turnaround || '-'}`);
    if (proposed.servicePricing !== undefined && proposed.servicePricing !== before.servicePricing) lines.push(`Charged: ${before.servicePricing || '-'} → ${proposed.servicePricing}`);
    if (proposed.description !== undefined && proposed.description !== (before.description || '')) lines.push('Description changed');
  }
  for (const { from, to } of proposed.itemRenames || []) lines.push(`Item renamed: ${from} → ${to}`);
  for (const item of proposed.addItems || []) lines.push(`New item: ${item}`);
  for (const [item, price] of Object.entries(proposed.garmentPrices || {})) {
    const was = before.garmentPrices?.[item];
    lines.push(was !== undefined ? `${item}: ${money(was)} → ${money(price)}` : `${item}: ${money(price)}`);
  }
  return lines;
}

function notice(request: ServiceChangeRequest, now: Date): FlowNotification {
  const lines = serviceChangeLines(request);
  return {
    id: noticeId(request.id),
    icon: '🏷️',
    tone: 'warning',
    date: now.toISOString(),
    read: false,
    title: `${request._fromStaff.name} wants to change ${request.serviceName}`,
    text: lines.slice(0, 2).join(' · '),
    description: `${lines.join('. ')}. Nothing changes until you approve it on the Price List.`,
    actionLabel: 'Review',
    actionTab: 'inventory',
  };
}

/**
 * Requests that arrived from the cloud, added on the owner's phone.
 *
 * A manager who changes the same service twice sends two requests; only the
 * newest is left to decide, the older one is marked superseded.
 */
export function addArrivedServiceChanges(store: StoreData, incoming: ServiceChangeRequest[] | undefined, now: Date = new Date()): { store: StoreData; added: number } {
  const have = new Set((store.serviceChangeRequests || []).map(request => request.id));
  const fresh = (incoming || []).filter(request => request?.id && request.serviceId && !have.has(request.id))
    .sort((a, b) => Date.parse(a._fromStaff?.at) - Date.parse(b._fromStaff?.at));
  if (!fresh.length) return { store, added: 0 };
  let list = [...(store.serviceChangeRequests || [])];
  let notices = [...(store.flowNotifications || [])];
  for (const request of fresh) {
    list = list.map(old => old.status === 'pending' && old.serviceId === request.serviceId && old._fromStaff?.staffId === request._fromStaff?.staffId
      ? { ...old, status: 'superseded' as const, decidedAt: now.toISOString() }
      : old);
    notices = notices.map(n => list.some(old => old.status === 'superseded' && n.id === noticeId(old.id)) ? { ...n, read: true } : n);
    list = [{ ...request, status: 'pending' }, ...list];
    notices = [notice(request, now), ...notices];
  }
  return { store: { ...store, serviceChangeRequests: list, flowNotifications: notices }, added: fresh.length };
}

function decide(store: StoreData, id: string, approver: { name?: string; role?: string }, approve: boolean, now: Date): StoreData {
  if (!canApproveServiceChanges(approver)) return store;
  const request = (store.serviceChangeRequests || []).find(item => item.id === id);
  // Decided once. A second tap, or a stale screen, changes nothing.
  if (!request || request.status !== 'pending') return store;
  let next = store;
  const { proposed } = request;
  if (approve) {
    const fields: Partial<Product> = {};
    for (const key of ['name', 'description', 'sellingPrice', 'turnaround', 'servicePricing', 'discontinued'] as const) {
      if (proposed[key] !== undefined) (fields as any)[key] = proposed[key];
    }
    const exists = (next.products || []).some(product => String(product.id) === request.serviceId);
    if (exists) {
      next = { ...next, products: next.products.map(product => String(product.id) === request.serviceId ? { ...product, ...fields } : product) };
    } else if (request.isNew) {
      const service = {
        id: request.serviceId, isService: true, category: 'Service', costPrice: 0, quantity: 999999, unit: 'pcs',
        addedAt: now.toISOString(), units_sold: 0, total_revenue: 0, total_profit: 0, restock_count: 0,
        ...fields,
      } as unknown as Product;
      next = { ...next, products: [...(next.products || []), service] };
    }
    // A rename is for the whole price list. The same rename arrives once per
    // service; whichever is approved first renames it, the rest find it done.
    const has = (s: StoreData, name: string) => getLaundryPricingConfig(s).garmentTypes.find(item => item.trim().toLowerCase() === name.trim().toLowerCase());
    for (const { from, to } of proposed.itemRenames || []) {
      const old = has(next, from);
      if (old && !has(next, to)) next = renameLaundryGarmentType(next, old, to);
    }
    for (const item of proposed.addItems || []) if (!has(next, item)) next = addLaundryGarmentType(next, item);
    for (const [item, price] of Object.entries(proposed.garmentPrices || {})) {
      next = setLaundryGarmentPrice(next, request.serviceId, has(next, item) || item, price);
    }
    next = publishLaundryPricingToTemplate(next);
  }
  const lines = serviceChangeLines(request).join('; ');
  next = recordActivityLog(next, approver.name || 'Owner', approver.role || 'owner',
    `${approve ? 'Approved' : 'Rejected'} ${request._fromStaff.name}'s change to ${request.serviceName}: ${lines}`);
  return {
    ...next,
    serviceChangeRequests: (next.serviceChangeRequests || []).map(item => item.id === id
      ? { ...item, status: approve ? 'approved' as const : 'rejected' as const, decidedAt: now.toISOString(), decidedBy: approver.name || 'Owner' }
      : item),
    flowNotifications: (next.flowNotifications || []).map(n => n.id === noticeId(id) ? { ...n, read: true } : n),
  };
}

export function approveServiceChange(store: StoreData, id: string, approver: { name?: string; role?: string }, now: Date = new Date()): StoreData {
  return decide(store, id, approver, true, now);
}

export function rejectServiceChange(store: StoreData, id: string, approver: { name?: string; role?: string }, now: Date = new Date()): StoreData {
  return decide(store, id, approver, false, now);
}

export type { ServiceFields };
