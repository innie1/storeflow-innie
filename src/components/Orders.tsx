import { useState, useMemo, useCallback } from 'react';
import { StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';
import { saveStore } from '@/lib/store-data';
import { Bell, User, Phone, MapPin, Package, Banknote, CreditCard, X, ChevronDown, ChevronUp } from 'lucide-react';

interface OrdersProps {
  store: StoreData;
  orders: any[];
  onUpdateOrderStatus: (orderId: string, status: string, metadata?: any) => void;
  onUpdate: (store: StoreData) => void;
}

export default function Orders({ store, orders, onUpdateOrderStatus, onUpdate }: OrdersProps) {
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Accepted' | 'Preparing' | 'Completed'>('All');
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
    if (s === 'cancelled') return 'Cancelled';
    if (s === 'rejected') return 'Rejected';
    return 'Pending';
  }, []);

  const todayOrders = useMemo(() => {
    return orders.filter(o => {
      const d = new Date(o.created_at);
      return d.toDateString() === new Date().toDateString() && o.status !== 'Rejected' && o.status !== 'Cancelled';
    });
  }, [orders]);

  const maxDailyOrders = store.marketplaceSettings?.maxDailyOrders || 0;
  const isLimitReached = maxDailyOrders > 0 && todayOrders.length >= maxDailyOrders;

  // Get order count for each tab using normalized statuses
  const counts = useMemo(() => {
    const res = { 
      All: orders.length, 
      Pending: 0, 
      Accepted: 0,
      Preparing: 0, 
      Completed: 0
    };
    orders.forEach(o => {
      const status = getNormalizedStatus(o.status);
      if (status === 'Pending') res.Pending++;
      else if (status === 'Accepted') res.Accepted++;
      else if (status === 'Preparing' || status === 'Ready') res.Preparing++;
      else if (status === 'Completed') res.Completed++;
    });
    return res;
  }, [orders, getNormalizedStatus]);

  // Filtering orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const normStatus = getNormalizedStatus(o.status);
      
      let matchesTab = false;
      if (activeTab === 'All') {
        matchesTab = true;
      } else if (activeTab === 'Preparing') {
        matchesTab = (normStatus === 'Preparing' || normStatus === 'Ready');
      } else {
        matchesTab = (normStatus === activeTab);
      }

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
    <div className="space-y-4">
      {/* Compact App Bar */}
      <div className="flex items-center justify-between py-2 border-b border-border/40 sticky top-0 bg-background/95 backdrop-blur-md z-20 -mx-4 px-4 md:-mx-0 md:px-0">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-black text-lg text-foreground tracking-tight select-none">Customer Orders</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Open to Market toggle */}
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
            className={`px-3 py-1.5 rounded-xl border text-[11px] font-display font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
              store.marketplaceSettings?.storeOpen !== false
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
                : 'bg-destructive/10 border-destructive/25 text-destructive'
            }`}
            title="Toggle whether customers can see and order from your store"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${store.marketplaceSettings?.storeOpen !== false ? 'bg-emerald-500' : 'bg-destructive'}`} />
            {store.marketplaceSettings?.storeOpen !== false ? 'Open to Market' : 'Closed to Market'}
          </button>

          {/* Notification Icon */}
          <button
            className="relative w-8 h-8 rounded-full bg-surface-2 hover:bg-surface-3 border border-border/60 flex items-center justify-center text-sm transition-all active:scale-95 cursor-pointer"
            title="Pending Orders Notification"
          >
            <Bell className="w-3.5 h-3.5 text-foreground" />
            {counts.Pending > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 rounded-full bg-destructive text-[8px] font-bold font-mono text-destructive-foreground px-1 flex items-center justify-center">
                {counts.Pending}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Warning banner if limit reached */}
      {isLimitReached && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-2xl text-red-500 text-[11px] font-medium space-y-1 text-left">
          <p className="font-bold flex items-center gap-1.5">
            <span>⚠️ Daily Capacity Limit Reached</span>
          </p>
          <p className="text-red-500/80 leading-normal">
            You have received {todayOrders.length} orders today, meeting your capacity of {maxDailyOrders}. Enable/disable ordering status as needed.
          </p>
        </div>
      )}

      {/* Sticky Filter Tabs */}
      <div className="sticky top-[49px] bg-background/95 backdrop-blur-md z-10 py-2 border-b border-border/40 -mx-4 px-4 md:-mx-0 md:px-0 flex gap-2 overflow-x-auto no-scrollbar">
        {(['All', 'Pending', 'Accepted', 'Preparing', 'Completed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-display font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 border ${
              activeTab === tab 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border/40 bg-surface-2/40 text-foreground hover:bg-surface-2'
            }`}
          >
            <span>{tab}</span>
            <span className={activeTab === tab ? 'text-primary/95' : 'text-muted-foreground font-medium'}>
              {counts[tab as keyof typeof counts] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search Input below filter tabs */}
      <div className="flex gap-2">
        <div className="relative flex-1 h-9 bg-surface-2/45 rounded-xl flex items-center px-3 border border-border/40 focus-within:border-primary/45 transition-colors">
          <span className="material-symbols-outlined text-muted-foreground text-xs mr-2 select-none">search</span>
          <input
            type="text"
            placeholder="Search by order ID, customer or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-xs focus:ring-0 focus:outline-none w-full text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <button className="w-9 h-9 rounded-xl border border-border/40 bg-surface-2/45 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer">
          <span className="material-symbols-outlined text-sm select-none">tune</span>
        </button>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-card border border-border/40 rounded-[22px] p-6 text-center text-xs text-muted-foreground shadow-sm">
          No orders found matching the filter criteria.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const normStatus = getNormalizedStatus(order.status);
            const styles = STATUS_STYLES[normStatus] || STATUS_STYLES['Pending'];
            const meta = parseNotes(order.notes);
            const pricingMode = meta?.pricing_mode || 'retail';
            const isExpanded = expandedOrder === order.id;

            return (
              <div 
                key={order.id} 
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                className={`bg-card border border-border/40 rounded-[22px] p-4.5 shadow-sm hover:shadow-md transition-all text-left space-y-3 cursor-pointer select-none ${
                  isExpanded ? 'ring-1 ring-primary/20 border-primary/30' : ''
                }`}
              >
                {/* Header Row */}
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-sm text-foreground">Order #{order.order_number}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold font-display ${styles.bg} ${styles.text} ${styles.border}`}>
                        {normStatus}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-display font-black text-sm text-foreground">₦{order.total?.toLocaleString() || '0.00'}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) === new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
                        ? `Today, ${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' as any })}
                    </p>
                  </div>
                </div>

                {/* Customer Details Row */}
                <div className="space-y-1.5 text-xs text-foreground/90 pl-0.5">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                    <span className="text-[13px] text-foreground font-medium">{order.customer_name}</span>
                  </div>
                  {order.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-[13px] text-muted-foreground">{order.customer_phone}</span>
                    </div>
                  )}
                  {meta?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
                      <span className="text-[13px] text-muted-foreground leading-normal">{meta.address}</span>
                    </div>
                  )}
                </div>

                {/* Items & Payment Method Info */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-3 border-t border-border/10 pl-0.5">
                  <div className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <span>{order.order_items?.length || 0} item{(order.order_items?.length || 0) === 1 ? '' : 's'}</span>
                  </div>
                  <div className="h-3 w-px bg-border/20" />
                  <div className="flex items-center gap-1">
                    {meta?.payment_method?.toLowerCase().includes('cash') || meta?.paymentMethod?.toLowerCase().includes('cash') ? (
                      <Banknote className="w-3.5 h-3.5 text-muted-foreground/50" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground/50" />
                    )}
                    <span>{meta?.payment_method || meta?.paymentMethod || 'Cash on Delivery'}</span>
                  </div>
                </div>

                {/* Promoted / Warning Notes inside Order details */}
                {meta?.rejection_reason && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] rounded-xl">
                    <span className="font-bold">Rejection Reason:</span> {meta.rejection_reason}
                  </div>
                )}

                {/* Order notes / customer instructions */}
                {(meta?.instructions || meta?.notes || (typeof order.notes === 'string' && !order.notes.startsWith('{') && order.notes.trim() !== '')) && (
                  <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 text-[11px] rounded-xl text-left">
                    <span className="text-[10px] text-amber-500 font-bold uppercase block mb-0.5">Instructions</span>
                    <p className="text-muted-foreground leading-relaxed font-medium">
                      {meta?.instructions || meta?.notes || order.notes}
                    </p>
                  </div>
                )}

                {/* Action Items & Expand trigger Row */}
                <div className="flex items-center justify-between gap-4 pt-1">
                  {/* Details Toggle */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedOrder(isExpanded ? null : order.id);
                    }}
                    className="flex items-center gap-0.5 text-xs font-display font-bold text-primary hover:text-primary-focus cursor-pointer transition-colors py-2"
                  >
                    <span>Details</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Actions buttons */}
                  {normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (
                    <div className="flex items-center gap-3">
                      {/* Reject button - circular red button, made w-11 h-11 for balanced touch target */}
                      {normStatus === 'Pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPromptType('reject');
                            setPromptOrderId(order.id);
                          }}
                          className="w-11 h-11 rounded-full border border-red-500/60 bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0"
                          title="Reject Order"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}

                      {/* Accept / Next State button - made h-11 to be equal in height to Reject button */}
                      {normStatus === 'Pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateOrderStatus(order.id, 'Accepted');
                          }}
                          className="h-11 px-5 rounded-[12px] bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer flex items-center justify-center"
                        >
                          Accept Order
                        </button>
                      )}

                      {normStatus === 'Accepted' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateOrderStatus(order.id, 'Preparing');
                          }}
                          className="h-11 px-5 rounded-[12px] bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer flex items-center justify-center"
                        >
                          Start Preparing
                        </button>
                      )}

                      {normStatus === 'Preparing' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateOrderStatus(order.id, 'Ready');
                          }}
                          className="h-11 px-5 rounded-[12px] bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer flex items-center justify-center"
                        >
                          {meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}
                        </button>
                      )}

                      {normStatus === 'Ready' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateOrderStatus(order.id, 'Completed');
                          }}
                          className="h-11 px-5 rounded-[12px] bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer flex items-center justify-center"
                        >
                          {meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}
                        </button>
                      )}

                      {/* Cancel order button */}
                      {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateOrderStatus(order.id, 'Cancelled');
                          }}
                          className="h-11 px-4.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive text-xs font-display font-semibold transition active:scale-95 cursor-pointer flex items-center justify-center"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Smooth Expandable Order Items & Pricing Breakdown container */}
                {isExpanded && (
                  <div className="mt-3 border-t border-border/20 pt-3 space-y-3 animate-slide-down">
                    {/* Time, Date and Pricing Mode */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground font-semibold bg-surface-2/45 p-2 rounded-xl border border-border/20">
                      <div className="flex items-center gap-1.5">
                        <span>Created:</span>
                        <span className="text-foreground">{new Date(order.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>Pricing:</span>
                        <span className="uppercase text-primary font-bold">{pricingMode} Pricing</span>
                      </div>
                    </div>

                    {/* Order Items List */}
                    <div className="space-y-2">
                      {(order.order_items || []).map((item: any, idx: number) => {
                        const pName = store.products?.find((p: any) => p.id === item.product_id)?.name || 'Unknown Product';
                        return (
                          <div key={item.id || idx} className="flex justify-between items-center text-xs py-1.5 border-b border-border/10 last:border-b-0">
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

                    {/* Pricing Summary */}
                    <div className="pt-2 border-t border-border/20 flex flex-col items-end text-xs space-y-1">
                      <div className="flex justify-between w-full max-w-[200px] text-muted-foreground">
                        <span>Subtotal:</span>
                        <span>₦{order.subtotal?.toLocaleString() || '0.00'}</span>
                      </div>
                      <div className="flex justify-between w-full max-w-[200px] text-foreground font-bold">
                        <span>Total Amount:</span>
                        <span>₦{order.total?.toLocaleString() || '0.00'}</span>
                      </div>
                    </div>
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
