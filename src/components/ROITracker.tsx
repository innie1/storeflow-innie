import { useState, useMemo } from 'react';
import { StoreData, Investment, Loan, Withdrawal } from '@/types/store';
import { 
  addManualInvestment, deleteManualInvestment, 
  addLoan, deleteLoan, repayLoan, 
  addWithdrawal, deleteWithdrawal,
  saveStore 
} from '@/lib/store-data';
import { exportROICSV, exportROIPDF } from '@/lib/export-data';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import { 
  TrendingUp, ArrowUpRight, ArrowDownRight, Coins, Scale, 
  Calendar, FileText, Landmark, User, DollarSign, RefreshCw 
} from 'lucide-react';

interface ROITrackerProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

type TabType = 'dashboard' | 'capital' | 'loans' | 'history';
type TimeFilter = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

export default function ROITracker({ store, onUpdate }: ROITrackerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [confirmDel, setConfirmDel] = useState<{ id: string; type: 'investment' | 'loan' | 'withdrawal' } | null>(null);

  // Form states
  const [invAmount, setInvAmount] = useState('');
  const [invNote, setInvNote] = useState('');
  const [invSource, setInvSource] = useState('Cash Drawer');
  const [invReason, setInvReason] = useState('Additional Capital');

  const [drawAmount, setDrawAmount] = useState('');
  const [drawNote, setDrawNote] = useState('');

  const [loanAmount, setLoanAmount] = useState('');
  const [loanSource, setLoanSource] = useState('Cash Drawer');
  const [loanNote, setLoanNote] = useState('');
  const [loanDueDate, setLoanDueDate] = useState('');
  const [repayAmount, setRepayAmount] = useState<{[key: string]: string}>({});

  // 1. Calculations
  const inventoryValue = useMemo(() => {
    return store.products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  }, [store.products]);

  const cashBalance = store.cashBalance || 0;
  const bankBalance = store.bankBalance || 0;
  const walletBalance = store.walletBalance || 0;
  const totalCash = cashBalance + bankBalance + walletBalance;

  const accountsReceivable = useMemo(() => {
    return (store.customers || []).reduce((sum, c) => sum + (c.outstandingDebt || 0), 0);
  }, [store.customers]);

  const otherAssets = store.otherAssets || 0;
  const liabilities = store.liabilities || 0;

  // Business Value
  const businessValue = inventoryValue + totalCash + accountsReceivable + otherAssets - liabilities;

  // Invested Capital components
  const investments = store.investments || [];
  const manualInvestmentsList = useMemo(() => {
    return investments.filter(inv => inv.source !== 'Inventory Restock');
  }, [investments]);
  const autoInvestmentsList = useMemo(() => {
    return investments.filter(inv => inv.source === 'Inventory Restock');
  }, [investments]);

  const totalManualInvestments = useMemo(() => {
    return manualInvestmentsList.reduce((sum, i) => sum + i.amount, 0);
  }, [manualInvestmentsList]);

  const totalAutoInvestments = useMemo(() => {
    return autoInvestmentsList.reduce((sum, i) => sum + i.amount, 0);
  }, [autoInvestmentsList]);

  const withdrawals = store.withdrawals || [];
  const totalWithdrawals = useMemo(() => {
    return withdrawals.reduce((sum, w) => sum + w.amount, 0);
  }, [withdrawals]);

  const initialInvestment = useMemo(() => {
    const init = investments.find(inv => inv.type === 'initial');
    return init ? init.amount : 0;
  }, [investments]);

  // NOTE: initialInvestment (the store's starting inventory value) is
  // already a member of either manualInvestmentsList or
  // autoInvestmentsList above (it always has type: 'initial', and its
  // `source` field determines which bucket it lands in depending on how
  // the store was set up) — so it must NOT be added again here. Adding it
  // a second time overstated Total Invested Capital by the store's entire
  // starting inventory value, which understated the ROI% shown to the
  // owner for every store that started with any inventory.
  const totalInvestedCapital = totalManualInvestments + totalAutoInvestments - totalWithdrawals;

  // Profit & ROI
  const currentProfit = businessValue - totalInvestedCapital;
  const currentROI = totalInvestedCapital > 0 ? (currentProfit / totalInvestedCapital) * 100 : 0;

  // Revenue & Profit metrics
  const sales = store.sales || [];
  const expenses = store.expenses || [];
  const totalRevenue = useMemo(() => sales.reduce((sum, s) => sum + s.total, 0), [sales]);
  const grossProfit = useMemo(() => sales.reduce((sum, s) => sum + s.profit, 0), [sales]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const netIncome = totalRevenue - totalExpenses;

  // Capital Added This Month
  const capitalAddedThisMonth = useMemo(() => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return investments
      .filter(i => new Date(i.date) >= startOfMonth)
      .reduce((sum, i) => sum + i.amount, 0);
  }, [investments]);

  // Dynamic Insights
  const insights = useMemo(() => {
    const list: string[] = [];
    if (sales.length > 0) {
      list.push("Net income is increasing consistently as sales are logged.");
    }
    if (totalRevenue > 0) {
      list.push(`Business value has grown to ₦${businessValue.toLocaleString()}.`);
    }
    if (totalInvestedCapital > 0 && currentROI > 20) {
      list.push(`ROI is currently healthy at ${currentROI.toFixed(1)}%.`);
    }
    if (capitalAddedThisMonth > 0) {
      list.push(`ROI base grew this month due to ₦${capitalAddedThisMonth.toLocaleString()} in capital additions.`);
    }
    if (inventoryValue > totalRevenue && totalRevenue > 0) {
      list.push("Inventory value is currently higher than total revenue.");
    } else if (totalRevenue > 0) {
      list.push("Sales are growing while investment remains stable.");
    }
    if (totalAutoInvestments > 0) {
      list.push(`Automatic investments of ₦${totalAutoInvestments.toLocaleString()} were injected during inventory restocks.`);
    }
    if (liabilities > 0) {
      list.push(`Liabilities of ₦${liabilities.toLocaleString()} are currently leverage-funding store operations.`);
    }
    return list.slice(0, 4);
  }, [sales, totalRevenue, totalInvestedCapital, currentROI, capitalAddedThisMonth, inventoryValue, totalAutoInvestments, liabilities]);

  // History timeline
  const timelineEvents = useMemo(() => {
    const events: { date: string; type: string; amount: number; notes: string; invested: number; roi: number; bizVal: number; id: string }[] = [];
    const allItems: { date: string; type: string; amount: number; note: string; id: string }[] = [];
    
    investments.forEach(i => {
      allItems.push({ id: i.id, date: i.date, type: i.type === 'initial' ? 'Initial Capital' : 'Capital Injection', amount: i.amount, note: i.note });
    });
    withdrawals.forEach(w => {
      allItems.push({ id: w.id, date: w.date, type: 'Owner Withdrawal', amount: -w.amount, note: w.note || 'Owner Draw' });
    });
    (store.loans || []).forEach(l => {
      allItems.push({ id: l.id, date: l.date, type: 'Loan Added', amount: l.amount, note: `Loan from ${l.source}. ${l.note || ''}` });
    });

    allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningInvested = 0;
    let runningBizVal = 0;

    const rawHistory = allItems.map(item => {
      if (item.type.includes('Capital') || item.type.includes('Injection')) {
        runningInvested += item.amount;
        runningBizVal += item.amount;
      } else if (item.type === 'Owner Withdrawal') {
        runningInvested += item.amount;
        runningBizVal += item.amount;
      } else if (item.type === 'Loan Added') {
        runningBizVal += item.amount;
      }
      
      const profit = runningBizVal - runningInvested;
      const stepROI = runningInvested > 0 ? (profit / runningInvested) * 100 : 0;

      return {
        id: item.id,
        date: item.date,
        type: item.type,
        amount: Math.abs(item.amount),
        notes: item.note,
        invested: runningInvested,
        roi: stepROI,
        bizVal: runningBizVal
      };
    });

    // Apply Time Filters
    const now = Date.now();
    const filterMs = {
      today: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      quarter: 90 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
      all: Infinity
    }[timeFilter];

    return rawHistory
      .filter(e => timeFilter === 'all' || (now - new Date(e.date).getTime() <= filterMs))
      .reverse();
  }, [investments, withdrawals, store.loans, timeFilter]);

  // Actions
  const handleAddInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(invAmount);
    if (!amt || amt <= 0) return;
    const note = invNote.trim() || `${invReason} via ${invSource}`;
    const updated = addManualInvestment(store, amt, note, invSource, invReason);
    onUpdate(updated);
    setInvAmount('');
    setInvNote('');
    showToast('Manual investment recorded!');
  };

  const handleAddWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(drawAmount);
    if (!amt || amt <= 0) return;
    const note = drawNote.trim() || 'Owner personal draw';
    const updated = addWithdrawal(store, amt, note);
    onUpdate(updated);
    setDrawAmount('');
    setDrawNote('');
    showToast('Withdrawal recorded!');
  };

  const handleAddLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(loanAmount);
    if (!amt || amt <= 0) return;
    const note = loanNote.trim() || `Loan from ${loanSource}`;
    const dueDateIso = loanDueDate ? new Date(loanDueDate + 'T12:00:00').toISOString() : undefined;
    const updated = addLoan(store, amt, loanSource, note, dueDateIso);
    onUpdate(updated);
    setLoanAmount('');
    setLoanNote('');
    setLoanDueDate('');
    showToast('Loan registered successfully!');
  };

  const handleRepayLoan = (id: string) => {
    const amt = parseFloat(repayAmount[id] || '');
    if (!amt || amt <= 0) {
      showToast('Please enter a valid repayment amount', 'error');
      return;
    }
    const loan = (store.loans || []).find(l => l.id === id);
    if (loan && amt > loan.amount) {
      showToast(`That's more than the ₦${loan.amount.toLocaleString()} still owed \u2014 only ₦${loan.amount.toLocaleString()} was applied.`, 'info');
    }
    const updated = repayLoan(store, id, amt);
    onUpdate(updated);
    setRepayAmount(prev => ({ ...prev, [id]: '' }));
    showToast('Loan repayment registered!');
  };

  const handleDelete = () => {
    if (!confirmDel) return;
    let updated = store;
    if (confirmDel.type === 'investment') {
      updated = deleteManualInvestment(store, confirmDel.id);
    } else if (confirmDel.type === 'loan') {
      updated = deleteLoan(store, confirmDel.id);
    } else if (confirmDel.type === 'withdrawal') {
      updated = deleteWithdrawal(store, confirmDel.id);
    }
    onUpdate(updated);
    setConfirmDel(null);
    showToast('Record removed successfully!');
  };

  const roiColor = currentROI >= 100 ? 'text-success' : currentROI >= 0 ? 'text-primary' : 'text-destructive';
  const roiEmoji = currentROI >= 100 ? '🚀' : currentROI >= 50 ? '📈' : currentROI >= 0 ? '📊' : '📉';

  return (
    <div className="animate-fade-in space-y-4 text-left">
      {/* Tab Switcher & Export */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        <div className="flex p-1 rounded-xl bg-surface-2 gap-1 border border-border/60">
          {(['dashboard', 'capital', 'loans', 'history'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase transition-all cursor-pointer ${
                activeTab === tab ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={() => exportROIPDF(store)} className="flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:border-primary/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => exportROICSV(store)} className="flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:border-primary/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
            <TrendingUp className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          {/* Main ROI Card */}
          <div className="bg-card shadow-card border border-border/40 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-primary/5 rounded-bl-full flex items-center justify-center text-4xl select-none opacity-40">
              📊
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Automatic Return on Investment</span>
              <div className="flex items-baseline gap-2">
                <p className={`font-display font-black text-4.5xl leading-tight ${roiColor}`}>
                  {roiEmoji} {currentROI.toFixed(1)}%
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Automatically monitored in real-time as your business updates.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border/60">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Invested Capital</span>
                <p className="font-display font-bold text-lg text-foreground mt-0.5">₦{totalInvestedCapital.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Business Value</span>
                <p className="font-display font-bold text-lg text-primary mt-0.5">₦{businessValue.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Current Profit</span>
                <p className={`font-display font-bold text-lg mt-0.5 ${currentProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ₦{currentProfit.toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Net Income</span>
                <p className={`font-display font-bold text-lg mt-0.5 ${netIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ₦{netIncome.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Sub KPIs Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Inventory Value</span>
              <p className="font-display font-bold text-xl text-foreground">₦{inventoryValue.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Cash Balance</span>
              <p className="font-display font-bold text-xl text-success">₦{totalCash.toLocaleString()}</p>
              <div className="flex gap-2 text-[9px] text-muted-foreground font-mono mt-1 flex-wrap">
                <span>D:{cashBalance.toLocaleString()}</span>
                <span>B:{bankBalance.toLocaleString()}</span>
                <span>W:{walletBalance.toLocaleString()}</span>
              </div>
            </div>
            <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Revenue</span>
              <p className="font-display font-bold text-xl text-yellow-500">₦{totalRevenue.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Liabilities</span>
              <p className="font-display font-bold text-xl text-destructive">₦{liabilities.toLocaleString()}</p>
            </div>
          </div>

          {/* Extra Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-2 col-span-2">
              <h3 className="font-display font-bold text-sm">💡 Real-time Business Insights</h3>
              <div className="space-y-2 pt-1">
                {insights.map((ins, i) => (
                  <div key={i} className="flex gap-2 items-start text-xs text-foreground/90 bg-surface-2/40 p-2.5 rounded-xl border border-border/10">
                    <span className="text-primary">✦</span>
                    <p>{ins}</p>
                  </div>
                ))}
                {insights.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">Insights will appear here once more transactions are registered.</p>
                )}
              </div>
            </div>

            <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-3">
              <h3 className="font-display font-bold text-sm">📋 Equity Distribution</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Owner Equity</span>
                  <span className="font-bold text-foreground">₦{totalInvestedCapital.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Capital added this month</span>
                  <span className="font-bold text-primary">₦{capitalAddedThisMonth.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Automatic Injections</span>
                  <span className="font-bold text-muted-foreground">₦{totalAutoInvestments.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-muted-foreground">Personal Withdrawals</span>
                  <span className="font-bold text-destructive">₦{totalWithdrawals.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'capital' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Manual Investments */}
          <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-display font-bold text-base flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" /> Manual Capital Injection
              </h3>
              <p className="text-xs text-muted-foreground">Add personal funds directly into your cash drawer or bank accounts.</p>
            </div>
            
            <form onSubmit={handleAddInvestment} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Deduct/Inject Target</label>
                  <select 
                    value={invSource}
                    onChange={e => setInvSource(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary font-display font-semibold"
                  >
                    <option value="Cash Drawer">Cash Drawer</option>
                    <option value="Bank Account">Bank Account</option>
                    <option value="Business Wallet">Business Wallet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Reason/Classification</label>
                  <select 
                    value={invReason}
                    onChange={e => setInvReason(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary font-display font-semibold"
                  >
                    <option value="Additional Capital">Additional Capital</option>
                    <option value="Startup Capital">Startup Capital</option>
                    <option value="Asset Purchase Float">Asset Purchase Float</option>
                    <option value="Emergency Fund">Emergency Fund</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Amount (₦)</label>
                <input 
                  type="number"
                  required
                  value={invAmount}
                  onChange={e => setInvAmount(e.target.value)}
                  placeholder="₦50,000"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Notes</label>
                <input 
                  type="text"
                  value={invNote}
                  onChange={e => setInvNote(e.target.value)}
                  placeholder="Additional remarks..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <button type="submit" className="w-full p-3 bg-primary text-primary-foreground font-display font-bold text-sm rounded-xl cursor-pointer">
                Inject Capital
              </button>
            </form>
          </div>

          {/* Withdrawals */}
          <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-display font-bold text-base flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-destructive" /> Owner Draw (Withdrawal)
              </h3>
              <p className="text-xs text-muted-foreground">Withdraw business cash for personal use. Decreases invested capital equity.</p>
            </div>
            
            <form onSubmit={handleAddWithdrawal} className="space-y-3">
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Withdrawal Amount (₦)</label>
                <input 
                  type="number"
                  required
                  value={drawAmount}
                  onChange={e => setDrawAmount(e.target.value)}
                  placeholder="₦10,000"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Remarks</label>
                <input 
                  type="text"
                  value={drawNote}
                  onChange={e => setDrawNote(e.target.value)}
                  placeholder="Personal use, emergency, salary draw..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <button type="submit" className="w-full p-3 bg-destructive/15 text-destructive border border-destructive/20 font-display font-bold text-sm rounded-xl hover:bg-destructive/20 cursor-pointer">
                Log Personal Draw
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'loans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Add Loan Form */}
            <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-4 col-span-1">
              <div>
                <h3 className="font-display font-bold text-base flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-yellow-500" /> Register Business Loan
                </h3>
                <p className="text-xs text-muted-foreground">Borrowed money increases Cash and Liabilities. It does NOT increase capital.</p>
              </div>

              <form onSubmit={handleAddLoan} className="space-y-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Loan Source / Lender</label>
                  <input 
                    type="text"
                    required
                    value={loanSource}
                    onChange={e => setLoanSource(e.target.value)}
                    placeholder="Bank, family, partner..."
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Loan Amount (₦)</label>
                  <input 
                    type="number"
                    required
                    value={loanAmount}
                    onChange={e => setLoanAmount(e.target.value)}
                    placeholder="₦200,000"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Repayment Due Date (optional)</label>
                  <input 
                    type="date"
                    value={loanDueDate}
                    onChange={e => setLoanDueDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">You'll get a reminder starting 3 days before this date.</p>
                </div>

                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Notes</label>
                  <input 
                    type="text"
                    value={loanNote}
                    onChange={e => setLoanNote(e.target.value)}
                    placeholder="Interest rate, terms..."
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <button type="submit" className="w-full p-3 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold text-sm rounded-xl cursor-pointer">
                  Register Loan
                </button>
              </form>
            </div>

            {/* Active Loans List */}
            <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-4 col-span-2">
              <h3 className="font-display font-bold text-base">Active Business Liabilities</h3>
              
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {(store.loans || []).filter(l => l.status === 'active').map(l => (
                  <div key={l.id} className="p-3.5 rounded-xl bg-surface-2 border border-border/40 flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="font-display font-bold text-sm text-foreground">{l.source}</p>
                      <p className="text-muted-foreground">{new Date(l.date).toLocaleDateString()} • {l.note || 'No notes'}</p>
                      {l.dueDate && (() => {
                        const d = Math.ceil((new Date(l.dueDate).getTime() - Date.now()) / 86400000);
                        return (
                          <p className={`text-[10px] font-semibold ${d < 0 ? 'text-destructive' : d <= 3 ? 'text-warning' : 'text-muted-foreground'}`}>
                            Due {new Date(l.dueDate).toLocaleDateString()} {d < 0 ? `(overdue ${-d}d)` : d === 0 ? '(today)' : `(${d}d left)`}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">Owed</span>
                        <span className="font-display font-bold text-sm text-destructive">₦{l.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          placeholder="Repay ₦"
                          max={l.amount}
                          value={repayAmount[l.id] || ''}
                          onChange={e => setRepayAmount({ ...repayAmount, [l.id]: e.target.value })}
                          className="w-24 p-1.5 rounded bg-card border border-border text-center text-foreground font-mono focus:outline-none"
                        />
                        <button 
                          onClick={() => handleRepayLoan(l.id)}
                          className="px-2 py-1.5 bg-success/15 border border-success/30 hover:bg-success/20 text-success rounded font-display font-bold cursor-pointer"
                        >
                          Repay
                        </button>
                      </div>
                      <button 
                        onClick={() => setConfirmDel({ id: l.id, type: 'loan' })}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {(store.loans || []).filter(l => l.status === 'active').length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-xs">
                    No active loan liabilities registered.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="font-display font-bold text-base">Timeline of Event Impact on ROI</h3>
            
            {/* Time filter */}
            <div className="flex p-1 bg-surface-2 border border-border/40 rounded-lg gap-1">
              {(['today', 'week', 'month', 'all'] as TimeFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setTimeFilter(f)}
                  className={`px-2 py-1 rounded text-[10px] font-display font-bold uppercase transition-all cursor-pointer ${
                    timeFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {timelineEvents.map((e, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-surface-2/60 border border-border/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-display font-bold uppercase ${
                      e.type === 'Owner Withdrawal' ? 'bg-destructive/15 text-destructive' : e.type === 'Loan Added' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-primary/10 text-primary'
                    }`}>
                      {e.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString()}</span>
                  </div>
                  <p className="font-semibold text-foreground">{e.notes}</p>
                </div>
                <div className="flex items-center gap-4 text-right self-stretch sm:self-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                  <div>
                    <span className="text-[9px] text-muted-foreground block">Impact Amt</span>
                    <span className="font-bold text-foreground">₦{e.amount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground block">New ROI</span>
                    <span className="font-bold text-primary">{e.roi.toFixed(1)}%</span>
                  </div>
                  <button 
                    onClick={() => setConfirmDel({
                      id: e.id,
                      type: e.type === 'Owner Withdrawal' ? 'withdrawal' : e.type === 'Loan Added' ? 'loan' : 'investment'
                    })}
                    className="p-1 hover:bg-destructive/15 text-destructive rounded"
                    title="Remove record"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {timelineEvents.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No events found matching current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title={`Delete this ${confirmDel.type} record?`}
          message="This action will recalculate ROI and available cash. Enter access code to confirm."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
