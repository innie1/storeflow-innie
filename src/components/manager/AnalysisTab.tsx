import { saveStore, updateProduct, undoAutoPrice } from '@/lib/store-data';
import {
  expenseAnalysis,
  rentAnalysis,
  pricingAlerts,
  analyzeSales,
  getProductInsightBadges,
} from '@/lib/manager-intel';
import { showToast } from '@/components/Toast';
import Mascot from '@/components/Mascot';
import { ShoppingCart, Flame, Moon, Receipt, Home, Undo2, BarChart3 } from 'lucide-react';
import MostActivePeriodsCard from './MostActivePeriodsCard';
import type { ManagerState } from './useManager';

/**
 * Flow's Analysis tab: sales, costs and busiest times.
 */
export default function AnalysisTab({ s }: { s: ManagerState }) {
  const { store, onUpdate, settings, insights, pendingPriceAccept, setPendingPriceAccept } = s;
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">What is selling</h3>
      {/* Activity graph */}
      <MostActivePeriodsCard store={store} />

      {/* Sales analysis */}
      {(() => {
        const sa = analyzeSales(store);
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-4">
            <h3 className="font-display font-bold text-base">Sales Breakdown</h3>
            {sa.fastMovers.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> Fast Movers (Last 30d)</p>
                <div className="space-y-1.5">
                  {sa.fastMovers.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs text-primary font-display font-bold ml-2 flex-shrink-0">{p.qty} sold · ₦{p.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sa.neverSold.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2 flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> Never Sold</p>
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
                <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2 flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> Often Bought Together</p>
                {sa.coPurchases.map((cp, i) => (
                  <p key={i} className="text-xs p-2 rounded-lg bg-surface-2 mb-1">{cp.a} + {cp.b} <span className="text-primary font-display font-bold">({cp.count}x)</span></p>
                ))}
              </div>
            )}
            {sa.fastMovers.length === 0 && sa.neverSold.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Record more sales to unlock analysis.</p>
            )}
          </div>
        );
      })()}

      <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">What it costs</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Expense analysis */}
      {settings.expenseAnalysis && (() => {
        const ea = expenseAnalysis(store);
        if (ea.byCat.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Expense Breakdown</h3>
              <span className={`text-[10px] font-display font-bold ${ea.trendPct > 0 ? 'text-destructive' : 'text-success'}`}>
                {ea.trendPct > 0 ? '↑' : '↓'} {Math.abs(ea.trendPct).toFixed(0)}% vs prev month
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Last 30 days total: ₦{ea.totalLast30.toLocaleString()}</p>
            <div className="space-y-2">
              {ea.byCat.map(c => (
                <div key={c.category}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-display font-semibold">{c.category}</span>
                    <span className="text-xs flex items-center gap-1">
                      {c.trend === 'up' && <span className="text-destructive">↑</span>}
                      {c.trend === 'down' && <span className="text-success">↓</span>}
                      ₦{c.total.toLocaleString()} · {c.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-primary/70 transition-all" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Rent Analysis */}
      {(() => {
        const rent = rentAnalysis(store);
        if (!rent) return null;
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
            <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Home className="w-4 h-4" /> Rent Analysis</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Monthly Rent</p><p className="font-display font-bold">₦{rent.monthly.toLocaleString()}</p></div>
              <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Weekly Target</p><p className="font-display font-bold">₦{rent.weeklyTarget.toLocaleString()}</p></div>
              <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Emergency Buffer</p><p className="font-display font-bold">₦{rent.emergencyBuffer.toLocaleString()}</p></div>
              <div className={`p-2.5 rounded-lg ${rent.affordabilityPct > 30 ? 'bg-warning/10 border border-warning/20' : 'bg-surface-2'}`}>
                <p className="text-[10px] text-muted-foreground">% of Revenue</p>
                <p className={`font-display font-bold ${rent.affordabilityPct > 30 ? 'text-warning' : 'text-success'}`}>{rent.affordabilityPct}%</p>
              </div>
            </div>
            {rent.affordabilityPct > 30 && <p className="text-xs text-warning p-2 rounded-lg bg-warning/10 border border-warning/20">Rent is high relative to revenue. Consider growing sales to reduce this ratio.</p>}
          </div>
        );
      })()}

      </div>

      <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">Pricing</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Auto-Applied Price History */}
      {settings.autoApplyPrices && (() => {
        const recentEvents = (store.autoPriceLog || []).filter(e => !e.undone).slice(0, 5);
        if (recentEvents.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
            <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><span className="h-4 w-4 shrink-0 overflow-hidden rounded-full"><Mascot size={16} /></span> Auto-Applied Prices</h3>
            <p className="text-[11px] text-muted-foreground -mt-1">Changes your Auto-Apply setting made on its own. Undo any of them any time.</p>
            <div className="space-y-2">
              {recentEvents.map(e => {
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
                    <p className="text-xs text-muted-foreground">
                      ₦{e.oldPrice.toLocaleString()} → ₦{e.newPrice.toLocaleString()}
                    </p>
                    <p className={`text-xs font-display font-bold ${profitDelta >= 0 ? 'text-success' : 'text-warning'}`}>
                      Profit per unit: ₦{oldProfit.toLocaleString()} → ₦{newProfit.toLocaleString()} ({profitDelta >= 0 ? '+' : ''}₦{profitDelta.toLocaleString()})
                    </p>
                    {stillCurrent ? (
                      <button
                        onClick={() => {
                          const updated = undoAutoPrice(store, e.id);
                          onUpdate(updated);
                          showToast(`${e.productName} reverted to ₦${e.oldPrice.toLocaleString()}`);
                        }}
                        className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-destructive/10 text-destructive border border-destructive/30 flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" /> Undo
                      </button>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Price has changed again since — undo unavailable.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Pricing alerts */}
      {settings.autoSuggestPrices && (() => {
        const alerts = pricingAlerts(store, (settings.defaultMargin || 25) / 100);
        if (alerts.length === 0) return null;
        return (
          <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
            <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Pricing Alerts</h3>
            <p className="text-[11px] text-muted-foreground -mt-1">Suggestions only — nothing changes until you tap Accept.</p>
            <div className="space-y-2">
              {alerts.slice(0, 4).map(a => {
                const isPendingConfirm = pendingPriceAccept === a.product.id;
                return (
                <div key={a.product.id} className={`p-3 rounded-xl border ${a.type === 'zero_margin' ? 'bg-destructive/5 border-destructive/30' : a.type === 'underpriced' ? 'bg-warning/5 border-warning/30' : 'bg-surface-2 border-border'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-sm truncate">{a.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.type === 'zero_margin' ? 'Selling at or below what you paid!' : a.type === 'underpriced' ? `Only ${(a.currentMarkup * 100).toFixed(0)}% on top of cost` : `Very high markup (${(a.currentMarkup * 100).toFixed(0)}%)`}
                        {' '}· Currently ₦{a.product.sellingPrice.toLocaleString()} → suggest ₦{a.suggestedPrice.toLocaleString()}
                      </p>
                    </div>
                    {!isPendingConfirm ? (
                      <button
                        onClick={() => setPendingPriceAccept(a.product.id)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-primary/10 text-primary border border-primary/30"
                      >
                        Accept
                      </button>
                    ) : (
                      <div className="flex-shrink-0 flex gap-1.5">
                        <button
                          onClick={() => setPendingPriceAccept(null)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold border border-border text-muted-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            const updated = updateProduct(store, a.product.id, { sellingPrice: a.suggestedPrice });
                            saveStore(updated);
                            onUpdate(updated);
                            setPendingPriceAccept(null);
                            showToast(`${a.product.name} price set to ₦${a.suggestedPrice.toLocaleString()}`);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold bg-success text-white"
                        >
                          Confirm ₦{a.suggestedPrice.toLocaleString()}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );})}
            </div>
          </div>
        );
      })()}

      </div>

      {/* Insights */}
      <div className="space-y-2">
        <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">Insights</h3>
        {insights.length === 0 ? <p className="text-sm text-muted-foreground p-4 text-center">Record more sales to unlock insights.</p> : null}
        {insights.map(i => {
          const tones: Record<string, string> = { success: 'bg-success/10 border-success/30 text-success', warning: 'bg-warning/10 border-warning/30 text-warning', info: 'bg-primary/10 border-primary/30 text-primary', danger: 'bg-destructive/10 border-destructive/30 text-destructive' };
          return (
            <div key={i.id} className={`p-3 rounded-xl border flex items-start gap-3 ${tones[i.tone]}`}>
              <span className="text-xl">{i.icon}</span>
              <div className="flex-1">
                <p className="font-display font-semibold text-sm">{i.text}</p>
                <p className="text-xs opacity-70 mt-0.5">{i.explain}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Product Insight Badges */}
      {(() => {
        const badges = getProductInsightBadges(store);
        if (badges.length === 0) return null;
        const badgeStyle: Record<string, string> = {
          'Best Seller': 'bg-warning/10 border-warning/30 text-warning',
          'Fast Mover': 'bg-primary/10 border-primary/30 text-primary',
          'High Sales': 'bg-success/10 border-success/30 text-success',
          'Dormant Product': 'bg-muted/40 border-border text-muted-foreground',
        };
        return (
          <div className="space-y-2">
            <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider">Product Insights</h3>
            <div className="space-y-2">
              {badges.slice(0, 8).map((b, idx) => (
                <div key={`${b.productId}-${b.label}-${idx}`} className={`p-3 rounded-xl border flex items-start gap-3 ${badgeStyle[b.label]}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-display font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-current/30">{b.label}</span>
                      <p className="font-display font-semibold text-sm">{b.productName}</p>
                    </div>
                    <p className="text-xs opacity-70 mt-0.5">{b.explain}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
