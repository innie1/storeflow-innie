import ToggleRow from '@/components/Toggle';
import { card, inputClass, SubPage, SectionLabel } from '../ui';
import type { SettingsState } from '../useSettings';

export default function PricingView({ s }: { s: SettingsState }) {
  const {
    keepsStock, setView, mgr, updateMgr, discValStr, discMinStr, discMaxStr, handleDiscValChange,
    handleDiscMinChange, handleDiscMaxChange,
  } = s;
  return (
    <SubPage title="Pricing & Discounts" subtitle="Configure profit margins, smart pricing rules, and automatic checkout discounts" onBack={() => setView('home')}>
      {/*
        Margin, smart pricing and profit-per-unit are all arithmetic on a cost
        price, and a service has no cost price - a laundry does not buy a wash
        in and sell it on. What a service shop needs instead is the pricing
        advisor on its own price list, which works from what the work actually
        consumes. None of this belongs on a laundry's settings screen.
      */}
      {keepsStock && <>
      <div className="px-1">
        <SectionLabel>Profit Margin & Smart Pricing</SectionLabel>
      </div>
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-display font-semibold">Default Profit Margin</p>
            <p className="text-[11px] text-muted-foreground">Used by smart pricing suggestions.</p>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" value={mgr.defaultMargin}
              onChange={e => updateMgr({ defaultMargin: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 p-2 rounded-lg bg-surface-2 border border-border text-sm text-right focus:outline-none focus:border-primary" />
            <span className="text-sm text-primary font-bold">%</span>
          </div>
        </div>
        <div className="flex gap-2">
          {[20,30,40,50].map(p => (
            <button key={p} onClick={() => updateMgr({ defaultMargin: p })}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold border ${mgr.defaultMargin===p ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Auto-Suggest Selling Prices" checked={mgr.autoSuggestPrices} onChange={v => updateMgr({ autoSuggestPrices: v })} />
        <ToggleRow
          label="Auto-Apply Suggested Prices"
          description="Applies a suggestion automatically — but only when it's within the limits below. Anything bigger always waits for you to tap Accept."
          checked={mgr.autoApplyPrices}
          onChange={v => updateMgr({ autoApplyPrices: v })}
        />
        <ToggleRow label="Show Product Profit" checked={mgr.showProductProfit} onChange={v => updateMgr({ showProductProfit: v })} />
        <ToggleRow label="Smart Pricing Enabled" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
      </div>
      {mgr.autoApplyPrices && (
        <div className={`${card} p-4 space-y-3`}>
          <p className="text-xs text-muted-foreground leading-snug">
            Auto-Apply uses your Default Profit Margin above as the target percentage. A suggestion only applies automatically if it changes the price by no more than the amount below — bigger changes always show up as a normal suggestion for you to review.
          </p>
          <div className="flex items-center justify-between">
            <p className="text-sm font-display font-semibold">Max Auto-Apply Change</p>
            <div className="flex items-center gap-1">
              <span className="text-sm text-primary font-bold">₦</span>
              <input
                type="number"
                value={mgr.autoApplyMaxChangeAmount ?? 200}
                onChange={e => updateMgr({ autoApplyMaxChangeAmount: Math.max(0, Number(e.target.value) || 0) })}
                className="w-20 p-2 rounded-lg bg-surface-2 border border-border text-sm text-right focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      )}

      </>}

      {/* Discounts are for anybody. A laundry runs a promotion like any shop. */}
      <div className="px-1 mt-4">
        <SectionLabel>Automatic Checkout Discounts</SectionLabel>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow
          label="Enable Automatic Discount"
          description="Automatically calculate and apply a discount at checkout if criteria are met."
          checked={mgr.autoDiscountEnabled ?? false}
          onChange={v => updateMgr({ autoDiscountEnabled: v })}
        />
      </div>

      {mgr.autoDiscountEnabled && (
        <div className={`${card} p-4 space-y-4 animate-fade-in`}>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Discount Type</label>
            <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
              {([['percentage', 'Percentage (%)'], ['flat', 'Flat Amount (₦)']] as const).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => updateMgr({ autoDiscountType: type })}
                  className={`flex-1 px-3 py-2 text-xs font-display font-semibold transition-all ${
                    mgr.autoDiscountType === type ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Discount Value {mgr.autoDiscountType === 'percentage' ? '(%)' : '(₦)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={discValStr}
                onChange={e => handleDiscValChange(e.target.value)}
                className={inputClass + ' flex-1 font-display font-bold text-sm'}
                placeholder="0"
              />
              <span className="text-sm font-bold text-primary">
                {mgr.autoDiscountType === 'percentage' ? '%' : '₦'}
              </span>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <h4 className="text-xs font-display font-bold text-muted-foreground uppercase mb-2">Conditions (Criteria)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Min Subtotal (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={discMinStr}
                  onChange={e => handleDiscMinChange(e.target.value)}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder="0"
                />
                <span className="text-[9px] text-muted-foreground block mt-0.5">e.g. above 10,000</span>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Max Subtotal (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={discMaxStr}
                  onChange={e => handleDiscMaxChange(e.target.value)}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder="0"
                />
                <span className="text-[9px] text-muted-foreground block mt-0.5">e.g. below 50,000</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-[11px] text-success leading-relaxed">
        <strong>How it works:</strong> Automatic discounts apply in the shopping cart when the subtotal falls within your defined criteria range. You can always override or edit the discount manually during checkout.
      </div>
    </SubPage>
  );
}
