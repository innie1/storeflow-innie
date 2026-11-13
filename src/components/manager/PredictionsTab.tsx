import { forecastHorizon } from '@/lib/manager-intel';
import { ThumbsUp, ThumbsDown, Info, BarChart3 } from 'lucide-react';
import RepaymentPredictionsCard from './RepaymentPredictionsCard';
import type { ManagerState } from './useManager';

/**
 * Flow's Predictions tab: forecasts and what is likely to run out.
 */
export default function PredictionsTab({ s }: { s: ManagerState }) {
  const {
    store, setPredictionHistoryOpen, forecastFeedback, handleForecastFeedback, settings, horizons,
    forecastHorizonDays, setForecastHorizonDays, FORECAST_LABELS,
  } = s;
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="p-4 rounded-2xl bg-card shadow-card">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-bold text-base">Revenue Forecasts</h3>
          <button
            onClick={() => setPredictionHistoryOpen(true)}
            className="text-[11px] font-display font-semibold text-primary"
          >
            History
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">A trend line through your recent daily sales. Pick how far ahead to look.</p>
        {!settings.revenueForecasts && !settings.profitForecasts ? (
          <p className="text-xs text-muted-foreground p-3 rounded-lg bg-surface-2 border border-border">Revenue and Profit Forecasts are both turned off in Settings.</p>
        ) : (
        <div className="space-y-3">
          {/* Seven horizons, each a full card with its own figures,
              confidence bar, range, caveat and pair of feedback buttons —
              a very long page to answer one question. The horizon is a
              choice now, and only the chosen one is drawn. */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {horizons.map(h => {
              const label = FORECAST_LABELS[h] ?? `${h}d`;
              const active = forecastHorizonDays === h;
              return (
                <button
                  key={h}
                  onClick={() => setForecastHorizonDays(h)}
                  className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-display font-bold whitespace-nowrap transition-all ${
                    active
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-border/60 text-muted-foreground bg-surface-2 hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {(() => {
            const f = forecastHorizon(store, forecastHorizonDays);
            const confColor = f.confidence === 'High' ? 'text-success' : f.confidence === 'Medium' ? 'text-warning' : 'text-muted-foreground';
            const feedbackGiven = forecastFeedback[forecastHorizonDays];
            return (
              <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {settings.revenueForecasts && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Expected revenue</p>
                      <p className="font-display font-black text-lg text-primary">₦{Math.round(f.expectedRevenue).toLocaleString()}</p>
                      {/* Range now widens as confidence falls; it used to be
                          a flat ±20% whatever the estimate was built on. */}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ₦{Math.round(f.revenueLow).toLocaleString()} – ₦{Math.round(f.revenueHigh).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {settings.profitForecasts && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Expected profit</p>
                      <p className="font-display font-black text-lg text-success">₦{Math.round(f.expectedProfit).toLocaleString()}</p>
                      {/* Profit swings wider than revenue, being the gap
                          between two moving numbers, so it gets its own
                          range rather than borrowing revenue's. */}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ₦{Math.round(f.profitLow).toLocaleString()} – ₦{Math.round(f.profitHigh).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">
                      Confidence · built on {f.daysObserved} day{f.daysObserved === 1 ? '' : 's'} of sales
                    </span>
                    <span className={`font-display font-bold ${confColor}`}>{f.confidencePct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${f.confidencePct}%` }} />
                  </div>
                </div>

                {f.caveat && (
                  <p className="text-[10px] text-muted-foreground italic bg-surface-3/50 p-2 rounded flex items-start gap-1.5">
                    <Info className="w-3 h-3 shrink-0 mt-0.5" /> {f.caveat}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                  <span className="text-[10px] text-muted-foreground mr-auto">Was this accurate?</span>
                  <button
                    onClick={() => handleForecastFeedback(forecastHorizonDays, 'correct')}
                    className={`text-xs px-2 py-1 rounded-lg transition flex items-center gap-1 ${feedbackGiven === 'correct' ? 'bg-success/20 text-success' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" /> Correct
                  </button>
                  <button
                    onClick={() => handleForecastFeedback(forecastHorizonDays, 'incorrect')}
                    className={`text-xs px-2 py-1 rounded-lg transition flex items-center gap-1 ${feedbackGiven === 'incorrect' ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" /> Incorrect
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
        )}
        {store.sales.length < 10 && (
          <p className="text-xs text-warning mt-3 p-2 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 shrink-0" /> Forecasts become more accurate as you record more sales. Keep going!</p>
        )}
      </div>

      {/* Customer Repayment Predictions */}
      <RepaymentPredictionsCard store={store} />
    </div>
  );
}
