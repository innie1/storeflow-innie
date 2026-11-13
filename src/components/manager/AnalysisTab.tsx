import { useMemo, type ReactNode } from 'react';
import { saveStore, updateProduct, undoAutoPrice } from '@/lib/store-data';
import {
  expenseAnalysis,
  rentAnalysis,
  pricingAlerts,
  analyzeSales,
  getProductInsightBadges,
} from '@/lib/manager-intel';
import { isServiceFirstBusiness, resolveBusinessType } from '@/lib/business-runtime';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { showToast } from '@/components/Toast';
import MessageIcon from '@/components/MessageIcon';
import { ShoppingCart, Flame, Moon, Receipt, Home, Undo2, BarChart3, Shirt, Wand2 } from 'lucide-react';
import MostActivePeriodsCard from './MostActivePeriodsCard';
import type { ManagerState } from './useManager';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/** A heading over a group of cards, the same on every tab. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-2">{title}</h3>
      {children}
    </section>
  );
}

const TONE_TILE: Record<string, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-primary/10 text-primary',
  danger: 'bg-destructive/10 text-destructive',
};

/**
 * What a laundry's customers bring, by service, over the last 30 days.
 *
 * Every laundry payment is recorded as one product called "Laundry", so the
 * shop's sales breakdown was a single line reading "Laundry: 41 sold". The
 * bundles themselves know which service they were for.
 */
function ServicesCard({ store }: { store: ManagerState['store'] }) {
  const version = useShopLaundryVersion();
  const rows = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    let bundles: ReturnType<typeof shopLaundryRecords> = [];
    try { bundles = shopLaundryRecords(String(store.accessCode || '')); } catch { /* none readable */ }
    const by = new Map<string, { name: string; bundles: number; pieces: number; value: number }>();
    for (const bundle of bundles) {
      if (new Date(String(bundle.createdAt || '')).getTime() < since) continue;
      const name = String(bundle.serviceName || 'Other').trim() || 'Other';
      const row = by.get(name) || { name, bundles: 0, pieces: 0, value: 0 };
      row.bundles += 1;
      row.pieces += Number(bundle.pieceCount) || 0;
      row.value += Number(bundle.total) || 0;
      by.set(name, row);
    }
    return [...by.values()].sort((a, b) => b.value - a.value);
  }, [store, version]);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div>
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Shirt className="w-4 h-4" /> What customers bring</h3>
        <p className="text-[11px] text-muted-foreground">By service, last 30 days</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No bundles in the last 30 days.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(row => (
            <div key={row.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-display font-semibold truncate">{row.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {row.bundles} {row.bundles === 1 ? 'bundle' : 'bundles'} · {row.pieces} pcs · <b className="text-foreground">{naira(row.value)}</b>
                </span>
              </div>
              <div className="h-1.5 mt-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? (row.value / total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SalesCard({ store }: { store: ManagerState['store'] }) {
  const sa = analyzeSales(store);
  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-4">
      <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Sales breakdown</h3>
      {sa.fastMovers.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground font-display font-semibold mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> Selling fastest, last 30 days</p>
          <div className="space-y-1.5">
            {sa.fastMovers.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-sm">
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-primary font-display font-bold ml-2 flex-shrink-0">{p.qty} sold · {naira(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {sa.neverSold.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground font-display font-semibold mb-2 flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> Never sold</p>
          <div className="space-y-1">
            {sa.neverSold.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-warning/5 border border-warning/20 text-sm">
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.daysInStock}d in stock</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {sa.coPurchases.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground font-display font-semibold mb-2 flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> Often bought together</p>
          {sa.coPurchases.map((cp, i) => (
            <p key={i} className="text-xs p-2 rounded-lg bg-surface-2 mb-1">{cp.a} + {cp.b} <span className="text-primary font-display font-bold">({cp.count}x)</span></p>
          ))}
        </div>
      )}
      {sa.fastMovers.length === 0 && sa.neverSold.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Record more sales to unlock this.</p>
      )}
    </div>
  );
}

/**
 * Flow's Analysis tab: when the shop is busy, what it sells, what it costs,
 * and what Flow has noticed - each under its own heading, in that order.
 */
export default function AnalysisTab({ s }: { s: ManagerState }) {
  const { store, onUpdate, settings, pendingPriceAccept, setPendingPriceAccept } = s;
  const isService = isServiceFirstBusiness(store);
  // Every laundry payment is filed under one line, so it is always the "best seller".
  const insights = isService ? s.insights.filter(i => i.id !== 'best') : s.insights;
  const isLaundry = resolveBusinessType(store) === 'laundry';

  const ea = settings.expenseAnalysis ? expenseAnalysis(store) : null;
  const rent = rentAnalysis(store);
  const autoPriced = settings.autoApplyPrices ? (store.autoPriceLog || []).filter(e => !e.undone).slice(0, 5) : [];
  const alerts = settings.autoSuggestPrices ? pricingAlerts(store, (settings.defaultMargin || 25) / 100) : [];
  // A badge naming the one "Laundry" payment line as best seller says nothing.
  const badges = isService ? [] : getProductInsightBadges(store);
  const badgeStyle: Record<string, string> = {
    'Best Seller': 'bg-warning/10 border-warning/30 text-warning',
    'Fast Mover': 'bg-primary/10 border-primary/30 text-primary',
    'High Sales': 'bg-success/10 border-success/30 text-success',
    'Dormant Product': 'bg-muted/40 border-border text-muted-foreground',
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Section title="When you are busy">
        <MostActivePeriodsCard store={store} />
      </Section>

      <Section title="What sells">
        {isLaundry ? <ServicesCard store={store} /> : <SalesCard store={store} />}
      </Section>

      {((ea && ea.byCat.length > 0) || rent) && (
        <Section title="What it costs">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {ea && ea.byCat.length > 0 && (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Spending</h3>
                    <p className="text-[11px] text-muted-foreground">Last 30 days · {naira(ea.totalLast30)}</p>
                  </div>
                  {ea.trendPct !== 0 && (
                    <span className={`text-[10px] font-display font-bold shrink-0 ${ea.trendPct > 0 ? 'text-destructive' : 'text-success'}`}>
                      {ea.trendPct > 0 ? '↑' : '↓'} {Math.abs(ea.trendPct).toFixed(0)}% on last month
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {ea.byCat.map(c => (
                    <div key={c.category}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm font-display font-semibold">{c.category}</span>
                        <span className="text-xs text-muted-foreground">{naira(c.total)} · {c.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${c.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rent && (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Home className="w-4 h-4" /> Rent</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">A month</p><p className="font-display font-bold">{naira(rent.monthly)}</p></div>
                  <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Put aside a week</p><p className="font-display font-bold">{naira(rent.weeklyTarget)}</p></div>
                  <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Emergency buffer</p><p className="font-display font-bold">{naira(rent.emergencyBuffer)}</p></div>
                  <div className={`p-2.5 rounded-lg ${rent.affordabilityPct > 30 ? 'bg-warning/10 border border-warning/20' : 'bg-surface-2'}`}>
                    <p className="text-[10px] text-muted-foreground">Share of takings</p>
                    <p className={`font-display font-bold ${rent.affordabilityPct > 30 ? 'text-warning' : 'text-success'}`}>{rent.affordabilityPct}%</p>
                  </div>
                </div>
                {rent.affordabilityPct > 30 && <p className="text-xs text-warning">Rent takes a large share of what comes in.</p>}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Only with something to show: the heading used to sit over nothing. */}
      {(autoPriced.length > 0 || alerts.length > 0) && (
        <Section title="Pricing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {autoPriced.length > 0 && (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> Prices Flow changed</h3>
                <p className="text-[11px] text-muted-foreground -mt-1">Set by Auto-Apply. Undo any of them any time.</p>
                <div className="space-y-2">
                  {autoPriced.map(e => {
                    const oldProfit = e.oldPrice - e.costPrice;
                    const newProfit = e.newPrice - e.costPrice;
                    const profitDelta = newProfit - oldProfit;
                    const stillCurrent = store.products.find(p => p.id === e.productId)?.sellingPrice === e.newPrice;
                    return (
                      <div key={e.id} className="p-3 rounded-xl bg-surface-2 border border-border space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="font-display font-semibold text-sm truncate">{e.productName}</p>
                          <span className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{naira(e.oldPrice)} → {naira(e.newPrice)}</p>
                        <p className={`text-xs font-display font-bold ${profitDelta >= 0 ? 'text-success' : 'text-warning'}`}>
                          Profit each: {naira(oldProfit)} → {naira(newProfit)} ({profitDelta >= 0 ? '+' : ''}{naira(profitDelta)})
                        </p>
                        {stillCurrent ? (
                          <button
                            onClick={() => {
                              const updated = undoAutoPrice(store, e.id);
                              onUpdate(updated);
                              showToast(`${e.productName} back to ${naira(e.oldPrice)}`);
                            }}
                            className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-destructive/10 text-destructive border border-destructive/30 flex items-center gap-1"
                          >
                            <Undo2 className="w-3 h-3" /> Undo
                          </button>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">The price has changed again since, so this can't be undone.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {alerts.length > 0 && (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Prices to look at</h3>
                <p className="text-[11px] text-muted-foreground -mt-1">Nothing changes until you tap Accept.</p>
                <div className="space-y-2">
                  {alerts.slice(0, 4).map(a => {
                    const confirming = pendingPriceAccept === a.product.id;
                    return (
                      <div key={a.product.id} className={`p-3 rounded-xl border ${a.type === 'zero_margin' ? 'bg-destructive/5 border-destructive/30' : a.type === 'underpriced' ? 'bg-warning/5 border-warning/30' : 'bg-surface-2 border-border'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-display font-semibold text-sm truncate">{a.product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {a.type === 'zero_margin' ? 'Selling at or below what you paid.' : a.type === 'underpriced' ? `Only ${(a.currentMarkup * 100).toFixed(0)}% on top of cost.` : `Very high markup (${(a.currentMarkup * 100).toFixed(0)}%).`}
                              {' '}{naira(a.product.sellingPrice)} → {naira(a.suggestedPrice)}
                            </p>
                          </div>
                          {!confirming ? (
                            <button onClick={() => setPendingPriceAccept(a.product.id)} className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-primary/10 text-primary border border-primary/30">
                              Accept
                            </button>
                          ) : (
                            <div className="flex-shrink-0 flex gap-1.5">
                              <button onClick={() => setPendingPriceAccept(null)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold border border-border text-muted-foreground">Cancel</button>
                              <button
                                onClick={() => {
                                  const updated = updateProduct(store, a.product.id, { sellingPrice: a.suggestedPrice });
                                  saveStore(updated);
                                  onUpdate(updated);
                                  setPendingPriceAccept(null);
                                  showToast(`${a.product.name} price set to ${naira(a.suggestedPrice)}`);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold bg-success text-white"
                              >
                                Confirm {naira(a.suggestedPrice)}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="What Flow noticed">
        {insights.length === 0 && badges.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">Nothing stands out yet. This fills in as you record more.</p>
        ) : (
          <div className="p-1 rounded-2xl bg-card shadow-card divide-y divide-border">
            {insights.map(i => (
              <div key={i.id} className="p-3 flex items-start gap-3">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TONE_TILE[i.tone] || 'bg-surface-2 text-muted-foreground'}`}>
                  <MessageIcon emoji={i.icon} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm leading-snug">{i.text}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{i.explain}</p>
                </div>
              </div>
            ))}
            {badges.slice(0, 8).map((b, idx) => (
              <div key={`${b.productId}-${b.label}-${idx}`} className="p-3 flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 text-[10px] font-display font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${badgeStyle[b.label]}`}>{b.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm">{b.productName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.explain}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
