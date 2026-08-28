import { useState, useMemo } from 'react';
import { StoreData, ExpenseCategory, Expense, Restock, RecurringBill } from '@/types/store';
import { addExpense, deleteExpense, EXPENSE_CATEGORIES, receiveStock, RestockFunding, addRecurringBill, deleteRecurringBill, toggleRecurringBill, markRecurringBillPaid } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';

interface ExpensesProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

const CATEGORY_ICON: Record<ExpenseCategory, string> = {
  Restock: '📦',
  Rent: '🏠',
  Utilities: '💡',
  Salaries: '👥',
  Transport: '🚚',
  Other: '🧾',
};

export default function Expenses({ store, onUpdate }: ExpensesProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');
  const [confirmDel, setConfirmDel] = useState<Expense | null>(null);
  const [showRestock, setShowRestock] = useState(false);
  const [restockQtys, setRestockQtys] = useState<Record<string, string>>({});
  const [restockFunding, setRestockFunding] = useState<RestockFunding>('balance');
  const [restockSearch, setRestockSearch] = useState('');
  const [selectedRestockBatch, setSelectedRestockBatch] = useState<{ expense: Expense; items: Restock[] } | null>(null);
  const [showBills, setShowBills] = useState(false);
  const [showAddBill, setShowAddBill] = useState(false);
  const [billLabel, setBillLabel] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState<ExpenseCategory>('Rent');
  const [billFrequency, setBillFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [billDueDate, setBillDueDate] = useState('');
  const [confirmDelBill, setConfirmDelBill] = useState<RecurringBill | null>(null);

  const expenses = store.expenses || [];

  const sortedProducts = useMemo(
    () => [...store.products].sort((a, b) => a.quantity - b.quantity),
    [store.products],
  );

  const filteredRestockProducts = useMemo(() => {
    const q = restockSearch.trim().toLowerCase();
    if (!q) return sortedProducts;
    return sortedProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [sortedProducts, restockSearch]);

  const restockTotal = useMemo(() => {
    return Object.entries(restockQtys).reduce((sum, [pid, qStr]) => {
      const q = Number(qStr);
      if (!q || q <= 0) return sum;
      const p = store.products.find(x => x.id === pid);
      return sum + q * (p?.costPrice || 0);
    }, 0);
  }, [restockQtys, store.products]);

  const handleSaveRestock = () => {
    const entries = Object.entries(restockQtys)
      .map(([productId, qStr]) => {
        const q = Number(qStr);
        if (!q || q <= 0) return null;
        const p = store.products.find(x => x.id === productId);
        if (!p) return null;
        return { productId, quantity: q, costPrice: p.costPrice };
      })
      .filter((e): e is { productId: string; quantity: number; costPrice: number } => e !== null);
    if (entries.length === 0) return showToast('Add at least one quantity', 'error');
    const updated = receiveStock(store, entries, restockFunding);
    onUpdate(updated);
    setRestockQtys({});
    setRestockSearch('');
    setRestockFunding('balance');
    setShowRestock(false);
    showToast(`Restocked ${entries.length} item${entries.length > 1 ? 's' : ''}`);
  };


  const { total, byCategory, filtered } = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byCategory = new Map<ExpenseCategory, number>();
    expenses.forEach(e => byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amount));
    const filtered = filter === 'all' ? expenses : expenses.filter(e => e.category === filter);
    return { total, byCategory, filtered };
  }, [expenses, filter]);

  const handleAdd = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return showToast('Enter a valid amount', 'error');
    if (!date) return showToast('Pick a date', 'error');
    if (category === 'Other' && !note.trim()) return showToast('A note is required for "Other" expenses', 'error');
    const iso = new Date(date + 'T12:00:00').toISOString();
    const updated = addExpense(store, { amount: amt, category, date: iso, note: note.trim() || undefined });
    onUpdate(updated);
    setAmount('');
    setNote('');
    setCategory('Rent');
    setDate(new Date().toISOString().slice(0, 10));
    setShowAdd(false);
    showToast('Expense added');
  };

  const handleDelete = (e: Expense) => {
    setConfirmDel(e);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    onUpdate(deleteExpense(store, confirmDel.id));
    setConfirmDel(null);
    showToast('Expense deleted');
  };

  const recurringBills = store.recurringBills || [];

  const handleAddBill = () => {
    const amt = Number(billAmount);
    if (!billLabel.trim()) return showToast('Give this bill a name', 'error');
    if (!amt || amt <= 0) return showToast('Enter a valid amount', 'error');
    if (!billDueDate) return showToast('Pick the next due date', 'error');
    const nextDueDate = new Date(billDueDate + 'T12:00:00').toISOString();
    const updated = addRecurringBill(store, { label: billLabel.trim(), amount: amt, category: billCategory, frequency: billFrequency, nextDueDate });
    onUpdate(updated);
    setBillLabel('');
    setBillAmount('');
    setBillCategory('Rent');
    setBillFrequency('monthly');
    setBillDueDate('');
    setShowAddBill(false);
    showToast('Recurring bill added — you\u2019ll get a reminder starting 3 days before it\u2019s due');
  };

  const handleMarkBillPaid = (bill: RecurringBill) => {
    onUpdate(markRecurringBillPaid(store, bill.id));
    showToast(`${bill.label} marked as paid — logged as an expense`);
  };

  const handleToggleBill = (bill: RecurringBill) => {
    onUpdate(toggleRecurringBill(store, bill.id));
  };

  const handleDeleteBill = () => {
    if (!confirmDelBill) return;
    onUpdate(deleteRecurringBill(store, confirmDelBill.id));
    setConfirmDelBill(null);
    showToast('Recurring bill removed');
  };

  const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm";

  return (
    <div className="animate-fade-in space-y-4">
      {/* Summary */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
        <p className="font-display font-bold text-2xl text-destructive">₦{total.toLocaleString()}</p>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {EXPENSE_CATEGORIES.map(cat => {
            const v = byCategory.get(cat) || 0;
            return (
              <div key={cat} className="p-1.5 rounded-lg bg-surface-2 text-center">
                <p className="text-[10px] text-muted-foreground truncate">{CATEGORY_ICON[cat]} {cat}</p>
                <p className="text-xs font-display font-semibold text-foreground">₦{v.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowAdd(true)}
          className="p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
        >
          + New Expense
        </button>
        <button
          onClick={() => setShowRestock(true)}
          className="p-3 rounded-lg bg-success text-success-foreground font-display font-semibold text-sm hover:opacity-90"
        >
          📦 Restock Items
        </button>
      </div>

      {/* Recurring Bills */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <button
          onClick={() => setShowBills(!showBills)}
          className="w-full p-3.5 flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔁</span>
            <div>
              <p className="font-display font-bold text-sm">Recurring Bills</p>
              <p className="text-[10px] text-muted-foreground">
                {recurringBills.filter(b => b.active).length > 0
                  ? `${recurringBills.filter(b => b.active).length} active — reminders 3 days before due`
                  : 'Rent, subscriptions — get reminded before they\'re due'}
              </p>
            </div>
          </div>
          <span className="text-muted-foreground text-sm">{showBills ? '▲' : '▼'}</span>
        </button>
        {showBills && (
          <div className="px-3.5 pb-3.5 space-y-2 border-t border-border/60 pt-3">
            {recurringBills.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No recurring bills yet.</p>
            )}
            {recurringBills.map(bill => {
              const d = Math.ceil((new Date(bill.nextDueDate).getTime() - Date.now()) / 86400000);
              return (
                <div key={bill.id} className={`p-2.5 rounded-lg border ${bill.active ? 'bg-surface-2 border-border' : 'bg-surface-2/40 border-border/40 opacity-60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-sm truncate">{CATEGORY_ICON[bill.category]} {bill.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        ₦{bill.amount.toLocaleString()} · {bill.frequency} ·{' '}
                        {bill.active ? (
                          <span className={d < 0 ? 'text-destructive font-semibold' : d <= 3 ? 'text-warning font-semibold' : ''}>
                            {d < 0 ? `overdue ${-d}d` : d === 0 ? 'due today' : `due in ${d}d`}
                          </span>
                        ) : 'paused'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {bill.active && (
                        <button
                          onClick={() => handleMarkBillPaid(bill)}
                          className="px-2 py-1 rounded bg-success/15 text-success text-[10px] font-display font-bold hover:bg-success/25"
                        >
                          ✓ Paid
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleBill(bill)}
                        className="px-2 py-1 rounded bg-surface-3 text-[10px] font-display font-semibold hover:bg-surface-2"
                      >
                        {bill.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => setConfirmDelBill(bill)}
                        className="p-1 rounded text-destructive hover:bg-destructive/10"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!showAddBill ? (
              <button
                onClick={() => setShowAddBill(true)}
                className="w-full p-2 rounded-lg bg-primary/10 text-primary text-xs font-display font-bold hover:bg-primary/20"
              >
                + Add Recurring Bill
              </button>
            ) : (
              <div className="space-y-2 p-2.5 rounded-lg bg-surface-2 border border-border">
                <input
                  value={billLabel}
                  onChange={e => setBillLabel(e.target.value)}
                  placeholder="e.g. Shop Rent"
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={billAmount}
                    onChange={e => setBillAmount(e.target.value)}
                    placeholder="Amount ₦"
                    className={inputClass}
                  />
                  <select value={billCategory} onChange={e => setBillCategory(e.target.value as ExpenseCategory)} className={inputClass}>
                    {EXPENSE_CATEGORIES.filter(c => c !== 'Restock').map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={billFrequency} onChange={e => setBillFrequency(e.target.value as 'weekly' | 'monthly')} className={inputClass}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <input
                    type="date"
                    value={billDueDate}
                    onChange={e => setBillDueDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowAddBill(false)} className="p-2 rounded-lg bg-surface-3 text-xs font-display font-semibold">Cancel</button>
                  <button onClick={handleAddBill} className="p-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Save Bill</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setConfirmDelBill(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-display font-bold text-sm">Remove "{confirmDelBill.label}"?</p>
            <p className="text-xs text-muted-foreground">You won't get reminders for this bill anymore.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelBill(null)} className="p-2 rounded-lg bg-surface-2 text-xs font-display font-semibold">Cancel</button>
              <button onClick={handleDeleteBill} className="p-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-display font-bold">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-md text-xs font-display font-semibold border transition-colors ${
            filter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          All ({expenses.length})
        </button>
        {EXPENSE_CATEGORIES.map(cat => {
          const count = expenses.filter(e => e.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-display font-semibold border transition-colors ${
                filter === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {CATEGORY_ICON[cat]} {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Expense list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            {expenses.length === 0 ? 'No expenses yet. Tap "New Expense" to add one.' : 'No expenses in this category.'}
          </p>
        ) : (
          filtered.map(e => {
            const isRestock = e.category === 'Restock' || e.source === 'restock';
            return (
              <div
                key={e.id}
                onClick={() => {
                  if (isRestock) {
                    const items = (store.restocks || []).filter(r => r.batchId === e.restockBatchId);
                    setSelectedRestockBatch({ expense: e, items });
                  }
                }}
                className={`p-3 rounded-lg bg-card border border-border flex items-center gap-3 transition-colors ${
                  isRestock ? 'cursor-pointer hover:bg-surface-2/30 hover:border-success/30' : ''
                }`}
              >
                <div className="text-2xl">{CATEGORY_ICON[e.category]}</div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-semibold text-sm">{e.category}</span>
                    {e.source === 'restock' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">Auto</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(e.date).toLocaleDateString()} {new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {e.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{e.note}</p>}
                </div>
                <div className="text-right">
                  <p className="font-display font-bold text-destructive">₦{e.amount.toLocaleString()}</p>
                  <button
                    onClick={(evt) => { evt.stopPropagation(); handleDelete(e); }}
                    className="text-[10px] text-muted-foreground hover:text-destructive mt-0.5"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-lg">New Expense</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Amount (₦)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Category</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {EXPENSE_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                        category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border hover:border-primary/30'
                      }`}
                    >
                      {CATEGORY_ICON[cat]} {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">
                  Note {category === 'Other' ? <span className="text-destructive">(required)</span> : '(optional)'}
                </label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={category === 'Other' ? 'Explain what this expense is for' : 'e.g. October rent'}
                  className={inputClass}
                />
                {category === 'Other' && !note.trim() && (
                  <p className="text-[10px] text-destructive mt-1">This expense must be explained.</p>
                )}
              </div>
              <button onClick={handleAdd} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title="Delete this expense?"
          message={`${confirmDel.category} • ₦${confirmDel.amount.toLocaleString()}${confirmDel.source === 'restock' ? ' — auto-created from a restock' : ''}. Enter your store access code to confirm.`}
          confirmLabel="Delete Expense"
          onConfirm={doDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {/* Restock Modal */}
      {showRestock && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setShowRestock(false)}>
          <div className="w-full max-w-lg bg-card border border-border rounded-xl p-5 animate-slide-up max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-display font-bold text-lg">📦 Restock Items</h3>
              <button onClick={() => setShowRestock(false)} className="text-muted-foreground hover:text-foreground text-xl">×</button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Items sorted by stock level — lowest first. Add quantities to restock.
            </p>
            <input
              value={restockSearch}
              onChange={e => setRestockSearch(e.target.value)}
              placeholder="Search products..."
              className={`${inputClass} mb-2`}
            />
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredRestockProducts.map(p => {
                const qStr = restockQtys[p.id] || '';
                const q = Number(qStr) || 0;
                const lineTotal = q * p.costPrice;
                const isLow = p.quantity <= 5;
                const isEmpty = p.quantity <= 0;
                return (
                  <div key={p.id} className={`p-2 rounded-lg border ${isEmpty ? 'bg-destructive/10 border-destructive/30' : isLow ? 'bg-warning/10 border-warning/30' : 'bg-surface-2 border-border'}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-semibold text-sm truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Stock: <span className={isEmpty ? 'text-destructive font-bold' : isLow ? 'text-warning font-bold' : 'text-foreground'}>{p.quantity}</span>
                          {' • '}Cost: ₦{p.costPrice.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setRestockQtys({ ...restockQtys, [p.id]: String(Math.max(0, q - 1)) })}
                          className="w-7 h-7 rounded bg-surface-3 hover:bg-surface-2 text-sm"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={qStr}
                          onChange={e => setRestockQtys({ ...restockQtys, [p.id]: e.target.value })}
                          placeholder="0"
                          className="w-14 text-center text-sm bg-surface-3 border border-border rounded p-1"
                        />
                        <button
                          onClick={() => setRestockQtys({ ...restockQtys, [p.id]: String(q + 1) })}
                          className="w-7 h-7 rounded bg-surface-3 hover:bg-surface-2 text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {q > 0 && (
                      <p className="text-[10px] text-right text-primary mt-1">+ ₦{lineTotal.toLocaleString()}</p>
                    )}
                  </div>
                );
              })}
              {filteredRestockProducts.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-6">No products found</p>
              )}
            </div>

            <div className="pt-3 mt-2 border-t border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Grand total</span>
                <span className="font-display font-bold text-primary">₦{restockTotal.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRestockFunding('balance')}
                  className={`p-2 rounded-lg text-xs font-display font-semibold border ${
                    restockFunding === 'balance' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                  }`}
                >
                  💰 From Balance
                </button>
                <button
                  onClick={() => setRestockFunding('new_money')}
                  className={`p-2 rounded-lg text-xs font-display font-semibold border ${
                    restockFunding === 'new_money' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                  }`}
                >
                  💵 New Money
                </button>
              </div>
              <button
                onClick={handleSaveRestock}
                disabled={restockTotal <= 0}
                className="w-full p-2.5 rounded-lg bg-success text-success-foreground font-display font-semibold text-sm hover:opacity-90 disabled:opacity-40"
              >
                ✓ Save Restock
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRestockBatch && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setSelectedRestockBatch(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 animate-slide-up max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-display font-bold text-base flex items-center gap-2 text-success">
                <span>📦 Restock Batch Details</span>
              </h3>
              <button onClick={() => setSelectedRestockBatch(null)} className="text-muted-foreground hover:text-foreground text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left">
              {/* Summary Metadata */}
              <div className="p-3 bg-surface-2 rounded-lg border border-border text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date & Time:</span>
                  <span className="font-semibold text-foreground">
                    {new Date(selectedRestockBatch.expense.date).toLocaleDateString()} {new Date(selectedRestockBatch.expense.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Funding Source:</span>
                  <span className="font-semibold text-primary">
                    {selectedRestockBatch.items[0]?.funding === 'new_money' ? '💵 New Money Capital' : '💰 Store Cash Balance'}
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-border/60">
                  <span className="text-muted-foreground font-semibold">Total Amount:</span>
                  <span className="font-bold text-success">₦{selectedRestockBatch.expense.amount.toLocaleString()}</span>
                </div>
              </div>

              {/* Products List */}
              <div>
                <h4 className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">Restocked Products</h4>
                <div className="space-y-1.5">
                  {selectedRestockBatch.items.length > 0 ? (
                    selectedRestockBatch.items.map((item, idx) => (
                      <div key={item.id || idx} className="p-2 rounded-lg bg-surface-2/60 border border-border/50 flex justify-between items-center text-xs">
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="font-semibold text-foreground truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Qty: <span className="text-foreground font-medium">{item.quantity}</span> · Cost: ₦{item.costPrice.toLocaleString()} each
                          </p>
                        </div>
                        <span className="font-display font-bold text-primary text-right shrink-0">
                          ₦{item.total.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-surface-2 rounded-lg border border-border/40 text-center text-xs text-muted-foreground">
                      No specific product logs found for this batch. The restock note states:
                      <p className="italic mt-1 text-foreground">"{selectedRestockBatch.expense.note}"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-border">
              <button
                onClick={() => setSelectedRestockBatch(null)}
                className="w-full p-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-xs font-display font-semibold transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
