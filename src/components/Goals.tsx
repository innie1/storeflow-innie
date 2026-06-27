import { useState, useMemo } from 'react';
import { StoreData, BusinessGoal } from '@/types/store';
import { addGoal, updateGoal, deleteGoal, saveStore } from '@/lib/store-data';
import { 
  Target, Plus, Calendar, Coins, TrendingUp, Sparkles, Award, Trash2, Edit3, ArrowRight
} from 'lucide-react';
import { showToast } from '@/components/Toast';
import { getFlowMemory, claimReferral } from '@/lib/flow-memory';
import { FlowIcon } from '@/components/FlowIcon';

interface GoalsProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Goals({ store, onUpdate }: GoalsProps) {
  const [activeTab, setActiveTab] = useState<'goals' | 'wallet'>('goals');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<BusinessGoal | null>(null);

  // Form states
  const [category, setCategory] = useState<'revenue' | 'profit' | 'savings' | 'debt' | 'inventory'>('revenue');
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [deadline, setDeadline] = useState('');

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !target) {
      showToast('Goal title and target amount are required', 'error');
      return;
    }
    const targetNum = Number(target);
    const currentNum = Number(current) || 0;
    const nextStore = addGoal(store, {
      category,
      label: label.trim(),
      target: targetNum,
      current: currentNum,
      deadline: deadline || undefined
    });
    
    // Check if completed on create
    if (currentNum >= targetNum) {
      nextStore.coins = (nextStore.coins || 0) + 10;
      showToast('🏆 Goal accomplished instantly! +10 FLOW Coins!');
    }
    
    onUpdate(nextStore);
    showToast('Business goal added!');
    resetForm();
  };

  const handleEditGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal || !label.trim() || !target) return;
    const targetNum = Number(target);
    const currentNum = Number(current) || 0;
    
    const wasCompleted = editingGoal.completed;
    const isCompletedNow = currentNum >= targetNum;

    let nextStore = updateGoal(store, editingGoal.id, {
      category,
      label: label.trim(),
      target: targetNum,
      current: currentNum,
      deadline: deadline || undefined
    });

    if (isCompletedNow && !wasCompleted) {
      nextStore.coins = (nextStore.coins || 0) + 10;
      showToast('🎉 Goal completed! You earned +10 FLOW Coins! 🪙');
    }

    onUpdate(nextStore);
    showToast('Goal details updated!');
    resetForm();
  };

  const handleDeleteGoal = (id: string) => {
    if (confirm('Delete this goal?')) {
      const nextStore = deleteGoal(store, id);
      onUpdate(nextStore);
      showToast('Goal deleted.');
    }
  };

  const resetForm = () => {
    setCategory('revenue');
    setLabel('');
    setTarget('');
    setCurrent('');
    setDeadline('');
    setShowAddModal(false);
    setEditingGoal(null);
  };

  const startEdit = (g: BusinessGoal) => {
    setEditingGoal(g);
    setCategory(g.category);
    setLabel(g.label);
    setTarget(g.target.toString());
    setCurrent(g.current.toString());
    setDeadline(g.deadline || '');
    setShowAddModal(true);
  };

  const goals = store.goals || [];

  const getProgress = (g: BusinessGoal) => {
    if (g.target <= 0) return 100;
    return Math.min(100, Math.round((g.current / g.target) * 100));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-4">
        <div className="text-left">
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Target className="w-6.5 h-6.5 text-yellow-500" /> Goals & Rewards
          </h2>
          <p className="text-sm text-muted-foreground">Track financial milestones, savings, and your FLOW wallet achievements.</p>
        </div>
        
        {activeTab === 'goals' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" /> Create Goal
          </button>
        )}
      </div>

      {/* Tab Switcher - Static row to prevent jumping */}
      <div className="flex justify-start">
        <div className="flex bg-surface-2 p-1 rounded-xl border border-border w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('goals')}
            className={`flex-1 sm:flex-none px-6 py-1.5 rounded-lg font-display font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'goals' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🎯 Business Goals
          </button>
          <button
            onClick={() => setActiveTab('wallet')}
            className={`flex-1 sm:flex-none px-6 py-1.5 rounded-lg font-display font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'wallet' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🪙 Flow Wallet
          </button>
        </div>
      </div>

      {activeTab === 'wallet' ? (
        <FlowWalletCard store={store} onUpdate={onUpdate} />
      ) : (
        <>
          {/* Rewards overview */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-yellow-500/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 text-xl font-bold shrink-0">
                🪙
              </div>
              <div className="text-left">
                <h4 className="font-display font-bold text-sm text-foreground">Flow Rewards Wallet</h4>
                <p className="text-xs text-muted-foreground">Accomplish challenges and goals to accumulate FLOW coins.</p>
              </div>
            </div>
            <span className="px-3.5 py-1.5 rounded-full bg-slate-950 border border-border text-yellow-500 font-display font-black text-sm">
              🪙 {store.coins || 0} Coins
            </span>
          </div>

          {/* Goals listing */}
          {goals.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
              <p className="text-muted-foreground text-sm">No business goals active. Create a target to stay motivated!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map(g => {
                const progress = getProgress(g);
                const isCompleted = g.completed;
                
                return (
                  <div 
                    key={g.id} 
                    className={`p-5 rounded-2xl bg-slate-950 border transition-all flex flex-col justify-between gap-4 shadow-sm ${
                      isCompleted ? 'border-yellow-500/35 bg-gradient-to-br from-yellow-500/5 to-transparent' : 'border-border'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-left space-y-1">
                        <span className="px-2 py-0.5 rounded bg-surface-2 border border-border text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                          {g.category}
                        </span>
                        <h3 className="font-display font-bold text-base text-foreground flex items-center gap-1.5">
                          {g.label} 
                          {isCompleted && <Award className="w-4.5 h-4.5 text-yellow-500 shrink-0" />}
                        </h3>
                        {g.deadline && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Target Date: {new Date(g.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(g)} className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-yellow-500 hover:border-yellow-500/25 transition-all">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteGoal(g.id)} className="p-2 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/25 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline text-xs text-muted-foreground">
                        <span>Progress: {progress}%</span>
                        <span className="font-display font-bold text-foreground">
                          ₦{g.current.toLocaleString()} <span className="text-muted-foreground text-[10px]">/ ₦{g.target.toLocaleString()}</span>
                        </span>
                      </div>
                      
                      {/* Progress track */}
                      <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden border border-border/80">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-yellow-500' : 'bg-primary'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {isCompleted ? (
                      <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center text-xs text-yellow-500 font-display font-semibold">
                        🏆 Goal Achieved! Reward Awarded.
                      </div>
                    ) : (
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                        <span>Keep pushing! You've got this.</span>
                        <span className="text-primary font-bold flex items-center gap-0.5">
                          Need ₦{(g.target - g.current).toLocaleString()} <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Goals Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={editingGoal ? handleEditGoal : handleAddGoal} 
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-lg">{editingGoal ? 'Modify Business Goal' : 'Define Business Goal'}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Focus your store's energy on concrete key results.</p>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Category</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  >
                    <option value="revenue">Revenue</option>
                    <option value="profit">Profit</option>
                    <option value="savings">Savings</option>
                    <option value="debt">Debt Reduction</option>
                    <option value="inventory">Inventory Growth</option>
                  </select>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Target Date</label>
                  <input 
                    type="date" 
                    value={deadline} 
                    onChange={e => setDeadline(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Goal Label / Title</label>
                <input 
                  type="text" 
                  value={label} 
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. Save for Dec warehouse lease"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Target Amount (₦)</label>
                  <input 
                    type="number" 
                    value={target} 
                    onChange={e => setTarget(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Current Standing (₦)</label>
                  <input 
                    type="number" 
                    value={current} 
                    onChange={e => setCurrent(e.target.value)}
                    placeholder="e.g. 120000"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                {editingGoal ? 'Save Target' : 'Create Target'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FlowWalletCard({ store, onUpdate }: { store: StoreData; onUpdate: (s: StoreData) => void }) {
  const [mem, setMem] = useState(() => getFlowMemory());
  const [refCode, setRefCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [showTx, setShowTx] = useState(false);

  const todaySales = store.sales.filter(s => s.date.startsWith(new Date().toISOString().split('T')[0])).length;
  const { streak, flowBalance, lifetimeFlowEarned, flowEarnedToday, flowTransactions = [], claimedReferralCode } = mem;

  const weeklyChallenges = useMemo(() => {
    const last7Days = store.sales.filter(s => (Date.now() - new Date(s.date).getTime()) < 7 * 86400000);
    const last7Expenses = (store.expenses || []).filter(e => (Date.now() - new Date(e.date).getTime()) < 7 * 86400000);
    
    let debtRecovered = 0;
    (store.pendingPayments || []).forEach(p => {
      p.events.forEach(ev => {
        if ((Date.now() - new Date(ev.date).getTime()) < 7 * 86400000 && ev.method) {
          debtRecovered += ev.amount;
        }
      });
    });

    const revenue = last7Days.reduce((s, x) => s + x.total, 0);
    const profit = last7Days.reduce((s, x) => s + x.profit, 0);
    const expenses = last7Expenses.reduce((s, x) => s + x.amount, 0);
    
    return [
      {
        id: 'c-sales',
        title: 'Sales Booster',
        description: 'Record at least 10 sales in the last 7 days.',
        target: 10,
        current: last7Days.length,
        rewardCoins: 5,
        completed: last7Days.length >= 10
      },
      {
        id: 'c-profit',
        title: 'Profit Maximizer',
        description: 'Earn ₦15,000 in net profit in the last 7 days.',
        target: 15000,
        current: profit,
        rewardCoins: 10,
        completed: profit >= 15000
      },
      {
        id: 'c-expense',
        title: 'Overhead Saver',
        description: 'Keep weekly operating expenses below ₦10,000.',
        target: 10000,
        current: expenses,
        rewardCoins: 5,
        completed: expenses < 10000 && last7Days.length > 0
      },
      {
        id: 'c-debt',
        title: 'Debt Recovery Specialist',
        description: 'Recover ₦5,000 in outstanding customer debt in the last 7 days.',
        target: 5000,
        current: debtRecovered,
        rewardCoins: 8,
        completed: debtRecovered >= 5000
      }
    ];
  }, [store]);

  const handleClaimReferral = () => {
    const code = refCode.trim();
    if (!code) return;
    setClaiming(true);
    setTimeout(() => {
      const res = claimReferral(code);
      if (res.success) {
        showToast(res.message, 'success');
        const updatedMem = getFlowMemory();
        setMem(updatedMem);
        const updatedStore = {
          ...store,
          coins: updatedMem.coins,
        };
        saveStore(updatedStore);
        onUpdate(updatedStore);
        setRefCode('');
      } else {
        showToast(res.message, 'error');
      }
      setClaiming(false);
    }, 800);
  };

  const getTxColor = (type: string) => {
    switch (type) {
      case 'referral': return 'text-purple-400';
      case 'streak': return 'text-amber-400';
      case 'daily': return 'text-emerald-400';
      case 'game': return 'text-sky-400';
      default: return 'text-gold';
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-yellow-500/15 via-yellow-500/5 to-surface-1 border border-yellow-500/25 shadow-card space-y-4 text-left">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlowIcon className="w-6 h-6 animate-pulse" />
          <h3 className="font-display font-bold text-base text-white tracking-wide">FLOW Wallet</h3>
        </div>
        <span className="text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 px-2 py-0.5 rounded-full font-display font-semibold uppercase tracking-wider">
          1 FLOW = ₦20
        </span>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Balance Card */}
        <div className="p-3.5 rounded-xl bg-yellow-500/5 border border-yellow-500/15 relative overflow-hidden flex flex-col justify-between min-h-[90px]">
          <div className="absolute -right-3 -top-3 opacity-10">
            <FlowIcon className="w-16 h-16" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Available FLOW</p>
            <p className="font-display font-extrabold text-2xl text-yellow-500 mt-1">
              {flowBalance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
          </div>
          <p className="font-display font-bold text-xs text-emerald-400 mt-1">
            ≈ ₦{(flowBalance * 20).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Earnings Card */}
        <div className="p-3.5 rounded-xl bg-surface-2 border border-border flex flex-col justify-between min-h-[90px]">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Today's Earned</p>
            <p className="font-display font-bold text-base text-white mt-1">
              +{flowEarnedToday.toLocaleString(undefined, { minimumFractionDigits: 1 })} FLOW
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-2 flex justify-between">
            <span>Lifetime:</span>
            <span className="font-bold text-white">{lifetimeFlowEarned.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </div>
        </div>
      </div>

      {/* Streak & Activity Progress */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl bg-surface-2 border border-border/60 text-center flex items-center justify-between px-3">
          <div className="text-left">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">🔥 Streak</p>
            <p className="font-display font-bold text-xs text-white mt-0.5">{streak} day{streak !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-lg">🔥</div>
        </div>
        <div className="p-2.5 rounded-xl bg-surface-2 border border-border/60 text-center flex items-center justify-between px-3">
          <div className="text-left">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Today's Sales</p>
            <p className="font-display font-bold text-xs text-white mt-0.5">{todaySales} sale{todaySales !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-lg">📈</div>
        </div>
      </div>

      {/* Referral Welcomer Code Section */}
      <div className="p-3.5 rounded-xl bg-surface-2/40 border border-border/60 space-y-2">
        <h4 className="font-display font-bold text-xs text-white flex items-center gap-1.5">
          🎁 Welcome Bonus
        </h4>
        {claimedReferralCode ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
            <span>Claimed: <strong>{claimedReferralCode}</strong></span>
            <span className="font-bold">+5 FLOW Bonus</span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">Enter a referral code to instantly claim 5 FLOW welcome bonus (₦100).</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="e.g. FLOW-WELCOME" 
                value={refCode}
                onChange={e => setRefCode(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-3 border border-border text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-yellow-500"
              />
              <button 
                onClick={handleClaimReferral}
                disabled={claiming || !refCode.trim()}
                className="px-3 py-1.5 bg-yellow-500 text-slate-950 font-display font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                {claiming ? 'Claiming...' : 'Claim'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Weekly Challenges */}
      <div className="p-4 rounded-xl bg-surface-2/60 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-left">
            <span className="text-sm">🏆</span>
            <div>
              <h3 className="font-display font-bold text-xs text-white">Weekly Challenges</h3>
              <p className="text-[9px] text-slate-400">Complete goals to accumulate FLOW reward coins</p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-yellow-500">
            {weeklyChallenges.filter(c => c.completed).length} / {weeklyChallenges.length} Done
          </span>
        </div>
        <div className="space-y-2">
          {weeklyChallenges.map(c => (
            <div key={c.id} className={`p-2.5 rounded-lg border flex justify-between items-center text-left ${c.completed ? 'bg-success/5 border-success/20' : 'bg-surface-3 border-border/60'}`}>
              <div className="flex-1 min-w-0 pr-2">
                <p className={`font-display font-bold text-xs ${c.completed ? 'text-success line-through opacity-75' : 'text-white'}`}>
                  {c.title}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{c.description}</p>
                
                {/* Progress bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all ${c.completed ? 'bg-success' : 'bg-yellow-500'}`} 
                      style={{ width: `${Math.min(100, (c.current / c.target) * 100)}%` }} 
                    />
                  </div>
                  <span className="text-[8px] font-mono text-slate-400 shrink-0 font-bold">
                    {c.current.toLocaleString()} / {c.target.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[9px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-1.5 py-0.5 rounded font-bold">
                  +{c.rewardCoins} FLOW
                </span>
                {c.completed && (
                  <p className="text-[9px] text-success font-bold mt-1">✓ Claimed</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Recent Transactions */}
      {flowTransactions.length > 0 && (
        <div className="space-y-1.5">
          <button 
            onClick={() => setShowTx(!showTx)} 
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-2 border border-border text-xs text-muted-foreground font-display font-semibold hover:text-white transition cursor-pointer"
          >
            <span>📜 Recent Transactions ({flowTransactions.length})</span>
            <span>{showTx ? '▲' : '▼'}</span>
          </button>
          
          {showTx && (
            <div className="p-2 rounded-xl bg-surface-2 border border-border/50 max-h-[150px] overflow-y-auto space-y-1.5 scrollbar-thin">
              {flowTransactions.map((tx: any) => (
                <div key={tx.id} className="flex justify-between items-start p-2 rounded-lg bg-surface-3 text-[11px] border border-border/30">
                  <div className="space-y-0.5 max-w-[70%] text-left">
                    <p className="text-white font-medium truncate">{tx.description}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString()} · <span className={`capitalize font-semibold ${getTxColor(tx.type)}`}>{tx.type}</span>
                    </p>
                  </div>
                  <span className="font-display font-bold text-yellow-500 flex-shrink-0">
                    +{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
