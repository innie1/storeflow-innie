import { useState } from 'react';
import { StoreData, Sale } from '@/types/store';
import { clearSales, deleteSale, getTrash } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import SaleReceipt from '@/components/SaleReceipt';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import RecentlyDeleted from '@/components/RecentlyDeleted';

interface SalesHistoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function SalesHistory({ store, onUpdate }: SalesHistoryProps) {
  const [search, setSearch] = useState('');
  const [viewReceipt, setViewReceipt] = useState<Sale | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelSale, setConfirmDelSale] = useState<Sale | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  const filtered = search
    ? store.sales.filter(s => s.productName.toLowerCase().includes(search.toLowerCase()))
    : store.sales;

  const trashCount = getTrash(store).length;

  const handleClear = () => {
    if (store.sales.length === 0) return;
    setConfirmClear(true);
  };

  const doClear = () => {
    onUpdate(clearSales(store));
    setConfirmClear(false);
    showToast('Sales history cleared (recoverable for 7 days)');
  };

  const doDeleteSale = () => {
    if (!confirmDelSale) return;
    onUpdate(deleteSale(store, confirmDelSale.id));
    setConfirmDelSale(null);
    showToast('Sale deleted (recoverable for 7 days)');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sales..."
          className="flex-1 min-w-[180px] p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
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
        {store.sales.length > 0 && (
          <button onClick={handleClear} className="px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm font-display font-semibold hover:bg-destructive/20 border border-destructive/20">
            Clear All
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map(s => (
          <div
            key={s.id}
            className="p-3 rounded-lg bg-card border border-border flex flex-wrap items-center gap-3 hover:border-primary/30 transition-colors"
          >
            <div
              className="flex-1 min-w-[140px] cursor-pointer"
              onClick={() => setViewReceipt(s)}
            >
              <p className="font-display font-semibold text-sm">{s.productName}</p>
              <p className="text-xs text-muted-foreground">{new Date(s.date).toLocaleString()}</p>
            </div>
            <div className="text-right text-xs space-y-0.5 cursor-pointer" onClick={() => setViewReceipt(s)}>
              <p>Qty: <span className="text-foreground">{s.quantity}</span></p>
              <p>Total: <span className="text-primary">₦{s.total.toLocaleString()}</span></p>
            </div>
            <div className="text-success text-sm font-bold cursor-pointer" onClick={() => setViewReceipt(s)}>
              +₦{s.profit.toLocaleString()}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewReceipt(s)}
                title="View receipt"
                className="w-8 h-8 rounded-lg bg-surface-2 hover:bg-surface-3 text-sm flex items-center justify-center"
              >
                🧾
              </button>
              <button
                onClick={() => setConfirmDelSale(s)}
                title="Delete sale"
                className="w-8 h-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm flex items-center justify-center border border-destructive/20"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {store.sales.length === 0 ? 'No sales recorded yet' : 'No matching sales'}
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
          message={`This will move all ${store.sales.length} sale record${store.sales.length === 1 ? '' : 's'} to the trash (recoverable for 7 days). Enter your store access code to confirm.`}
          confirmLabel="Clear History"
          onConfirm={doClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {confirmDelSale && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title="Delete this sale?"
          message={`${confirmDelSale.productName} • ₦${confirmDelSale.total.toLocaleString()}. The sale will be moved to trash and recoverable for 7 days. Enter your store access code to confirm.`}
          confirmLabel="Delete Sale"
          onConfirm={doDeleteSale}
          onCancel={() => setConfirmDelSale(null)}
        />
      )}

      {showTrash && (
        <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />
      )}
    </div>
  );
}
