import { useMemo } from 'react';
import { forecastHorizon, forecastTrackRecord } from '@/lib/manager-intel';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { Info, CheckCircle2, AlertCircle, Target } from 'lucide-react';
import RepaymentPredictionsCard from './RepaymentPredictionsCard';
import type { ManagerState } from './useManager';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const day = (time: number) => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The figure, under a plain label, with the range it could reasonably be. */
function Figure({ label, value, range, tone }: { label: string; value: number; range?: [number, number]; tone: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-display font-black text-xl ${tone}`}>{naira(value)}</p>
      {range && <p className="text-[10px] text-muted-foreground mt-0.5">likely {naira(range[0])} – {naira(range[1])}</p>}
    </div>
  );
}

/**
 * Flow's Forecast tab: what is likely to come in, how right these forecasts
 * have turned out to be, and who is likely to pay what they owe.
 */
export default function PredictionsTab({ s }: { s: ManagerState }) {
  const { store, setPredictionHistoryOpen, settings, horizons, forecastHorizonDays, setForecastHorizonDays, FORECAST_LABELS } = s;
  const isService = isServiceFirstBusiness(store);
  const f = useMemo(() => forecastHorizon(store, forecastHorizonDays), [store, forecastHorizonDays]);
  const record = useMemo(() => forecastTrackRecord(store, forecastHorizonDays), [store, forecastHorizonDays]);
  const label = (FORECAST_LABELS[forecastHorizonDays] ?? `${forecastHorizonDays} days`).toLowerCase();
  const stretch = forecastHorizonDays === 1 ? 'tomorrow' : `the next ${label}`;
  const confTone = f.confidence === 'High' ? 'bg-success' : f.confidence === 'Medium' ? 'bg-warning' : 'bg-muted-foreground';
  // A laundry's payment is all "profit" to the till, so a profit forecast was
  // the revenue forecast printed twice. What it can say is what is left once
  // the shop's usual running costs are paid.
  const leftOver = Math.max(0, f.expectedRevenue - f.expectedExpenses);

  if (!settings.revenueForecasts && !settings.profitForecasts) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-xs text-muted-foreground p-4 rounded-2xl bg-card shadow-card">Forecasts are turned off in Settings.</p>
        <RepaymentPredictionsCard store={store} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* How far ahead, chosen once for the whole tab. */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {horizons.map(h => {
          const active = forecastHorizonDays === h;
          return (
            <button
              key={h}
              type="button"
              onClick={() => setForecastHorizonDays(h)}
              aria-pressed={active}
              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-display font-bold whitespace-nowrap transition-all ${active ? 'border-primary text-primary bg-primary/10' : 'border-border/60 text-muted-foreground bg-card'}`}
            >
              {FORECAST_LABELS[h] ?? `${h}d`}
            </button>
          );
        })}
      </div>

      <div className="p-4 rounded-2xl bg-card shadow-card space-y-4">
        <div>
          <h3 className="font-display font-bold text-base">What is likely to come in</h3>
          <p className="text-[11px] text-muted-foreground">For {stretch}, from your recent days</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {settings.revenueForecasts && (
            <Figure label="Money in" value={f.expectedRevenue} range={[f.revenueLow, f.revenueHigh]} tone="text-primary" />
          )}
          {settings.profitForecasts && (isService
            ? <Figure label="Left after running costs" value={leftOver} tone="text-success" />
            : <Figure label="Profit" value={f.expectedProfit} range={[f.profitLow, f.profitHigh]} tone="text-success" />)}
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-muted-foreground">How sure · {f.daysObserved} {f.daysObserved === 1 ? 'day' : 'days'} of takings</span>
            <span className="font-display font-bold">{f.confidencePct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className={`h-full rounded-full ${confTone}`} style={{ width: `${f.confidencePct}%` }} />
          </div>
        </div>

        {f.caveat && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" /> {f.caveat}
          </p>
        )}
      </div>

      {/* Checked by the app against what really came in, instead of asking. */}
      <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-base flex items-center gap-1.5"><Target className="w-4 h-4" /> How right it has been</h3>
            <p className="text-[11px] text-muted-foreground">The same forecast, made on earlier days, beside what you really took</p>
          </div>
          {record.accuracyPct !== null && (
            <span className={`shrink-0 text-[11px] font-display font-bold px-2 py-0.5 rounded-full ${record.accuracyPct >= 75 ? 'bg-success/15 text-success' : record.accuracyPct >= 50 ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'}`}>
              {record.accuracyPct}% close
            </span>
          )}
        </div>

        {record.checks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Not enough history to check {stretch} yet. Once there is, Flow sets each forecast beside what actually came in, by itself.
          </p>
        ) : (
          <>
            <p className="text-xs text-foreground">
              {record.hits} of {record.checks.length} landed inside the range Flow gave.
            </p>
            <ul className="divide-y divide-border">
              {record.checks.map(check => {
                const diff = check.actual - check.predicted;
                const pct = check.predicted > 0 ? Math.round(Math.abs(diff) / check.predicted * 100) : 100;
                return (
                  <li key={check.from} className="py-2.5 flex items-center gap-3">
                    {check.withinRange
                      ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-warning shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-semibold">
                        {forecastHorizonDays === 1 ? day(check.from) : `${day(check.from)} – ${day(check.to - 1)}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Said {naira(check.predicted)} · took {naira(check.actual)}</p>
                    </div>
                    <span className={`text-[11px] font-display font-bold shrink-0 ${check.withinRange ? 'text-success' : 'text-warning'}`}>
                      {check.withinRange ? 'In range' : `${pct}% ${diff > 0 ? 'more' : 'less'}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <button type="button" onClick={() => setPredictionHistoryOpen(true)} className="text-[11px] font-display font-semibold text-primary">
          Saved forecasts
        </button>
      </div>

      <RepaymentPredictionsCard store={store} />
    </div>
  );
}
