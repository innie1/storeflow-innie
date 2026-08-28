import { useMemo } from 'react';
import { StoreData } from '@/types/store';
import { getDashboardStats } from '@/lib/store-data';
import { Package, AlertTriangle, UserPlus, Compass, ArrowDownToLine, RefreshCw } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface InventoryDashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

export default function InventoryDashboard({ store, onNavigate }: InventoryDashboardProps) {
  const stats = getDashboardStats(store);

  // Count products added today
  const productsAddedToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (store.products || []).filter(p => {
      if (!p.addedAt) return false;
      return new Date(p.addedAt).toDateString() === todayStr;
    }).length;
  }, [store.products]);

  // Count total restock events
  const restocksCount = (store.restocks || []).length;

  return (
    <div className="animate-fade-in space-y-6 text-left">
      {/* Mascot Header */}
      <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-card border border-border/40 shadow-card">
        <Mascot size={48} mood={stats.lowStockProducts.length > 0 ? 'concerned' : 'happy'} store={store} />
        <div>
          <h2 className="font-display font-bold text-lg text-foreground">Inventory Manager Desk</h2>
          <p className="text-xs text-muted-foreground">Monitor stock health, log inbound shipments, and verify catalog records.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Products */}
        <div className="p-4 rounded-xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start text-foreground">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Catalog Size</span>
            <Package className="w-4 h-4 text-primary" />
          </div>
          <p className="font-display font-bold text-2xl mt-2">{stats.totalProducts}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Total items registered</p>
        </div>

        {/* Added Today */}
        <div className="p-4 rounded-xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start text-foreground">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Added Today</span>
            <UserPlus className="w-4 h-4 text-success" />
          </div>
          <p className="font-display font-bold text-2xl mt-2">+{productsAddedToday}</p>
          <p className="text-[10px] text-muted-foreground mt-1">New SKUs logged today</p>
        </div>

        {/* Low Stock Alerts */}
        <button
          onClick={() => onNavigate('inventory', true)}
          className={`p-4 rounded-xl bg-card border text-left transition-all cursor-pointer shadow-card ${
            stats.lowStockProducts.length > 0 ? 'border-warning/60 bg-warning/5' : 'border-border/40 hover:bg-surface-2/40'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Low Stock Alerts</span>
            <AlertTriangle className={`w-4 h-4 ${stats.lowStockProducts.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          </div>
          <p className={`font-display font-bold text-2xl mt-2 ${stats.lowStockProducts.length > 0 ? 'text-warning' : 'text-foreground'}`}>
            {stats.lowStockProducts.length}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Tap to review warnings</p>
        </button>

        {/* Total Restocks */}
        <div className="p-4 rounded-xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start text-foreground">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Inbound Restocks</span>
            <RefreshCw className="w-4 h-4 text-cyan-500" />
          </div>
          <p className="font-display font-bold text-2xl mt-2">{restocksCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Total batches received</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Watchlist */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col h-80">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning" /> Low Stock Watchlist
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-1">
            {stats.lowStockProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <span className="text-2xl mb-1">✅</span>
                <p className="text-xs text-muted-foreground">All items have healthy stock levels.</p>
              </div>
            ) : (
              stats.lowStockProducts.map(p => (
                <div key={p.id} className="p-3 rounded-xl bg-surface-2/50 border border-border/30 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-foreground truncate max-w-[180px]">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Category: {p.category}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-bold font-mono">
                      {p.quantity} left
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Inventory Controls */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card space-y-4">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary" /> Inventory Quick Routes
          </h3>
          <p className="text-xs text-muted-foreground">Quick shortcut keys to execute catalog management workflows.</p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => onNavigate('inventory')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <ArrowDownToLine className="w-5 h-5 text-primary" />
              <span>Catalog & Restock</span>
            </button>
            <button
              onClick={() => onNavigate('suppliers')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <Compass className="w-5 h-5 text-success" />
              <span>Suppliers Portal</span>
            </button>
            <button
              onClick={() => onNavigate('marketplace')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <span className="text-lg">🛒</span>
              <span>Flow Marketplace</span>
            </button>
            <button
              onClick={() => onNavigate('wishlist')}
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-2"
            >
              <span className="text-lg">🌟</span>
              <span>Stock Wishlist</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
