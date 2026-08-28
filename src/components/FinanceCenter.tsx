import { useMemo } from 'react';
import { StoreData } from '@/types/store';
import { ArrowRight, CreditCard, Receipt, ShoppingCart, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

interface FinanceCenterProps {
  store: StoreData;
  onNavigate?: (tab: string) => void;
}

const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export default function FinanceCenter({ store, onNavigate }: FinanceCenterProps) {
  const finance = useMemo(() => {
    const sales = store.sales || [];
    const expenses = store.expenses || [];
    const pending = store.pendingPayments || [];
    const revenue = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const grossProfit = sales.reduce((sum, s) => sum + (Number(s.profit) || 0), 0);
    const operatingExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const restockSpend = (store.restocks || []).reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const pendingBalance = pending.filter(p => p.status === 'pending').reduce((sum, p) => sum + (Number(p.balance) || 0), 0);
    const netProfit = grossProfit - operatingExpenses;
    const cashCollected = sales.filter(s => !s.pendingPaymentId).reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    return { revenue, grossProfit, operatingExpenses, restockSpend, pendingBalance, netProfit, cashCollected };
  }, [store]);

  const actions = [
    { label: 'Record expense', icon: Receipt, tab: 'expenses' },
    { label: 'View orders', icon: ShoppingCart, tab: 'orders' },
    { label: 'Pending payments', icon: CreditCard, tab: 'pending' },
    { label: 'Cash drawer', icon: Wallet, tab: 'cash-drawer' },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Finance Center</p>
        <h2 className="font-display font-bold text-xl">Know where the money is going.</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Revenue" value={money(finance.revenue)} icon={<TrendingUp className="w-4 h-4" />} />
        <Metric label="Gross profit" value={money(finance.grossProfit)} icon={<TrendingUp className="w-4 h-4" />} />
        <Metric label="Expenses" value={money(finance.operatingExpenses)} icon={<TrendingDown className="w-4 h-4" />} negative />
        <Metric label="Net profit" value={money(finance.netProfit)} icon={<TrendingUp className="w-4 h-4" />} positive={finance.netProfit >= 0} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-bold text-sm">Money position</p>
            <p className="text-[10px] text-muted-foreground">What Flow can see from recorded transactions</p>
          </div>
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <Row label="Cash collected" value={money(finance.cashCollected)} />
        <Row label="Still owed" value={money(finance.pendingBalance)} action="pending" onNavigate={onNavigate} />
        <Row label="Stock purchases" value={money(finance.restockSpend)} action="expenses" onNavigate={onNavigate} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <p className="font-display font-bold text-sm">Quick actions</p>
        </div>
        {actions.map(({ label, icon: Icon, tab }) => (
          <button key={tab} onClick={() => onNavigate?.(tab)} className="w-full p-3 flex items-center gap-3 text-left hover:bg-surface-2 border-b last:border-b-0 border-border">
            <Icon className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1">{label}</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, icon, negative, positive = true }: { label: string; value: string; icon: React.ReactNode; negative?: boolean; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">{icon}{label}</div>
      <p className={`mt-1 font-display font-bold text-base ${negative ? 'text-destructive' : positive ? 'text-foreground' : 'text-destructive'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, action, onNavigate }: { label: string; value: string; action?: string; onNavigate?: (tab: string) => void }) {
  return (
    <button disabled={!action} onClick={() => action && onNavigate?.(action)} className="w-full flex items-center justify-between py-2 border-t border-border/60 text-left disabled:cursor-default">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-display font-semibold">{value}{action && <ArrowRight className="inline ml-1 w-3 h-3" />}</span>
    </button>
  );
}
