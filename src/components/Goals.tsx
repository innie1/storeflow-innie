import { useState } from 'react';
import { StoreData, BusinessGoal } from '@/types/store';
import { addGoal, updateGoal, deleteGoal } from '@/lib/store-data';
import { 
  Target, Plus, Calendar, Coins, TrendingUp, Sparkles, Award, Trash2, Edit3, ArrowRight
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface GoalsProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function Goals({ store, onUpdate }: GoalsProps) {
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-yellow-500" /> Business Goals
          </h2>
          <p className="text-sm text-muted-foreground">Track financial milestones, savings, and inventory scaling targets.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create Goal
        </button>
      </div>

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
