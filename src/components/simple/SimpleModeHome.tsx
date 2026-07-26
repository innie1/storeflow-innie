import { useMemo } from 'react';
import { StoreData } from '@/types/store';
import { recordSale, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import SimpleVoiceSell from './SimpleVoiceSell';
import { History } from 'lucide-react';

interface SimpleModeHomeProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
  currentUser?: any;
  onNavigate: (tab: any) => void;
}

export default function SimpleModeHome({ store, setStore, currentUser, onNavigate }: SimpleModeHomeProps) {
  const today = new Date().toISOString().split('T')[0];
  const todaySales = useMemo(() => store.sales.filter(s => s.date.startsWith(today)), [store.sales, today]);
  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayCount = todaySales.length;

  const handleConfirmSale = (productId: string, quantity: number) => {
    const product = store.products.find(p => p.id === productId);
    if (!product) return;
    if (product.quantity < quantity) {
      showToast('Not enough stock for that quantity', 'error');
      return;
    }
    const updated = recordSale(store, productId, quantity, currentUser?.name, currentUser?.role);
    saveStore(updated);
    setStore(updated);
  };

  return (
    <div className="flex flex-col items-center px-5 pt-8 pb-10 max-w-sm mx-auto">
      {/* Today's total */}
      <div className="w-full text-center mb-10">
        <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wide">Today's Sales</p>
        <h1 className="text-4xl font-display font-black text-foreground mt-1">₦{todayRevenue.toLocaleString()}</h1>
        <p className="text-xs text-muted-foreground mt-1">{todayCount} sale{todayCount === 1 ? '' : 's'} recorded</p>
      </div>

      {/* Big mic — the whole point of Simple Mode */}
      <SimpleVoiceSell products={store.products} onConfirmSale={handleConfirmSale} />

      {/* Light secondary action — history only, nothing else competes for attention here */}
      <button
        onClick={() => onNavigate('history')}
        className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground font-display font-semibold"
      >
        <History className="w-3.5 h-3.5" /> View Sales History
      </button>
    </div>
  );
}
