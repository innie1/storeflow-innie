import { StoreData } from '@/types/store';
import { Forecast } from '@/lib/manager-intel';
import { supabase } from '@/integrations/supabase/client';

export interface PredictionLogRow {
  id: string;
  horizon_days: number;
  label: string;
  predicted_revenue: number;
  predicted_profit: number;
  target_date: string;
  log_date: string;
  feedback: 'correct' | 'incorrect' | null;
  created_at: string;
}

export interface ReconciledPrediction extends PredictionLogRow {
  resolved: boolean; // target_date has passed, actuals are computable
  actualRevenue: number | null;
  actualProfit: number | null;
  accuracyPct: number | null; // 100 - abs(% error), clamped at 0
  outcomeMessage: string | null;
}

// One row per store/horizon/day — logPrediction is safe to call every time
// the Forecasts tab renders; the unique index on (store_id, horizon_days,
// log_date) makes repeat calls within the same day no-ops.
export async function logPrediction(store: StoreData, forecast: Forecast): Promise<void> {
  if (!store.id) return;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + forecast.horizonDays);
  try {
    await supabase.from('prediction_log').insert({
      store_id: store.id,
      horizon_days: forecast.horizonDays,
      label: forecast.label,
      predicted_revenue: forecast.expectedRevenue,
      predicted_profit: forecast.expectedProfit,
      target_date: targetDate.toISOString().slice(0, 10),
    });
    // Unique violation on repeat same-day calls is expected and fine —
    // deliberately not checking the error here.
  } catch {
    // Best-effort logging; a failed log shouldn't block the forecast UI.
  }
}

export async function submitPredictionFeedback(store: StoreData, horizonDays: number, feedback: 'correct' | 'incorrect'): Promise<boolean> {
  if (!store.id) return false;
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('prediction_log')
    .update({ feedback, feedback_at: new Date().toISOString() })
    .eq('store_id', store.id)
    .eq('horizon_days', horizonDays)
    .eq('log_date', today);
  return !error;
}

export async function fetchPredictionLogs(store: StoreData, limit = 60): Promise<PredictionLogRow[]> {
  if (!store.id) return [];
  const { data, error } = await supabase
    .from('prediction_log')
    .select('id, horizon_days, label, predicted_revenue, predicted_profit, target_date, log_date, feedback, created_at')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as PredictionLogRow[];
}

// Computes actual revenue/profit for the window [logDate, targetDate) from
// this store's own sales — no estimation, just a sum over the recorded
// window the prediction was actually about.
function actualForWindow(store: StoreData, logDate: string, targetDate: string) {
  const start = new Date(logDate);
  const end = new Date(targetDate);
  const inWindow = store.sales.filter(s => {
    const d = new Date(s.date);
    return d >= start && d < end;
  });
  const revenue = inWindow.reduce((s, x) => s + (x.total || 0), 0);
  // Sale doesn't always carry profit directly in this codebase's local
  // model — fall back to 0 if absent rather than guessing a margin.
  const profit = inWindow.reduce((s, x) => s + ((x as any).profit || 0), 0);
  return { revenue, profit };
}

function outcomeMessageFor(accuracyPct: number, actualRevenue: number, predictedRevenue: number): string {
  if (predictedRevenue <= 0) return 'Not enough data at the time to judge.';
  const diff = ((actualRevenue - predictedRevenue) / predictedRevenue) * 100;
  if (Math.abs(diff) <= 15) return 'Prediction achieved.';
  return diff > 15 ? 'Performance exceeded prediction.' : 'Performance below prediction.';
}

export function reconcilePredictions(store: StoreData, logs: PredictionLogRow[]): ReconciledPrediction[] {
  const today = new Date().toISOString().slice(0, 10);
  return logs.map(log => {
    const resolved = log.target_date <= today;
    if (!resolved) {
      return { ...log, resolved: false, actualRevenue: null, actualProfit: null, accuracyPct: null, outcomeMessage: null };
    }
    const { revenue, profit } = actualForWindow(store, log.log_date, log.target_date);
    const pctError = log.predicted_revenue > 0 ? Math.abs((revenue - log.predicted_revenue) / log.predicted_revenue) * 100 : null;
    const accuracyPct = pctError !== null ? Math.max(0, Math.round(100 - pctError)) : null;
    const outcomeMessage = accuracyPct !== null ? outcomeMessageFor(accuracyPct, revenue, log.predicted_revenue) : null;
    return {
      ...log,
      resolved: true,
      actualRevenue: revenue,
      actualProfit: profit,
      accuracyPct,
      outcomeMessage,
    };
  });
}

export function overallAccuracy(reconciled: ReconciledPrediction[]): number | null {
  const withAccuracy = reconciled.filter(r => r.accuracyPct !== null);
  if (withAccuracy.length === 0) return null;
  return Math.round(withAccuracy.reduce((s, r) => s + (r.accuracyPct || 0), 0) / withAccuracy.length);
}
