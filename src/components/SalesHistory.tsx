import { useState } from 'react';
import { StoreData } from '@/types/store';
import { clearSales } from '@/lib/store-data';
import { showToast } from '@/components/Toast';

interface SalesHistoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function SalesHistory({ store, onUpdate }: SalesHistoryProps) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? store.sales.filter(s => s.productName.toLowerCase().includes(search.toLowerCase()))
    : store.sales;

  const handleClear = () => {
    if (!confirm('Clear all sales history? This cannot be undone.')) return;
    onUpdate(clearSales(store));
    showToast('Sales history cleared');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sales..."
          className="flex-1 min-w-[200px] p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
        {store.sales.length > 0 && (
          <button onClick={handleClear} className="px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm font-display font-semibold hover:bg-destructive/20 border border-destructive/20">
            Clear All
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map(s => (
          <div key={s.id} className="p-3 rounded-lg bg-card border border-border flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[150px]">
              <p className="font-display font-semibold text-sm">{s.productName}</p>
              <p className="text-xs text-muted-foreground">{new Date(s.date).toLocaleString()}</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p>Qty: <span className="text-foreground">{s.quantity}</span></p>
              <p>Total: <span className="text-primary">₦{s.total.toLocaleString()}</span></p>
            </div>
            <div className="text-success text-sm font-bold">
              +₦{s.profit.toLocaleString()}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {store.sales.length === 0 ? 'No sales recorded yet' : 'No matching sales'}
          </p>
        )}
      </div>
    </div>
  );
}
