import { useState } from 'react';
import { StoreData, SavingsGoal, SavingsFrequency } from '@/types/store';
import Mascot from '@/components/Mascot';

// --- Savings setup modal ---
export default function SavingsModal({ initial, onClose, onSave, animate = true, store }: { initial: SavingsGoal; onClose: () => void; onSave: (g: SavingsGoal) => void; animate?: boolean; store?: StoreData }) {
  const [g, setG] = useState<SavingsGoal>({
    ...initial,
    dayOfWeek: initial.dayOfWeek || 'Monday',
    timeOfDay: initial.timeOfDay || '08:00',
  });
  const inp = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary";
  const freqs: SavingsFrequency[] = ['daily', 'weekly', 'monthly'];
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Mascot size={36} mood="happy" animate={animate} store={store} />
            <h3 className="font-display font-bold text-lg">Set Up Savings Plan</h3>
          </div>
          <button onClick={onClose} className="text-xl text-muted-foreground hover:text-foreground">×</button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input value={g.label || ''} onChange={e => setG({ ...g, label: e.target.value })} placeholder="Emergency Fund" className={inp} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Destination Bank</label>
          <input value={g.bankName || ''} onChange={e => setG({ ...g, bankName: e.target.value })} placeholder="Opay / PalmPay / GTBank" className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Goal Amount (₦)</label>
            <input type="number" value={g.amount || ''} onChange={e => setG({ ...g, amount: Number(e.target.value) || 0 })} placeholder="500000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dynamic Save %</label>
            <input type="number" value={g.percentage || ''} onChange={e => setG({ ...g, percentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} placeholder="10" className={inp} />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Deduction Type</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setG({ ...g, autoSaveAmount: undefined })}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${!g.autoSaveAmount ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-3 border-border text-muted-foreground'}`}
              >
                Use Percentage
              </button>
              <button
                type="button"
                onClick={() => setG({ ...g, autoSaveAmount: g.autoSaveAmount || 2000 })}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${g.autoSaveAmount ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-3 border-border text-muted-foreground'}`}
              >
                Use Fixed Cash
              </button>
            </div>
          </div>
          {g.autoSaveAmount !== undefined && (
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Periodic Cash Deduction (₦)</label>
              <input
                type="number"
                value={g.autoSaveAmount || ''}
                onChange={e => setG({ ...g, autoSaveAmount: Math.max(0, Number(e.target.value) || 0) })}
                placeholder="e.g. 2000"
                className={inp}
              />
            </div>
          )}
          <label className="flex items-center justify-between text-xs font-bold text-foreground cursor-pointer select-none pt-1.5 border-t border-border/60">
            <span>Automated Business Balance Deduction</span>
            <input
              type="checkbox"
              checked={!!g.autoSaveEnabled}
              onChange={e => setG({ ...g, autoSaveEnabled: e.target.checked })}
              className="rounded accent-primary w-4 h-4 cursor-pointer"
            />
          </label>
          {!g.autoSaveEnabled && (
            <p className="text-[10px] text-muted-foreground">Off: track this goal's savings manually. On: deducts automatically on a schedule.</p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Save from</label>
          <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
            {(['profit','revenue'] as const).map(s => (
              <button key={s} type="button" onClick={() => setG({ ...g, source: s })} className={`flex-1 px-3 py-2 text-xs font-display font-semibold capitalize cursor-pointer ${g.source === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Frequency</label>
          <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
            {freqs.map(f => (
              <button key={f} type="button" onClick={() => setG({ ...g, frequency: f })} className={`flex-1 px-3 py-2 text-xs font-display font-semibold capitalize cursor-pointer ${g.frequency === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{f}</button>
            ))}
          </div>
        </div>

        {g.frequency !== 'daily' && (
          <div>
            <label className="text-xs text-muted-foreground">Deduction Day</label>
            <select
              value={g.dayOfWeek || 'Monday'}
              onChange={e => setG({ ...g, dayOfWeek: e.target.value })}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:bg-surface-2 [&>option]:bg-card"
            >
              <option value="Monday">Monday</option>
              <option value="Tuesday">Tuesday</option>
              <option value="Wednesday">Wednesday</option>
              <option value="Thursday">Thursday</option>
              <option value="Friday">Friday</option>
              <option value="Saturday">Saturday</option>
              <option value="Sunday">Sunday</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground">Deduction Time</label>
          <input
            type="time"
            value={g.timeOfDay || '08:00'}
            onChange={e => setG({ ...g, timeOfDay: e.target.value })}
            className={inp}
          />
        </div>

        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-xs text-primary">
          ✨ Auto-deductions occur on login/save. Capped to available Business Balance to prevent negative balances.
        </div>

        <button onClick={() => onSave(g)} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">Save Plan</button>
      </div>
    </div>
  );
}
