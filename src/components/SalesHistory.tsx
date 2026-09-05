import { useState, useMemo } from 'react';
import { startOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { StoreData, Sale, Expense, Restock } from '@/types/store';
import { clearSales, deleteSale, deleteExpense, getTrash } from '@/lib/store-data';
import { exportHistoryCSV, exportHistoryPDF } from '@/lib/export-data';
import { showToast } from '@/components/Toast';
import SaleReceipt from '@/components/SaleReceipt';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import { Search, Trash2, FileText, FileSpreadsheet, Wallet, Package, Receipt, ListFilter, X, ChevronDown } from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';

interface SalesHistoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

type HistoryFilter = 'all' | 'sales' | 'restocks' | 'expenses';
type DateRange = 'today' | 'yesterday' | '7days' | 'month' | 'all';

interface HistoryEntry {
  id: string;
  type: 'sale' | 'restock' | 'expense';
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  amountColor: string;
  icon: React.ReactNode;
  raw: Sale | Sale[] | Restock | Expense;
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7days': 'Last 7 Days',
  month: 'This Month',
  all: 'All Time',
};
const DATE_RANGE_OPTIONS: DateRange[] = ['today', 'yesterday', '7days', 'month', 'all'];

function dateRangeWindow(range: DateRange): { start: number | null; end: number | null } {
  const now = new Date();
  switch (range) {
    case 'today': return { start: startOfDay(now).getTime(), end: null };
    case 'yesterday': return { start: startOfDay(subDays(now, 1)).getTime(), end: startOfDay(now).getTime() };
    case '7days': return { start: startOfDay(subDays(now, 6)).getTime(), end: null };
    case 'month': return { start: startOfMonth(now).getTime(), end: null };
    case 'all': return { start: null, end: null };
  }
}

export default function SalesHistory({ store, onUpdate }: SalesHistoryProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<Sale | Sale[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<HistoryEntry | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [viewBatch, setViewBatch] = useState<Restock[] | null>(null);

  const restockStats = useMemo(() => {
    if (!viewBatch) return {};
    const stats: Record<string, { day: number; dayCost: number; week: number; weekCost: number; month: number; monthCost: number }> = {};
    
    viewBatch.forEach(item => {
      const pId = item.productId;
      const rDate = new Date(item.date);
      
      const dayStart = new Date(rDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(rDate); dayEnd.setHours(23, 59, 59, 999);
      
      const dayOfWeek = rDate.getDay();
      const weekStart = new Date(rDate); weekStart.setDate(rDate.getDate() - dayOfWeek); weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
      
      const monthStart = new Date(rDate.getFullYear(), rDate.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(rDate.getFullYear(), rDate.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const allRestocks = (store.restocks || []).filter(x => x.productId === pId);
      
      let daySum = 0; let dayCost = 0;
      let weekSum = 0; let weekCost = 0;
      let monthSum = 0; let monthCost = 0;
      
      allRestocks.forEach(x => {
        const xDate = new Date(x.date);
        const qty = x.quantity;
        const cost = x.total;
        
        if (xDate >= dayStart && xDate <= dayEnd) {
          daySum += qty;
          dayCost += cost;
        }
        if (xDate >= weekStart && xDate <= weekEnd) {
          weekSum += qty;
          weekCost += cost;
        }
        if (xDate >= monthStart && xDate <= monthEnd) {
          monthSum += qty;
          monthCost += cost;
        }
      });
      
      stats[pId] = {
        day: daySum,
        dayCost,
        week: weekSum,
        weekCost,
        month: monthSum,
        monthCost
      };
    });
    
    return stats;
  }, [viewBatch, store.restocks]);

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
        const isOnlineOrder = firstSale.channel === 'online_order';
        items.push({
          id: txId,
          type: 'sale',
          date: firstSale.date,
          title: group.length === 1
            ? firstSale.productName
            : `${isOnlineOrder ? 'Online Order' : 'Sale'} — ${group.length} items`,
          subtitle: group.length === 1 
            ? `${firstSale.quantity} × ₦${firstSale.unitPrice.toLocaleString()}` 
            : `${totalQty} items${isOnlineOrder ? ' · Online Order' : ''}`,
          amount: total,
          amountColor: 'text-primary',
          icon: isOnlineOrder ? <Package className="w-4 h-4" /> : <Wallet className="w-4 h-4" />,
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
          icon: <Wallet className="w-4 h-4" />,
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
        const fundingLabel = funding === 'new_money' ? 'new money' : funding === 'balance' ? 'from balance' : '';
        items.push({
          id: batchId,
          type: 'restock',
          date: batch[0].date,
          title: batch.length === 1 ? batch[0].productName : `Restock — ${batch.length} items`,
          subtitle: `${totalQty} units${fundingLabel ? ' • ' + fundingLabel : ''}`,
          amount: -total,
          amountColor: 'text-warning',
          icon: <Package className="w-4 h-4" />,
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
          icon: <Package className="w-4 h-4" />,
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
          icon: <Receipt className="w-4 h-4" />,
          raw: e,
        });
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [store, filter]);

  const inDateRange = (dateStr: string) => {
    const { start, end } = dateRangeWindow(dateRange);
    const t = new Date(dateStr).getTime();
    return (start === null || t >= start) && (end === null || t < end);
  };

  const periodEntries = useMemo(() => entries.filter(e => inDateRange(e.date)), [entries, dateRange]);

  const periodSummary = useMemo(() => {
    const income = periodEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const outgoing = periodEntries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    return { income, outgoing, net: income + outgoing };
  }, [periodEntries]);

  const referenceStats = useMemo(() => {
    const now = new Date();
    const sumInRange = (start: number | null, end: number | null) => entries
      .filter(e => {
        const t = new Date(e.date).getTime();
        return (start === null || t >= start) && (end === null || t < end);
      })
      .reduce((s, e) => s + e.amount, 0);
    return {
      today: sumInRange(startOfDay(now).getTime(), null),
      yesterday: sumInRange(startOfDay(subDays(now, 1)).getTime(), startOfDay(now).getTime()),
      week: sumInRange(startOfWeek(now).getTime(), null),
      month: sumInRange(startOfMonth(now).getTime(), null),
    };
  }, [entries]);

  const filtered = search
    ? periodEntries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.subtitle.toLowerCase().includes(search.toLowerCase()) ||
        e.id.toLowerCase().includes(search.toLowerCase())
      )
    : periodEntries;

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

  const filters: { key: HistoryFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All', icon: <ListFilter className="w-3.5 h-3.5" /> },
    { key: 'sales', label: 'Sales', icon: <Wallet className="w-3.5 h-3.5" /> },
    { key: 'restocks', label: 'Restocks', icon: <Package className="w-3.5 h-3.5" /> },
    { key: 'expenses', label: 'Expenses', icon: <Receipt className="w-3.5 h-3.5" /> },
  ];

  const channelSplit = useMemo(() => {
    let onlineRevenue = 0;
    let inStoreRevenue = 0;
    let unlabeled = 0;
    store.sales.forEach(s => {
      if (s.channel === 'online_order') onlineRevenue += s.total;
      else if (s.channel === 'in_store') inStoreRevenue += s.total;
      else unlabeled += s.total;
    });
    const total = onlineRevenue + inStoreRevenue + unlabeled;
    return {
      onlineRevenue, inStoreRevenue, unlabeled, total,
      onlinePct: total > 0 ? Math.round((onlineRevenue / total) * 100) : 0,
      inStorePct: total > 0 ? Math.round((inStoreRevenue / total) * 100) : 0,
    };
  }, [store.sales]);

  return (
    <div className="animate-fade-in space-y-2">
      {channelSplit.total > 0 && (channelSplit.onlineRevenue > 0 || channelSplit.inStoreRevenue > 0) && (
        <div className="p-3.5 rounded-xl bg-card border border-border">
          <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Where Your Sales Come From</p>
          <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden flex">
            <div className="h-full bg-primary" style={{ width: `${channelSplit.inStorePct}%` }} />
            <div className="h-full bg-success" style={{ width: `${channelSplit.onlinePct}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> In-Store {channelSplit.inStorePct}% (₦{channelSplit.inStoreRevenue.toLocaleString()})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> Online {channelSplit.onlinePct}% (₦{channelSplit.onlineRevenue.toLocaleString()})</span>
          </div>
        </div>
      )}

      {/* Time frame + summary */}
      <div className="p-2.5 rounded-xl bg-card border border-border space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div className="relative">
            <span
              role="button"
              tabIndex={0}
              onClick={() => setDateMenuOpen(v => !v)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setDateMenuOpen(v => !v); }}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide font-display font-bold hover:text-foreground active:scale-95 transition cursor-pointer"
            >
              {DATE_RANGE_LABELS[dateRange]} <ChevronDown className={`w-3 h-3 transition-transform ${dateMenuOpen ? 'rotate-180' : ''}`} />
            </span>
            {dateMenuOpen && (
              <><ScrollLock />
                <span role="presentation" className="fixed inset-0 z-10" onClick={() => setDateMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[150px]">
                  {DATE_RANGE_OPTIONS.map(r => (
                    <span
                      key={r}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setDateRange(r); setDateMenuOpen(false); }}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setDateRange(r); setDateMenuOpen(false); } }}
                      className={`block w-full text-left px-3 py-2 text-xs font-display font-semibold cursor-pointer ${r === dateRange ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-surface-2'}`}
                    >
                      {DATE_RANGE_LABELS[r]}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <p className={`font-display font-black text-lg leading-none ${periodSummary.net >= 0 ? 'text-success' : 'text-destructive'}`}>
            {periodSummary.net >= 0 ? '+' : '−'}₦{Math.abs(periodSummary.net).toLocaleString()}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="px-2 py-1.5 rounded-lg bg-success/10 border border-success/20 min-w-0 flex items-center justify-between gap-1">
            <p className="text-[9px] text-muted-foreground uppercase">In</p>
            <p className="font-display font-bold text-xs text-success truncate">+₦{periodSummary.income.toLocaleString()}</p>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 min-w-0 flex items-center justify-between gap-1">
            <p className="text-[9px] text-muted-foreground uppercase">Out</p>
            <p className="font-display font-bold text-xs text-destructive truncate">−₦{Math.abs(periodSummary.outgoing).toLocaleString()}</p>
          </div>
        </div>

        <div className="pt-1.5 border-t border-border/60 grid grid-cols-4 gap-1 text-center">
          {[
            { label: 'Today', value: referenceStats.today },
            { label: 'Yesterday', value: referenceStats.yesterday },
            { label: 'This Week', value: referenceStats.week },
            { label: 'This Month', value: referenceStats.month },
          ].map(r => (
            <div key={r.label} className="min-w-0">
              <p className="text-[8px] text-muted-foreground uppercase truncate">{r.label}</p>
              <p className={`text-[10px] font-display font-bold truncate ${r.value >= 0 ? 'text-success' : 'text-destructive'}`}>
                {r.value >= 0 ? '+' : '−'}₦{Math.abs(r.value).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Search + actions */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product, category or receipt ID..."
            className="w-full p-2.5 pl-9 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
        </div>
        <button
          onClick={() => setShowTrash(true)}
          className="relative px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm font-display font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          title="Recently deleted"
        >
          <Trash2 className="w-4 h-4" />
          {trashCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {trashCount}
            </span>
          )}
        </button>
        <button
          onClick={() => exportHistoryPDF(store)}
          className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          title="Export PDF"
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={() => exportHistoryCSV(store)}
          className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          title="Export CSV"
        >
          <FileSpreadsheet className="w-4 h-4" />
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
            <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-muted-foreground shrink-0">
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
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground truncate">{entry.subtitle}</span>
                {entry.type === 'sale' && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-semibold">
                    #{entry.id.substring(0, 8).toUpperCase()}
                  </span>
                )}
              </div>
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
                className="w-7 h-7 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center border border-destructive/20 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
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
        ><ScrollLock />
          <div
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-foreground flex items-center gap-1.5"><Package className="w-4 h-4" /> Restock details</h3>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(viewBatch[0].date).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setViewBatch(null)}
                className="w-8 h-8 rounded-lg bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-border">
                <span className="text-xs text-muted-foreground font-display">Funded by</span>
                <span className="text-xs font-display font-semibold text-foreground">
                  {viewBatch[0].funding === 'new_money'
                    ? 'New money invested'
                    : viewBatch[0].funding === 'balance'
                    ? 'From balance'
                    : '—'}
                </span>
              </div>
              {viewBatch.map(r => (
                <div key={r.id} className="p-3 rounded-lg bg-surface-2 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-display font-semibold text-sm text-foreground">{r.productName}</p>
                    <p className="font-display font-bold text-sm text-warning">
                      −₦{r.total.toLocaleString()}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {r.quantity} units × ₦{r.costPrice.toLocaleString()}
                  </p>
                  {restockStats[r.productId] && (
                    <div className="pt-2 border-t border-border/40 mt-1.5 grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground text-left">
                      <div className="p-1.5 rounded bg-black/10 border border-border/20">
                        <p className="font-semibold text-foreground">Same Day</p>
                        <p className="text-yellow-500 font-bold mt-0.5">{restockStats[r.productId].day} units</p>
                        <p className="text-[8px] mt-0.5">Total: ₦{restockStats[r.productId].dayCost.toLocaleString()}</p>
                      </div>
                      <div className="p-1.5 rounded bg-black/10 border border-border/20">
                        <p className="font-semibold text-foreground">Same Week</p>
                        <p className="text-yellow-500 font-bold mt-0.5">{restockStats[r.productId].week} units</p>
                        <p className="text-[8px] mt-0.5">Total: ₦{restockStats[r.productId].weekCost.toLocaleString()}</p>
                      </div>
                      <div className="p-1.5 rounded bg-black/10 border border-border/20">
                        <p className="font-semibold text-foreground">Same Month</p>
                        <p className="text-yellow-500 font-bold mt-0.5">{restockStats[r.productId].month} units</p>
                        <p className="text-[8px] mt-0.5">Total: ₦{restockStats[r.productId].monthCost.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
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
