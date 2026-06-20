import { useState } from 'react';
import { StoreData, CashSession } from '@/types/store';
import { recordCashSession } from '@/lib/store-data';
import { 
  Coins, Plus, Calendar, DollarSign, ArrowRight, ShieldAlert, Sparkles, Scale, FileText
} from 'lucide-react';
import { showToast } from '@/components/Toast';

interface CashDrawerProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
}

export default function CashDrawer({ store, onUpdate }: CashDrawerProps) {
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [openingCash, setOpeningCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');

  // Daily totals calculations
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  
  // Sales that are cash
  const todayCashSales = store.sales
    .filter(s => new Date(s.date) >= todayStart && s.paymentMethod === 'cash')
    .reduce((sum, s) => sum + s.total, 0);

  // Expenses that are cash
  const todayCashExpenses = (store.expenses || [])
    .filter(e => new Date(e.date) >= todayStart)
    .reduce((sum, e) => sum + e.amount, 0);

  const expectedSalesCash = todayCashSales;
  const expectedExpenses = todayCashExpenses;

  const handleRecordSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingCash || !actualCash) {
      showToast('Opening cash float and physical count are required', 'error');
      return;
    }

    const open = Number(openingCash);
    const actual = Number(actualCash);
    const expected = open + expectedSalesCash - expectedExpenses;

    const nextStore = recordCashSession(store, {
      date: new Date().toISOString(),
      openingCash: open,
      salesCash: expectedSalesCash,
      expenses: expectedExpenses,
      expectedCash: expected,
      actualCash: actual,
      notes: notes.trim() || undefined
    });

    onUpdate(nextStore);
    showToast('Daily drawer balance logged!');
    resetForm();
  };

  const resetForm = () => {
    setOpeningCash('');
    setActualCash('');
    setNotes('');
    setShowAddModal(false);
  };

  const sessions = store.cashSessions || [];

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Coins className="w-6 h-6 text-yellow-500" /> Cash Drawer Tracker
          </h2>
          <p className="text-sm text-muted-foreground">Reconcile physical cash drawer counts, log floats, and track discrepancies.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-display font-bold transition-all text-sm shadow-md active:scale-95 cursor-pointer"
        >
          <Scale className="w-4 h-4" /> Balance Drawer
        </button>
      </div>

      {/* Discrepancies audit widget from Flow */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-yellow-500/10 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 font-bold shrink-0">
          ✨
        </div>
        <div className="space-y-1">
          <h4 className="font-display font-bold text-sm text-yellow-500">Flow's Drawer Audit</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {sessions.length > 0 ? (
              <>
                Across your last logged balancing sessions, the total discrepancy index is{' '}
                <strong className={`font-mono ${
                  sessions.reduce((sum, s) => sum + (s.actualCash - s.expectedCash), 0) < 0 
                    ? 'text-destructive font-black' 
                    : 'text-success'
                }`}>
                  ₦{sessions.reduce((sum, s) => sum + (s.actualCash - s.expectedCash), 0).toLocaleString()}
                </strong>. Ensure staff accounts verify checkout change parameters.
              </>
            ) : (
              "No drawer audits recorded. Perform your first drawer balance count above to audit cash register flow."
            )}
          </p>
        </div>
      </div>

      {/* Tally Stats for Today */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-950 border border-border">
          <span className="text-[10px] text-muted-foreground font-sans font-bold uppercase tracking-wider block">Today Cash Sales</span>
          <p className="font-display font-black text-xl text-success mt-1">₦{todayCashSales.toLocaleString()}</p>
          <span className="text-[10px] text-muted-foreground block mt-1">From transactions paid in Cash</span>
        </div>
        
        <div className="p-5 rounded-2xl bg-slate-950 border border-border">
          <span className="text-[10px] text-muted-foreground font-sans font-bold uppercase tracking-wider block">Today Cash Expenses</span>
          <p className="font-display font-black text-xl text-destructive mt-1">₦{todayCashExpenses.toLocaleString()}</p>
          <span className="text-[10px] text-muted-foreground block mt-1">From inventory restocks or overheads</span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-950 border border-border">
          <span className="text-[10px] text-muted-foreground font-sans font-bold uppercase tracking-wider block">Expected Drawer Net</span>
          <p className="font-display font-black text-xl text-foreground mt-1">
            ₦{(todayCashSales - todayCashExpenses).toLocaleString()}
          </p>
          <span className="text-[10px] text-muted-foreground block mt-1">(excluding opening drawer float)</span>
        </div>
      </div>

      {/* Session Ledger list */}
      <div className="space-y-3.5">
        <h3 className="font-display font-bold text-base text-foreground">Drawer Balancing Logs</h3>
        
        {sessions.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-border/80">
            <p className="text-muted-foreground text-sm">No balancing records logged. Tally your drawer at closing time!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => {
              const variance = s.actualCash - s.expectedCash;
              return (
                <div key={s.id} className="p-4 rounded-xl bg-slate-950 border border-border flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> {new Date(s.date).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Float: <strong>₦{s.openingCash.toLocaleString()}</strong> · Sales: <strong>₦{s.salesCash.toLocaleString()}</strong> · Expenses: <strong>₦{s.expenses.toLocaleString()}</strong>
                    </p>
                    {s.notes && <p className="text-[11px] text-muted-foreground italic">Note: {s.notes}</p>}
                  </div>
                  
                  <div className="text-right space-y-1">
                    <p className="text-xs text-muted-foreground">Expected: <strong>₦{s.expectedCash.toLocaleString()}</strong></p>
                    <p className="text-xs text-muted-foreground">Actual Count: <strong>₦{s.actualCash.toLocaleString()}</strong></p>
                    <p className={`text-xs font-display font-bold ${variance === 0 ? 'text-success' : variance < 0 ? 'text-destructive font-black' : 'text-primary'}`}>
                      {variance === 0 ? 'Balanced ✓' : `Variance: ₦${variance.toLocaleString()} ${variance < 0 ? '📉' : '📈'}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Balance Modal uploader */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={handleRecordSession} 
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 animate-slide-up space-y-4"
          >
            <div>
              <h3 className="font-display font-bold text-lg">Balance Drawer</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Tally cash register counts against expected transactions.</p>
            </div>

            <div className="space-y-3.5 border-b border-border/60 pb-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs p-3.5 rounded-xl bg-surface-2 border border-border">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold">Float Float</p>
                  <p className="font-bold text-foreground mt-0.5">Adjustable</p>
                </div>
                <div className="border-x border-border/80">
                  <p className="text-[9px] text-muted-foreground uppercase font-bold">Cash Sales</p>
                  <p className="font-bold text-success mt-0.5">₦{expectedSalesCash.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold">Cash Exp</p>
                  <p className="font-bold text-destructive mt-0.5">₦{expectedExpenses.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Opening Float (₦)</label>
                  <input 
                    type="number" 
                    value={openingCash} 
                    onChange={e => setOpeningCash(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
                
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Actual Cash Count (₦)</label>
                  <input 
                    type="number" 
                    value={actualCash} 
                    onChange={e => setActualCash(e.target.value)}
                    placeholder="Count drawer cash"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs text-muted-foreground uppercase font-bold">Notes (Optional)</label>
                <input 
                  type="text" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Joy shift handover. Discrepancy due to missed change."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-yellow-500 text-left"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={resetForm} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-display font-bold active:scale-95 transition-all cursor-pointer">
                Balance & Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
