import { useState, useMemo } from 'react';
import { StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';

interface OrdersProps {
  store: StoreData;
  orders: any[];
  onUpdateOrderStatus: (orderId: string, status: string) => void;
}

export default function Orders({ store, orders, onUpdateOrderStatus }: OrdersProps) {
  const [activeTab, setActiveTab] = useState<'All' | 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Status Colors
  const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    Pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20' },
    Preparing: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
    Ready: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20' },
    Completed: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20' },
    Cancelled: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/20' }
  };

  // Get order count for each tab
  const counts = useMemo(() => {
    const res = { All: orders.length, Pending: 0, Preparing: 0, Ready: 0, Completed: 0, Cancelled: 0 };
    orders.forEach(o => {
      const status = o.status as keyof typeof res;
      if (res[status] !== undefined) {
        res[status]++;
      }
    });
    return res;
  }, [orders]);

  // Filtering orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesTab = activeTab === 'All' || o.status === activeTab;
      const matchesSearch = 
        o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [orders, activeTab, searchQuery]);

  // Decode metadata notes (e.g. delivery details, pricing mode)
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
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <h2 className="font-display font-black text-2xl text-foreground tracking-tight">QR Customer Orders</h2>
          <p className="text-xs text-muted-foreground mt-1">Receive, prepare and track online storefront orders in real-time.</p>
        </div>
      </div>

      {/* Tabs list with counts */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-border/40 -mx-4 px-4 md:-mx-0 md:px-0">
        {(['All', 'Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'] as const).map(tab => (
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
                {counts[tab]}
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
            const styles = STATUS_STYLES[order.status] || STATUS_STYLES.Pending;
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
                        {order.status}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-2/40 p-3 rounded-xl border border-border/30 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Customer</span>
                    <p className="font-semibold text-foreground mt-0.5">{order.customer_name}</p>
                    <p className="text-muted-foreground mt-0.5">{order.customer_phone || 'No phone provided'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Delivery & Details</span>
                    <p className="font-semibold text-foreground mt-0.5 capitalize">{meta?.delivery_type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</p>
                    {meta?.delivery_type === 'delivery' && (
                      <p className="text-muted-foreground mt-0.5 truncate" title={meta.address}>{meta.address}</p>
                    )}
                  </div>
                </div>

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
                        // Find matching product name if available in store products
                        const pName = store.products?.find(p => p.id === item.product_id)?.name || 'Unknown Product';
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
                      {meta?.instructions && (
                        <div className="bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg mt-3 text-xs">
                          <span className="text-[10px] text-amber-500 font-bold uppercase block mb-0.5">Special Instructions</span>
                          <p className="text-muted-foreground leading-relaxed font-semibold">{meta.instructions}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions row */}
                {order.status !== 'Completed' && order.status !== 'Cancelled' && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30 justify-end">
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')}
                      className="px-3.5 py-1.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive text-xs font-display font-semibold transition active:scale-95 cursor-pointer"
                    >
                      Cancel Order
                    </button>
                    {order.status === 'Pending' && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}
                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                      >
                        Accept & Prepare
                      </button>
                    )}
                    {order.status === 'Preparing' && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                      >
                        Mark Ready
                      </button>
                    )}
                    {order.status === 'Ready' && (
                      <button
                        onClick={() => onUpdateOrderStatus(order.id, 'Completed')}
                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"
                      >
                        Complete Order
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
