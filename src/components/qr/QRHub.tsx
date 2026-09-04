import { useState } from 'react';
import { Camera, QrCode, Sparkles, ShoppingCart, Users, Tag, CreditCard, Receipt, Database, LayoutGrid } from 'lucide-react';
import { StoreData } from '@/types/store';
import { encodeQRData, decodeQRData, QRData, parseScannedQRText } from '@/lib/qr-code';
import { logScanEvent } from '@/lib/store-data';
import QRDisplayCard from './QRDisplayCard';
import QRScannerPage from './QRScannerPage';
import QRAnalyticsPanel from './QRAnalyticsPanel';
import { showToast } from '@/components/Toast';

interface QRHubProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  currentUser?: any;
  orders?: any[];
}

type QRType = 'store' | 'product' | 'shelf' | 'customer' | 'staff' | 'payment' | 'receipt' | 'inventory' | 'promotion';

export default function QRHub({ store, onUpdate, currentUser: _currentUser, orders = [] }: QRHubProps) {
  const [activeMode, setActiveMode] = useState<'scan' | 'generate' | 'analytics'>('generate');
  const [qrType, setQrType] = useState<QRType>('store');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [staffRole, setStaffRole] = useState('manager');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('10');
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [displayLabel, setDisplayLabel] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<QRData | null>(null);
  const [rawScannedText, setRawScannedText] = useState('');

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    let label = '';
    let payloadData: any = {};
    switch (qrType) {
      case 'store': label = store.storeName; payloadData = { name: store.storeName, category: store.category }; break;
      case 'product': { const prod = store.products.find(p => p.id === selectedProductId); if (!prod) return showToast('Please select a product', 'error'); label = prod.name; payloadData = { id: prod.id, name: prod.name, price: prod.sellingPrice, sku: prod.barcode || '' }; break; }
      case 'shelf': if (!shelfLocation.trim()) return showToast('Enter shelf location', 'error'); label = shelfLocation; payloadData = { location: shelfLocation.trim() }; break;
      case 'customer': if (!customerName.trim()) return showToast('Enter customer name', 'error'); label = customerName; payloadData = { name: customerName.trim() }; break;
      case 'staff': label = `Staff Account (${staffRole})`; payloadData = { role: staffRole }; break;
      case 'payment': if (!paymentAmount || Number(paymentAmount) <= 0) return showToast('Enter a valid amount', 'error'); label = `Pay ₦${paymentAmount}`; payloadData = { amount: Number(paymentAmount), currency: 'NGN' }; break;
      case 'receipt': { const sale = store.sales.find(s => s.id === selectedSaleId); if (!sale) return showToast('Please select a receipt', 'error'); label = `Receipt #${sale.id.substring(0, 6)}`; payloadData = { id: sale.id, total: sale.total, date: sale.date }; break; }
      case 'inventory': label = 'Inventory Audit'; payloadData = { auditDate: new Date().toISOString() }; break;
      case 'promotion': if (!promoCode.trim()) return showToast('Enter promo code', 'error'); label = `${promoCode} (-${promoDiscount}%)`; payloadData = { code: promoCode.trim().toUpperCase(), discount: Number(promoDiscount) }; break;
    }
    const tokenPayload = encodeQRData({ version: 1, storeId: store.accessCode, timestamp: Date.now(), type: qrType, payload: payloadData });
    setDisplayLabel(label);
    setGeneratedPayload(tokenPayload);
    showToast(`Secure QR Code generated for ${qrType}!`, 'success');
  };

  const handleScanSuccess = (decodedText: string) => {
    setScannerOpen(false);
    setRawScannedText(decodedText);
    const parsed = decodeQRData(decodedText);
    if (parsed) {
      setScannedResult(parsed);
      onUpdate(logScanEvent(store, { kind: 'qr', purpose: parsed.type || 'unknown', productId: parsed.payload?.id, productName: parsed.payload?.name, matched: true }));
      return;
    }
    const urlParsed = parseScannedQRText(decodedText);
    if (urlParsed) {
      const syntheticResult: QRData = { version: 1, uuid: 'url-scan', token: urlParsed.source, storeId: urlParsed.storeId, timestamp: Date.now(), type: urlParsed.productId ? 'product' : 'store', payload: { scannedUrl: decodedText, ...(urlParsed.productId ? { productId: urlParsed.productId } : {}) } };
      setScannedResult(syntheticResult);
      showToast(`StoreFlow ${urlParsed.productId ? 'product' : 'store'} QR identified!`, 'success');
      onUpdate(logScanEvent(store, { kind: 'qr', purpose: urlParsed.productId ? 'product' : 'store', productId: urlParsed.productId, matched: true }));
      return;
    }
    setScannedResult(null);
    showToast('Decoded QR is not a valid StoreFlow token or URL', 'warning');
    onUpdate(logScanEvent(store, { kind: 'qr', purpose: 'unrecognized', matched: false }));
  };

  if (scannerOpen) return <QRScannerPage onScanSuccess={handleScanSuccess} onClose={() => setScannerOpen(false)} />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2"><QrCode className="w-6 h-6 text-primary" /> QR Workspace</h1>
          <p className="text-xs text-muted-foreground">Generate, scan and manage StoreFlow QR codes.</p>
        </div>
        <div className="flex p-1 rounded-xl bg-surface-2 border border-border/80 self-start text-xs font-semibold">
          <button onClick={() => { setActiveMode('generate'); setScannedResult(null); }} className={`px-4 py-2 rounded-lg flex items-center gap-1.5 ${activeMode === 'generate' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground'}`}><Sparkles className="w-3.5 h-3.5" /> Generate</button>
          <button onClick={() => { setActiveMode('scan'); setGeneratedPayload(null); }} className={`px-4 py-2 rounded-lg flex items-center gap-1.5 ${activeMode === 'scan' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground'}`}><Camera className="w-3.5 h-3.5" /> Scan</button>
          <button onClick={() => setActiveMode('analytics')} className={`px-4 py-2 rounded-lg flex items-center gap-1.5 ${activeMode === 'analytics' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground'}`}><Database className="w-3.5 h-3.5" /> Analytics</button>
        </div>
      </div>

      {activeMode === 'generate' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="bg-surface-1 border border-border rounded-2xl p-6 shadow-sm space-y-5 text-left">
            <div><h2 className="font-display font-bold text-sm text-foreground mb-1 uppercase tracking-wide">1. Select Target Type</h2><p className="text-[11px] text-muted-foreground">Choose the entity you want to generate a QR Code for.</p></div>
            <form onSubmit={handleGenerate} className="space-y-4">
              <select value={qrType} onChange={e => { setQrType(e.target.value as QRType); setGeneratedPayload(null); }} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs">
                <option value="store">Store Front / Check-In</option><option value="product">Product Details / SKU</option><option value="shelf">Shelf / Location tag</option><option value="customer">Customer Loyalty Account</option><option value="staff">Staff Authorization badge</option><option value="payment">Direct Payment Request</option><option value="receipt">Sales Receipt / Transaction</option><option value="inventory">Inventory Audit Marker</option><option value="promotion">Promo Discount code</option>
              </select>
              {qrType === 'product' && <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs" required><option value="">Choose Product</option>{store.products.map(p => <option key={p.id} value={p.id}>{p.name} (₦{p.sellingPrice})</option>)}</select>}
              {qrType === 'shelf' && <input value={shelfLocation} onChange={e => setShelfLocation(e.target.value)} placeholder="e.g. Aisle 3, Row B" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs" required />}
              {qrType === 'customer' && <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer full name" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs" required />}
              {qrType === 'staff' && <select value={staffRole} onChange={e => setStaffRole(e.target.value)} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs"><option value="owner">Owner</option><option value="manager">Manager</option><option value="cashier">Cashier</option><option value="inventory">Inventory Clerk</option></select>}
              {qrType === 'payment' && <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Amount" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs" required />}
              {qrType === 'receipt' && <select value={selectedSaleId} onChange={e => setSelectedSaleId(e.target.value)} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs" required><option value="">Choose transaction</option>{store.sales.slice(0, 10).map(s => <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} - ₦{s.total}</option>)}</select>}
              {qrType === 'promotion' && <div className="grid grid-cols-2 gap-3"><input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="PROMO20" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs" required /><select value={promoDiscount} onChange={e => setPromoDiscount(e.target.value)} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs"><option value="5">5%</option><option value="10">10%</option><option value="20">20%</option><option value="30">30%</option></select></div>}
              <button type="submit" className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm">Generate QR</button>
            </form>
          </div>
          {generatedPayload && <QRDisplayCard encodedData={generatedPayload} storeName={store.storeName} storeId={store.storeId || store.accessCode} type={qrType} payloadLabel={displayLabel} />}
        </div>
      ) : activeMode === 'scan' ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <Camera className="w-10 h-10 mx-auto text-primary" /><h2 className="font-display font-bold">Scan a StoreFlow Code</h2><p className="text-xs text-muted-foreground">Scan a store, product or supported QR code.</p><button onClick={() => setScannerOpen(true)} className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold">Open Scanner</button>
          {scannedResult && <div className="p-4 rounded-xl bg-success/5 border border-success/20 text-left"><p className="text-xs font-bold text-success">Recognized: {scannedResult.type}</p><p className="text-xs text-muted-foreground mt-1">Store: {scannedResult.storeId}</p>{rawScannedText && <p className="text-[10px] text-muted-foreground break-all mt-1">{rawScannedText}</p>}</div>}
        </div>
      ) : (
        <QRAnalyticsPanel store={store} />
      )}
    </div>
  );
}
