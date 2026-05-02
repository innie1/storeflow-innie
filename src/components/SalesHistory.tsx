import { useState, useMemo } from 'react';
import { StoreData, Sale, Expense, Restock } from '@/types/store';
import { clearSales, deleteSale, deleteExpense, getTrash } from '@/lib/store-data';
import { exportHistoryCSV, exportHistoryPDF } from '@/lib/export-data';
import { showToast } from '@/components/Toast';
import SaleReceipt from '@/components/SaleReceipt';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import RecentlyDeleted from '@/components/RecentlyDeleted';

interface SalesHistoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

type HistoryFilter = 'all' | 'sales' | 'restocks' | 'expenses';

interface HistoryEntry {
  id: string;
  type: 'sale' | 'restock' | 'expense';
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  amountColor: string;
  icon: string;
  raw: Sale | Restock | Expense;
}

export default function SalesHistory({ store, onUpdate }: SalesHistoryProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [viewReceipt, setViewReceipt] = useState<Sale | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<HistoryEntry | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  const trashCount = getTrash(store).length;

  const entries = useMemo<HistoryEntry[]>(() => {
    const items: HistoryEntry[] = [];

    if (filter === 'all' || filter === 'sales') {
      store.sales.forEach(s => {
        items.push({
          id: s.id,
          type: 'sale',
          date: s.date,
          title: s.productName,
          subtitle: `${s.quantity} × ₦${s.unitPrice.toLocaleString()}`,
          amount: s.total,
          amountColor: 'text-primary',
          icon: '💰',
          raw: s,
        });
      });
    }

    if (filter === 'all' || filter === 'restocks') {
      (store.restocks || []).forEach(r => {
        items.push({
          id: r.id,
          type: 'restock',
          date: r.date,
          title: r.productName,
          subtitle: `Restocked ${r.quantity} units @ ₦${r.costPrice.toLocaleString()}`,
          amount: -r.total,
          amountColor: 'text-warning',
          icon: '📦',
          raw: r,
        });
      });
    }

    if (filter === 'all' || filter === 'expenses') {
      (store.expenses || []).forEach(e => {
        items.push({
          id: e.id,
          type: 'expense',
          date: e.date,
          title: e.category,
          subtitle: e.note || 'Manual expense',
          amount: -e.amount,
          amountColor: 'text-destructive',
          icon: '🧾',
          raw: e,
        });
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [store, filter]);

  const filtered = search
    ? entries.filter(e => e.title.toLowerCase().includes(search.toLowerCase()) || e.subtitle.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const handleClear = () => {
    if (store.sales.length === 0) return;
    setConfirmClear(true);
  };

  const doClear = () => {
    onUpdate(clearSales(store));
    setConfirmClear(false);
    showToast('Sales history cleared (recoverable for 7 days)');
  };

  const doDeleteEntry = () => {
    if (!confirmDelId) return;
    if (confirmDelId.type === 'sale') {
      onUpdate(deleteSale(store, confirmDelId.id));
    } else if (confirmDelId.type === 'expense') {
      onUpdate(deleteExpense(store, confirmDelId.id));
    }
    setConfirmDelId(null);
    showToast('Item deleted (recoverable for 7 days)');
  };

  const filters: { key: HistoryFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'sales', label: 'Sales', icon: '💰' },
    { key: 'restocks', label: 'Restocks', icon: '📦' },
    { key: 'expenses', label: 'Expenses', icon: '🧾' },
  ];

  return (
    <div className="animate-fade-in space-y-3">
      {/* Search + actions */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search history..."
          className="flex-1 min-w-[160px] p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
        <button
          onClick={() => setShowTrash(true)}
          className="relative px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm font-display font-semibold text-muted-foreground hover:text-foreground"
          title="Recently deleted"
        >
          🗑
          {trashCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {trashCount}
            </span>
          )}
        </button>
        <button
          onClick={() => exportHistoryPDF(store)}
          className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold text-muted-foreground hover:text-foreground"
          title="Export PDF"
        >
          📄 PDF
        </button>
        <button
          onClick={() => exportHistoryCSV(store)}
          className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold text-muted-foreground hover:text-foreground"
          title="Export CSV"
        >
          📊 CSV
        </button>
        {store.sales.length > 0 && (
          <button onClick={handleClear} className="px-3 py-2.5 rounded-lg bg-destructive/10 text-destructive text-xs font-display font-semibold hover:bg-destructive/20 border border-destructive/20">
            Clear Sales
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-display font-semibold border transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <span>{f.icon}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-2">
        {filtered.map(entry => (
          <div
            key={`${entry.type}-${entry.id}`}
            className="p-3 rounded-xl bg-card shadow-card border border-border flex items-center gap-3 hover:border-primary/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-lg shrink-0">
              {entry.icon}
            </div>
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => {
                if (entry.type === 'sale') setViewReceipt(entry.raw as Sale);
              }}
            >
              <p className="font-display font-semibold text-sm text-foreground truncate">{entry.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">{entry.subtitle}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(entry.date).toLocaleString()}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-display font-bold text-sm ${entry.amountColor}`}>
                {entry.amount >= 0 ? '+' : '−'}₦{Math.abs(entry.amount).toLocaleString()}
              </p>
            </div>
            {(entry.type === 'sale' || entry.type === 'expense') && (
              <button
                onClick={() => setConfirmDelId(entry)}
                title="Delete"
                className="w-7 h-7 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs flex items-center justify-center border border-destructive/20 shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {entries.length === 0 ? 'No history yet' : 'No matching items'}
          </p>
        )}
      </div>

      {viewReceipt && (
        <SaleReceipt store={store} sale={viewReceipt} onClose={() => setViewReceipt(null)} />
      )}

      {confirmClear && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title="Clear all sales history?"
          message={`This will move all ${store.sales.length} sale record${store.sales.length === 1 ? '' : 's'} to the trash (recoverable for 7 days).`}
          confirmLabel="Clear History"
          onConfirm={doClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {confirmDelId && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title={`Delete this ${confirmDelId.type}?`}
          message={`${confirmDelId.title} — ₦${Math.abs(confirmDelId.amount).toLocaleString()}. It will be recoverable for 7 days.`}
          confirmLabel="Delete"
          onConfirm={doDeleteEntry}
          onCancel={() => setConfirmDelId(null)}
        />
      )}

      {showTrash && (
        <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />
      )}
    </div>
  );
}
