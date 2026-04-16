import { useState } from 'react';
import { StoreData, Sale } from '@/types/store';

interface SaleReceiptProps {
  store: StoreData;
  sale: Sale;
  onClose: () => void;
}

export default function SaleReceipt({ store, sale, onClose }: SaleReceiptProps) {
  const profile = store.profile;
  const date = new Date(sale.date);
  const [buyerPhone, setBuyerPhone] = useState('');

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

  const handleWhatsAppShare = () => {
    if (!buyerPhone) return;
    const text = encodeURIComponent(generateReceiptText());
    const phone = buyerPhone.replace(/\D/g, ''); // Remove non-digits
    const whatsappUrl = `https://wa.me/${phone}?text=${text}`;
    window.open(whatsappUrl, '_blank');
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

        {/* Buyer Phone Input for WhatsApp */}
        <div className="mt-4">
          <label className="block text-sm text-muted-foreground mb-1.5">Buyer&apos;s WhatsApp Number</label>
          <input
            type="tel"
            value={buyerPhone}
            onChange={e => setBuyerPhone(e.target.value)}
            placeholder="e.g. +2348012345678"
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            onClick={handleShare}
            className="p-3 rounded-lg bg-surface-2 border border-border text-foreground font-display font-semibold hover:bg-surface-3 transition-colors text-xs"
          >
            📤 Share
          </button>
          <button
            onClick={handleWhatsAppShare}
            disabled={!buyerPhone}
            className="p-3 rounded-lg bg-success text-success-foreground font-display font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-xs"
          >
            💬 WhatsApp
          </button>
          <button
            onClick={onClose}
            className="p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity text-xs"
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
