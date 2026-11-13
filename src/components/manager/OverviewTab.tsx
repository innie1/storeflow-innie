import { isServiceFirstBusiness, runsATill } from '@/lib/business-runtime';
import { DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import {
  inventoryIntelligence,
  stockCoverLabel,
  getTopOpportunities,
  getProfitLeaks,
  getSeasonalPredictions,
  getWeatherInsights,
  generateWeeklyRecap,
} from '@/lib/manager-intel';
import { getLowStockThreshold } from '@/lib/settings';
import {
  Package,
  Star,
  Calendar,
  Rocket,
  AlertTriangle,
  ClipboardList,
  Banknote,
  Clock,
  PiggyBank,
  ShoppingCart,
  ChevronRight,
} from 'lucide-react';
import BreakEvenCard from '@/components/BreakEvenCard';
import MonthReportCard from '@/components/MonthReportCard';
import { isServiceShop } from '@/lib/flow-service-brain';
import MessageIcon from '@/components/MessageIcon';
import { Ring } from './ui';
import StoreHealthCard from './StoreHealthCard';
import MoneyOwedCard from './MoneyOwedCard';
import type { ManagerState } from './useManager';

/**
 * Flow's Overview tab, in the order an owner asks: what to do next, how the
 * month stands, who owes what, how last week went, then ideas and the rest.
 */
export default function OverviewTab({ s }: { s: ManagerState }) {
  const {
    store, onUpdate, onNavigate, setTab, requestText, setRequestText, setShowBreakdown,
    setShowPerformanceCalendar, settings, requests, savings, addRequest, advice,
    advicePriorityColor, adviceIconBg,
  } = s;
  const isService = isServiceFirstBusiness(store);
  return (
    <div className="space-y-4 animate-fade-in text-left">
      {/* The one thing to do, first: it used to sit below the health score,
          the recap and a calendar link. */}
      {advice.length > 0 && (
        <div className={`p-4 rounded-2xl border ${advicePriorityColor[advice[0].priority]} shadow-card`}>
          <p className="text-[11px] text-muted-foreground mb-2 font-display font-semibold">Do this next</p>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${adviceIconBg[advice[0].priority]}`}><MessageIcon emoji={advice[0].icon} className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm text-foreground">{advice[0].title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{advice[0].detail}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3">
            {advice[0].goTo && (
              <button onClick={() => onNavigate?.(advice[0].goTo!, advice[0].focus)} className="text-xs text-primary font-display font-bold">Go there →</button>
            )}
            <button onClick={() => setTab('advice')} className="text-xs text-muted-foreground font-display font-semibold">
              All advice{advice.length > 1 ? ` (${advice.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* What the month must take, and how it went. Here rather than on
          the home screen: this is where somebody has come to think about
          the business, not to take a bundle in. */}
      {isServiceShop(store) && (
        <>
          <BreakEvenCard store={store} canSeeMoney />
          <MonthReportCard store={store} canSeeMoney />
        </>
      )}

      <StoreHealthCard store={store} onOpenBreakdown={() => setShowBreakdown(true)} animate={settings.numericAnimations !== false} />

      <MoneyOwedCard store={store} onClick={() => onNavigate?.('pending')} />

      {/* A laundry takes money at a counter but never opens a drawer, floats
          it or tallies a shift against it, so this is for till shops only.
          Pending Payments used to sit here as a tile of its own, directly
          above the Money Owed card that opens the same screen. */}
      {runsATill(store) && (
        <button
          onClick={() => onNavigate?.('cash-drawer')}
          className="w-full p-3 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all flex items-center justify-between text-left group shadow-card"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="bg-primary/10 text-primary w-9 h-9 rounded-xl flex items-center justify-center shrink-0"><Banknote className="w-4 h-4" /></span>
            <div className="min-w-0">
              <p className="font-display font-bold text-sm text-foreground">Cash drawer</p>
              <p className="text-[11px] text-muted-foreground truncate">Cash in and out, by shift</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Weekly Recap */}
      {settings.weeklyRecap && (() => {
        const recap = generateWeeklyRecap(store);
        if (!recap) return null;
        return (
          <div className="p-4 rounded-2xl bg-card border border-border/40 shadow-card space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Last week</h3>
              <span className="text-[10px] text-muted-foreground">{recap.weekLabel}</span>
            </div>
            {/* A laundry's payments are all "profit" to the till, so its
                profit read the same as its revenue, and its best seller was
                the one line every payment is filed under. */}
            <div className={`grid gap-2 text-center ${isService ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <div className="p-2 rounded-xl bg-surface-2">
                <p className="text-[10px] text-muted-foreground">{isService ? 'Money in' : 'Revenue'}</p>
                <p className="font-display font-bold text-sm text-primary">₦{recap.revenue.toLocaleString()}</p>
              </div>
              {!isService && (
                <div className="p-2 rounded-xl bg-surface-2">
                  <p className="text-[10px] text-muted-foreground">Profit</p>
                  <p className="font-display font-bold text-sm text-success">₦{recap.profit.toLocaleString()}</p>
                </div>
              )}
              <div className="p-2 rounded-xl bg-surface-2">
                <p className="text-[10px] text-muted-foreground">{isService ? 'Payments' : 'Sales'}</p>
                <p className="font-display font-bold text-sm">{recap.salesCount}</p>
              </div>
            </div>
            {recap.revenuePctVsPrevWeek !== null && (
              <p className={`text-xs ${recap.revenuePctVsPrevWeek >= 0 ? 'text-success' : 'text-warning'}`}>
                {recap.revenuePctVsPrevWeek >= 0 ? '↑' : '↓'} {Math.abs(recap.revenuePctVsPrevWeek)}% vs the week before
              </p>
            )}
            {recap.bestSeller && !isService && (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Star className="w-3.5 h-3.5" /> Best seller: {recap.bestSeller}</p>
            )}
          </div>
        );
      })()}

      {/* Top Opportunities Card */}
      {settings.productSuggestions && (() => {
        const opps = getTopOpportunities(store);
        if (opps.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-card border border-primary/20 shadow-card space-y-3">
            <div className="flex items-center gap-1.5">
              <Rocket className="w-4 h-4 text-primary" />
              <h3 className="font-display font-bold text-sm">Worth doing next</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {opps.map((o, idx) => (
                // A button, not a div with a chevron drawn on it. Every one
                // of these looked tappable and did nothing.
                <button
                  key={idx}
                  type="button"
                  onClick={() => onNavigate?.(o.goTo, o.focus)}
                  className="p-3 rounded-xl bg-surface-2 border border-border flex flex-col justify-between text-left hover:bg-surface-3 active:scale-[0.99] transition-all"
                >
                  <div>
                    <p className="font-display font-bold text-xs text-foreground line-clamp-1">{o.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-normal line-clamp-2">{o.description}</p>
                  </div>
                  <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-border/40 gap-2">
                    <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">
                      {o.impactAmount !== undefined
                        ? `₦${o.impactAmount.toLocaleString()} ${o.impactLabel}`
                        : o.impactLabel}
                    </span>
                    <span className="text-[9px] text-primary font-semibold shrink-0">{o.actionLabel} ›</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Profit Leak Detector Card */}
      {(() => {
        const leaks = getProfitLeaks(store);
        if (leaks.length === 0) return null;
        const leaking = leaks.filter(l => l.kind === 'leaking');
        const stuck = leaks.filter(l => l.kind === 'stuck');
        // Only money actually lost is added up. The total used to include
        // stock on the shelf and invoices raised the day before, so it
        // read as a loss several times larger than anything was.
        const leakTotal = leaking.reduce((sum, l) => sum + l.amountLeak, 0);

        const Row = ({ l, tone }: { l: typeof leaks[number]; tone: 'bad' | 'idle' }) => (
          <div className="p-2.5 rounded-xl bg-surface-2 border border-border text-left">
            <div className="flex justify-between items-start gap-2">
              <p className="font-display font-bold text-xs text-foreground">{l.title}</p>
              <span className={`text-[9px] font-mono font-bold shrink-0 ${tone === 'bad' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {tone === 'bad' ? '-' : ''}₦{l.amountLeak.toLocaleString()}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{l.description}</p>
            <p className="text-[10px] text-foreground/80 mt-1">{l.recommendation}</p>
          </div>
        );

        return (
          <div className="p-4 rounded-2xl bg-card border border-destructive/25 shadow-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <div>
                  <h3 className="font-display font-bold text-sm">Where money is going</h3>
                  <p className="text-[10px] text-muted-foreground">Last 30 days</p>
                </div>
              </div>
              {leakTotal > 0 && (
                <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-bold shrink-0">
                  ₦{leakTotal.toLocaleString()} lost
                </span>
              )}
            </div>

            {leaking.length > 0 && (
              <div className="space-y-2">
                {leaking.map((l, i) => <Row key={`leak-${i}`} l={l} tone="bad" />)}
              </div>
            )}

            {stuck.length > 0 && (
              <div className="space-y-2">
                {/* Kept apart on purpose: this is money the merchant still
                    has. Adding it to the figure above turned assets into
                    losses. */}
                <p className="text-[10px] font-display font-bold text-muted-foreground uppercase pt-1">
                  Money you have but can't spend
                </p>
                {stuck.map((l, i) => <Row key={`stuck-${i}`} l={l} tone="idle" />)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Inventory alerts */}
      {settings.inventoryForecasts && (() => {
        const alerts = inventoryIntelligence(store).filter(f => f.urgency !== 'ok').slice(0, 3);
        if (alerts.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
            <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Package className="w-4 h-4" /> Stock Alerts</h3>
            <div className="space-y-2">
              {alerts.map(f => (
                <div key={f.product.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${f.urgency === 'critical' ? 'bg-destructive/5 border-destructive/30' : 'bg-warning/5 border-warning/30'}`}>
                  <div>
                    <p className="text-sm font-display font-semibold">{f.product.name}</p>
                    <p className="text-[11px] text-muted-foreground">{stockCoverLabel(f)}{f.hasVelocity ? ` · Order ${f.restockQty} units` : ''}</p>
                  </div>
                  <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${f.urgency === 'critical' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}><AlertTriangle className="w-3 h-3" /> {f.urgency === 'critical' ? 'Critical' : 'Soon'}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Smart Restocking Buy List */}
      {(() => {
        const threshold = store.managerSettings?.minStockThreshold ?? getLowStockThreshold();
        const autoSuggest = !!store.managerSettings?.autoSuggestRestock;

        // Calculate velocity
        const salesCount: Record<string, number> = {};
        store.sales.forEach(sale => {
          salesCount[sale.productId] = (salesCount[sale.productId] || 0) + sale.quantity;
        });

        // Filter needy products (not discontinued, stock <= threshold)
        const needy = store.products
          .filter(p => !p.discontinued && p.quantity <= threshold)
          .map(p => {
            const velocity = salesCount[p.id] || 0;
            const targetQty = store.managerSettings?.defaultRestockQty ?? 50;
            const suggestedQty = Math.max(1, targetQty - p.quantity);
            const totalCost = suggestedQty * p.costPrice;
            return { product: p, velocity, suggestedQty, totalCost };
          });

        // Sort by velocity descending
        needy.sort((a, b) => b.velocity - a.velocity);

        // Calculate Net Income budget
        const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
        const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
        const savingsSaved = store.savingsGoal?.saved || 0;
        const netIncome = totalRevenue - totalExpenses - savingsSaved;

        const suggestions: typeof needy = [];
        let accumulatedCost = 0;

        for (const item of needy) {
          if (accumulatedCost + item.totalCost <= Math.max(0, netIncome)) {
            suggestions.push(item);
            accumulatedCost += item.totalCost;
          } else if (suggestions.length === 0) {
            suggestions.push(item);
            break;
          } else {
            break;
          }
        }

        const activeItems = autoSuggest ? suggestions : needy;
        const totalRestockCost = activeItems.reduce((sum, s) => sum + s.totalCost, 0);

        if (needy.length === 0) return null;

        return (
          <div className="p-4 rounded-2xl bg-card border border-warning/20 shadow-card space-y-3">
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <ClipboardList className="w-4 h-4 shrink-0" />
                <div className="text-left min-w-0">
                  <h3 className="font-display font-bold text-sm truncate">Smart Restocking List</h3>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    {autoSuggest ? 'Capped to Net Income & prioritized by velocity' : 'Estimated capital required to replenish low stock'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 cursor-pointer select-none">
                  <span>Smart Restock</span>
                  <input
                    type="checkbox"
                    checked={autoSuggest}
                    onChange={e => {
                      const nextSettings = {
                        ...(store.managerSettings || DEFAULT_MANAGER_SETTINGS),
                        autoSuggestRestock: e.target.checked
                      };
                      onUpdate({
                        ...store,
                        managerSettings: nextSettings
                      });
                    }}
                    className="rounded accent-primary w-3.5 h-3.5 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-between items-center px-2 py-1.5 bg-surface-2/30 rounded border border-border/40 text-left">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Total replenishment cost</span>
              <span className="text-xs font-display font-bold text-warning">
                ₦{totalRestockCost.toLocaleString()}
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {activeItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-xs">No items suggested (budget limit exceeded).</p>
              ) : (
                activeItems.map(item => (
                  <div key={item.product.id} className="flex justify-between items-center p-2 rounded-lg bg-surface-2 text-xs border border-border text-left">
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{item.product.name}</p>
                      <p className="text-[9px] text-muted-foreground font-semibold">
                        Stock: {item.product.quantity} left · Suggest: +{item.suggestedQty} {autoSuggest && `· Sold: ${item.velocity}`}
                      </p>
                    </div>
                    <span className="font-mono text-primary font-bold shrink-0">₦{item.totalCost.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })()}

      {/* Seasonal & Climate Insights Card — was built but never shown anywhere; now wired in */}
      {(() => {
        const seasonal = getSeasonalPredictions(store);
        const weatherEnabled = store.managerSettings?.weatherImpactEnabled !== false;
        const weather = weatherEnabled ? getWeatherInsights(store) : null;
        if (seasonal.length === 0 && !weather) return null;
        return (
          <div className="p-4 rounded-2xl bg-card border border-primary/20 shadow-card space-y-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              <div>
                <h3 className="font-display font-bold text-sm">Seasonal &amp; Climate Insights</h3>
                <p className="text-[10px] text-muted-foreground font-semibold">General patterns for this time of year — not personalized predictions</p>
              </div>
            </div>
            <div className="space-y-2">
              {weather && (
                <div className="p-2.5 rounded-xl bg-surface-2 border border-border text-left">
                  <p className="font-display font-bold text-xs text-foreground">{weather.weatherCondition}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{weather.effect}</p>
                  <p className="text-[10px] text-emerald-400 mt-1 bg-emerald-500/5 p-1 rounded border border-emerald-500/10">
                    {weather.suggestedAction}
                  </p>
                </div>
              )}
              {seasonal.map((s, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-surface-2 border border-border text-left">
                  <p className="font-display font-bold text-xs text-foreground">{s.periodName}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{s.details}</p>
                  {s.suggestedItems.length > 0 && (
                    <p className="text-[10px] text-primary mt-1.5">
                      {s.itemsFromYourCatalog ? 'From your catalog: ' : 'Example items (not in your catalog yet): '}
                      {s.suggestedItems.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {settings.savingsPlanner && savings && (
        <div className="p-4 rounded-2xl bg-card shadow-card">
          <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-1.5"><PiggyBank className="w-4 h-4" /> Savings Plan</h3>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <Ring value={(savings.saved / Math.max(1, savings.amount)) * 100} size={84} tone="success" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display font-bold text-sm">{Math.round((savings.saved / Math.max(1, savings.amount)) * 100)}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">Goal: {savings.label || 'Savings Goal'}</p>
              <p className="font-display font-bold text-lg text-foreground">₦{savings.amount.toLocaleString()}</p>
              <p className="text-xs text-success">Saved: ₦{savings.saved.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{savings.frequency ? `${savings.frequency} target` : `${savings.percentage}% of ${savings.source}`}</p>
            </div>
          </div>
        </div>
      )}

      {/* Memory Timeline */}
      {(() => {
        const events = store.memoryTimeline || [];
        if (events.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
            <h3 className="font-display font-bold text-sm text-left flex items-center gap-1.5"><Clock className="w-4 h-4" /> Store Milestones & Timeline</h3>
            <div className="relative pl-4 border-l border-border/80 space-y-4 text-left ml-2 py-1">
              {events.slice(0, 5).map((e, idx) => (
                <div key={e.id || idx} className="relative">
                  {/* Dot */}
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card ring-2 ring-primary/20" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString('en-GB')} {new Date(e.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="font-display font-bold text-xs text-foreground mt-0.5">{e.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{e.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Customer Requests is about stock a shop could carry ("Peak
          Milk"). A laundry or any other service shop has none, so it is
          not shown there at all. */}
      {settings.customerRequests && !isServiceFirstBusiness(store) && (
        <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
          <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><ShoppingCart className="w-4 h-4" /> Customer Requests</h3>
          <div className="flex gap-2">
            <input value={requestText} onChange={e => setRequestText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRequest()}
              placeholder='e.g. "Peak Milk"'
              className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
            <button onClick={addRequest} className="px-4 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">+ Record</button>
          </div>
          {requests.length > 0 ? (
            <div className="space-y-1.5">
              {requests.map((r, i) => (
                <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-surface-2 text-sm">
                  <span className="capitalize">{r.text}</span>
                  <span className="text-xs text-primary font-display font-semibold">requested {r.count}×</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">{isServiceFirstBusiness(store)
            ? 'No requests yet. Tap + Record when a customer asks for something you do not offer.'
            : 'No requests yet. Tap + Record when a customer asks for something out of stock.'}</p>}
        </div>
      )}

      {/* Performance Calendar entry point */}
      <button
        onClick={() => setShowPerformanceCalendar(true)}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-border/40 shadow-card text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0"><Calendar className="w-5 h-5" /></div>
          <div>
            <p className="font-display font-bold text-sm">Performance Calendar</p>
            <p className="text-[11px] text-muted-foreground">See your consistency at a glance</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}
