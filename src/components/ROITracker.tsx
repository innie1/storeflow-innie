import { useState, useMemo } from 'react';
import { StoreData, Investment } from '@/types/store';
import { addInvestment, deleteInvestment, getTotalInvestment, getDashboardStats, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';

interface ROITrackerProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function ROITracker({ store, onUpdate }: ROITrackerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState<'initial' | 'additional'>('additional');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const stats = getDashboardStats(store);
  const totalInvested = getTotalInvestment(store);
  const investments = store.investments || [];

  const roi = useMemo(() => {
    if (totalInvested === 0) return 0;
    return ((stats.netIncome) / totalInvested) * 100;
  }, [stats.netIncome, totalInvested]);

  // Calculate estimated time to reach milestones
  const milestones = useMemo(() => {
    const storeDays = Math.max(1, (Date.now() - new Date(store.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const dailyProfit = stats.netIncome / storeDays;
    
    const targets = [
      { label: 'Break Even', amount: totalInvested },
      { label: '2× Investment', amount: totalInvested * 2 },
      { label: '5× Investment', amount: totalInvested * 5 },
      { label: '₦100K Bankroll', amount: 100000 },
      { label: '₦500K Bankroll', amount: 500000 },
      { label: '₦1M Bankroll', amount: 1000000 },
    ];

    return targets.map(t => {
      const remaining = t.amount - stats.netIncome;
      if (remaining <= 0) return { ...t, daysLeft: 0, reached: true };
      if (dailyProfit <= 0) return { ...t, daysLeft: Infinity, reached: false };
      return { ...t, daysLeft: Math.ceil(remaining / dailyProfit), reached: false };
    });
  }, [store, stats, totalInvested]);

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const updated = addInvestment(store, {
      amount: amt,
      note: note || (type === 'initial' ? 'Initial investment' : 'Additional investment'),
      date: new Date().toISOString(),
      type,
    });
    onUpdate(updated);
    setAmount('');
    setNote('');
    setShowAddForm(false);
    showToast('Investment recorded');
  };

  const handleDelete = () => {
    if (!confirmDel) return;
    onUpdate(deleteInvestment(store, confirmDel));
    setConfirmDel(null);
    showToast('Investment removed');
  };

  const roiColor = roi >= 100 ? 'text-success' : roi >= 0 ? 'text-primary' : 'text-destructive';
  const roiEmoji = roi >= 100 ? '🚀' : roi >= 50 ? '📈' : roi >= 0 ? '📊' : '📉';

  return (
    <div className="animate-fade-in space-y-3">
      {/* ROI Overview Card */}
      <div className="bg-card shadow-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground font-display uppercase tracking-wide">Return on Investment</p>
            <p className={`font-display font-bold text-3xl ${roiColor}`}>
              {roiEmoji} {roi.toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase">Total Invested</p>
            <p className="font-display font-bold text-lg text-foreground">₦{totalInvested.toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-surface-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Revenue</p>
            <p className="font-display font-bold text-sm text-primary">₦{stats.totalRevenue.toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-surface-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Expenses</p>
            <p className="font-display font-bold text-sm text-destructive">₦{stats.totalExpenses.toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-surface-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Net</p>
            <p className={`font-display font-bold text-sm ${stats.netIncome >= 0 ? 'text-success' : 'text-destructive'}`}>
              ₦{stats.netIncome.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Milestones */}
      {totalInvested > 0 && (
        <div className="bg-card shadow-card rounded-2xl p-4 space-y-3">
          <h3 className="font-display font-bold text-sm">🏆 Milestones & Projections</h3>
          <div className="space-y-2">
            {milestones.filter(m => m.amount > 0).map((m, i) => (
              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                m.reached ? 'bg-success/10 border-success/30' : 'bg-surface-2 border-border'
              }`}>
                <span className="text-lg">{m.reached ? '✅' : '🎯'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-xs text-foreground">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground">₦{m.amount.toLocaleString()}</p>
                </div>
                <div className="text-right shrink-0">
                  {m.reached ? (
                    <span className="text-success text-xs font-display font-bold">Reached! 🎉</span>
                  ) : m.daysLeft === Infinity ? (
                    <span className="text-muted-foreground text-[10px]">—</span>
                  ) : (
                    <span className="text-xs text-muted-foreground font-display">
                      ~{m.daysLeft < 365 ? `${m.daysLeft}d` : `${(m.daysLeft / 365).toFixed(1)}y`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Investments List */}
      <div className="bg-card shadow-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-sm">💼 Investment Log</h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 font-display font-semibold"
          >
            {showAddForm ? '✕' : '+ Record'}
          </button>
        </div>

        {showAddForm && (
          <div className="p-3 rounded-lg bg-surface-2 border border-border space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setType('initial')}
                className={`flex-1 p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                  type === 'initial' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'
                }`}
              >
                Initial Capital
              </button>
              <button
                onClick={() => setType('additional')}
                className={`flex-1 p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                  type === 'additional' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'
                }`}
              >
                New Investment
              </button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Amount (₦)"
              className="w-full p-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
            />
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full p-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleAdd}
              disabled={!amount || parseFloat(amount) <= 0}
              className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm hover:opacity-90 disabled:opacity-40"
            >
              Record Investment
            </button>
          </div>
        )}

        {investments.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-4">No investments recorded. Tap "+ Record" to add your initial capital.</p>
        ) : (
          <div className="space-y-2">
            {investments.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2 border border-border">
                <span className="text-lg">{inv.type === 'initial' ? '🏦' : '💵'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm text-foreground">{inv.note}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {inv.type === 'initial' ? 'Initial' : 'Additional'} • {new Date(inv.date).toLocaleDateString()}
                  </p>
                </div>
                <p className="font-display font-bold text-sm text-primary shrink-0">₦{inv.amount.toLocaleString()}</p>
                <button
                  onClick={() => setConfirmDel(inv.id)}
                  className="w-6 h-6 rounded text-destructive text-xs hover:bg-destructive/10 flex items-center justify-center shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDel && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title="Delete this investment record?"
          message="Enter your store access code to confirm."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
