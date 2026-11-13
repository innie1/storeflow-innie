import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { StoreData } from '@/types/store';
import { healthScore } from '@/lib/manager-intel';

// ─── Health Breakdown Modal ───────────────────────────────────────────────────
export default function HealthBreakdownModal({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const h = healthScore(store);
  const rows = [
    { label: 'Revenue Performance', weight: 25, score: h.revenue, detail: h.details.revenue },
    { label: 'Profit Performance', weight: 25, score: h.profit, detail: h.details.profit },
    { label: isServiceFirstBusiness(store) ? 'Work On Time' : 'Inventory Health', weight: 15, score: h.inventory, detail: h.details.inventory },
    { label: 'Expense Control', weight: 15, score: h.expense, detail: h.details.expense },
    { label: 'Savings Progress', weight: 10, score: h.savings, detail: h.details.savings },
    { label: 'Customer Debt', weight: 10, score: h.debt, detail: h.details.debt },
  ];
  const tone = h.overall >= 80 ? 'text-success' : h.overall >= 60 ? 'text-primary' : h.overall >= 40 ? 'text-warning' : 'text-destructive';
  return (
    <div className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg">Store Health Breakdown</h3>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="text-center">
          <p className={`font-display font-bold text-5xl ${tone}`}>{h.overall}<span className="text-muted-foreground text-lg font-normal">/100</span></p>
          <p className={`text-sm font-display font-semibold mt-1 ${tone}`}>{h.label}</p>
        </div>
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.label}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-display font-semibold">{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.score}/100 · {r.weight}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden mb-1">
                <div className={`h-full transition-all ${r.score >= 70 ? 'bg-success' : r.score >= 40 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${r.score}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{r.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Flow weighs these 6 signals into your Store Health score. Improving any component lifts the total.
        </p>
        <button onClick={onClose} className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Got it</button>
      </div>
    </div>
  );
}
