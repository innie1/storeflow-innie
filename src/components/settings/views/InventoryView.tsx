import { showToast } from '@/components/Toast';
import ToggleRow from '@/components/Toggle';
import { saveLowStockThreshold } from '@/lib/settings';
import { card, inputClass, SubPage, SectionLabel, NumberRow } from '../ui';
import type { SettingsState } from '../useSettings';

export default function InventoryView({ s }: { s: SettingsState }) {
  const {
    setView, lowStock, setLowStock, backorderPwOpen, setBackorderPwOpen, backorderPwInput,
    setBackorderPwInput, backorderPwPendingValue, requestBackorderToggle, confirmBackorderToggle,
    mgr, updateMgr, defaultPurchaseQtyStr, setDefaultPurchaseQtyStr, defaultRestockQtyStr,
    setDefaultRestockQtyStr, minStockThresholdStr, setMinStockThresholdStr,
    handleSaveRestockSettings,
  } = s;
  return (
    <SubPage title="Inventory" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <NumberRow label="Low Stock Threshold" value={lowStock} onChange={setLowStock}
          onSave={() => { const n = Number(lowStock); if (!Number.isFinite(n) || n < 0) return showToast('Invalid number', 'error'); saveLowStockThreshold(n); showToast(`Low stock set to ${Math.floor(n)}`); }} />
        <NumberRow label="Critical Stock Threshold" value={String(mgr.criticalStockThreshold)}
          onChange={v => updateMgr({ criticalStockThreshold: Math.max(0, Number(v) || 0) })}
          onSave={() => showToast('Saved')} />
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Restock Suggestions" checked={mgr.restockSuggestions} onChange={v => updateMgr({ restockSuggestions: v })} />
        <ToggleRow label="Inventory Alerts" checked={mgr.inventoryAlerts} onChange={v => updateMgr({ inventoryAlerts: v })} />
        <ToggleRow label="Low Stock Notifications" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />
      </div>

      <div className="px-1 mt-4">
        <SectionLabel>Selling Out-Of-Stock Items</SectionLabel>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow
          label="Allow Backorder Selling"
          description="Lets staff sell items even at 0 stock. The shortfall is tracked separately, never as negative stock. Password required to change this."
          checked={!!mgr.backorderSellingEnabled}
          onChange={v => requestBackorderToggle(v)}
        />
      </div>
      {backorderPwOpen && (
        <div className={`${card} p-4 space-y-3`}>
          <p className="text-sm font-display font-semibold">
            Enter owner password to {backorderPwPendingValue ? 'turn on' : 'turn off'} Backorder Selling
          </p>
          <input
            type="password"
            value={backorderPwInput}
            onChange={e => setBackorderPwInput(e.target.value)}
            placeholder="Owner password"
            className="w-full p-3 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setBackorderPwOpen(false); setBackorderPwInput(''); }}
              className="flex-1 py-2 rounded-lg text-xs font-display font-bold border border-border text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={confirmBackorderToggle}
              className="flex-1 py-2 rounded-lg text-xs font-display font-bold bg-primary text-primary-foreground"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      <div className="px-1 mt-4">
        <SectionLabel>Default Restock Settings</SectionLabel>
      </div>
      <div className={`${card} p-4 space-y-4`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Default Purchase Quantity</label>
            <input
              type="number"
              min="1"
              value={defaultPurchaseQtyStr}
              onChange={e => setDefaultPurchaseQtyStr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Default Restock Target</label>
            <input
              type="number"
              min="1"
              value={defaultRestockQtyStr}
              onChange={e => setDefaultRestockQtyStr(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Minimum Stock Threshold</label>
            <input
              type="number"
              min="0"
              value={minStockThresholdStr}
              onChange={e => setMinStockThresholdStr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Restock Frequency</label>
            <select
              value={mgr.restockFrequency || 'weekly'}
              onChange={e => updateMgr({ restockFrequency: e.target.value as 'daily' | 'weekly' | 'monthly' })}
              className={inputClass}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {/* Save Settings Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveRestockSettings}
            className="px-4 py-2 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            Save Settings
          </button>
        </div>
      </div>
    </SubPage>
  );
}
