import { useState, useMemo } from 'react';
import { StoreData } from '@/types/store';
import { getRepaymentInsights } from '@/lib/manager-intel';
import { Star, TrendingUp, AlertTriangle } from 'lucide-react';
import { fmtRelDate, Stat } from './ui';

export default function RepaymentPredictionsCard({ store }: { store: StoreData }) {
  const insights = useMemo(() => getRepaymentInsights(store), [store]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (insights.customers.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-card shadow-card">
        <h3 className="font-display font-bold text-base mb-1">Repayment Predictions</h3>
        <p className="text-xs text-muted-foreground">No pending payments yet. Flow learns repayment habits as they settle.</p>
      </div>
    );
  }

  const active = insights.customers.filter(c => c.activeDebts > 0);
  const shown = active.length > 0 ? active : insights.customers.slice(0, 5);

  const toneClass = (r: number) =>
    r >= 75 ? 'bg-success/15 text-success border-success/30'
    : r >= 45 ? 'bg-warning/15 text-warning border-warning/30'
    : 'bg-destructive/15 text-destructive border-destructive/30';

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-base">Repayment Predictions</h3>
          <p className="text-xs text-muted-foreground">Learned from {insights.customers.length} customer{insights.customers.length === 1 ? '' : 's'} · {insights.customers.reduce((s, c) => s + c.sampleSize, 0)} payment events.</p>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-display font-bold border ${toneClass(insights.overallReliability)}`}>
          {insights.overallReliability}% avg reliability
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-surface-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg debt</p>
          <p className="font-display font-bold text-sm text-yellow-500">₦{insights.overallAvgDebtSize.toLocaleString()}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-surface-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Clears in</p>
          <p className="font-display font-bold text-sm">{insights.overallAvgDaysToClear !== null ? `${insights.overallAvgDaysToClear}d` : '—'}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-surface-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Customers</p>
          <p className="font-display font-bold text-sm">{insights.customers.length}</p>
        </div>
      </div>

      {(insights.mostReliable || insights.riskiest) && (
        <div className="grid grid-cols-2 gap-2">
          {insights.mostReliable && (
            <div className="p-2.5 rounded-xl bg-success/10 border border-success/30">
              <p className="text-[10px] text-success uppercase font-semibold flex items-center gap-1"><Star className="w-3 h-3" /> Most reliable</p>
              <p className="text-xs font-display font-bold truncate">{insights.mostReliable.customerName}</p>
              <p className="text-[10px] text-muted-foreground">{insights.mostReliable.reliabilityScore}% score</p>
            </div>
          )}
          {insights.riskiest && insights.riskiest.customerKey !== insights.mostReliable?.customerKey && (
            <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/30">
              <p className="text-[10px] text-destructive uppercase font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Watch closely</p>
              <p className="text-xs font-display font-bold truncate">{insights.riskiest.customerName}</p>
              <p className="text-[10px] text-muted-foreground">{insights.riskiest.reliabilityScore}% score</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {shown.slice(0, 8).map(c => {
          const isOpen = expanded === c.customerKey;
          const chip = toneClass(c.reliabilityScore);
          return (
            <div key={c.customerKey} className="rounded-xl bg-surface-2 border border-border overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : c.customerKey)} className="w-full p-3 flex items-start justify-between gap-2 text-left">
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-sm truncate">{c.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.activeDebts > 0
                      ? <>Owes <span className="text-warning font-semibold">₦{c.currentBalance.toLocaleString()}</span> · next pay {fmtRelDate(c.predictedNextPaymentDate)}</>
                      : <>Cleared {c.completedDebts} debt{c.completedDebts === 1 ? '' : 's'} · avg ₦{c.avgDebtSize.toLocaleString()}</>
                    }
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full border ${chip}`}>
                    {c.reliabilityScore}%
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.sampleSize} events</p>
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-0 grid grid-cols-2 gap-2 border-t border-border/60">
                  <Stat label="Avg debt size" value={`₦${c.avgDebtSize.toLocaleString()}`} />
                  <Stat label="Largest debt" value={`₦${c.largestDebt.toLocaleString()}`} />
                  <Stat label="Avg days to clear" value={c.avgDaysToClear !== null ? `${c.avgDaysToClear}d` : 'No data'} />
                  <Stat label="Payment cadence" value={c.avgDaysBetweenPayments !== null ? `every ${c.avgDaysBetweenPayments}d` : 'No data'} />
                  <Stat label="On-time rate" value={c.onTimeRate !== null ? `${c.onTimeRate}%` : 'No due dates'} />
                  <Stat label="Debts (done / total)" value={`${c.completedDebts} / ${c.totalDebts}`} />
                  {c.activeDebts > 0 && (
                    <>
                      <Stat label="Predicted next pay" value={fmtRelDate(c.predictedNextPaymentDate)} tone="primary" />
                      <Stat label="Full clear by" value={fmtRelDate(c.predictedFullClearDate)} tone="primary" />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {insights.customers.reduce((s, c) => s + c.sampleSize, 0) < 5 && (
        <p className="text-[11px] text-warning p-2 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 shrink-0" /> Predictions sharpen as more repayments are recorded.</p>
      )}
    </div>
  );
}
