import { useState } from 'react';
import { Camera, QrCode, Sparkles, AlertCircle, ShoppingCart, Users, Tag, CreditCard, Receipt, Database, LayoutGrid } from 'lucide-react';
import { StoreData, Product } from '@/types/store';
import { encodeQRData, decodeQRData, QRData, parseScannedQRText } from '@/lib/qr-code';
import { logScanEvent } from '@/lib/store-data';
import QRDisplayCard from './QRDisplayCard';
import QRScannerPage from './QRScannerPage';
import { showToast } from '@/components/Toast';

interface QRHubProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  currentUser?: any;
}

type QRType = 'store' | 'product' | 'shelf' | 'customer' | 'staff' | 'payment' | 'receipt' | 'inventory' | 'promotion';

export default function QRHub({ store, onUpdate, currentUser }: QRHubProps) {
  const [activeMode, setActiveMode] = useState<'scan' | 'generate' | 'analytics'>('generate');
  const [qrType, setQrType] = useState<QRType>('store');

  // Generator State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [staffRole, setStaffRole] = useState('manager');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('10');

  // Display QR State
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [displayLabel, setDisplayLabel] = useState('');

  // Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<QRData | null>(null);
  const [rawScannedText, setRawScannedText] = useState('');

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();

    let label = '';
    let payloadData: any = {};

    switch (qrType) {
      case 'store':
        label = store.storeName;
        payloadData = { name: store.storeName, category: store.category };
        break;
      case 'product':
        const prod = store.products.find(p => p.id === selectedProductId);
        if (!prod) return showToast('Please select a product', 'error');
        label = prod.name;
        payloadData = { id: prod.id, name: prod.name, price: prod.sellingPrice, sku: prod.barcode || '' };
        break;
      case 'shelf':
        if (!shelfLocation.trim()) return showToast('Enter shelf location', 'error');
        label = shelfLocation;
        payloadData = { location: shelfLocation.trim() };
        break;
      case 'customer':
        if (!customerName.trim()) return showToast('Enter customer name', 'error');
        label = customerName;
        payloadData = { name: customerName.trim() };
        break;
      case 'staff':
        label = `Staff Account (${staffRole})`;
        payloadData = { role: staffRole };
        break;
      case 'payment':
        if (!paymentAmount || Number(paymentAmount) <= 0) return showToast('Enter a valid amount', 'error');
        label = `Pay GHS ${paymentAmount}`;
        payloadData = { amount: Number(paymentAmount), currency: 'GHS' };
        break;
      case 'receipt':
        const sale = store.sales.find(s => s.id === selectedSaleId);
        if (!sale) return showToast('Please select a receipt', 'error');
        label = `Receipt #${sale.id.substring(0, 6)}`;
        payloadData = { id: sale.id, total: sale.total, date: sale.date };
        break;
      case 'inventory':
        label = `Inventory Audit`;
        payloadData = { auditDate: new Date().toISOString() };
        break;
      case 'promotion':
        if (!promoCode.trim()) return showToast('Enter promo code', 'error');
        label = `${promoCode} (-${promoDiscount}%)`;
        payloadData = { code: promoCode.trim().toUpperCase(), discount: Number(promoDiscount) };
        break;
    }

    const tokenPayload = encodeQRData({
      version: 1,
      storeId: store.accessCode,
      timestamp: Date.now(),
      type: qrType,
      payload: payloadData
    });

    setDisplayLabel(label);
    setGeneratedPayload(tokenPayload);
    showToast(`Secure QR Code generated for ${qrType}!`, 'success');
  };

  const handleScanSuccess = (decodedText: string) => {
    setScannerOpen(false);
    setRawScannedText(decodedText);

    // 1. Try to decode as an encoded StoreFlow token
    const parsed = decodeQRData(decodedText);
    if (parsed) {
      setScannedResult(parsed);
      onUpdate(logScanEvent(store, {
        kind: 'qr',
        purpose: parsed.type || 'unknown',
        productId: parsed.payload?.id,
        productName: parsed.payload?.name,
        matched: true,
      }));
      return;
    }

    // 2. Try to parse as a StoreFlow URL (e.g. from Settings QR code or external camera scan)
    const urlParsed = parseScannedQRText(decodedText);
    if (urlParsed) {
      // Build a synthetic QRData for display purposes
      const syntheticResult: QRData = {
        version: 1,
        uuid: 'url-scan',
        token: urlParsed.source,
        storeId: urlParsed.storeId,
        timestamp: Date.now(),
        type: urlParsed.productId ? 'product' : 'store',
        payload: {
          scannedUrl: decodedText,
          ...(urlParsed.productId ? { productId: urlParsed.productId } : {}),
        }
      };
      setScannedResult(syntheticResult);
      showToast(`StoreFlow ${urlParsed.productId ? 'product' : 'store'} QR identified!`, 'success');
      onUpdate(logScanEvent(store, {
        kind: 'qr',
        purpose: urlParsed.productId ? 'product' : 'store',
        productId: urlParsed.productId,
        matched: true,
      }));
      return;
    }

    // 3. Not recognizable
    setScannedResult(null);
    showToast('Decoded QR is not a valid StoreFlow token or URL', 'warning');
    onUpdate(logScanEvent(store, { kind: 'qr', purpose: 'unrecognized', matched: false }));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <QrCode className="w-6 h-6 text-primary" /> Premium QR Workspace
          </h1>
          <p className="text-xs text-muted-foreground">Generate security-encoded branded codes and scan labels instantly.</p>
        </div>

        {/* Workspace Mode Tabs */}
        <div className="flex p-1 rounded-xl bg-surface-2 border border-border/80 self-start text-xs font-semibold">
          <button
            onClick={() => {
              setActiveMode('generate');
              setScannedResult(null);
            }}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeMode === 'generate' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Generate QR
          </button>
          <button
            onClick={() => {
              setActiveMode('scan');
              setGeneratedPayload(null);
            }}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeMode === 'scan' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Scan Code
          </button>
          <button
            onClick={() => setActiveMode('analytics')}
            className={`px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeMode === 'analytics' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Analytics
          </button>
        </div>
      </div>

      {activeMode === 'generate' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          
          {/* QR Generator form */}
          <div className="bg-surface-1 border border-border rounded-2xl p-6 shadow-sm space-y-5 text-left">
            <div>
              <h2 className="font-display font-bold text-sm text-foreground mb-1 uppercase tracking-wide">1. Select Target Type</h2>
              <p className="text-[11px] text-muted-foreground">Choose the entity you want to generate a premium QR Code for.</p>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">QR Entity Type</label>
                <select
                  value={qrType}
                  onChange={e => {
                    setQrType(e.target.value as QRType);
                    setGeneratedPayload(null);
                  }}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                >
                  <option value="store">Store Front / Check-In</option>
                  <option value="product">Product Details / SKU</option>
                  <option value="shelf">Shelf / Location tag</option>
                  <option value="customer">Customer Loyalty Account</option>
                  <option value="staff">Staff Authorization badge</option>
                  <option value="payment">Direct Payment Request</option>
                  <option value="receipt">Sales Receipt / Transaction</option>
                  <option value="inventory">Inventory Audit Marker</option>
                  <option value="promotion">Promo Discount code</option>
                </select>
              </div>

              {/* Dynamic Sub-selection forms */}
              {qrType === 'product' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold">Select Product</label>
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  >
                    <option value="">-- Choose Product --</option>
                    {store.products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (GHS {p.sellingPrice})</option>
                    ))}
                  </select>
                </div>
              )}

              {qrType === 'shelf' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold">Shelf / Location Identifier</label>
                  <input
                    type="text"
                    value={shelfLocation}
                    onChange={e => setShelfLocation(e.target.value)}
                    placeholder="e.g. Aisle 3, Row B"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              )}

              {qrType === 'customer' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold">Customer Full Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Ama Serwaa"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              )}

              {qrType === 'staff' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold">Account Access Level</label>
                  <select
                    value={staffRole}
                    onChange={e => setStaffRole(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="owner">Owner / Proprietor</option>
                    <option value="manager">Store Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="inventory">Inventory Clerk</option>
                  </select>
                </div>
              )}

              {qrType === 'payment' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold">Request Amount (GHS)</label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              )}

              {qrType === 'receipt' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-muted-foreground uppercase font-bold">Select Receipt / Sale</label>
                  <select
                    value={selectedSaleId}
                    onChange={e => setSelectedSaleId(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  >
                    <option value="">-- Choose Transaction --</option>
                    {store.sales.slice(0, 10).map(s => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.date).toLocaleDateString()} - GHS {s.total} (#{s.id.substring(0, 6)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {qrType === 'promotion' && (
                <div className="grid grid-cols-2 gap-3 animate-fade-in">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-muted-foreground uppercase font-bold">Promo Code</label>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value)}
                      placeholder="FESTIVE20"
                      className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-muted-foreground uppercase font-bold">Discount %</label>
                    <select
                      value={promoDiscount}
                      onChange={e => setPromoDiscount(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    >
                      <option value="5">5% Off</option>
                      <option value="10">10% Off</option>
                      <option value="15">15% Off</option>
                      <option value="20">20% Off</option>
                      <option value="25">25% Off</option>
                      <option value="50">50% Off</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-4 py-3 rounded-xl bg-primary hover:brightness-110 text-primary-foreground font-display font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate Premium Branded QR
              </button>
            </form>
          </div>

          {/* QR Display Card */}
          <div className="flex items-center justify-center">
            {generatedPayload ? (
              <QRDisplayCard
                encodedData={generatedPayload}
                storeName={store.storeName}
                storeId={store.accessCode}
                type={qrType}
                payloadLabel={displayLabel}
              />
            ) : (
              <div className="w-full max-w-sm rounded-3xl border border-dashed border-border/80 bg-surface-1/40 p-12 text-center flex flex-col items-center justify-center gap-3 min-h-[360px]">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted-foreground mb-2">
                  <QrCode className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="font-display font-bold text-sm text-foreground">Waiting for generation</h3>
                <p className="text-[11px] text-muted-foreground max-w-[200px]">Configure details and hit submit to view the premium branded card layout.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-md mx-auto bg-surface-1 border border-border rounded-2xl p-6 shadow-sm space-y-6 text-center">
          
          {/* Scan hub portal */}
          {!scannedResult ? (
            <div className="py-8 space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-foreground mb-1">Verify Secure Tokens</h3>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">Click below to open the secure camera scanning console and capture tags.</p>
              </div>

              <button
                onClick={() => setScannerOpen(true)}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs hover:brightness-110 cursor-pointer shadow-md transition flex items-center justify-center gap-2 mx-auto active:scale-95"
              >
                <Camera className="w-4 h-4" /> Open Camera Scanner
              </button>
            </div>
          ) : (
            <div className="space-y-5 text-left animate-scale-up">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5 uppercase">
                  ✓ Scanned Valid Token
                </h3>
                <button
                  onClick={() => {
                    setScannedResult(null);
                    setRawScannedText('');
                  }}
                  className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                >
                  Clear scan
                </button>
              </div>

              {/* Scanned Details Cards */}
              <div className="p-4 rounded-xl bg-[#111111] border border-[#FFC72C]/20 shadow-sm space-y-3 font-mono text-[11px]">
                <div className="grid grid-cols-3 border-b border-white/5 pb-2">
                  <span className="text-neutral-500 font-sans">TYPE:</span>
                  <span className="text-white col-span-2 capitalize flex items-center gap-1">
                    {scannedResult.type === 'product' && <ShoppingCart className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'customer' && <Users className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'staff' && <Users className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'payment' && <CreditCard className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'receipt' && <Receipt className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'inventory' && <Database className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'promotion' && <Tag className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type === 'shelf' && <LayoutGrid className="w-3.5 h-3.5 text-primary" />}
                    {scannedResult.type}
                  </span>
                </div>
                <div className="grid grid-cols-3 border-b border-white/5 pb-2">
                  <span className="text-neutral-500 font-sans">ORIGIN STORE:</span>
                  <span className="text-white col-span-2">{scannedResult.storeId}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-white/5 pb-2">
                  <span className="text-neutral-500 font-sans">TOKEN ID:</span>
                  <span className="text-white col-span-2 truncate">{scannedResult.token}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-white/5 pb-2">
                  <span className="text-neutral-500 font-sans">TIMESTAMP:</span>
                  <span className="text-white col-span-2">{new Date(scannedResult.timestamp).toLocaleString()}</span>
                </div>

                {/* Encoded payload parameters */}
                <div className="pt-2">
                  <span className="text-neutral-500 font-sans block mb-1">DECODED DATA:</span>
                  <div className="bg-[#141414] p-3 rounded-lg border border-white/5 text-[10px] text-green-400 overflow-x-auto">
                    {JSON.stringify(scannedResult.payload, null, 2)}
                  </div>
                </div>
              </div>

              {/* Quick Navigation based on types */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    setScannedResult(null);
                    setRawScannedText('');
                    setScannerOpen(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-surface-2 border border-border text-foreground hover:bg-surface-3 font-display font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" /> Scan Another QR Code
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeMode === 'analytics' && (
        <div className="space-y-4">
          {(() => {
            const events = store.scanEvents || [];
            const sevenDaysAgo = Date.now() - 7 * 86400000;
            const last7 = events.filter(e => new Date(e.date).getTime() >= sevenDaysAgo);
            const qrCount = events.filter(e => e.kind === 'qr').length;
            const barcodeCount = events.filter(e => e.kind === 'barcode').length;
            const matchedCount = events.filter(e => e.matched).length;
            const matchRate = events.length > 0 ? Math.round((matchedCount / events.length) * 100) : 0;

            const productCounts = new Map<string, { name: string; count: number }>();
            events.filter(e => e.productId).forEach(e => {
              const existing = productCounts.get(e.productId!) || { name: e.productName || 'Unknown', count: 0 };
              existing.count++;
              productCounts.set(e.productId!, existing);
            });
            const topScanned = Array.from(productCounts.values()).sort((a, b) => b.count - a.count).slice(0, 5);

            if (events.length === 0) {
              return (
                <div className="p-8 rounded-2xl bg-surface-2/40 border border-border/40 text-center">
                  <Database className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-display font-bold text-sm">No scans recorded yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Once you or your customers start scanning QR codes or barcodes, activity will show up here.</p>
                </div>
              );
            }

            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Scans (7 days)</p>
                    <p className="font-display font-bold text-xl mt-0.5">{last7.length}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Scans</p>
                    <p className="font-display font-bold text-xl mt-0.5">{events.length}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">QR vs Barcode</p>
                    <p className="font-display font-bold text-sm mt-0.5">{qrCount} / {barcodeCount}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Match Rate</p>
                    <p className={`font-display font-bold text-xl mt-0.5 ${matchRate < 70 ? 'text-warning' : 'text-success'}`}>{matchRate}%</p>
                  </div>
                </div>

                {topScanned.length > 0 && (
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <h3 className="font-display font-bold text-sm mb-2">Most Scanned Products</h3>
                    <div className="space-y-1.5">
                      {topScanned.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{i + 1}. {p.name}</span>
                          <span className="text-muted-foreground font-mono">{p.count} scans</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-card border border-border">
                  <h3 className="font-display font-bold text-sm mb-2">Recent Activity</h3>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {events.slice(0, 20).map(e => (
                      <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="text-foreground">
                          {e.kind === 'qr' ? '📱' : '📊'} {e.productName || e.purpose} {!e.matched && <span className="text-muted-foreground">(not recognized)</span>}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">{new Date(e.date).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Camera scanner overlay */}
      {scannerOpen && (
        <QRScannerPage
          onScanSuccess={handleScanSuccess}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}
