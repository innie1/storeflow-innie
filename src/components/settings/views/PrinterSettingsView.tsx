import { DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { Bluetooth, Wifi } from 'lucide-react';
import { SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function PrinterSettingsView({ s }: { s: SettingsState }) {
  const { store, onUpdate, setView } = s;
  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;
  const printMethod = settings.printMethod || 'system';
  const setPrintMethod = (method: 'system' | 'bluetooth') => {
    const updated = { ...store, managerSettings: { ...settings, printMethod: method } };
    onUpdate(updated);
    saveStore(updated);
  };
  return (
    <SubPage title="Printer Settings" onBack={() => setView('home')}>
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <h3 className="font-display font-bold text-sm">Receipt Printer</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            Choose how receipts print when you check out a sale or complete an order.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPrintMethod('system')}
              className={`flex-1 p-3 rounded-xl border text-sm font-display font-semibold flex items-center justify-center gap-1.5 ${printMethod === 'system' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
            >
              <Wifi className="w-4 h-4" /> System / Wi-Fi
            </button>
            <button
              type="button"
              onClick={() => setPrintMethod('bluetooth')}
              className={`flex-1 p-3 rounded-xl border text-sm font-display font-semibold flex items-center justify-center gap-1.5 ${printMethod === 'bluetooth' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
            >
              <Bluetooth className="w-4 h-4" /> Bluetooth
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            {printMethod === 'system'
              ? 'Opens your device\'s normal print dialog — works with WiFi printers, saving as PDF, or any printer already set up on your phone/computer.'
              : 'Sends receipts directly to a 58mm/80mm Bluetooth thermal printer. Only works in Chrome or Edge (Android or desktop) — not supported on iPhone/Safari, which will automatically fall back to System print.'}
          </p>
        </div>

        {printMethod === 'bluetooth' && (
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <h3 className="font-display font-bold text-sm">Bluetooth Printer</h3>
            {settings.savedBluetoothPrinterName && (
              <p className="text-xs text-success">✓ Last connected: {settings.savedBluetoothPrinterName}</p>
            )}
            <p className="text-[11px] text-muted-foreground leading-normal">
              Make sure your printer is turned on and already paired in your phone/computer's Bluetooth settings, then tap below to connect it to StoreFlow and print a test receipt.
            </p>
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
                    footerMessage: 'This is a test print from StoreFlow ✅',
                    receiptCurrency: settings.receiptCurrency || '₦',
                  }, settings.receiptWidth === '80mm' ? '80mm' : '58mm');
                  const updated = { ...store, managerSettings: { ...settings, savedBluetoothPrinterName: name } };
                  onUpdate(updated);
                  saveStore(updated);
                  showToast(`Connected to ${name} — test receipt sent`);
                } catch (err: any) {
                  // Closing the chooser is a decision, not a failure — it
                  // used to raise a red "pairing failed" message.
                  const { describeBluetoothFailure } = await import('@/lib/print-engine');
                  const { cancelled, message } = describeBluetoothFailure(err);
                  if (!cancelled) showToast(message, 'error');
                }
              }}
              className="w-full p-3 rounded-xl bg-primary text-primary-foreground text-sm font-display font-bold"
            >
              Pair Printer & Test Print
            </button>
          </div>
        )}

        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <h3 className="font-display font-bold text-sm">Paper Size</h3>
          <select
            value={store.managerSettings?.receiptWidth || '58mm'}
            onChange={e => {
              const updated = { ...store, managerSettings: { ...settings, receiptWidth: e.target.value as any } };
              onUpdate(updated);
              saveStore(updated);
            }}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          >
            <option value="58mm">Thermal (58mm)</option>
            <option value="80mm">Thermal (80mm)</option>
            <option value="standard">Standard A4 / PDF</option>
          </select>
        </div>
      </div>
    </SubPage>
  );
}
