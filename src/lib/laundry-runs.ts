/**
 * Pickups and deliveries — the shop's runs for the day.
 *
 * Deliberately no live map and no location streaming. What a customer wants to
 * know is whether their clothes are coming today, and a status plus an honest
 * time answers that completely; a dot moving on a map answers a question
 * nobody asked. It would also mean a rider's phone uploading its position all
 * day, which costs egress on a quota that is already tight and turns one known
 * member of staff into something being watched.
 *
 * Navigation uses a plain maps URL, which opens the phone's own map app. That
 * is a link, not an API: no key, no billing, no quota.
 */

import type { StoreData } from '@/types/store';

/** How the bundle gets to the shop and back. */
export type LaundryFulfillment = 'walk_in' | 'pickup' | 'delivery';

/**
 * Where the bundle is in its journey, which is NOT where it is in the wash.
 *
 * Kept apart from the workflow stage on purpose: a bundle can be finished
 * ironing and out on a bike at the same time. Folding delivery into the wash
 * stages would mean a bundle that left the shop stopped counting as ready, and
 * the ready total is what the counter trusts.
 */
export type LaundryRunStatus = 'awaiting_pickup' | 'picked_up' | 'out_for_delivery' | 'delivered';

/**
 * One thing that happened, and when.
 *
 * A status on its own says where a bundle is now and nothing about how it got
 * there — which cannot answer "when did we deliver it?", the question that
 * actually comes up when a customer says they never received their clothes.
 * The trail is what makes a run trackable rather than merely labelled.
 */
export interface RunEvent {
  status: LaundryRunStatus;
  at: string;
  /** Who moved it, so a disputed delivery has a name against it. */
  by?: string;
}

/** Append an event, keeping the trail in the order things happened. */
export function appendRunEvent(events: RunEvent[] | undefined, status: LaundryRunStatus, by?: string): RunEvent[] {
  const trail = Array.isArray(events) ? events : [];
  return [...trail, { status, at: new Date().toISOString(), by: by || undefined }];
}

/** "Picked up 9:14 am by Hanna" — the line a shop reads back. */
export function describeRunEvent(event: RunEvent): string {
  const when = new Date(event.at);
  const time = Number.isFinite(when.getTime())
    ? when.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
  return [runStatusLabel(event.status), time, event.by ? `by ${event.by}` : ''].filter(Boolean).join(' · ');
}

export interface RunStop {
  clientRef: string;
  tagCode: string;
  customerName: string;
  customerPhone: string;
  address: string;
  landmark?: string;
  /** 'pickup' collects from the customer; 'delivery' takes it back. */
  kind: 'pickup' | 'delivery';
  runStatus?: LaundryRunStatus;
  promisedFor?: string;
  /** Still owed, so a rider knows to ask before handing the bag over. */
  balance: number;
  /** Everything that has happened to this run, oldest first. */
  events?: RunEvent[];
}

export const FULFILLMENT_LABELS: Record<LaundryFulfillment, string> = {
  walk_in: 'Walk-in',
  pickup: 'We collect',
  delivery: 'We deliver',
};

/**
 * The next status, or null when the run is finished.
 *
 * A pickup ends at 'picked_up': once the bundle is in the shop the ordinary
 * wash stages take over, and pretending the run is still open would leave it
 * on the day's list for ever.
 */
export function nextRunStatus(kind: 'pickup' | 'delivery', current?: LaundryRunStatus): LaundryRunStatus | null {
  if (kind === 'pickup') return current === 'picked_up' ? null : 'picked_up';
  if (current === 'delivered') return null;
  return current === 'out_for_delivery' ? 'delivered' : 'out_for_delivery';
}

export function runStatusLabel(status?: LaundryRunStatus): string {
  switch (status) {
    case 'picked_up': return 'Picked up';
    case 'out_for_delivery': return 'On the way';
    case 'delivered': return 'Delivered';
    case 'awaiting_pickup': return 'To collect';
    default: return 'To do';
  }
}

/** What the rider taps to move it on. */
export function runActionLabel(kind: 'pickup' | 'delivery', current?: LaundryRunStatus): string | null {
  const next = nextRunStatus(kind, current);
  if (!next) return null;
  if (next === 'picked_up') return 'Picked up';
  if (next === 'out_for_delivery') return 'Set off';
  return 'Delivered';
}

/**
 * A link the phone's own map app can open.
 *
 * Not a maps API. This is the plain directions URL, so it needs no key and
 * costs nothing however many times it is tapped. A landmark is included
 * because a great many addresses here are only findable by one.
 */
export function mapsLink(address: string, landmark?: string): string {
  const destination = [address, landmark].filter(Boolean).join(', ').trim();
  if (!destination) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function telLink(phone: string): string {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

/**
 * What the customer is told, in the words a person would use.
 *
 * No tracking link, because there is nothing to track: the message itself is
 * the update, and it arrives on WhatsApp where they will actually see it.
 */
export function runMessage(store: StoreData, stop: RunStop, status: LaundryRunStatus): string {
  const shop = String(store.storeName || 'your laundry');
  const name = stop.customerName ? ` ${stop.customerName}` : '';
  switch (status) {
    case 'picked_up':
      return `Hello${name}, we have collected your laundry (${stop.tagCode}). We will let you know when it is ready.`;
    case 'out_for_delivery':
      return stop.balance > 0
        ? `Hello${name}, your laundry (${stop.tagCode}) is on the way. Balance to pay on delivery: ₦${stop.balance.toLocaleString()}.`
        : `Hello${name}, your laundry (${stop.tagCode}) is on the way to you now.`;
    case 'delivered':
      return `Hello${name}, your laundry (${stop.tagCode}) has been delivered. Thank you for using ${shop}.`;
    default:
      return `Hello${name}, we will collect your laundry (${stop.tagCode}) today.`;
  }
}

/**
 * Split the day's stops into the two runs.
 *
 * A pickup is outstanding until it has been collected. A delivery only joins
 * the list once the washing is actually finished — putting it up earlier would
 * send a rider out for a bundle still in the machine.
 */
export function splitRuns(stops: RunStop[]): { pickups: RunStop[]; deliveries: RunStop[] } {
  return {
    pickups: stops.filter(stop => stop.kind === 'pickup' && stop.runStatus !== 'picked_up'),
    deliveries: stops.filter(stop => stop.kind === 'delivery' && stop.runStatus !== 'delivered'),
  };
}

/** Soonest promised first, so the run has an order without anyone sorting it. */
export function byPromised(stops: RunStop[]): RunStop[] {
  return [...stops].sort((a, b) => {
    const left = a.promisedFor ? new Date(a.promisedFor).getTime() : Number.POSITIVE_INFINITY;
    const right = b.promisedFor ? new Date(b.promisedFor).getTime() : Number.POSITIVE_INFINITY;
    return left - right;
  });
}

/**
 * The fee, folded into what the bundle costs.
 *
 * Returned rather than stored separately so it goes through the same payment
 * path as the washing. A fee kept on the side would not reach the balance, the
 * takings or the customer's receipt — it would be money the shop earned and
 * the books never saw.
 */
export function totalWithDelivery(serviceTotal: number, deliveryFee: number): number {
  return Math.max(0, Number(serviceTotal) || 0) + Math.max(0, Number(deliveryFee) || 0);
}
