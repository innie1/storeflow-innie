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

export default function Orders({ store, orders, onUpdateOrderStatus, onUpdate }: OrdersProps) {
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Accepted' | 'Preparing' | 'Ready' | 'Completed' | 'Rejected' | 'Cancelled'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

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

  // Filtering orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const normStatus = getNormalizedStatus(o.status);
      const matchesTab = activeTab === 'All' || normStatus === activeTab;
      const matchesSearch = 
        o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [orders, activeTab, searchQuery, getNormalizedStatus]);

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
    <div className="space-y-6">
      {/* Title & Limit Counter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <h2 className="font-display font-black text-2xl text-foreground tracking-tight">QR Customer Orders</h2>
          <p className="text-xs text-muted-foreground mt-1">Receive, prepare and track online storefront orders in real-time.</p>
        </div>
        {/* Open to Market toggle — controls whether customers can see & order from your store */}
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
          className={`px-4 py-2.5 rounded-xl border text-sm font-display font-bold flex items-center gap-2 self-start md:self-auto transition-all active:scale-95 cursor-pointer ${
            store.marketplaceSettings?.storeOpen !== false
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
              : 'bg-destructive/10 border-destructive/25 text-destructive'
          }`}
          title="Toggle whether customers can see and order from your store"
        >
          <span className={`w-2.5 h-2.5 rounded-full ${store.marketplaceSettings?.storeOpen !== false ? 'bg-emerald-500' : 'bg-destructive'}`} />
          {store.marketplaceSettings?.storeOpen !== false ? 'Open to Market' : 'Closed to Market — tap to open'}
        </button>
        {maxDailyOrders && (
          <div className={`px-4 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 self-start md:self-auto ${
            isLimitReached ? 'bg-red-500/10 border-red-500/25 text-red-500' : 'bg-surface-2 border-border text-muted-foreground'
          }`}>
            <span>Daily Capacity:</span>
            <span className="font-mono font-bold">{todayOrders.length} / {maxDailyOrders}</span>
            {isLimitReached && <span className="animate-pulse">⚠️ Reached</span>}
          </div>
        )}
      </div>

      {/* Warning banner if limit reached */}
      {isLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-2xl text-red-500 text-xs font-medium space-y-1 text-left">
          <p className="font-bold flex items-center gap-1.5">
            <span>⚠️ Daily Limit Exceeded</span>
          </p>
          <p className="text-[11px] text-red-500/80 leading-normal">
            You have received {todayOrders.length} orders today, which meets or exceeds your maximum capacity of {maxDailyOrders}. Consider disabling new online orders in Settings if you cannot fulfill more.
          </p>
        </div>
      )}

      {/* Tabs list with counts */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-border/40 -mx-4 px-4 md:-mx-0 md:px-0">
        {(['All', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Rejected', 'Cancelled'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative pb-3 text-xs font-display font-bold transition-all whitespace-nowrap px-1 cursor-pointer ${
              activeTab === tab ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab}
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono ${
                activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-surface-3 text-muted-foreground'
              }`}>
                {counts[tab as keyof typeof counts] ?? 0}
              </span>
            </span>
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative w-full h-11 bg-surface-2 rounded-xl flex items-center px-4 border border-border/60 focus-within:border-primary/45 transition-colors">
        <span className="material-symbols-outlined text-muted-foreground text-sm mr-2.5">search</span>
        <input
          type="text"
          placeholder="Search by order ID, customer name or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-transparent border-none text-xs focus:ring-0 focus:outline-none w-full text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground shadow-sm">
          No orders found matching the filter criteria.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(order => {
            const normStatus = getNormalizedStatus(order.status);
            const styles = STATUS_STYLES[normStatus] || STATUS_STYLES['Pending'];
            const meta = parseNotes(order.notes);
            const pricingMode = meta?.pricing_mode || 'retail';
            const isExpanded = expandedOrder === order.id;

            return (
              <div 
                key={order.id} 
                className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all text-left space-y-4"
              >
                {/* Header Row */}
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-base text-foreground">Order #{order.order_number}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold font-display ${styles.bg} ${styles.text} ${styles.border}`}>
                        {normStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold">
                      <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="uppercase text-primary font-bold">{pricingMode} PRICING</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-display font-black text-base text-foreground">₦{order.total?.toLocaleString() || '0.00'}</span>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Subtotal: ₦{order.subtotal?.toLocaleString() || '0.00'}</p>
                  </div>
                </div>

                {/* Customer Details Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-2/40 p-3 rounded-xl border border-border/30 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Customer</span>
                    <p className="font-semibold text-foreground mt-0.5">{order.customer_name}</p>
                    <p className="text-muted-foreground mt-0.5">{order.customer_phone || 'No phone provided'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Fulfillment</span>
                    <p className="font-semibold text-foreground mt-0.5 capitalize">
                      {meta?.delivery_type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}
                    </p>
                    {meta?.delivery_type === 'delivery' && (
                      <p className="text-muted-foreground mt-0.5 truncate text-[11px]" title={meta.address}>{meta.address}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Method</span>
                    <p className="font-semibold text-foreground mt-0.5 capitalize">
                      💳 {meta?.payment_method || meta?.paymentMethod || 'Not specified'}
                    </p>
                  </div>
                </div>

                {/* Promoted / Warning Notes inside Order details */}
                {meta?.rejection_reason && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">
                    <span className="font-bold">Rejection Reason:</span> {meta.rejection_reason}
                  </div>
                )}

                {/* Order notes / customer instructions */}
                {(meta?.instructions || meta?.notes || (typeof order.notes === 'string' && !order.notes.startsWith('{') && order.notes.trim() !== '')) && (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/10 text-xs rounded-xl text-left">
                    <span className="text-[10px] text-amber-500 font-bold uppercase block mb-0.5">Order Notes / Instructions</span>
                    <p className="text-muted-foreground leading-relaxed font-medium">
                      {meta?.instructions || meta?.notes || order.notes}
                    </p>
                  </div>
                )}

                {/* Expandable Order Items list */}
                <div>
                  <button 
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    className="w-full py-1.5 flex justify-between items-center text-xs font-display font-bold text-primary hover:text-primary-focus cursor-pointer"
                  >
                    <span>{isExpanded ? 'Hide Items' : 'Show Items'} ({order.order_items?.length || 0})</span>
                    <span className="material-symbols-outlined text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 border-t border-border/40 pt-3 space-y-2 animate-slide-down">
                      {(order.order_items || []).map((item: any, idx: number) => {
                        const pName = store.products?.find((p: any) => p.id === item.product_id)?.name || 'Unknown Product';
                        return (
                          <div key={item.id || idx} className="flex justify-between items-center text-xs py-1">
                            <div className="flex-1 pr-4">
                              <p className="font-semibold text-foreground">{pName}</p>
                              <p className="text-[10px] text-muted-foreground">₦{item.price?.toLocaleString()} each</p>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-foreground">× {Number(item.quantity)}</span>
                              <p className="text-[10px] text-muted-foreground font-bold">₦{item.subtotal?.toLocaleString()}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Actions row */}
                {normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30 justify-end">
                    {/* Cancel action is available for Accepted, Preparing, and Ready */}
                    {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')}
                        className="px-3.5 py-1.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive text-xs font-display font-semibold transition active:scale-95 cursor-pointer mr-auto"
                      >
                        Cancel Order
                      </button>
                    )}

                    {/* Pending Actions */}
                    {normStatus === 'Pending' && (
                      <>
                        <button
                          onClick={() => {
                            setPromptType('reject');
                            setPromptOrderId(order.id);
                          }}
                          className="px-3.5 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 text-xs font-display font-semibold transition active:scale-95 cursor-pointer"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Accepted')}
                          className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                        >
                          Accept Order
                        </button>
                      </>
                    )}

                    {/* Accepted Actions */}
                    {normStatus === 'Accepted' && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}
                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                      >
                        Start Preparing
                      </button>
                    )}

                    {/* Preparing Actions */}
                    {normStatus === 'Preparing' && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                      >
                        {meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}
                      </button>
                    )}

                    {/* Ready Actions */}
                    {normStatus === 'Ready' && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Completed')}
                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                      >
                        {meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}
                      </button>
                    )}
                  </div>
                )}
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
