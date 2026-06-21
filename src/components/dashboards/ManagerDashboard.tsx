import { useState, useMemo } from 'react';
import { StoreData } from '@/types/store';
import { getDashboardStats } from '@/lib/store-data';
import { Shield, Package, TrendingUp, AlertTriangle, ClipboardList } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface ManagerDashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

export default function ManagerDashboard({ store, onNavigate }: ManagerDashboardProps) {
  const stats = getDashboardStats(store);

  // Filter today's sales
  const todaySales = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime();
    return (store.sales || []).filter(s => new Date(s.date).getTime() >= start);
  }, [store.sales]);

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const lowStockCount = stats.lowStockProducts.length;

  return (
    <div className="animate-fade-in space-y-6 text-left">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/40 shadow-card">
        <Mascot size={48} mood="happy" store={store} />
        <div>
          <h2 className="font-display font-bold text-lg text-foreground">Manager Operations Hub</h2>
          <p className="text-xs text-muted-foreground">Keep the store running smoothly. Monitor stock levels and review today's sales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today's Revenue */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider">Today's Revenue</p>
              <p className="font-display font-bold text-2xl text-yellow-500 mt-2">₦{todayRevenue.toLocaleString()}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-yellow-500/10 text-yellow-500">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 font-mono">
            {todaySales.length} transaction{todaySales.length === 1 ? '' : 's'} recorded today.
          </p>
        </div>

        {/* Stock Status */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider">Active Inventory</p>
              <p className="font-display font-bold text-2xl text-foreground mt-2">{stats.totalProducts} Products</p>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 font-mono">
            Total inventory valuation: <strong className="text-success">₦{stats.inventoryValue.toLocaleString()}</strong>
          </p>
        </div>

        {/* Low Stock Alert */}
        <div 
          onClick={() => onNavigate('inventory', true)} 
          className={`p-5 rounded-2xl bg-card border transition-all cursor-pointer ${
            lowStockCount > 0 ? 'border-warning/60 hover:bg-warning/5 bg-warning/5' : 'border-border/40 hover:bg-surface-2/40'
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider">Low Stock Warnings</p>
              <p className={`font-display font-bold text-2xl mt-2 ${lowStockCount > 0 ? 'text-warning' : 'text-foreground'}`}>
                {lowStockCount} Alert{lowStockCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className={`p-2.5 rounded-xl ${lowStockCount > 0 ? 'bg-warning/20 text-warning' : 'bg-surface-2 text-muted-foreground'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 font-mono">
            {lowStockCount > 0 ? 'Action required! Tap to restock items.' : 'All stock levels are optimal.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Sales List */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col h-96">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-primary" /> Today's Sales Activities
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-1">
            {todaySales.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <span className="text-2xl mb-1">🏪</span>
                <p className="text-xs text-muted-foreground">No sales recorded today yet.</p>
              </div>
            ) : (
              todaySales.map(s => (
                <div key={s.id} className="p-3 rounded-xl bg-surface-2/50 border border-border/30 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-foreground truncate max-w-[160px]">{s.productName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Qty: {s.quantity} · {new Date(s.date).toLocaleTimeString()}</p>
                  </div>
                  <span className="font-bold text-primary font-mono">₦{s.total.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Operations Quick Links */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card space-y-4">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-500" /> Operational Controls
          </h3>
          <p className="text-xs text-muted-foreground">Quick access routes to perform standard operations duties.</p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button 
              onClick={() => onNavigate('sales')} 
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-1.5"
            >
              <span className="text-lg">💰</span>
              <span>New Cash Sale</span>
            </button>
            <button 
              onClick={() => onNavigate('inventory')} 
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-1.5"
            >
              <span className="text-lg">📦</span>
              <span>Manage Stock</span>
            </button>
            <button 
              onClick={() => onNavigate('customers')} 
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-1.5"
            >
              <span className="text-lg">👥</span>
              <span>Customers List</span>
            </button>
            <button 
              onClick={() => onNavigate('suppliers')} 
              className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/60 transition-colors text-center text-xs font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-1.5"
            >
              <span className="text-lg">🏬</span>
              <span>Suppliers Portal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
