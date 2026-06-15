import { useState, useEffect, useRef } from 'react';
import { StoreData, StoreProfile, ManagerSettings, DEFAULT_MANAGER_SETTINGS, SavingsGoal, PaymentInfo, SavingsFrequency } from '@/types/store';
import { saveStore, getTrash } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import StoreSwitcher from '@/components/StoreSwitcher';
import ToggleRow from '@/components/Toggle';
import Mascot, { MascotBadge } from '@/components/Mascot';
import { getLowStockThreshold, saveLowStockThreshold } from '@/lib/settings';

export type LockTimer = '1h' | '12h' | 'never';

const LOCK_TIMER_KEY = 'storeflow_lock_timer';
const SESSION_KEY = 'storeflow_session';

interface SessionData { accessCode: string; loginAt: number; lockTimer: LockTimer; }

export function saveLockTimer(timer: LockTimer) { localStorage.setItem(LOCK_TIMER_KEY, timer); }
export function getLockTimer(): LockTimer { return (localStorage.getItem(LOCK_TIMER_KEY) as LockTimer) || '1h'; }
export function saveSession(accessCode: string) {
  const s: SessionData = { accessCode, loginAt: Date.now(), lockTimer: getLockTimer() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function clearSession() { localStorage.removeItem(SESSION_KEY); }
export function getActiveSession(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session: SessionData = JSON.parse(raw);
    const timer = getLockTimer();
    if (timer === 'never') return session.accessCode;
    const maxMs = timer === '1h' ? 3600000 : 43200000;
    if (Date.now() - session.loginAt > maxMs) { clearSession(); return null; }
    return session.accessCode;
  } catch { return null; }
}

interface SettingsProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onLock: () => void;
}

export default function Settings({ store, onUpdate, onLock }: SettingsProps) {
  const [timer, setTimer] = useState<LockTimer>(getLockTimer());
  const [editing, setEditing] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(getTheme());
  const [showTrash, setShowTrash] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [lowStock, setLowStock] = useState<string>(String(getLowStockThreshold()));
  const [profile, setProfile] = useState<StoreProfile>(
    store.profile || { storeType: '', location: '', phone: '', email: '' }
  );
  const [payment, setPayment] = useState<PaymentInfo>(store.profile?.payment || {});
  const [mgr, setMgr] = useState<ManagerSettings>(store.managerSettings || DEFAULT_MANAGER_SETTINGS);
  const [savings, setSavings] = useState<SavingsGoal>(store.savingsGoal || {
    amount: 500000, label: 'Emergency Fund', source: 'profit', percentage: 10, saved: 0,
    bankName: '', frequency: 'weekly',
  });
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const trashCount = getTrash(store).length;

  const persist = (patch: Partial<StoreData>) => {
    const updated = { ...store, ...patch };
    saveStore(updated); onUpdate(updated);
  };
  const updateMgr = (patch: Partial<ManagerSettings>) => {
    const next = { ...mgr, ...patch };
    setMgr(next); persist({ managerSettings: next });
  };
  const updateSavings = (patch: Partial<SavingsGoal>) => {
    const next = { ...savings, ...patch };
    setSavings(next); persist({ savingsGoal: next });
  };
  const updatePayment = (patch: Partial<PaymentInfo>) => {
    const next = { ...payment, ...patch };
    setPayment(next);
    persist({ profile: { ...(store.profile || { storeType:'', location:'', phone:'', email:'' }), ...profile, payment: next } });
  };

  const handleThemeChange = (t: ThemeId) => {
    setTheme(t); applyTheme(t);
    const meta = THEMES.find(x => x.id === t);
    if (meta) showToast(meta.quote);
  };

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast('Image must be under 2 MB', 'error');
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const next = { ...(store.profile || { storeType:'', location:'', phone:'', email:'' }), ...profile, photo: data, payment };
      setProfile(next);
      persist({ profile: next });
      showToast('Store photo updated');
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => { saveLockTimer(timer); saveSession(store.accessCode); }, [timer, store.accessCode]);

  // Auto open savings setup when planner toggled ON for first time
  const toggleSavings = (next: boolean) => {
    updateMgr({ savingsPlanner: next });
    if (next && !store.savingsGoal) setShowSavingsModal(true);
  };

  const timerOptions: { value: LockTimer; label: string; desc: string; icon: string }[] = [
    { value: '1h', label: '1 Hour', desc: 'Auto-lock after 1 hour', icon: '🕐' },
    { value: '12h', label: '12 Hours', desc: 'Auto-lock after 12 hours', icon: '🕐' },
    { value: 'never', label: 'Always Open', desc: 'Stay logged in until you lock manually', icon: '🔓' },
  ];

  const handleSaveProfile = () => {
    const next = { ...profile, payment };
    persist({ profile: next });
    setEditing(false);
    showToast('Profile updated');
  };

  const handleLock = () => { clearSession(); onLock(); showToast('Store locked'); };

  const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm";

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      {/* Store Profile Card */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => photoInputRef.current?.click()} className="relative w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 overflow-hidden flex items-center justify-center text-2xl">
              {store.profile?.photo ? (
                <img src={store.profile.photo} alt={store.storeName} className="w-full h-full object-cover" />
              ) : '🏪'}
              <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] flex items-center justify-center">📷</span>
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoPick} />
            <div>
              <h3 className="font-display font-bold text-lg">{store.storeName}</h3>
              <p className="text-xs text-muted-foreground font-mono">{store.accessCode}</p>
              {store.profile?.storeType && store.profile?.location && (
                <p className="text-xs text-muted-foreground mt-0.5">📍 {store.profile.storeType} • {store.profile.location}</p>
              )}
            </div>
          </div>
          <button onClick={() => setEditing(!editing)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors font-display font-semibold">
            {editing ? '✕ Cancel' : '✏️ Edit'}
          </button>
        </div>

        {editing && (
          <div className="space-y-3 pt-2 border-t border-border">
            <button onClick={() => photoInputRef.current?.click()} className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-display font-semibold hover:border-primary/30">
              📷 Change Store Photo
            </button>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Store Type</label>
              <select value={profile.storeType} onChange={e => setProfile({ ...profile, storeType: e.target.value })} className={inputClass}>
                <option value="">Select type...</option>
                {['Retail Shop','Supermarket','Provision Store','Mini Mart','Wholesale','Pharmacy','Restaurant','Other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Location / Address</label>
              <input value={profile.location} onChange={e => setProfile({ ...profile, location: e.target.value })} placeholder="e.g. 12 Market Road, Lagos" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Phone</label>
                <input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="08012345678" type="tel" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} placeholder="store@example.com" type="email" className={inputClass} />
              </div>
            </div>
            <button onClick={handleSaveProfile} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity">
              Save Profile
            </button>
          </div>
        )}
      </div>

      {/* Payment Info */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <h3 className="font-display font-bold text-base">How to Receive Payment</h3>
        <p className="text-[11px] text-muted-foreground -mt-1">Shown on receipts so customers can pay you by transfer.</p>
        <input value={payment.bankName || ''} onChange={e => updatePayment({ bankName: e.target.value })} placeholder="Bank name (e.g. Opay, GTBank)" className={inputClass} />
        <input value={payment.accountName || ''} onChange={e => updatePayment({ accountName: e.target.value })} placeholder="Account name" className={inputClass} />
        <input value={payment.accountNumber || ''} onChange={e => updatePayment({ accountNumber: e.target.value })} placeholder="Account number" inputMode="numeric" className={inputClass} />
      </div>

      {/* Appearance */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <h3 className="font-display font-bold text-base">Appearance</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => handleThemeChange(t.id)}
              className={`relative p-3 rounded-xl border text-center transition-all ${theme === t.id ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30' : 'bg-surface-2 border-border hover:border-primary/30'}`}>
              {theme === t.id && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">✓</span>}
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg border border-border" style={{ background: t.swatch }}>{t.emoji}</div>
              <p className="font-display font-semibold text-xs text-foreground">{t.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Low Stock */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-base">Low Stock Alert</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Items at or below this quantity are flagged.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={lowStock} onChange={e => setLowStock(e.target.value)} className={inputClass + ' flex-1'} />
          <button
            onClick={() => {
              const n = Number(lowStock);
              if (!Number.isFinite(n) || n < 0) return showToast('Enter a valid number', 'error');
              saveLowStockThreshold(n);
              showToast(`Low-stock threshold set to ${Math.floor(n)}`);
            }}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold hover:opacity-90">Save</button>
        </div>
      </div>

      {/* Store Manager */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-base text-primary">Store Manager</h3>
          <MascotBadge on={mgr.enabled} />
        </div>
        <ToggleRow label="Enable Store Manager" description="Master switch — turn on to unlock insights, forecasts and recommendations." checked={mgr.enabled} onChange={v => updateMgr({ enabled: v })} />
        {mgr.enabled && (
          <>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground pt-2">Features</p>
            {([
              ['revenueForecasts', 'Revenue Forecasts'],
              ['profitForecasts', 'Profit Forecasts'],
              ['inventoryForecasts', 'Inventory Forecasts'],
              ['expenseAnalysis', 'Expense Analysis'],
              ['smartPricing', 'Smart Pricing'],
              ['productSuggestions', 'Product Suggestions'],
              ['voiceFeatures', 'Voice Features'],
              ['weeklyRecap', 'Weekly Recap'],
              ['customerRequests', 'Customer Request Tracking'],
            ] as [keyof ManagerSettings, string][]).map(([k, label]) => (
              <ToggleRow key={k} label={label} checked={!!mgr[k]} onChange={v => updateMgr({ [k]: v } as Partial<ManagerSettings>)} />
            ))}
            <ToggleRow label="Savings Planner" checked={mgr.savingsPlanner} onChange={toggleSavings} />
          </>
        )}
      </div>

      {/* Pricing */}
      {mgr.enabled && (
        <div className="bg-card shadow-card rounded-xl p-4 space-y-2">
          <h3 className="font-display font-bold text-base text-primary">Pricing</h3>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-display font-semibold">Default Profit Margin</span>
            <div className="flex items-center gap-1">
              <input type="number" value={mgr.defaultMargin} onChange={e => updateMgr({ defaultMargin: Math.max(0, Number(e.target.value) || 0) })}
                className="w-16 p-1.5 rounded-lg bg-surface-2 border border-border text-sm text-right focus:outline-none focus:border-primary" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <ToggleRow label="Auto-Suggest Prices" checked={mgr.autoSuggestPrices} onChange={v => updateMgr({ autoSuggestPrices: v })} />
          <ToggleRow label="Auto-Apply Suggested Prices" checked={mgr.autoApplyPrices} onChange={v => updateMgr({ autoApplyPrices: v })} />
        </div>
      )}

      {/* Savings */}
      {mgr.enabled && mgr.savingsPlanner && (
        <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-primary">Savings Plan</h3>
            <button onClick={() => setShowSavingsModal(true)} className="text-xs text-primary font-display font-semibold">Edit</button>
          </div>
          <div className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Goal:</span> <span className="font-display font-bold">₦{savings.amount.toLocaleString()}</span> · {savings.label}</p>
            <p className="text-xs text-muted-foreground">Save {savings.percentage}% of {savings.source} · {savings.frequency || 'weekly'} {savings.bankName ? `→ ${savings.bankName}` : ''}</p>
          </div>
        </div>
      )}

      {/* Lock Timer */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <h3 className="font-display font-bold text-base">Lock Timer</h3>
        <div className="space-y-2">
          {timerOptions.map(opt => (
            <button key={opt.value} onClick={() => setTimer(opt.value)}
              className={`w-full p-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${timer === opt.value ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border hover:border-primary/20'}`}>
              <span className="text-lg">{opt.icon}</span>
              <div className="flex-1">
                <span className="font-display font-semibold text-sm">{opt.label}</span>
                <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${timer === opt.value ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                {timer === opt.value && <span className="text-primary-foreground text-[10px]">✓</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => setShowSwitcher(true)} className="w-full p-3 rounded-xl bg-card shadow-card flex items-center justify-between hover:ring-1 hover:ring-primary/30 transition-all">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div className="text-left">
            <p className="font-display font-semibold text-sm">Switch Store</p>
            <p className="text-[11px] text-muted-foreground">Manage and switch between stores</p>
          </div>
        </div>
        <span className="text-muted-foreground">›</span>
      </button>

      <button onClick={() => setShowTrash(true)} className="w-full p-3 rounded-xl bg-card shadow-card flex items-center justify-between hover:ring-1 hover:ring-primary/30 transition-all">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗑</span>
          <div className="text-left">
            <p className="font-display font-semibold text-sm">Recently Deleted</p>
            <p className="text-[11px] text-muted-foreground">Restore items from the last 7 days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trashCount > 0 && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-display font-semibold">{trashCount}</span>}
          <span className="text-muted-foreground">›</span>
        </div>
      </button>

      <button onClick={handleLock} className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-display font-semibold hover:bg-destructive/20 transition-colors">
        🔒 Lock Store Now
      </button>

      {showTrash && <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />}
      {showSwitcher && <StoreSwitcher currentCode={store.accessCode} onSwitch={onUpdate} onClose={() => setShowSwitcher(false)} />}
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} />
      )}
    </div>
  );
}

// --- Savings setup modal ---
function SavingsModal({ initial, onClose, onSave }: { initial: SavingsGoal; onClose: () => void; onSave: (g: SavingsGoal) => void }) {
  const [g, setG] = useState<SavingsGoal>(initial);
  const inp = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary";
  const freqs: SavingsFrequency[] = ['daily', 'weekly', 'monthly'];
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Mascot size={36} mood="happy" />
            <h3 className="font-display font-bold text-lg">Set Up Savings Plan</h3>
          </div>
          <button onClick={onClose} className="text-xl text-muted-foreground hover:text-foreground">×</button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input value={g.label || ''} onChange={e => setG({ ...g, label: e.target.value })} placeholder="Emergency Fund" className={inp} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Bank</label>
          <input value={g.bankName || ''} onChange={e => setG({ ...g, bankName: e.target.value })} placeholder="Opay / PalmPay / GTBank" className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Goal Amount (₦)</label>
            <input type="number" value={g.amount || ''} onChange={e => setG({ ...g, amount: Number(e.target.value) || 0 })} placeholder="500000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">% of {g.source}</label>
            <input type="number" value={g.percentage || ''} onChange={e => setG({ ...g, percentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} placeholder="10" className={inp} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Save from</label>
          <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
            {(['profit','revenue'] as const).map(s => (
              <button key={s} onClick={() => setG({ ...g, source: s })} className={`flex-1 px-3 py-2 text-xs font-display font-semibold capitalize ${g.source === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Frequency</label>
          <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
            {freqs.map(f => (
              <button key={f} onClick={() => setG({ ...g, frequency: f })} className={`flex-1 px-3 py-2 text-xs font-display font-semibold capitalize ${g.frequency === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{f}</button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
          ⚠️ This sets the target in StoreFlow. To actually move money, set up an automated save plan in your banking app (Opay, PalmPay, Kuda, etc.).
        </div>

        <button onClick={() => onSave(g)} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90">Save Plan</button>
      </div>
    </div>
  );
}
