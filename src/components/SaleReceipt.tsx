import { useState, useRef } from 'react';
import { StoreData, Sale } from '@/types/store';
import { printReceipt } from '@/lib/print-engine';
import { showToast } from '@/components/Toast';
import StoreLogo from '@/components/StoreLogo';
import { drawQRCode, encodeQRData } from '@/lib/qr-code';

interface SaleReceiptProps {
  store: StoreData;
  sale: Sale | Sale[];
  onClose: () => void;
  onUpdateStore?: (store: StoreData) => void;
}

export default function SaleReceipt({ store, sale, onClose, onUpdateStore }: SaleReceiptProps) {
  const profile = store.profile;
  const salesList = Array.isArray(sale) ? sale : [sale];
  const date = new Date(salesList[0]?.date || Date.now());
  const [buyerPhone, setBuyerPhone] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const settings = store.managerSettings || {};

  const subtotalBeforeDiscount = salesList.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);
  const totalAfterDiscount = salesList.reduce((sum, s) => sum + s.total, 0);
  const totalDiscount = Math.max(0, subtotalBeforeDiscount - totalAfterDiscount);

  const generateReceiptText = () => {
    let receipt = `==============================\n`;
    receipt += `       ${settings.receiptStoreName || store.storeName}\n`;
    if (profile?.storeType) receipt += `       ${profile.storeType}\n`;
    if (settings.receiptAddress || profile?.location) receipt += `  ${settings.receiptAddress || profile?.location}\n`;
    if (settings.receiptPhone || profile?.phone) receipt += `  Tel: ${settings.receiptPhone || profile?.phone}\n`;
    if (profile?.email) receipt += `  ${profile.email}\n`;
    if (settings.receiptWebsite) receipt += `  Web: ${settings.receiptWebsite}\n`;
    if (settings.receiptWhatsApp) receipt += `  WA: ${settings.receiptWhatsApp}\n`;
    receipt += `==============================\n`;
    receipt += `Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`;
    const receiptNum = salesList[0]?.transactionId || salesList[0]?.id || '';
    receipt += `Receipt #: ${receiptNum.toUpperCase()}\n`;
    receipt += `------------------------------\n`;
    salesList.forEach(s => {
      receipt += `${s.productName}\n`;
      receipt += `  ${s.quantity} × ₦${s.unitPrice.toLocaleString()} = ₦${s.total.toLocaleString()}\n`;
    });
    receipt += `------------------------------\n`;
    if (totalDiscount > 0) {
      receipt += `Subtotal: ₦${subtotalBeforeDiscount.toLocaleString()}\n`;
      receipt += `Discount: -₦${totalDiscount.toLocaleString()}\n`;
    }
    receipt += `TOTAL: ₦${totalAfterDiscount.toLocaleString()}\n`;
    receipt += `==============================\n`;
    receipt += `  ${settings.receiptFooterMessage || 'Thank you for your patronage! 🙏'}\n`;
    return receipt;
  };

  const handleShare = async () => {
    const text = generateReceiptText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Receipt - ${settings.receiptStoreName || store.storeName}`, text });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Receipt text copied to clipboard');
    }
  };

  const handleWhatsAppShare = () => {
    if (!buyerPhone) return;
    const text = encodeURIComponent(generateReceiptText());
    const phone = buyerPhone.replace(/\D/g, ''); // Remove non-digits
    const whatsappUrl = `https://wa.me/${phone}?text=${text}`;
    window.open(whatsappUrl, '_blank');
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
      receiptNumber: salesList[0]?.transactionId || salesList[0]?.id || '',
      date: salesList[0]?.date || new Date().toISOString(),
      items: salesList.map(s => ({
        productName: s.productName,
        name: s.productName,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        total: s.total
      })),
      subtotal: subtotalBeforeDiscount,
      discount: totalDiscount,
      total: totalAfterDiscount,
      paid: totalAfterDiscount,
      balance: 0,
      paymentMethod: salesList[0]?.paymentMethod || 'transfer',
      footerMessage: settings.receiptFooterMessage || 'Thank you for your patronage! 🙏',
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'qr') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024) {
      showToast('Image must be under 100KB to save offline', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'logo') {
        const nextProfile = { ...(store.profile || {}), photo: base64 };
        const nextSettings = { ...(store.managerSettings || {}), receiptLogoEnabled: true };
        const updated = { ...store, profile: nextProfile, managerSettings: nextSettings };
        onUpdateStore?.(updated);
        showToast('✓ Store logo updated');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateBrandedQR = async () => {
    setGeneratingQR(true);
    try {
      const tmpCanvas = document.createElement('canvas');
      const encoded = encodeQRData({
        version: 1,
        storeId: store.accessCode,
        timestamp: Date.now(),
        type: 'store',
        payload: { name: store.storeName, uniqueCode: store.profile?.uniqueCode }
      });
      await drawQRCode({ text: encoded, canvas: tmpCanvas });
      const base64 = tmpCanvas.toDataURL('image/png');
      const nextSettings = { ...(store.managerSettings || {}), receiptQrCode: base64 };
      const updated = { ...store, managerSettings: nextSettings };
      onUpdateStore?.(updated);
      showToast('✓ Branded QR Code generated and applied to receipt!');
    } catch (err) {
      showToast('Failed to generate QR code', 'error');
    } finally {
      setGeneratingQR(false);
    }
  };

  const inputClass = "w-full p-2 rounded bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-xs";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full bg-card border border-border rounded-xl p-5 animate-slide-up flex flex-col transition-all duration-300 ${
          isEditing ? 'max-w-3xl md:flex-row gap-5' : 'max-w-sm gap-4'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Column 1: Receipt Preview */}
        <div className={isEditing ? 'md:w-1/2 flex flex-col justify-between' : 'w-full space-y-4'}>
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-display font-bold text-lg">Receipt Preview</h3>
            {onUpdateStore && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs text-primary font-semibold hover:underline bg-primary/10 px-2 py-1 rounded"
              >
                {isEditing ? '← View Preview' : '⚙️ Custom template'}
              </button>
            )}
          </div>

          <div className="bg-background border border-border rounded-lg p-4 font-mono text-xs space-y-2 text-left max-h-[50vh] overflow-y-auto">
            {settings.receiptLogoEnabled && profile?.photo ? (
              <div className="flex justify-center mb-2">
                <img src={profile.photo} alt="Logo" className="w-12 h-12 object-contain rounded-full border border-border" />
              </div>
            ) : (
              <div className="flex justify-center mb-2">
                <StoreLogo
                  storeName={settings.receiptStoreName || store.storeName}
                  selectedStyle={profile?.logoStyle || 'minimalist'}
                  className="w-48 h-auto"
                />
              </div>
            )}

            <div className="text-center space-y-0.5">
              {profile?.storeType && <p className="text-muted-foreground">{profile.storeType}</p>}
              {(settings.receiptAddress || profile?.location) && (
                <p className="text-muted-foreground">{settings.receiptAddress || profile?.location}</p>
              )}
              {(settings.receiptPhone || profile?.phone) && (
                <p className="text-muted-foreground">Tel: {settings.receiptPhone || profile?.phone}</p>
              )}
              {profile?.email && <p className="text-muted-foreground">{profile.email}</p>}
              {settings.receiptWebsite && (
                <p className="text-muted-foreground text-[10px] truncate">{settings.receiptWebsite}</p>
              )}
              {settings.receiptWhatsApp && (
                <p className="text-muted-foreground text-[10px]">WA: {settings.receiptWhatsApp}</p>
              )}
            </div>

            <div className="border-t border-dashed border-border my-2" />

            <div className="flex justify-between text-muted-foreground">
              <span>{date.toLocaleDateString()}</span>
              <span>{date.toLocaleTimeString()}</span>
            </div>
            <p className="text-muted-foreground">Receipt #: {(salesList[0]?.transactionId || salesList[0]?.id || '').slice(0, 8).toUpperCase()}</p>

            <div className="border-t border-dashed border-border my-2" />

            <div className="space-y-3">
              {salesList.map((s, idx) => (
                <div key={s.id || idx}>
                  <p className="text-foreground font-semibold">{s.productName}</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{s.quantity} × ₦{s.unitPrice.toLocaleString()}</span>
                    <span>₦{s.total.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-border my-2" />

            {totalDiscount > 0 ? (
              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>₦{subtotalBeforeDiscount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Discount</span>
                  <span>-₦{totalDiscount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-foreground text-sm border-t border-dashed border-border/40 pt-1 mt-1">
                  <span>TOTAL</span>
                  <span className="text-primary">₦{totalAfterDiscount.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between font-bold text-foreground text-sm">
                <span>TOTAL</span>
                <span className="text-primary">₦{totalAfterDiscount.toLocaleString()}</span>
              </div>
            )}

            <div className="border-t border-dashed border-border my-2" />

            <p className="text-center text-muted-foreground leading-normal">
              {settings.receiptFooterMessage || 'Thank you for your patronage! 🙏'}
            </p>

            {settings.receiptQrCode && (
              <div className="flex flex-col items-center pt-2">
                <img src={settings.receiptQrCode} alt="Scan QR" className="w-16 h-16 object-contain rounded border border-border p-0.5 bg-white mx-auto" />
                <span className="text-[8px] text-muted-foreground mt-1 text-center">Scan to pay / contact</span>
              </div>
            )}
          </div>

          {!isEditing && (
            <>
              {/* Buyer Phone Input */}
              <div>
                <label className="block text-xs text-muted-foreground text-left mb-1">Buyer&apos;s WhatsApp Number</label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={e => setBuyerPhone(e.target.value)}
                  placeholder="e.g. +2348012345678"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-2">
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
            </>
          )}
        </div>

        {/* Column 2: Template Editor Form */}
        {isEditing && (
          <div className="md:w-1/2 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-5 space-y-3.5 text-left max-h-[65vh] overflow-y-auto pr-1">
            <h3 className="font-display font-bold text-base text-primary">⚙️ Customize Receipt</h3>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Store Name</label>
                <input
                  type="text"
                  value={settings.receiptStoreName || ''}
                  onChange={e => {
                    const updated = { ...store, managerSettings: { ...settings, receiptStoreName: e.target.value } };
                    onUpdateStore?.(updated);
                  }}
                  placeholder={store.storeName}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Phone</label>
                  <input
                    type="text"
                    value={settings.receiptPhone || ''}
                    onChange={e => {
                      const updated = { ...store, managerSettings: { ...settings, receiptPhone: e.target.value } };
                      onUpdateStore?.(updated);
                    }}
                    placeholder={profile?.phone || 'No phone set'}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Website</label>
                  <input
                    type="text"
                    value={settings.receiptWebsite || ''}
                    onChange={e => {
                      const updated = { ...store, managerSettings: { ...settings, receiptWebsite: e.target.value } };
                      onUpdateStore?.(updated);
                    }}
                    placeholder={profile?.website || 'e.g. www.store.com'}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Address</label>
                <input
                  type="text"
                  value={settings.receiptAddress || ''}
                  onChange={e => {
                    const updated = { ...store, managerSettings: { ...settings, receiptAddress: e.target.value } };
                    onUpdateStore?.(updated);
                  }}
                  placeholder={profile?.location || 'No address set'}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">WhatsApp Line</label>
                  <input
                    type="text"
                    value={settings.receiptWhatsApp || ''}
                    onChange={e => {
                      const updated = { ...store, managerSettings: { ...settings, receiptWhatsApp: e.target.value } };
                      onUpdateStore?.(updated);
                    }}
                    placeholder="e.g. +23480..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Receipt Width</label>
                  <select
                    value={settings.receiptWidth || '58mm'}
                    onChange={e => {
                      const updated = { ...store, managerSettings: { ...settings, receiptWidth: e.target.value as any } };
                      onUpdateStore?.(updated);
                    }}
                    className="w-full p-2 rounded bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary text-foreground"
                  >
                    <option value="58mm">Thermal (58mm)</option>
                    <option value="80mm">Thermal (80mm)</option>
                    <option value="standard">Standard A4 / PDF</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Printer</label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...store, managerSettings: { ...settings, printMethod: 'system' as const } };
                      onUpdateStore?.(updated);
                    }}
                    className={`flex-1 p-2 rounded-lg border text-xs font-semibold ${(settings.printMethod || 'system') === 'system' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                  >
                    🖨️ System / WiFi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...store, managerSettings: { ...settings, printMethod: 'bluetooth' as const } };
                      onUpdateStore?.(updated);
                    }}
                    className={`flex-1 p-2 rounded-lg border text-xs font-semibold ${settings.printMethod === 'bluetooth' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                  >
                    🔵 Bluetooth
                  </button>
                </div>
                {settings.printMethod === 'bluetooth' && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Works with most 58mm/80mm ESC/POS Bluetooth thermal printers on Chrome or Edge (Android or desktop). Not supported on iPhone/Safari — those devices will automatically fall back to System print.
                    </p>
                    {settings.savedBluetoothPrinterName && (
                      <p className="text-[10px] text-success">Last connected: {settings.savedBluetoothPrinterName}</p>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { printBluetooth } = await import('@/lib/print-engine');
                          const name = await printBluetooth({
                            storeName: store.storeName,
                            receiptNumber: 'TEST-0001',
                            date: new Date().toLocaleString(),
                            items: [{ productName: 'Test Item', quantity: 1, unitPrice: 100, total: 100 }],
                            subtotal: 100, discount: 0, total: 100, paid: 100, balance: 0,
                            paymentMethod: 'cash',
                            footerMessage: 'This is a test print from Flow ✅',
                            receiptCurrency: settings.receiptCurrency || '₦',
                          }, settings.receiptWidth === '80mm' ? '80mm' : '58mm');
                          const updated = { ...store, managerSettings: { ...settings, savedBluetoothPrinterName: name } };
                          onUpdateStore?.(updated);
                          showToast(`Connected to ${name} — test receipt sent`);
                        } catch (err: any) {
                          showToast('Bluetooth pairing failed: ' + err.message, 'error');
                        }
                      }}
                      className="w-full p-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                    >
                      Pair Printer & Test Print
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Footer Message</label>
                <textarea
                  rows={2}
                  value={settings.receiptFooterMessage || ''}
                  onChange={e => {
                    const updated = { ...store, managerSettings: { ...settings, receiptFooterMessage: e.target.value } };
                    onUpdateStore?.(updated);
                  }}
                  placeholder="Thank you for your patronage! 🙏"
                  className="w-full p-2 rounded bg-surface-2 border border-border text-xs resize-none focus:outline-none focus:border-primary text-foreground"
                />
              </div>

              {/* Logo Upload */}
              <div className="p-2 rounded bg-surface-2/50 border border-border/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Store Logo</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.receiptLogoEnabled !== false}
                      onChange={e => {
                        const updated = { ...store, managerSettings: { ...settings, receiptLogoEnabled: e.target.checked } };
                        onUpdateStore?.(updated);
                      }}
                      className="rounded text-primary border-border focus:ring-primary h-3 w-3"
                    />
                    <span className="text-[10px]">Enable</span>
                  </label>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleFileChange(e, 'logo')}
                  className="block w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                />
              </div>

              {/* QR Code section */}
              <div className="p-2 rounded bg-surface-2/50 border border-border/60 space-y-2">
                <span className="text-xs font-semibold text-foreground block">Receipt QR Code</span>
                
                {/* Generate branded QR button */}
                <button
                  onClick={handleGenerateBrandedQR}
                  disabled={generatingQR}
                  className="w-full py-2 rounded-lg bg-[#111111] border border-[#FFC72C]/40 text-[#FFC72C] text-[11px] font-display font-bold hover:bg-[#1a1a1a] transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-sm"
                >
                  {generatingQR ? '⏳ Generating...' : '✨ Generate Branded StoreFlow QR'}
                </button>

                {settings.receiptQrCode && (
                  <div className="flex items-center gap-2">
                    <img src={settings.receiptQrCode} alt="Preview" className="w-12 h-12 rounded border border-[#FFC72C]/20 bg-white p-0.5" />
                    <button
                      onClick={() => {
                        const updated = { ...store, managerSettings: { ...settings, receiptQrCode: '' } };
                        onUpdateStore?.(updated);
                        showToast('✓ QR code removed');
                      }}
                      className="text-[9px] text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setIsEditing(false);
                showToast('✓ Receipt settings applied');
              }}
              className="w-full py-2.5 rounded bg-success text-white font-display font-bold text-xs hover:opacity-90"
            >
              ✓ Done & Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
