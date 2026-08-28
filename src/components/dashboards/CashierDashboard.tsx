import { useMemo } from 'react';
import { StoreData } from '@/types/store';
import { ShoppingCart, Search, Receipt, Coins, ShieldAlert } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface CashierDashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

export default function CashierDashboard({ store, onNavigate }: CashierDashboardProps) {
  // Find active cashier shift if any
  const activeShift = useMemo(() => {
    return (store.shifts || []).find(sh => !sh.endTime);
  }, [store.shifts]);

  return (
    <div className="animate-fade-in space-y-6 text-left">
      {/* Welcome Banner */}
      <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-card border border-border/40 shadow-card">
        <Mascot size={48} mood={activeShift ? 'confident' : 'resting'} store={store} />
        <div>
          <h2 className="font-display font-bold text-lg text-foreground">
            {activeShift ? `Cashier: ${activeShift.staffName}` : 'No Active Shift'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {activeShift
              ? `Shift started at ${new Date(activeShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Please start a shift under Staff Accounts to record transactions.'}
          </p>
        </div>
      </div>

      {/* Grid of Large Touch Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* New Sale Button */}
        <button
          onClick={() => onNavigate('sales')}
          className="p-6 rounded-2xl bg-primary hover:bg-primary/95 text-primary-foreground text-left transition-all active:scale-[0.98] cursor-pointer shadow-lg flex flex-col justify-between h-40"
        >
          <div className="p-3 rounded-xl bg-white/10 w-fit">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg leading-tight">New Sale Checkout</h3>
            <p className="text-xs text-primary-foreground/80 mt-1">Open cash register, scan barcodes, and process payment.</p>
          </div>
        </button>

        {/* Product Search */}
        <button
          onClick={() => onNavigate('inventory')}
          className="p-6 rounded-2xl bg-card hover:bg-surface-2 border border-border/60 text-left transition-all active:scale-[0.98] cursor-pointer shadow-card flex flex-col justify-between h-40"
        >
          <div className="p-3 rounded-xl bg-surface-2 w-fit border border-border/60 text-foreground">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-foreground leading-tight">Search Inventory</h3>
            <p className="text-xs text-muted-foreground mt-1">Check stock levels, categories, and item prices instantly.</p>
          </div>
        </button>

        {/* Print Receipt / History */}
        <button
          onClick={() => onNavigate('history')}
          className="p-6 rounded-2xl bg-card hover:bg-surface-2 border border-border/60 text-left transition-all active:scale-[0.98] cursor-pointer shadow-card flex flex-col justify-between h-40"
        >
          <div className="p-3 rounded-xl bg-surface-2 w-fit border border-border/60 text-foreground">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-foreground leading-tight">Printed Receipts</h3>
            <p className="text-xs text-muted-foreground mt-1">Review past orders, issue duplicates, and view customer sales history.</p>
          </div>
        </button>

        {/* Cash Drawer */}
        <button
          onClick={() => onNavigate('cash-drawer')}
          className="p-6 rounded-2xl bg-card hover:bg-surface-2 border border-border/60 text-left transition-all active:scale-[0.98] cursor-pointer shadow-card flex flex-col justify-between h-40"
        >
          <div className="p-3 rounded-xl bg-surface-2 w-fit border border-border/60 text-foreground">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-foreground leading-tight">Cash Drawer Tally</h3>
            <p className="text-xs text-muted-foreground mt-1">Record drawer drop tallies, check opening balance float, and review cash session logs.</p>
          </div>
        </button>
      </div>

      {/* Active Shift Tally summary */}
      {activeShift && (
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">Your Current Shift Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-surface-2">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Shift Float</p>
              <p className="font-display font-bold text-lg mt-1 text-foreground">₦{activeShift.openingCash.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-2">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Shift Transactions</p>
              <p className="font-display font-bold text-lg mt-1 text-primary">{activeShift.salesMade || 0} sales</p>
            </div>
          </div>
        </div>
      )}

      {/* Security notice */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border/40 flex gap-3 text-xs text-muted-foreground items-center">
        <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0" />
        <p>Your current job permissions restrict access to administrative functions, financial reports, profit statistics, and backups.</p>
      </div>
    </div>
  );
}
