import { StoreData } from '@/types/store';
import { healthScore, storeHealthFigures } from '@/lib/manager-intel';
import { Ring } from './ui';
import { useCountUp } from './useCountUp';

// ─── Store Health Card ────────────────────────────────────────────────────────
export default function StoreHealthCard({ store, onOpenBreakdown, animate = true }: { store: StoreData; onOpenBreakdown: () => void; animate?: boolean }) {
  const health = healthScore(store);
  const tone: 'success' | 'primary' | 'warning' | 'danger' = health.overall >= 80 ? 'success' : health.overall >= 60 ? 'primary' : health.overall >= 40 ? 'warning' : 'danger';
  /*
   * The last seven days, said on the card, from the definitions every screen
   * shares. Revenue is money received. Expenses are running costs, with piece
   * work counted when it is approved rather than again when it is paid.
   * Profit takes those costs off: it used to be the sales profit alone, which
   * for a laundry is the whole payment, so it read the same as Revenue.
   */
  // The same figures Flow gives when asked how the store is doing.
  const { revenue, expenses, profit } = storeHealthFigures(store);

  const animatedHealth = useCountUp(animate ? health.overall : 0, 1500);
  const displayHealth = animate ? animatedHealth : health.overall;
  const isHealthDone = animate ? animatedHealth === health.overall : true;

  const animatedRevenue = useCountUp(animate ? revenue : 0, 2000);
  const displayRevenue = animate ? animatedRevenue : revenue;

  const animatedProfit = useCountUp(animate ? profit : 0, 2000);
  const displayProfit = animate ? animatedProfit : profit;
  const isProfitDone = animate ? animatedProfit === profit : true;

  const animatedExpenses = useCountUp(animate ? expenses : 0, 2000);
  const displayExpenses = animate ? animatedExpenses : expenses;
  const isExpenseDone = animate ? animatedExpenses === expenses : true;

  return (
    <button onClick={onOpenBreakdown} className="w-full text-left p-4 rounded-2xl bg-card shadow-card hover:border-primary/30 border border-transparent transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div><h3 className="font-display font-bold text-base">Store Health</h3><p className="text-[10px] text-muted-foreground">Last 7 days · tap to see breakdown</p></div>
        <span className="text-muted-foreground">›</span>
      </div>
      <div className="flex items-center gap-4">
        <div className={`relative flex-shrink-0 ${animate && isHealthDone ? 'pulse-once-anim' : ''}`}>
          <Ring value={displayHealth} size={104} tone={tone} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-bold text-3xl text-foreground leading-none">{displayHealth}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Revenue</p><p className="font-display font-bold text-sm truncate">₦{displayRevenue.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Profit</p><p className={`font-display font-bold text-sm truncate transition-all duration-300 ${animate && isProfitDone && profit > 0 ? 'text-success font-black drop-shadow-[0_0_4px_rgba(34,197,94,0.3)] pulse-twice-anim' : 'text-success'}`}>₦{displayProfit.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Expenses</p><p className={`font-display font-bold text-sm truncate transition-all duration-300 ${animate && isExpenseDone && expenses > 0 ? 'text-destructive font-black drop-shadow-[0_0_4px_rgba(239,68,68,0.3)]' : 'text-destructive'}`}>₦{displayExpenses.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Score</p><p className={`font-display font-bold text-sm ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary'}`}>{health.label}</p></div>
        </div>
      </div>
    </button>
  );
}
