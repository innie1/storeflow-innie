import { SavingsGoal } from '@/types/store';
import {
  getSavingsGoals,
  addSavingsGoal,
  updateSavingsGoalById,
  deleteSavingsGoalById,
} from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { card, ProgressRing, SubPage, Stat } from '../ui';
import SavingsModal from '../SavingsModal';
import type { SettingsState } from '../useSettings';

export default function SavingsView({ s }: { s: SettingsState }) {
  const {
    store, onUpdate, setView, showSavingsModal, setShowSavingsModal, editingGoalId,
    setEditingGoalId, deleteConfirmGoalId, setDeleteConfirmGoalId, mgr,
  } = s;
    const goals = getSavingsGoals(store);
    const editingGoal = goals.find(g => g.id === editingGoalId);
    return (
    <SubPage title="Savings Plans" onBack={() => setView('home')}>
      {goals.length === 0 && (
        <div className={`${card} p-5 text-center space-y-2`}>
          <p className="text-sm text-muted-foreground">No savings plans yet.</p>
          <p className="text-[11px] text-muted-foreground">Set one up to automatically put money aside as you sell.</p>
        </div>
      )}
      {goals.map(g => {
        const pct = g.amount > 0 ? Math.min(100, (g.saved / g.amount) * 100) : 0;
        return (
          <div key={g.id} className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <ProgressRing pct={pct} size={64} color="hsl(var(--primary))" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{g.label || 'Savings Goal'}</p>
                  <p className="font-display font-bold text-lg text-primary">₦{g.amount.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">Saved ₦{g.saved.toLocaleString()}</p>
                </div>
              </div>
              <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-display font-bold px-2 py-1 rounded-full bg-success/10 text-success border border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Active
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Stat label="Source" value={`${g.percentage}% of ${g.source}`} />
              <Stat label="Frequency" value={g.frequency || 'weekly'} />
              <Stat label="Destination" value={g.bankName || '—'} />
              <Stat label="Progress" value={`${Math.round(pct)}%`} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingGoalId(g.id || null); setShowSavingsModal(true); }}
                className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteConfirmGoalId(g.id || null)}
                className="px-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/30 font-display font-bold text-sm"
              >
                Delete
              </button>
            </div>
            {deleteConfirmGoalId === g.id && (
              <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/30 space-y-2">
                <p className="text-xs text-muted-foreground">Delete "{g.label || 'this plan'}"? Money already saved isn't removed from anywhere — this just stops tracking it as a plan.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirmGoalId(null)} className="flex-1 py-2 rounded-lg text-xs font-display font-bold border border-border text-muted-foreground">Cancel</button>
                  <button
                    onClick={() => { onUpdate(deleteSavingsGoalById(store, g.id!)); setDeleteConfirmGoalId(null); showToast('Savings plan removed'); }}
                    className="flex-1 py-2 rounded-lg text-xs font-display font-bold bg-destructive text-white"
                  >
                    Delete Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => { setEditingGoalId(null); setShowSavingsModal(true); }}
        className="w-full p-3 rounded-xl bg-primary/10 text-primary border border-primary/30 font-display font-bold"
      >
        + Add Savings Plan
      </button>

      {showSavingsModal && (
        <SavingsModal
          initial={editingGoal || { amount: 0, label: '', source: 'profit', percentage: 10, saved: 0, frequency: 'weekly' } as SavingsGoal}
          onClose={() => { setShowSavingsModal(false); setEditingGoalId(null); }}
          onSave={(g) => {
            if (editingGoalId) {
              onUpdate(updateSavingsGoalById(store, editingGoalId, g));
              showToast('Savings plan updated');
            } else {
              const { id, ...rest } = g;
              onUpdate(addSavingsGoal(store, rest));
              showToast('Savings plan created');
            }
            setShowSavingsModal(false);
            setEditingGoalId(null);
          }}
          animate={mgr.mascotAnimations}
          store={store}
        />
      )}
    </SubPage>
  );
}
