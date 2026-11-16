import { StoreData } from '@/types/store';

// ─── Activity Graph ────────────────────────────────────────────────────────────
export type ActivityRange = 'today' | '7d' | '30d' | '1y' | 'lifetime';

export interface ActivityBucket {
  minute: number; label: string; shortLabel: string;
  sales: number; revenue: number; profit: number;
}

export interface MostActivePeriods {
  buckets: ActivityBucket[];
  peakWindow?: { startLabel: string; endLabel: string };
  totalSales: number;
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60); const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function mostActivePeriods(store: StoreData, range: ActivityRange = '7d', interval: number = 30): MostActivePeriods {
  let cutoff = 0;
  const now = Date.now();
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); cutoff = d.getTime(); }
  else if (range === '7d') cutoff = now - 7 * 86400000;
  else if (range === '30d') cutoff = now - 30 * 86400000;
  else if (range === '1y') cutoff = now - 365 * 86400000;
  else cutoff = 0;

  const N = Math.floor(1440 / interval);
  const labelInterval = interval === 10 ? 120 : interval === 30 ? 180 : 120;

  const buckets: ActivityBucket[] = [];
  for (let i = 0; i < N; i++) {
    const minute = i * interval; const h = Math.floor(minute / 60);
    const showLabel = minute % labelInterval === 0;
    buckets.push({ minute, label: fmtMin(minute), shortLabel: showLabel ? `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}` : '', sales: 0, revenue: 0, profit: 0 });
  }
  let totalSales = 0;
  store.sales.forEach(s => {
    const t = new Date(s.date).getTime();
    if (t < cutoff) return;
    const d = new Date(t);
    const min = d.getHours() * 60 + d.getMinutes();
    const idx = Math.floor(min / interval);
    const b = buckets[idx]; if (!b) return;
    b.sales += 1; b.revenue += s.total; b.profit += s.profit; totalSales += 1;
  });
  let peakWindow: MostActivePeriods['peakWindow'];
  if (totalSales > 0) {
    const sorted = [...buckets].map(b => b.revenue).sort((a, b) => b - a);
    const cut = sorted[Math.min(8, sorted.length - 1)] || 1;
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    buckets.forEach((b, i) => {
      if (b.revenue >= cut && b.revenue > 0) { if (curStart < 0) curStart = i; curLen++; if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; } }
      else { curStart = -1; curLen = 0; }
    });
    if (bestStart >= 0) peakWindow = { startLabel: buckets[bestStart].label, endLabel: fmtMin(Math.min(1440, (bestStart + bestLen) * interval)) };
  }
  return { buckets, peakWindow, totalSales };
}

// ─── Busy times, paid and not ─────────────────────────────────────────────────
export interface SlotActivity {
  minute: number; label: string; shortLabel: string;
  /** Jobs or sales that came in during this slot. */
  count: number;
  /** What was paid on them, and what was not. */
  paid: number; unpaid: number;
}

export interface BusyTimes {
  slots: SlotActivity[];
  peakWindow?: { startLabel: string; endLabel: string };
  total: number;
  paid: number;
  unpaid: number;
}

/**
 * When the work comes in, split by whether it has been paid for.
 *
 * The graph used to offer two separate readings - "clothes in" and "money in"
 * - and an owner had to flip between them to see that the busy hour was also
 * the hour most of the unpaid work arrived. One bar a slot, in two colours,
 * answers both at once: how busy it was, and how much of it is money in hand.
 */
export function busyTimes(
  items: { at: string; paid: number; unpaid: number }[],
  range: ActivityRange = 'today',
  interval: number = 30,
  now: number = Date.now(),
): BusyTimes {
  let cutoff = 0;
  if (range === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); cutoff = d.getTime(); }
  else if (range === '7d') cutoff = now - 7 * 86400000;
  else if (range === '30d') cutoff = now - 30 * 86400000;
  else if (range === '1y') cutoff = now - 365 * 86400000;

  const N = Math.floor(1440 / interval);
  const labelEvery = interval === 10 ? 120 : interval === 30 ? 180 : 120;
  const slots: SlotActivity[] = [];
  for (let i = 0; i < N; i++) {
    const minute = i * interval; const h = Math.floor(minute / 60);
    slots.push({
      minute,
      label: fmtMin(minute),
      shortLabel: minute % labelEvery === 0 ? `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}` : '',
      count: 0, paid: 0, unpaid: 0,
    });
  }

  let total = 0, paid = 0, unpaid = 0;
  for (const item of items) {
    const t = new Date(item.at).getTime();
    if (!Number.isFinite(t) || t < cutoff || t > now) continue;
    const d = new Date(t);
    const slot = slots[Math.floor((d.getHours() * 60 + d.getMinutes()) / interval)];
    if (!slot) continue;
    const p = Math.max(0, Number(item.paid) || 0);
    const u = Math.max(0, Number(item.unpaid) || 0);
    slot.count += 1; slot.paid += p; slot.unpaid += u;
    total += 1; paid += p; unpaid += u;
  }

  let peakWindow: BusyTimes['peakWindow'];
  if (total > 0) {
    const worth = (slot: SlotActivity) => slot.paid + slot.unpaid;
    const sorted = slots.map(worth).sort((a, b) => b - a);
    const cut = sorted[Math.min(8, sorted.length - 1)] || 1;
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    slots.forEach((slot, i) => {
      if (worth(slot) >= cut && worth(slot) > 0) { if (curStart < 0) curStart = i; curLen++; if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; } }
      else { curStart = -1; curLen = 0; }
    });
    if (bestStart >= 0) peakWindow = { startLabel: slots[bestStart].label, endLabel: fmtMin(Math.min(1440, (bestStart + bestLen) * interval)) };
  }
  return { slots, peakWindow, total, paid, unpaid };
}

/** The chart is never narrower than this, so two bars are not blown up to fill a card. */
export const MIN_HOURS_SHOWN = 8;

/**
 * The part of the day worth drawing.
 *
 * A shop open from eight to six had a chart running midnight to midnight, so
 * two thirds of it was empty night and each bar was a few pixels wide. This is
 * the stretch from an hour before the first busy slot to an hour after the
 * last, on whole hours, and at least MIN_HOURS_SHOWN wide.
 */
export function busyWindow(slots: SlotActivity[], interval: number = 30): SlotActivity[] {
  const busy = slots.map((slot, index) => (slot.paid + slot.unpaid > 0 ? index : -1)).filter(index => index >= 0);
  if (!busy.length) return slots;
  const perHour = Math.max(1, Math.round(60 / interval));
  const hours = Math.ceil(slots.length / perHour);
  let from = Math.max(0, Math.floor(busy[0] / perHour) - 1);
  let to = Math.min(hours, Math.floor(busy[busy.length - 1] / perHour) + 2);
  // Widen evenly, then whichever way there is room.
  while (to - from < Math.min(MIN_HOURS_SHOWN, hours)) {
    if (from > 0) from -= 1;
    if (to - from < MIN_HOURS_SHOWN && to < hours) to += 1;
  }
  return slots.slice(from * perHour, to * perHour);
}

/** Which slots carry an hour label, so there are a handful across the chart and never a crowd. */
export function hourLabel(slot: SlotActivity, shown: number, interval: number = 30): string {
  const hours = (shown * interval) / 60;
  const every = hours <= 8 ? 1 : hours <= 14 ? 2 : 3;
  if (slot.minute % (every * 60) !== 0) return '';
  const hour = Math.floor(slot.minute / 60);
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/**
 * The bar a tap was meant for.
 *
 * A bar on a phone is a few pixels wide with a gap beside it, so a finger
 * lands between bars, or on an empty slot next to a busy one, as often as on
 * the bar itself. `across` is how far across the chart the tap was, 0 to 1,
 * and the answer is the nearest slot that has anything in it.
 */
export function nearestBusySlot(slots: SlotActivity[], across: number): SlotActivity | null {
  if (!slots.length || !Number.isFinite(across)) return null;
  // Slot i covers i/N to (i+1)/N, so its middle is at i + 0.5.
  const at = Math.min(1, Math.max(0, across)) * slots.length - 0.5;
  let best: SlotActivity | null = null;
  let bestGap = Infinity;
  slots.forEach((slot, index) => {
    if (slot.paid + slot.unpaid <= 0) return;
    const gap = Math.abs(index - at);
    if (gap < bestGap) { best = slot; bestGap = gap; }
  });
  return best;
}
