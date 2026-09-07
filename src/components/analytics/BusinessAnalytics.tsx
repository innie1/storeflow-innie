import { useMemo, useState } from 'react';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { ArrowLeft, BarChart3, CheckCircle2, Eye, Globe2, RefreshCw, ShoppingBag, UserRound, Users, XCircle } from 'lucide-react';
import type { StoreData } from '@/types/store';

type Range = '7d' | '30d' | 'all';

type AnyRecord = Record<string, any>;

function listFromStore(store: StoreData, names: string[]): AnyRecord[] {
  const root = store as any;
  const data = root.data || {};
  for (const name of names) {
    if (Array.isArray(root[name])) return root[name];
    if (Array.isArray(data[name])) return data[name];
  }
  return [];
}

function dateOf(row: AnyRecord): number {
  const value = row.created_at || row.createdAt || row.date || row.timestamp || row.updated_at;
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function within(t: number, range: Range): boolean {
  if (range === 'all') return true;
  const days = range === '7d' ? 7 : 30;
  return t >= Date.now() - days * 86400000;
}

function isSuccessfulOrder(order: AnyRecord): boolean {
  const status = String(order.status || order.order_status || '').toLowerCase();
  return ['completed', 'complete', 'successful', 'success', 'delivered', 'collected', 'paid'].includes(status);
}

function customerKey(order: AnyRecord): string {
  return String(order.customer_uuid || order.customer_id || order.customerId || order.customer_phone || order.customerPhone || order.customer_name || order.customerName || `guest:${order.id || order.order_number || Math.random()}`);
}

/**
 * Work taken in over the counter, as order-shaped rows.
 *
 * This page read the online storefront and nothing else: QR scans, and orders
 * placed through the customer app. A laundry doing real business over a
 * counter saw seven of its eight cards read zero - no customers, no returning
 * buyers, no orders - because every walk-in bundle lives in its own record
 * store that nothing here ever opened.
 */
function walkInOrders(store: StoreData): AnyRecord[] {
  const accessCode = String((store as AnyRecord).accessCode || '');
  if (!accessCode) return [];
  let records: AnyRecord[] = [];
  try { records = getLocalLaundryRecords(accessCode) as unknown as AnyRecord[]; } catch { return []; }
  return records.map(record => ({
    id: record.clientRef,
    order_number: record.tagCode,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    customer_id: record.customerPhone || record.customerName,
    total: Number(record.total) || 0,
    // A bundle handed back is this trade's completed order.
    status: record.workflowStage === 'collected' ? 'collected' : String(record.workflowStage || 'received'),
    created_at: record.createdAt,
    walkIn: true,
  }));
}

export default function BusinessAnalytics({ store, onBack }: { store: StoreData; onBack?: () => void }) {
  const [range, setRange] = useState<Range>('30d');
  const [tab, setTab] = useState<'overview' | 'customers' | 'scans'>('overview');

  const analytics = useMemo(() => {
    const scans = listFromStore(store, ['scanEvents', 'scan_events', 'qrScans', 'qr_scans']);
    const online = listFromStore(store, ['orders', 'customerOrders', 'customer_orders']);
    const walkIns = walkInOrders(store);
    // Both count. A shop can take work at the counter, through the storefront,
    // or both, and the page should describe the whole business either way.
    const orders = [...online, ...walkIns];
    const customers = listFromStore(store, ['customers']);
    const sales = Array.isArray((store as any).sales) ? (store as any).sales : [];

    const filteredScans = scans.filter(s => within(dateOf(s), range));
    const filteredOrders = orders.filter(o => within(dateOf(o), range));
    const successful = filteredOrders.filter(isSuccessfulOrder);
    const guests = filteredOrders.filter(o => o.is_guest === true || o.isGuest === true || (!o.customer_uuid && !o.customer_id));

    const customerMap = new Map<string, AnyRecord>();
    for (const order of orders) {
      const key = customerKey(order);
      const existing = customerMap.get(key) || {
        key,
        name: order.customer_name || order.customerName || 'Guest buyer',
        phone: order.customer_phone || order.customerPhone || '',
        guest: order.is_guest === true || order.isGuest === true || (!order.customer_uuid && !order.customer_id),
        orders: 0,
        successful: 0,
        spent: 0,
        lastPurchase: 0,
      };
      existing.orders += 1;
      if (isSuccessfulOrder(order)) {
        existing.successful += 1;
        existing.spent += Number(order.total || order.amount || order.subtotal || 0);
      }
      existing.lastPurchase = Math.max(existing.lastPurchase, dateOf(order));
      customerMap.set(key, existing);
    }

    const customerRows = [...customerMap.values()].sort((a, b) => b.spent - a.spent);
    const outstanding = (store.pendingPayments || [])
      .filter(payment => payment.status === 'pending')
      .reduce((sum, payment) => sum + Math.max(0, Number(payment.balance) || 0), 0);
    const returning = customerRows.filter(c => c.successful > 1);
    const revenue = successful.reduce((sum, o) => sum + Number(o.total || o.amount || o.subtotal || 0), 0);
    const salesInRange = sales.filter((s: AnyRecord) => within(dateOf(s), range));
    const salesRevenue = salesInRange.reduce((sum: number, s: AnyRecord) => sum + Number(s.total || 0), 0);

    return {
      scans: filteredScans.length,
      uniqueScanners: new Set(filteredScans.map(s => String(s.visitor_id || s.visitorId || s.session_id || s.sessionId || s.ip_hash || s.id || 'unknown'))).size,
      orders: filteredOrders.length,
      successful: successful.length,
      guests: guests.length,
      revenue: revenue || salesRevenue,
      customers: Math.max(customers.length, customerRows.length),
      returning: returning.length,
      customerRows,
      outstanding,
      walkIns: filteredOrders.filter(order => order.walkIn).length,
      recentScans: [...filteredScans].sort((a, b) => dateOf(b) - dateOf(a)).slice(0, 20),
    };
  }, [store, range]);

  const isService = isServiceFirstBusiness(store);
  const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;
  const average = analytics.successful > 0 ? analytics.revenue / analytics.successful : 0;

  /**
   * A shop that never uses the storefront has nothing to say about scans, and
   * eight cards of zero say only that the app is not watching the right thing.
   * The storefront cards appear once there is storefront activity to report.
   */
  const storefrontCards = [
    { label: 'QR / Storefront scans', value: analytics.scans, icon: Eye },
    { label: 'Unique visitors', value: analytics.uniqueScanners, icon: Globe2 },
  ];

  const serviceCards = [
    { label: 'Jobs taken in', value: analytics.orders, icon: ShoppingBag },
    { label: 'Handed back', value: analytics.successful, icon: CheckCircle2 },
    { label: 'Customers served', value: analytics.customers, icon: Users },
    { label: 'Came back again', value: analytics.returning, icon: RefreshCw },
    { label: 'Collected', value: money(analytics.revenue), icon: BarChart3 },
    { label: 'Average job', value: money(average), icon: BarChart3 },
    { label: 'Still owed', value: money(analytics.outstanding), icon: UserRound },
  ];

  const retailCards = [
    { label: 'Orders received', value: analytics.orders, icon: ShoppingBag },
    { label: 'Successful orders', value: analytics.successful, icon: CheckCircle2 },
    { label: 'Guest buyers', value: analytics.guests, icon: UserRound },
    { label: 'Customers', value: analytics.customers, icon: Users },
    { label: 'Returning buyers', value: analytics.returning, icon: RefreshCw },
    { label: 'Order revenue', value: money(analytics.revenue), icon: BarChart3 },
  ];

  const cards = [
    ...(analytics.scans > 0 || !isService ? storefrontCards : []),
    ...(isService ? serviceCards : retailCards),
  ];

  return (
    <div className="animate-fade-in space-y-5 pb-8">
      <div className="flex items-center gap-3">
        {onBack && <button onClick={onBack} className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-primary font-bold">Business intelligence</p>
          <h1 className="font-display font-black text-2xl">Analysis</h1>
          <p className="text-sm text-muted-foreground">
            {isService
              ? 'Who brings you work, what you have handed back, and who comes again.'
              : 'Understand who finds your store, who buys, and who comes back.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([['7d', '7 days'], ['30d', '30 days'], ['all', 'Lifetime']] as [Range, string][]).map(([id, label]) => <button key={id} onClick={() => setRange(id)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${range === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>{label}</button>)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><Icon className="w-4 h-4 text-primary" /><p className="font-display font-black text-2xl mt-2">{value}</p><p className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</p></div>)}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([['overview', 'Overview'], ['customers', 'Customers'], ['scans', 'Scan activity']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`p-3 rounded-xl border text-xs font-bold ${tab === id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card'}`}>{label}</button>)}
      </div>

      {tab === 'overview' && <div className="grid md:grid-cols-2 gap-3">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display font-bold">Customer journey</h2>
          <div className="space-y-3 mt-4">
            {[[isService ? 'Found you online' : 'Scanned storefront', analytics.scans], [isService ? 'Brought work in' : 'Placed an order', analytics.orders], [isService ? 'Handed back' : 'Successful purchase', analytics.successful], ['Bought more than once', analytics.returning]].map(([label, value]) => <div key={label as string} className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><b className="font-display">{value as number}</b></div>)}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display font-bold">What this means</h2>
          <div className="space-y-3 mt-4 text-sm text-muted-foreground">
            <p><b className="text-foreground">Guest buyers:</b> customers who ordered without a linked customer account.</p>
            <p><b className="text-foreground">Returning buyers:</b> customers with more than one successful purchase.</p>
            <p><b className="text-foreground">Successful orders:</b> orders that reached a completed/paid/delivered state.</p>
            <p><b className="text-foreground">Unique visitors:</b> best-effort distinct visitor/session identifiers from recorded scan events.</p>
          </div>
        </section>
      </div>}

      {tab === 'customers' && <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border"><h2 className="font-display font-bold">Customer purchase history</h2><p className="text-xs text-muted-foreground mt-1">See how often each buyer successfully purchased.</p></div>
        {analytics.customerRows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No order customer history is available yet.</div> : <div className="divide-y divide-border">{analytics.customerRows.slice(0, 50).map(c => <div key={c.key} className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black">{c.guest ? 'G' : String(c.name).slice(0, 1).toUpperCase()}</div><div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{c.name}</p><p className="text-xs text-muted-foreground truncate">{c.guest ? 'Guest buyer' : c.phone || 'Customer'} · {c.orders} order{c.orders === 1 ? '' : 's'}</p></div><div className="text-right"><p className="font-display font-black text-sm">{c.successful} successful</p><p className="text-xs text-primary">₦{Math.round(c.spent).toLocaleString()}</p></div></div>)}</div>}
      </section>}

      {tab === 'scans' && <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border"><h2 className="font-display font-bold">QR / storefront activity</h2><p className="text-xs text-muted-foreground mt-1">Recorded visits to the customer storefront.</p></div>
        {analytics.recentScans.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No scan events have been recorded yet.</div> : <div className="divide-y divide-border">{analytics.recentScans.map((s, i) => <div key={s.id || i} className="p-4 flex items-center justify-between"><div><p className="font-bold text-sm">{s.purpose === 'storefront_visit' ? 'Storefront visit' : s.kind === 'qr' ? 'QR scan' : 'Store visit'}</p><p className="text-xs text-muted-foreground">{dateOf(s) ? new Date(dateOf(s)).toLocaleString() : 'Unknown time'}</p></div><span className="text-xs font-bold text-primary">{s.matched === false ? 'Not matched' : 'Matched'}</span></div>)}</div>}
      </section>}
    </div>
  );
}
