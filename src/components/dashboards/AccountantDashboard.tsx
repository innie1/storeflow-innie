import { useMemo } from 'react';
import { StoreData } from '@/types/store';
import { getDashboardStats } from '@/lib/store-data';
import { Wallet, Calculator, Coins, TrendingUp, AlertCircle, FileText } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface AccountantDashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

export default function AccountantDashboard({ store, onNavigate }: AccountantDashboardProps) {
  const stats = getDashboardStats(store);

  // Calculate average profit margin
  const avgMargin = useMemo(() => {
    if (store.products.length === 0) return 0;
    let sumMargins = 0;
    let count = 0;
    store.products.forEach(p => {
      if (p.costPrice > 0) {
        sumMargins += ((p.sellingPrice - p.costPrice) / p.costPrice) * 100;
        count++;
      }
    });
    return count > 0 ? Math.round(sumMargins / count) : 0;
  }, [store.products]);

  // Outstanding Debt Summary
  const pendingSummary = useMemo(() => {
    const list = (store.pendingPayments || []).filter(p => p.status === 'pending');
    return {
      totalOwed: list.reduce((s, p) => s + p.balance, 0),
      count: list.length,
    };
  }, [store.pendingPayments]);

  return (
    <div className="animate-fade-in space-y-6 text-left">
      {/* Mascot Header */}
      <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-card border border-border/40 shadow-card">
        <Mascot size={48} mood="confident" store={store} />
        <div>
          <h2 className="font-display font-bold text-lg text-foreground">Accounts & Margins Desk</h2>
          <p className="text-xs text-muted-foreground">Audit margins, record expenses, trace outstanding receivables, and ensure financial accuracy.</p>
        </div>
      </div>

      {/* Grid of Finance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="p-4 rounded-xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start text-foreground">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Revenue (Gross)</span>
            <TrendingUp className="w-4 h-4 text-yellow-500" />
          </div>
          <p className="font-display font-bold text-xl mt-2 text-yellow-500">₦{stats.totalRevenue.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Total receipts logged</p>
        </div>

        {/* Expenses */}
        <div className="p-4 rounded-xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start text-foreground">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Expenses</span>
            <Wallet className="w-4 h-4 text-destructive" />
          </div>
          <p className="font-display font-bold text-xl mt-2 text-destructive">₦{stats.totalExpenses.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Inbound stock & operating costs</p>
        </div>

        {/* Profit Margin */}
        <div className="p-4 rounded-xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start text-foreground">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Average Margin</span>
            <Calculator className="w-4 h-4 text-success" />
          </div>
          <p className="font-display font-bold text-xl mt-2 text-success">{avgMargin}%</p>
          <p className="text-[10px] text-muted-foreground mt-1">Average catalog markup</p>
        </div>

        {/* Debt Receivables */}
        <button
          onClick={() => onNavigate('pending')}
          className={`p-4 rounded-xl bg-card border text-left transition-all cursor-pointer shadow-card ${
            pendingSummary.totalOwed > 0 ? 'border-warning/60 bg-warning/5' : 'border-border/40 hover:bg-surface-2/40'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Outstanding Debts</span>
            <AlertCircle className={`w-4 h-4 ${pendingSummary.totalOwed > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </div>
          <p className={`font-display font-bold text-xl mt-2 ${pendingSummary.totalOwed > 0 ? 'text-warning' : 'text-foreground'}`}>
            ₦{pendingSummary.totalOwed.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">{pendingSummary.count} pending receivables</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Margin Audit Breakdown */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col h-80">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-primary" /> Product Profitability Audit
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-1">
            {store.products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <span className="text-xl">🧮</span>
                <p className="text-xs text-muted-foreground mt-1">No products registered to analyze.</p>
              </div>
            ) : (
              [...store.products]
                .sort((a, b) => {
                  const mB = b.costPrice > 0 ? (b.sellingPrice - b.costPrice) / b.costPrice : 0;
                  const mA = a.costPrice > 0 ? (a.sellingPrice - a.costPrice) / a.costPrice : 0;
                  return mB - mA;
                })
                .slice(0, 10)
                .map(p => {
                  const margin = p.costPrice > 0 ? Math.round(((p.sellingPrice - p.costPrice) / p.costPrice) * 100) : 0;
                  return (
                    <div key={p.id} className="p-3 rounded-xl bg-surface-2/50 border border-border/30 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-foreground truncate max-w-[180px]">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Cost: ₦{p.costPrice.toLocaleString()} · Sell: ₦{p.sellingPrice.toLocaleString()}</p>
                      </div>
                      <span className="font-bold text-success font-mono">{margin}% margin</span>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Accounting Workflows */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card space-y-4">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-yellow-500" /> Accounting Actions
          </h3>
          <p className="text-xs text-muted-foreground">Fast navigation triggers to update expenses records and review debt logs.</p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => onNavigate('expenses')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <Wallet className="w-5 h-5 text-destructive" />
              <span>Log Business Expenses</span>
            </button>
            <button
              onClick={() => onNavigate('pending')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <AlertCircle className="w-5 h-5 text-warning" />
              <span>Debt Repayments</span>
            </button>
            <button
              onClick={() => onNavigate('cash-drawer')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <Coins className="w-5 h-5 text-yellow-500" />
              <span>Cash Drawer sheets</span>
            </button>
            <button
              onClick={() => onNavigate('roi')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <TrendingUp className="w-5 h-5 text-primary" />
              <span>ROI Performance</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
