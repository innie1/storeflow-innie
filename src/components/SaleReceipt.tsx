import { StoreData, Sale } from '@/types/store';

interface SaleReceiptProps {
  store: StoreData;
  sale: Sale;
  onClose: () => void;
}

export default function SaleReceipt({ store, sale, onClose }: SaleReceiptProps) {
  const profile = store.profile;
  const date = new Date(sale.date);

  const handleShare = async () => {
    const text = generateReceiptText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Receipt - ${store.storeName}`, text });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  const generateReceiptText = () => {
    let receipt = `==============================\n`;
    receipt += `       ${store.storeName}\n`;
    if (profile?.storeType) receipt += `       ${profile.storeType}\n`;
    if (profile?.location) receipt += `  ${profile.location}\n`;
    if (profile?.phone) receipt += `  Tel: ${profile.phone}\n`;
    if (profile?.email) receipt += `  ${profile.email}\n`;
    receipt += `==============================\n`;
    receipt += `Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`;
    receipt += `Receipt #: ${sale.id.toUpperCase()}\n`;
    receipt += `------------------------------\n`;
    receipt += `${sale.productName}\n`;
    receipt += `  ${sale.quantity} × ₦${sale.unitPrice.toLocaleString()} = ₦${sale.total.toLocaleString()}\n`;
    receipt += `------------------------------\n`;
    receipt += `TOTAL: ₦${sale.total.toLocaleString()}\n`;
    receipt += `==============================\n`;
    receipt += `  Thank you for your patronage!\n`;
    return receipt;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Receipt */}
        <div className="bg-background border border-border rounded-lg p-4 font-mono text-xs space-y-2">
          <div className="text-center space-y-0.5">
            <p className="font-display font-bold text-base text-primary">{store.storeName}</p>
            {profile?.storeType && <p className="text-muted-foreground">{profile.storeType}</p>}
            {profile?.location && <p className="text-muted-foreground">{profile.location}</p>}
            {profile?.phone && <p className="text-muted-foreground">Tel: {profile.phone}</p>}
            {profile?.email && <p className="text-muted-foreground">{profile.email}</p>}
          </div>

          <div className="border-t border-dashed border-border my-2" />

          <div className="flex justify-between text-muted-foreground">
            <span>{date.toLocaleDateString()}</span>
            <span>{date.toLocaleTimeString()}</span>
          </div>
          <p className="text-muted-foreground">Receipt #: {sale.id.slice(0, 8).toUpperCase()}</p>

          <div className="border-t border-dashed border-border my-2" />

          <div>
            <p className="text-foreground font-semibold">{sale.productName}</p>
            <div className="flex justify-between text-muted-foreground">
              <span>{sale.quantity} × ₦{sale.unitPrice.toLocaleString()}</span>
              <span>₦{sale.total.toLocaleString()}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-border my-2" />

          <div className="flex justify-between font-bold text-foreground text-sm">
            <span>TOTAL</span>
            <span className="text-primary">₦{sale.total.toLocaleString()}</span>
          </div>

          <div className="border-t border-dashed border-border my-2" />

          <p className="text-center text-muted-foreground">Thank you for your patronage! 🙏</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={handleShare}
            className="p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity text-sm"
          >
            📤 Share Receipt
          </button>
          <button
            onClick={onClose}
            className="p-3 rounded-lg bg-surface-2 border border-border text-foreground font-display font-semibold hover:bg-surface-3 transition-colors text-sm"
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
