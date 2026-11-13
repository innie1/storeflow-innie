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
