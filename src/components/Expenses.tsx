import { useState, useMemo } from 'react';
import { StoreData, ExpenseCategory, Expense } from '@/types/store';
import { addExpense, deleteExpense, EXPENSE_CATEGORIES, receiveStock, RestockFunding } from '@/lib/store-data';
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

      {/* Add button */}
      <button
        onClick={() => setShowAdd(true)}
        className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
      >
        + New Expense
      </button>

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
          filtered.map(e => (
            <div key={e.id} className="p-3 rounded-lg bg-card border border-border flex items-center gap-3">
              <div className="text-2xl">{CATEGORY_ICON[e.category]}</div>
              <div className="flex-1 min-w-0">
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
                  onClick={() => handleDelete(e)}
                  className="text-[10px] text-muted-foreground hover:text-destructive mt-0.5"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
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
                <label className="text-[10px] text-muted-foreground uppercase">Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. October rent"
                  className={inputClass}
                />
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
    </div>
  );
}
