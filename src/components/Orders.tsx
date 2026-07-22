import { useState, useMemo, useCallback } from 'react';
import { StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';
import { saveStore } from '@/lib/store-data';

interface OrdersProps {
  store: StoreData;
  orders: any[];
  onUpdateOrderStatus: (orderId: string, status: string, metadata?: any) => void;
  onUpdate: (store: StoreData) => void;
}

// Converts a locally-formatted number (e.g. "0803 123 4567") into the
// digits-only, country-code-prefixed format wa.me requires. Assumes
// Nigerian numbers (the app's currency is ₦ throughout) when a number
// starts with a local trunk '0' — swaps it for '234'. Numbers that already
// include a country code (with or without a leading '+') pass through as-is.
function sanitizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  return digits;
}

function buildOrderWhatsAppMessage(order: any, store: StoreData, status: string): string {
  const items = (order.order_items || []).map((item: any) => {
    const pName = store.products?.find((p: any) => p.id === item.product_id)?.name || 'Item';
    return `• ${pName} x${Number(item.quantity)} — ₦${Number(item.subtotal || item.price * item.quantity || 0).toLocaleString()}`;
  }).join('\n');
  const total = `₦${Number(order.total || 0).toLocaleString()}`;
  const orderRef = order.order_number ? `Order #${order.order_number}` : 'Your order';
  const name = order.customer_name ? `Hi ${order.customer_name}, ` : 'Hi, ';

  let statusLine = '';
  if (status === 'Ready') statusLine = `your order from ${store.storeName} is ready for pickup! 🎉`;
  else if (status === 'Completed') statusLine = `your order from ${store.storeName} has been completed. ✅ Thank you for your patronage!`;
  else if (status === 'Preparing') statusLine = `your order from ${store.storeName} is being prepared. 👨‍🍳`;
  else if (status === 'Accepted') statusLine = `your order from ${store.storeName} has been accepted and is being processed. 👍`;
  else if (status === 'Cancelled' || status === 'Rejected') statusLine = `your order from ${store.storeName} was ${status.toLowerCase()}. We're sorry for the inconvenience.`;
  else statusLine = `here's an update on your order from ${store.storeName}.`;

  return `${name}${statusLine}\n\n${orderRef}\n${items}\n\nTotal: ${total}`;
}

function openOrderWhatsApp(order: any, store: StoreData, status: string) {
  if (!order.customer_phone) return;
  const phone = sanitizePhoneForWhatsApp(order.customer_phone);
  const message = buildOrderWhatsAppMessage(order, store, status);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

export default function Orders({ store, orders, onUpdateOrderStatus, onUpdate }: OrdersProps) {
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Accepted' | 'Preparing' | 'Ready' | 'Completed' | 'Rejected' | 'Cancelled'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Date & Time Filter states
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Prompt states for Reject
  const [promptType, setPromptType] = useState<'reject' | null>(null);
  const [promptOrderId, setPromptOrderId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');

  // Status Colors and display text matching normalized values
  const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    'Pending': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20' },
    'Accepted': { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' },
    'Preparing': { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
    'Ready': { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20' },
    'Completed': { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20' },
    'Cancelled': { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/20' },
    'Rejected': { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20' }
  };

  // Helper to normalize casing of order status strings
  const getNormalizedStatus = useCallback((status?: string): string => {
    if (!status) return 'Pending';
    const s = status.trim().toLowerCase();
    if (s === 'pending' || s === 'pending approval') return 'Pending';
    if (s === 'accepted') return 'Accepted';
    if (s === 'preparing') return 'Preparing';
    if (s === 'ready' || s === 'ready for pickup' || s === 'ready for delivery') return 'Ready';
    if (s === 'completed') return 'Completed';
    if (s === 'rejected') return 'Rejected';
    if (s === 'cancelled') return 'Cancelled';
    return status;
  }, []);

  // Today's orders count for daily order limit calculations
  const todayOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter(o => new Date(o.created_at).getTime() >= today.getTime());
  }, [orders]);

  const maxDailyOrders = store.marketplaceSettings?.maxDailyOrders || null;
  const isLimitReached = maxDailyOrders && todayOrders.length >= maxDailyOrders;

  // Get order count for each tab using normalized statuses
  const counts = useMemo(() => {
    const res = { 
      All: orders.length, 
      Pending: 0, 
      Accepted: 0,
      Preparing: 0, 
      Ready: 0, 
      Completed: 0, 
      Rejected: 0,
      Cancelled: 0
    };
    orders.forEach(o => {
      const status = getNormalizedStatus(o.status) as keyof typeof res;
      if (res[status] !== undefined) {
        res[status]++;
      }
    });
    return res;
  }, [orders, getNormalizedStatus]);

  const hasActiveDateFilter = datePreset !== 'all' || startDate !== '' || endDate !== '' || startTime !== '' || endTime !== '';

  const resetDateFilter = () => {
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
  };

  // Filtering orders
  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart); yesterdayEnd.setMilliseconds(-1);

    return orders
      .filter(o => {
        const normStatus = getNormalizedStatus(o.status);
        const isFinished = normStatus === 'Completed' || normStatus === 'Cancelled' || normStatus === 'Rejected';
        const matchesSearch = 
          !searchQuery ||
          o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase());

        // On the "All" tab, finished orders (Completed/Cancelled/Rejected) stay
        // out of the default view so the active queue doesn't get cluttered.
        // They're still reachable via their own tab, and a search query always
        // overrides the hide so a finished order can still be found by number,
        // name, or phone even while on "All".
        const matchesTab = activeTab === 'All'
          ? (!isFinished || (searchQuery.length > 0 && matchesSearch))
          : normStatus === activeTab;

        // Date & Time filtering
        const orderTime = new Date(o.created_at).getTime();
        let matchesDate = true;

        if (datePreset === 'today') {
          matchesDate = orderTime >= todayStart.getTime();
        } else if (datePreset === 'yesterday') {
          matchesDate = orderTime >= yesterdayStart.getTime() && orderTime <= yesterdayEnd.getTime();
        } else if (datePreset === '7d') {
          matchesDate = orderTime >= now - 7 * 86400000;
        } else if (datePreset === '30d') {
          matchesDate = orderTime >= now - 30 * 86400000;
        } else if (datePreset === 'custom' || startDate || endDate || startTime || endTime) {
          if (startDate) {
            const startTs = new Date(`${startDate}T${startTime || '00:00'}:00`).getTime();
            if (!isNaN(startTs)) matchesDate = matchesDate && orderTime >= startTs;
          }
          if (endDate) {
            const endTs = new Date(`${endDate}T${endTime || '23:59'}:59`).getTime();
            if (!isNaN(endTs)) matchesDate = matchesDate && orderTime <= endTs;
          }
        }

        return matchesTab && matchesSearch && matchesDate;
      })
      // Newest first, and status changes (Pending -> Accepted -> Preparing -> Ready)
      // no longer move an order's position in the list. It only leaves the
      // default "All" view once it's Completed/Cancelled/Rejected (see filter above).
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, activeTab, searchQuery, getNormalizedStatus, datePreset, startDate, endDate, startTime, endTime]);

  // Decode metadata notes (e.g. delivery details, pricing mode, payment details)
  const parseNotes = (notesStr?: string) => {
    if (!notesStr) return null;
    try {
      return JSON.parse(notesStr);
    } catch {
      return { instructions: notesStr };
    }
  };

  return (
    <div className="space-y-3.5 pt-1">
      {/* Top Action Bar (Store Open/Close Toggle & Capacity Badge) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button
          onClick={() => {
            const wasOpen = store.marketplaceSettings?.storeOpen !== false;
            const updatedStore = {
              ...store,
              marketplaceSettings: {
                ...(store.marketplaceSettings || {}),
                storeOpen: !wasOpen,
              },
            };
            onUpdate(updatedStore);
            saveStore(updatedStore);
            showToast(
              wasOpen ? 'Store is now closed to customers' : 'Store is now open to the marketplace',
              wasOpen ? 'info' : 'success'
            );
          }}
          className={`px-3.5 py-1.5 rounded-lg border text-xs font-display font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
            store.marketplaceSettings?.storeOpen !== false
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
              : 'bg-destructive/10 border-destructive/25 text-destructive'
          }`}
          title="Toggle whether customers can see and order from your store"
        >
          <span className={`w-2 h-2 rounded-full ${store.marketplaceSettings?.storeOpen !== false ? 'bg-emerald-500 animate-pulse' : 'bg-destructive'}`} />
          {store.marketplaceSettings?.storeOpen !== false ? 'Open to Market' : 'Closed to Market — tap to open'}
        </button>

        {maxDailyOrders && (
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            isLimitReached ? 'bg-red-500/10 border-red-500/25 text-red-500' : 'bg-surface-2 border-border text-muted-foreground'
          }`}>
            <span>Capacity:</span>
            <span className="font-mono font-bold">{todayOrders.length} / {maxDailyOrders}</span>
            {isLimitReached && <span className="animate-pulse">⚠️ Full</span>}
          </div>
        )}
      </div>

      {/* Warning banner if limit reached */}
      {isLimitReached && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-500 text-xs font-medium space-y-1 text-left">
          <p className="font-bold flex items-center gap-1.5">
            <span>⚠️ Daily Limit Exceeded</span>
          </p>
          <p className="text-[11px] text-red-500/80 leading-normal">
            You have received {todayOrders.length} orders today, meeting your capacity of {maxDailyOrders}. Consider disabling new online orders in Settings if you cannot fulfill more.
          </p>
        </div>
      )}

      {/* Tabs list with counts — pill style matching the reference design */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4 md:-mx-0 md:px-0">
        {(['All', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Rejected', 'Cancelled'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-display font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab
                ? 'border-primary text-primary bg-primary/5'
                : 'border-border/60 text-muted-foreground bg-surface-2 hover:text-foreground'
            }`}
          >
            {tab}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono ${
              activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-surface-3 text-muted-foreground'
            }`}>
              {counts[tab as keyof typeof counts] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search Input + Filter button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 h-10 bg-surface-2 rounded-xl flex items-center px-3.5 border border-border/60 focus-within:border-primary/45 transition-colors min-w-0">
          <span className="material-symbols-outlined text-muted-foreground text-sm mr-2 shrink-0">search</span>
          <input
            type="text"
            placeholder="Search order ID, customer or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-xs focus:ring-0 focus:outline-none w-full min-w-0 text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground text-xs ml-1">
              ✕
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilterPanel(prev => !prev)}
          className={`shrink-0 h-10 px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
            hasActiveDateFilter || showFilterPanel
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'bg-surface-2 border-border/60 text-muted-foreground hover:text-foreground'
          }`}
          title="Date & Time Filter"
        >
          <span className="material-symbols-outlined text-lg">tune</span>
          <span className="hidden sm:inline">Filter</span>
          {hasActiveDateFilter && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* Expandable Date & Time Filter Panel (Tune Area) */}
      {showFilterPanel && (
        <div className="p-3.5 bg-card border border-border/80 rounded-2xl shadow-sm text-left space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-display text-foreground flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-primary">calendar_month</span>
              Date & Time Filter
            </span>
            {hasActiveDateFilter && (
              <button
                onClick={resetDateFilter}
                className="text-[11px] text-destructive hover:underline font-semibold"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'custom', label: 'Custom Range' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id as any)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface-2 text-muted-foreground border-border/60 hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date & Time Inputs */}
          {(datePreset === 'custom' || startDate || endDate || startTime || endTime) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-border/40">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase">From (Date & Time)</label>
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); setDatePreset('custom'); }}
                    className="flex-1 px-2.5 py-1.5 bg-surface-2 border border-border/60 rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/40"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => { setStartTime(e.target.value); setDatePreset('custom'); }}
                    className="w-24 px-2 py-1.5 bg-surface-2 border border-border/60 rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/40"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase">To (Date & Time)</label>
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => { setEndDate(e.target.value); setDatePreset('custom'); }}
                    className="flex-1 px-2.5 py-1.5 bg-surface-2 border border-border/60 rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/40"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => { setEndTime(e.target.value); setDatePreset('custom'); }}
                    className="w-24 px-2 py-1.5 bg-surface-2 border border-border/60 rounded-lg text-xs text-foreground focus:outline-none focus:border-primary/40"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground shadow-sm">
          No orders found matching the filter criteria.
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredOrders.map(order => {
            const normStatus = getNormalizedStatus(order.status);
            const styles = STATUS_STYLES[normStatus] || STATUS_STYLES['Pending'];
            const meta = parseNotes(order.notes);
            const pricingMode = meta?.pricing_mode || 'retail';
            const isExpanded = expandedOrder === order.id;

            return (
              <div 
                key={order.id} 
                className="bg-card border border-border/80 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all text-left space-y-3"
              >
                {/* Header Row — responsive layout for mobile */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-black text-base text-foreground">Order #{order.order_number}</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold font-display ${styles.bg} ${styles.text} ${styles.border}`}>
                      {normStatus}
                    </span>
                    <span className="uppercase text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold tracking-wider">{pricingMode} PRICING</span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 text-right">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                      <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-display font-black text-base text-foreground block">₦{order.total?.toLocaleString() || '0.00'}</span>
                    </div>
                  </div>
                </div>

                {/* Customer Details Box — mobile optimized */}
                <div className="space-y-2 text-xs bg-surface-2/60 p-2.5 sm:p-3 rounded-xl border border-border/40">
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="material-symbols-outlined text-muted-foreground text-sm shrink-0">person</span>
                    <span className="font-semibold truncate">{order.customer_name || 'Walk-in Customer'}</span>
                  </div>

                  {order.customer_phone && (
                    <div className="flex items-center justify-between gap-2 text-muted-foreground pt-1 border-t border-border/30">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="material-symbols-outlined text-muted-foreground text-sm shrink-0">call</span>
                        <span className="font-mono text-xs text-foreground truncate">{order.customer_phone}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openOrderWhatsApp(order, store, normStatus); }}
                        className="shrink-0 px-2.5 py-1 rounded-full bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                        title="Message customer on WhatsApp"
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.19-.31a8.22 8.22 0 0 1-1.27-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.21-8.25 8.21zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.16 0-.42.06-.65.31s-.85.83-.85 2.03.87 2.36 1 2.52c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.09.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28z"/></svg>
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  )}

                  {meta?.delivery_type === 'delivery' && meta?.address && (
                    <div className="flex items-start gap-2 text-muted-foreground pt-1 border-t border-border/30">
                      <span className="material-symbols-outlined text-muted-foreground text-sm shrink-0 mt-0.5">location_on</span>
                      <span className="leading-snug break-words text-left flex-1 font-medium">{meta.address}</span>
                    </div>
                  )}
                </div>

                {/* Items & Payment Badge Row */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm shrink-0 text-primary">inventory_2</span>
                    <span className="font-semibold text-foreground">{order.order_items?.length || 0} item{(order.order_items?.length || 0) === 1 ? '' : 's'}</span>
                    <span className="text-border">•</span>
                    <span className="material-symbols-outlined text-sm shrink-0">
                      {(meta?.payment_method || meta?.paymentMethod || '').toLowerCase().includes('transfer') ? 'sync_alt' : 'payments'}
                    </span>
                    <span className="capitalize">{meta?.payment_method || meta?.paymentMethod || 'Not specified'}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">Subtotal: ₦{order.subtotal?.toLocaleString() || '0.00'}</span>
                </div>

                {/* Rejection Reason Notice */}
                {meta?.rejection_reason && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">
                    <span className="font-bold">Rejection Reason:</span> {meta.rejection_reason}
                  </div>
                )}

                {/* Order Notes / Instructions */}
                {(meta?.instructions || meta?.notes || (typeof order.notes === 'string' && !order.notes.startsWith('{') && order.notes.trim() !== '')) && (
                  <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 text-xs rounded-xl text-left">
                    <span className="text-[10px] text-amber-500 font-bold uppercase block mb-0.5">Order Notes</span>
                    <p className="text-muted-foreground leading-relaxed font-medium">
                      {meta?.instructions || meta?.notes || order.notes}
                    </p>
                  </div>
                )}

                {/* Details Accordion & Actions Row */}
                <div className="pt-2 border-t border-border/40 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      className="flex items-center gap-1 text-xs font-display font-bold text-primary hover:text-primary-focus cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Items' : 'View Items'} ({order.order_items?.length || 0})</span>
                      <span className="material-symbols-outlined text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </button>

                    {/* Pending Status Quick Actions */}
                    {normStatus === 'Pending' && (
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={() => { setPromptType('reject'); setPromptOrderId(order.id); }}
                          className="px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-bold transition active:scale-95 cursor-pointer"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Accepted')}
                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer whitespace-nowrap"
                        >
                          Accept Order
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded Items Drawer */}
                  {isExpanded && (
                    <div className="mt-2 border-t border-border/40 pt-2 space-y-1.5 animate-fadeIn">
                      {(order.order_items || []).map((item: any, idx: number) => {
                        const pName = store.products?.find((p: any) => p.id === item.product_id)?.name || 'Unknown Product';
                        return (
                          <div key={item.id || idx} className="flex justify-between items-center text-xs py-1 px-2 rounded-lg bg-surface-2/40">
                            <div className="flex-1 pr-3">
                              <p className="font-semibold text-foreground">{pName}</p>
                              <p className="text-[10px] text-muted-foreground">₦{item.price?.toLocaleString()} each</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-foreground">× {Number(item.quantity)}</span>
                              <p className="text-[10px] text-muted-foreground font-bold">₦{item.subtotal?.toLocaleString()}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions for Non-Pending active statuses */}
                  {normStatus !== 'Pending' && normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/30">
                      {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')}
                          className="px-3 py-1.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs font-semibold hover:bg-destructive/10 transition active:scale-95 cursor-pointer mr-auto"
                        >
                          Cancel Order
                        </button>
                      )}

                      {normStatus === 'Accepted' && (
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}
                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                        >
                          Start Preparing
                        </button>
                      )}

                      {normStatus === 'Preparing' && (
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                        >
                          {meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}
                        </button>
                      )}

                      {normStatus === 'Ready' && (
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Completed')}
                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                        >
                          {meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Prompt Overlay Dialog */}
      {promptType === 'reject' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl text-left">
            <h3 className="font-display font-black text-lg text-foreground">Reject Order</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the reason for rejecting this order. The customer will receive this message immediately.
            </p>
            <textarea
              className="w-full h-24 p-3 bg-surface-2 border border-border/80 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              placeholder="e.g. Product out of stock, shop closed..."
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => { setPromptType(null); setPromptOrderId(null); setPromptText(''); }}
                className="px-4 py-2 rounded-xl bg-surface-3 hover:bg-surface-4 text-foreground transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!promptText.trim()) return showToast('Please enter details', 'error');
                  if (promptOrderId) {
                    onUpdateOrderStatus(promptOrderId, 'Rejected', { rejection_reason: promptText.trim() });
                  }
                  setPromptType(null);
                  setPromptOrderId(null);
                  setPromptText('');
                }}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary-focus transition cursor-pointer"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
