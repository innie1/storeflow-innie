import { updateProduct } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ProductIcon from '@/components/ProductIcon';
import { Sparkles } from 'lucide-react';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Everything about one product: stock, prices, history.
 */
export default function ProductDetailSheet({ s }: { s: InventoryState }) {
  const {
    store, onUpdate, currentUser, showProfit, selectedDetailProduct, setSelectedDetailProduct,
    performancePeriod, setPerformancePeriod, detailTab, setDetailTab, unitsSold, totalRevenue,
    totalProfit, contributionPct, flowInsights, setRestockProduct, setRestockQty,
    setSingleRestockFunding, setSelectedTransferProduct, setTransferQty, setTransferDestCode,
    lowThreshold, openEditFor,
  } = s;
  return (
    <Modal title={`Product Details`} onClose={() => setSelectedDetailProduct(null)}>
      <div className="space-y-4 text-left">
        {/* Hero Header Card */}
        <div className="bg-surface-2 p-3.5 rounded-2xl border border-border flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-card border border-border/80 p-2 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
            {selectedDetailProduct.image ? (
              <img src={selectedDetailProduct.image} alt={selectedDetailProduct.name} className="w-full h-full object-cover rounded-xl" onError={(e) => { e.currentTarget.style.display='none'; }} />
            ) : (
              <ProductIcon product={selectedDetailProduct} className="w-7 h-7" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-black text-base text-foreground truncate">{selectedDetailProduct.name}</h3>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${selectedDetailProduct.discontinued ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}`}>
                {selectedDetailProduct.discontinued ? '🚫 Discontinued' : '✅ Active'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
              <span className="bg-card px-2 py-0.5 rounded-md border border-border/60 font-semibold">{selectedDetailProduct.category}</span>
              {selectedDetailProduct.barcode && (
                <span className="font-mono bg-card px-2 py-0.5 rounded-md border border-border/60 text-primary font-bold">
                  {selectedDetailProduct.barcode}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Segmented Sub-Tab Switcher */}
        <div className="flex p-1 rounded-xl bg-surface-2 border border-border">
          {[
            { id: 'overview' as const, label: 'Overview', icon: '🏷️' },
            { id: 'performance' as const, label: 'Performance', icon: '📊' },
            { id: 'history' as const, label: 'Cost History', icon: '📈' }
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailTab(t.id)}
              className={`flex-1 py-2 text-xs font-display font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                detailTab === t.id
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW & PRICING */}
        {detailTab === 'overview' && (
          <div className="space-y-3 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-card p-3 rounded-xl border border-border space-y-0.5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Selling Price</p>
                <p className="text-base font-display font-black text-primary">₦{selectedDetailProduct.sellingPrice.toLocaleString()}</p>
              </div>
              <div className="bg-card p-3 rounded-xl border border-border space-y-0.5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Cost Price</p>
                <p className="text-base font-display font-bold text-foreground">₦{selectedDetailProduct.costPrice.toLocaleString()}</p>
              </div>
              {/*
                Show Product Profit, from the settings screen.

                The switch existed and nothing read it, so a shop that had
                turned it off - usually because a phone gets handed to
                staff or a customer leans over the counter - was still
                showing what it makes on every item.
              */}
              {showProfit && <div className="bg-card p-3 rounded-xl border border-border space-y-0.5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Profit / unit</p>
                {(() => {
                  const profit = selectedDetailProduct.sellingPrice - selectedDetailProduct.costPrice;
                  // This percentage is profit over COST, which is markup,
                  // not margin — it was labelled "Profit Margin". Margin is
                  // profit over the selling price, and is the smaller of the
                  // two: at ₦100 cost and ₦150 selling, markup is 50% and
                  // margin is 33%. Both are shown, each under its own name,
                  // rather than one number under the wrong one.
                  const markupPct = selectedDetailProduct.costPrice > 0 ? (profit / selectedDetailProduct.costPrice) * 100 : 0;
                  const marginPct = selectedDetailProduct.sellingPrice > 0 ? (profit / selectedDetailProduct.sellingPrice) * 100 : 0;
                  const cls = profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : 'text-muted-foreground';
                  return (
                    <>
                      <p className={`text-base font-display font-bold ${cls}`}>₦{profit.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{marginPct.toFixed(0)}% margin · {markupPct.toFixed(0)}% markup</p>
                    </>
                  );
                })()}
              </div>}
              <div className="bg-card p-3 rounded-xl border border-border space-y-0.5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Current Stock</p>
                <p className={`text-base font-display font-black ${selectedDetailProduct.quantity <= lowThreshold ? 'text-destructive' : selectedDetailProduct.quantity <= lowThreshold * 3 ? 'text-warning' : 'text-success'}`}>
                  {selectedDetailProduct.quantity} units
                </p>
              </div>
            </div>

            {/* Carton / Single Breakdown if enabled */}
            {selectedDetailProduct.isCartonSingleEnabled && (
              <div className="p-3.5 bg-surface-2 border border-border rounded-xl space-y-2">
                <p className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
                  📦 Carton & Single Package Pricing
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-card p-2.5 rounded-lg border border-border/60">
                    <span className="text-[10px] text-muted-foreground block">Singles per Carton</span>
                    <strong className="text-foreground font-display font-bold">{selectedDetailProduct.singlesPerCarton} pcs</strong>
                  </div>
                  <div className="bg-card p-2.5 rounded-lg border border-border/60">
                    <span className="text-[10px] text-muted-foreground block">Single Selling Price</span>
                    <strong className="text-foreground font-display font-bold">₦{(selectedDetailProduct.singleSellingPrice ?? Math.round(selectedDetailProduct.sellingPrice / (selectedDetailProduct.singlesPerCarton || 1))).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PERFORMANCE & ANALYTICS */}
        {detailTab === 'performance' && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
                📊 Performance Metrics
              </h4>
              <div className="flex items-center gap-1 bg-surface-2 px-2.5 py-1 rounded-lg border border-border text-[10px]">
                <span className="text-muted-foreground">📅 Filter:</span>
                <select
                  value={performancePeriod}
                  onChange={(e) => setPerformancePeriod(e.target.value as any)}
                  className="bg-transparent text-foreground font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-card border border-border p-3 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground">Units Sold</span>
                <p className="text-base font-black text-foreground mt-0.5">{Math.round(unitsSold * 100) / 100}</p>
              </div>
              <div className="bg-card border border-border p-3 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground">Total Revenue</span>
                <p className="text-base font-black text-foreground mt-0.5">₦{Math.round(totalRevenue).toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border p-3 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground">Total Profit</span>
                <p className="text-base font-black text-success mt-0.5">₦{Math.round(totalProfit).toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border p-3 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground">Contribution</span>
                <p className="text-base font-black text-primary mt-0.5">{contributionPct}%</p>
              </div>
            </div>

            {/* Flow AI Insight Card */}
            {/* Themed like the rest of the app. This card was hardcoded to
                a purple/indigo gradient with #0f1117 and slate-200 text —
                fixed dark-mode colours that ignored the merchant's theme and
                left the text nearly unreadable on a light background. */}
            <div className="relative overflow-hidden rounded-2xl bg-primary/5 border border-primary/25 p-3 flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-display font-black text-primary text-[10px] uppercase tracking-wider">
                    ✨ Flow Insight
                  </span>
                  <span className="px-1.5 py-0.5 text-[8px] rounded-full bg-primary/15 text-primary font-bold border border-primary/25">
                    {flowInsights.badge}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-[10px] text-foreground leading-normal font-medium">
                  {flowInsights.list.map((ins, i) => (
                    <p key={i}>{ins}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: COST HISTORY */}
        {detailTab === 'history' && (
          <div className="space-y-3 animate-fade-in">
            {(() => {
              const priceHistory = selectedDetailProduct.priceHistory || [];
              return (
                <div className="space-y-3">
                  {priceHistory.length >= 2 ? (
                    <div className="h-36 w-full bg-surface-2 p-2 rounded-xl border border-border">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 8 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 8 }} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#d97706', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="costPrice" stroke="#d97706" strokeWidth={2} dot={{ fill: '#d97706', r: 3 }} name="Cost" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-4 bg-surface-2 rounded-xl border border-border">
                      Initial Cost Price: ₦{selectedDetailProduct.costPrice.toLocaleString()} (added at product creation)
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Action buttons inside popup */}
        <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              setRestockProduct(selectedDetailProduct);
              setRestockQty('');
              setSingleRestockFunding('balance');
              setSelectedDetailProduct(null);
            }}
            className="p-2.5 rounded-xl bg-success text-white font-display font-bold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer active:scale-95 transition-all"
          >
            ↑ Restock
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedTransferProduct(selectedDetailProduct);
              setTransferQty('');
              setTransferDestCode('');
              setSelectedDetailProduct(null);
            }}
            className="p-2.5 rounded-xl bg-warning text-primary-foreground font-display font-bold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer active:scale-95 transition-all"
          >
            🚚 Transfer
          </button>
          <button
            type="button"
            onClick={() => {
              openEditFor(selectedDetailProduct);
              setSelectedDetailProduct(null);
            }}
            className="p-2.5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer active:scale-95 transition-all"
          >
            ✎ Edit
          </button>
          <button
            type="button"
            onClick={() => {
              const isDiscontinued = !!selectedDetailProduct.discontinued;
              const updated = updateProduct(store, selectedDetailProduct.id, { discontinued: !isDiscontinued }, currentUser?.name, currentUser?.role);
              onUpdate(updated);
              setSelectedDetailProduct({ ...selectedDetailProduct, discontinued: !isDiscontinued });
              showToast(isDiscontinued ? 'Product reactivated' : 'Product discontinued');
            }}
            className={`p-2.5 rounded-xl font-display font-bold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer active:scale-95 transition-all ${
              selectedDetailProduct.discontinued
                ? 'bg-success/20 text-success border border-success/30'
                : 'bg-destructive/20 text-destructive border border-destructive/30'
            }`}
          >
            {selectedDetailProduct.discontinued ? '🟢 Reactivate' : '🔴 Discontinue'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
