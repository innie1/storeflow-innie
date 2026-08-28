const LOW_STOCK_KEY = 'storeflow_low_stock_threshold';
const DEFAULT_LOW_STOCK = 5;

export function getLowStockThreshold(): number {
  const raw = localStorage.getItem(LOW_STOCK_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_STOCK;
}

export function saveLowStockThreshold(value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  localStorage.setItem(LOW_STOCK_KEY, String(Math.floor(value)));
}
