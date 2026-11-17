import { useMemo, useState } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { whereMoneyGoes, whereMoneyGoesSentence } from '@/lib/where-money-goes';
import type { StoreData } from '@/types/store';
import { Wallet } from 'lucide-react';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/**
 * Where a service shop's money goes: soap, light, fuel, the people who do the
 * work and the rent, each against the money that came in over the same days.
 *
 * `compact` shows the largest few with the rest a tap away, for the Overview;
 * the Analysis page shows all of it.
 */
export default function WhereMoneyGoesCard({ store, compact = false }: { store: StoreData; compact?: boolean }) {
  const version = useShopLaundryVersion();
  const report = useMemo(() => whereMoneyGoes(store), [store, version]);
  const [showAll, setShowAll] = useState(!compact);
  if (report.rows.length === 0) return null;

  const rows = showAll ? report.rows : report.rows.slice(0, 3);
  const top = Math.max(1, ...report.rows.map(row => row.amount));
  const short = report.left < 0;

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3" data-where-money-goes>
      <div>
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Where money is going</h3>
        <p className="text-[11px] text-muted-foreground">Last {report.days} days</p>
      </div>

      <p className="text-sm leading-snug">{whereMoneyGoesSentence(report)}</p>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Came in</p><p className="font-display font-bold text-sm">{naira(report.received)}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Went out</p><p className="font-display font-bold text-sm">{naira(report.spent)}</p></div>
        <div className={`p-2.5 rounded-lg ${short ? 'bg-destructive/10 border border-destructive/20' : 'bg-surface-2'}`}>
          <p className="text-[10px] text-muted-foreground uppercase">{short ? 'Short by' : 'Left'}</p>
          <p className={`font-display font-bold text-sm ${short ? 'text-destructive' : ''}`}>{naira(Math.abs(report.left))}</p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.key} data-money-row={row.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-display font-semibold">
                {row.label}
                {row.fixed && <span className="text-[10px] font-normal text-muted-foreground"> · every month</span>}
              </span>
              <span className="text-sm font-display font-bold shrink-0">{naira(row.amount)}</span>
            </div>
            <div className="h-1.5 mt-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className={`h-full rounded-full ${row.fixed ? 'bg-primary/50' : 'bg-primary'}`} style={{ width: `${(row.amount / top) * 100}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {row.per100 !== null && <b className="text-foreground">₦{Math.round(row.per100)} of every ₦100 that came in. </b>}
              {row.detail}
            </p>
          </div>
        ))}
      </div>

      {compact && report.rows.length > 3 && (
        <button type="button" onClick={() => setShowAll(all => !all)} className="text-[11px] font-display font-semibold text-primary">
          {showAll ? 'Show fewer' : `Show all ${report.rows.length}`}
        </button>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Money that came in is payments received in these {report.days} days. Rent and salaries are counted at what a month of them costs, paid yet or not.
      </p>
    </div>
  );
}
