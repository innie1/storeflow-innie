import { useState } from 'react';
import { StoreData } from '@/types/store';
import { printReceipt } from '@/lib/print-engine';
import { showToast } from '@/components/Toast';
import StoreLogo from '@/components/StoreLogo';

interface OrderReceiptProps {
  store: StoreData;
  order: any;
  onClose: () => void;
}

// Receipt view for a single marketplace Order (as opposed to SaleReceipt,
// which is for in-store POS sales). Reuses the store's existing receipt
// branding/print settings from managerSettings so both receipt types stay
// visually consistent without duplicating the template editor.
export default function OrderReceipt({ store, order, onClose }: OrderReceiptProps) {
  const profile = store.profile;
  const settings = store.managerSettings || {};
  const date = new Date(order?.created_at || Date.now());
  const [buyerPhone, setBuyerPhone] = useState(order?.customer_phone || '');

  const status = (order?.status || '').trim();
  const normStatus = status.toLowerCase();
  const isCancelled = normStatus === 'cancelled';
  const isRejected = normStatus === 'rejected';

  const parseNotes = (notesStr?: string) => {
    if (!notesStr || typeof notesStr !== 'string') return null;
    try { return JSON.parse(notesStr); } catch { return { instructions: notesStr }; }
  };
  const meta = parseNotes(order?.notes) || {};

  const items = (order?.order_items || []).map((item: any) => {
    const product = store.products?.find((p: any) => p.id === item.product_id);
    return {
      productName: item.item_name || item.product_name || product?.name || 'Item',
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.price) || 0,
      total: Number(item.subtotal ?? (item.price * item.quantity)) || 0,
    };
  });

  const subtotal = items.reduce((sum: number, i: any) => sum + i.total, 0);
  const total = Number(order?.total ?? subtotal) || 0;

  const generateReceiptText = () => {
    let receipt = `==============================\n`;
    receipt += `       ${settings.receiptStoreName || store.storeName}\n`;
    if (profile?.storeType) receipt += `       ${profile.storeType}\n`;
    if (settings.receiptAddress || profile?.location) receipt += `  ${settings.receiptAddress || profile?.location}\n`;
    if (settings.receiptPhone || profile?.phone) receipt += `  Tel: ${settings.receiptPhone || profile?.phone}\n`;
    receipt += `==============================\n`;
    receipt += `Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`;
    receipt += `Order #: ${order?.order_number || ''}\n`;
    if (order?.customer_name) receipt += `Customer: ${order.customer_name}\n`;
    receipt += `------------------------------\n`;
    items.forEach((i: any) => {
      receipt += `${i.productName}\n`;
      receipt += `  ${i.quantity} × ₦${i.unitPrice.toLocaleString()} = ₦${i.total.toLocaleString()}\n`;
    });
    receipt += `------------------------------\n`;
    // Without these the receipt's items never add up to its total on any
    // discounted or delivered order. The customer app records them in the
    // order notes; nothing here used to read them.
    if (Number(meta?.online_discount) > 0) receipt += `Online discount: -₦${Number(meta.online_discount).toLocaleString()}
`;
    if (Number(meta?.loyalty_discount) > 0) receipt += `Loyalty: -₦${Number(meta.loyalty_discount).toLocaleString()}
`;
    if (Number(meta?.delivery_fee) > 0) receipt += `Delivery: +₦${Number(meta.delivery_fee).toLocaleString()}
`;
    receipt += `TOTAL: ₦${total.toLocaleString()}\n`;
    receipt += `==============================\n`;
    if (isCancelled) {
      receipt += `CANCELLED BY CUSTOMER\n`;
      if (meta?.customer_cancel_reason) receipt += `Reason: ${meta.customer_cancel_reason}\n`;
      receipt += `==============================\n`;
    } else if (isRejected && meta?.rejection_reason) {
      receipt += `REJECTED — Reason: ${meta.rejection_reason}\n`;
      receipt += `==============================\n`;
    } else {
      receipt += `  ${settings.receiptFooterMessage || 'Thank you for your patronage! 🙏'}\n`;
    }
    return receipt;
  };

  const handleShare = async () => {
    const text = generateReceiptText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Order Receipt #${order?.order_number || ''}`, text });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Receipt text copied to clipboard');
    }
  };

  const handleWhatsAppShare = () => {
    if (!buyerPhone) return;
    const text = encodeURIComponent(generateReceiptText());
    const phone = buyerPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const handlePrint = () => {
    const receiptData = {
      storeName: settings.receiptStoreName || store.storeName,
      storeType: profile?.storeType,
      storeAddress: settings.receiptAddress || profile?.location,
      storePhone: settings.receiptPhone || profile?.phone,
      email: profile?.email,
      logoStyle: profile?.logoStyle || 'minimalist',
      storePhoto: settings.receiptLogoEnabled && profile?.photo ? profile.photo : undefined,
      receiptNumber: order?.order_number || order?.id || '',
      date: order?.created_at || new Date().toISOString(),
      items,
      subtotal,
      discount: 0,
      total,
      paid: total,
      balance: 0,
      paymentMethod: order?.payment_method || 'transfer',
      footerMessage: isCancelled
        ? `CANCELLED BY CUSTOMER${meta?.customer_cancel_reason ? ' — ' + meta.customer_cancel_reason : ''}`
        : (settings.receiptFooterMessage || 'Thank you for your patronage! 🙏'),
      receiptCurrency: settings.receiptCurrency || '₦',
    };
    printReceipt(receiptData, settings.receiptWidth || '58mm', settings.printMethod || 'system')
      .then(({ usedFallback }) => {
        if (usedFallback) showToast('Bluetooth printer unavailable — sent to system print instead', 'info');
      })
      .catch(err => {
        showToast('Printing failed: ' + err.message, 'error');
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl p-5 animate-slide-up flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display font-bold text-lg">Order Receipt</h3>

        <div className="bg-background border border-border rounded-lg p-4 font-mono text-xs space-y-2 text-left max-h-[55vh] overflow-y-auto">
          <div className="flex justify-center mb-2">
            {settings.receiptLogoEnabled && profile?.photo ? (
              <img src={profile.photo} alt="Logo" className="w-12 h-12 object-contain rounded-full border border-border" />
            ) : (
              <StoreLogo
                storeName={settings.receiptStoreName || store.storeName}
                selectedStyle={profile?.logoStyle || 'minimalist'}
                className="w-48 h-auto"
              />
            )}
          </div>

          <div className="text-center space-y-0.5">
            {profile?.storeType && <p className="text-muted-foreground">{profile.storeType}</p>}
            {(settings.receiptAddress || profile?.location) && (
              <p className="text-muted-foreground">{settings.receiptAddress || profile?.location}</p>
            )}
            {(settings.receiptPhone || profile?.phone) && (
              <p className="text-muted-foreground">Tel: {settings.receiptPhone || profile?.phone}</p>
            )}
          </div>

          <div className="border-t border-dashed border-border my-2" />

          <div className="flex justify-between text-muted-foreground">
            <span>{date.toLocaleDateString()}</span>
            <span>{date.toLocaleTimeString()}</span>
          </div>
          <p className="text-muted-foreground">Order #: {order?.order_number}</p>
          {order?.customer_name && <p className="text-muted-foreground">Customer: {order.customer_name}</p>}

          <div className="border-t border-dashed border-border my-2" />

          <div className="space-y-3">
            {items.map((i: any, idx: number) => (
              <div key={idx}>
                <p className="text-foreground font-semibold">{i.productName}</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>{i.quantity} × ₦{i.unitPrice.toLocaleString()}</span>
                  <span>₦{i.total.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-border my-2" />

          {Number(meta?.online_discount) > 0 && (
            <div className="flex justify-between text-xs text-emerald-600">
              <span>Online discount</span><span>−₦{Number(meta.online_discount).toLocaleString()}</span>
            </div>
          )}
          {Number(meta?.loyalty_discount) > 0 && (
            <div className="flex justify-between text-xs text-emerald-600">
              <span>Loyalty</span><span>−₦{Number(meta.loyalty_discount).toLocaleString()}</span>
            </div>
          )}
          {Number(meta?.delivery_fee) > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Delivery</span><span>+₦{Number(meta.delivery_fee).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-foreground text-sm">
            <span>TOTAL</span>
            <span className="text-primary">₦{total.toLocaleString()}</span>
          </div>

          <div className="border-t border-dashed border-border my-2" />

          {isCancelled ? (
            <div className="text-center bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-2 space-y-0.5">
              <p className="font-bold">CANCELLED BY CUSTOMER</p>
              {meta?.customer_cancel_reason && <p>Reason: {meta.customer_cancel_reason}</p>}
            </div>
          ) : isRejected && meta?.rejection_reason ? (
            <div className="text-center bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-2">
              <p className="font-bold">REJECTED</p>
              <p>Reason: {meta.rejection_reason}</p>
            </div>
          ) : (
            <p className="text-center text-muted-foreground leading-normal">
              {settings.receiptFooterMessage || 'Thank you for your patronage! 🙏'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-muted-foreground text-left mb-1">Customer&apos;s WhatsApp Number</label>
          <input
            type="tel"
            value={buyerPhone}
            onChange={e => setBuyerPhone(e.target.value)}
            placeholder="e.g. +2348012345678"
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handlePrint}
            className="p-2.5 rounded-lg bg-[#E8C34E] text-slate-950 font-display font-bold hover:opacity-90 transition-opacity text-xs flex items-center justify-center gap-1.5"
          >
            🖨️ Print
          </button>
          <button
            onClick={handleWhatsAppShare}
            disabled={!buyerPhone}
            className="p-2.5 rounded-lg bg-success text-success-foreground font-display font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center gap-1.5"
          >
            💬 WhatsApp
          </button>
          <button
            onClick={handleShare}
            className="p-2.5 rounded-lg bg-surface-2 border border-border text-foreground font-display font-semibold hover:bg-surface-3 transition-colors text-xs flex items-center justify-center gap-1.5"
          >
            📤 Share / Copy
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-lg bg-slate-700 text-white font-display font-bold hover:opacity-90 transition-opacity text-xs flex items-center justify-center"
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
}
