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
  raw: Sale | Sale[] | Restock | Expense;
}

export default function SalesHistory({ store, onUpdate }: SalesHistoryProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [viewReceipt, setViewReceipt] = useState<Sale | Sale[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<HistoryEntry | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [viewBatch, setViewBatch] = useState<Restock[] | null>(null);

  const trashCount = getTrash(store).length;

  const entries = useMemo<HistoryEntry[]>(() => {
    const items: HistoryEntry[] = [];

    if (filter === 'all' || filter === 'sales') {
      const groupedSales = new Map<string, Sale[]>();
      const singleSales: Sale[] = [];
      store.sales.forEach(s => {
        if (s.transactionId) {
          const arr = groupedSales.get(s.transactionId) || [];
          arr.push(s);
          groupedSales.set(s.transactionId, arr);
        } else {
          singleSales.push(s);
        }
      });

      groupedSales.forEach((group, txId) => {
        const total = group.reduce((sum, s) => sum + s.total, 0);
        const totalQty = group.reduce((sum, s) => sum + s.quantity, 0);
        const firstSale = group[0];
        items.push({
          id: txId,
          type: 'sale',
          date: firstSale.date,
          title: group.length === 1 ? firstSale.productName : `Sale — ${group.length} items`,
          subtitle: group.length === 1 
            ? `${firstSale.quantity} × ₦${firstSale.unitPrice.toLocaleString()}` 
            : `${totalQty} items`,
          amount: total,
          amountColor: 'text-primary',
          icon: '💰',
          raw: group,
        });
      });

      singleSales.forEach(s => {
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
      const restocks = store.restocks || [];
      const grouped = new Map<string, Restock[]>();
      const singles: Restock[] = [];
      restocks.forEach(r => {
        if (r.batchId) {
          const arr = grouped.get(r.batchId) || [];
          arr.push(r);
          grouped.set(r.batchId, arr);
        } else {
          singles.push(r);
        }
      });
      grouped.forEach((batch, batchId) => {
        const total = batch.reduce((s, r) => s + r.total, 0);
        const totalQty = batch.reduce((s, r) => s + r.quantity, 0);
        const funding = batch[0].funding;
        const fundingLabel = funding === 'new_money' ? '💵 new money' : funding === 'balance' ? '🏦 from balance' : '';
        items.push({
          id: batchId,
          type: 'restock',
          date: batch[0].date,
          title: batch.length === 1 ? batch[0].productName : `Restock — ${batch.length} items`,
          subtitle: `${totalQty} units${fundingLabel ? ' • ' + fundingLabel : ''}`,
          amount: -total,
          amountColor: 'text-warning',
          icon: '📦',
          raw: batch[0],
        });
      });
      singles.forEach(r => {
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
                if (entry.type === 'sale') setViewReceipt(entry.raw as Sale | Sale[]);
                else if (entry.type === 'restock') {
                  const r = entry.raw as Restock;
                  const batch = r.batchId
                    ? (store.restocks || []).filter(x => x.batchId === r.batchId)
                    : [r];
                  setViewBatch(batch);
                }
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

      {viewBatch && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3 animate-fade-in"
          onClick={() => setViewBatch(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-foreground">📦 Restock details</h3>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(viewBatch[0].date).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setViewBatch(null)}
                className="w-8 h-8 rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-border">
                <span className="text-xs text-muted-foreground font-display">Funded by</span>
                <span className="text-xs font-display font-semibold text-foreground">
                  {viewBatch[0].funding === 'new_money'
                    ? '💵 New money invested'
                    : viewBatch[0].funding === 'balance'
                    ? '🏦 From balance'
                    : '—'}
                </span>
              </div>
              {viewBatch.map(r => (
                <div key={r.id} className="p-3 rounded-lg bg-surface-2 border border-border">
                  <div className="flex items-center justify-between">
                    <p className="font-display font-semibold text-sm text-foreground">{r.productName}</p>
                    <p className="font-display font-bold text-sm text-warning">
                      −₦{r.total.toLocaleString()}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {r.quantity} units × ₦{r.costPrice.toLocaleString()}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-display font-semibold text-sm text-foreground">Total</span>
                <span className="font-display font-bold text-base text-warning">
                  −₦{viewBatch.reduce((s, r) => s + r.total, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
