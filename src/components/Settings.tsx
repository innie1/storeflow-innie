import { useState, useEffect, useRef, useMemo } from 'react';
import {
  StoreData, StoreProfile, ManagerSettings, DEFAULT_MANAGER_SETTINGS,
  SavingsGoal, PaymentInfo, SavingsFrequency, RentInfo, RentFrequency,
} from '@/types/store';
import { saveStore, getTrash } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import StoreSwitcher from '@/components/StoreSwitcher';
import ToggleRow from '@/components/Toggle';
import Mascot from '@/components/Mascot';
import { getLowStockThreshold, saveLowStockThreshold } from '@/lib/settings';
import { generateInsights } from '@/lib/manager-intel';

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

type View =
  | 'home' | 'profile' | 'flow' | 'pricing' | 'inventory' | 'savings'
  | 'appearance' | 'notifications' | 'security' | 'data' | 'support';

interface SettingsProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onLock: () => void;
}

const card = "bg-card shadow-card rounded-2xl";
const tileBase = "w-full p-4 rounded-2xl bg-card shadow-card flex items-center gap-3 text-left transition-all hover:ring-1 hover:ring-primary/30";
const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm";

// ---- small helpers ----
function ProgressRing({ pct, size = 56, color = 'hsl(var(--success))' }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth="4" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="4" fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        transform={`rotate(90 ${size/2} ${size/2})`}
        className="fill-foreground font-display font-bold" style={{ fontSize: 11 }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function IconBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-base"
      style={{ background: color + '20', color }}>
      {children}
    </div>
  );
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
          ‹
        </button>
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ============ MAIN ============
export default function Settings({ store, onUpdate, onLock }: SettingsProps) {
  const [view, setView] = useState<View>('home');
  const [timer, setTimer] = useState<LockTimer>(getLockTimer());
  const [theme, setTheme] = useState<ThemeId>(getTheme());
  const [showTrash, setShowTrash] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [lowStock, setLowStock] = useState<string>(String(getLowStockThreshold()));
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<StoreProfile>(
    store.profile || { storeType: '', location: '', phone: '', email: '' }
  );
  const [payment, setPayment] = useState<PaymentInfo>(store.profile?.payment || {});
  const [rent, setRent] = useState<RentInfo>(store.profile?.rent || { isRented: false });
  const [mgr, setMgr] = useState<ManagerSettings>({ ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) });
  const [savings, setSavings] = useState<SavingsGoal>(store.savingsGoal || {
    amount: 500000, label: 'Emergency Fund', source: 'profit', percentage: 10, saved: 0,
    bankName: '', frequency: 'weekly',
  });

  const trashCount = getTrash(store).length;
  const insights = useMemo(() => generateInsights(store, '7d'), [store]);
  const latestInsight = insights[0];

  // ----- profile completion -----
  const profileCompletion = useMemo(() => {
    const fields = [
      store.profile?.photo, profile.storeType, profile.location, profile.phone, profile.email,
      profile.website, profile.openingTime, profile.closingTime, profile.ownerName,
      payment.bankName, payment.accountNumber,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [store.profile, profile, payment]);

  const lowStockCount = store.products.filter(p => p.quantity <= getLowStockThreshold()).length;
  const activeNotifTypes = [
    mgr.notifyInsights, mgr.notifyRecommendations, mgr.notifyAlerts,
    mgr.notifyWeeklyRecap, mgr.notifySavingsReminders, mgr.notifyLowStock,
  ].filter(Boolean).length;
  const savingsPct = savings.amount > 0 ? Math.min(100, (savings.saved / savings.amount) * 100) : 0;

  // ----- persistence -----
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
  const persistProfile = (nextProfile: StoreProfile, nextPayment = payment, nextRent = rent) => {
    const merged: StoreProfile = { ...nextProfile, payment: nextPayment, rent: nextRent };
    persist({ profile: merged });
  };
  const updatePayment = (patch: Partial<PaymentInfo>) => {
    const next = { ...payment, ...patch };
    setPayment(next);
    persistProfile(profile, next, rent);
  };
  const updateRent = (patch: Partial<RentInfo>) => {
    const next = { ...rent, ...patch };
    setRent(next);
    persistProfile(profile, payment, next);
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
      const next: StoreProfile = { ...profile, photo: reader.result as string };
      setProfile(next);
      persistProfile(next);
      showToast('Store photo updated');
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    const next: StoreProfile = { ...profile, photo: undefined };
    setProfile(next);
    persistProfile(next);
    showToast('Photo removed');
  };

  useEffect(() => { saveLockTimer(timer); saveSession(store.accessCode); }, [timer, store.accessCode]);

  const handleLock = () => { clearSession(); onLock(); showToast('Store locked'); };
  const toggleSavings = (next: boolean) => {
    updateMgr({ savingsPlanner: next });
    if (next && !store.savingsGoal) setShowSavingsModal(true);
  };

  // ============ SUB-VIEWS ============
  if (view === 'profile') return (
    <SubPage title="Edit Profile" onBack={() => setView('home')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-4">
          <button onClick={() => photoInputRef.current?.click()}
            className="relative w-20 h-20 rounded-2xl overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-3xl">
            {profile.photo ? <img src={profile.photo} alt="" className="w-full h-full object-cover" /> : '🏪'}
            <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">📷</span>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
          <div className="flex-1 space-y-1.5">
            <button onClick={() => photoInputRef.current?.click()} className="text-xs font-display font-semibold text-primary">Change photo</button>
            {profile.photo && <button onClick={removePhoto} className="block text-xs text-destructive">Remove</button>}
            <div className="text-[11px] text-muted-foreground font-mono">Store ID: {store.accessCode}</div>
          </div>
        </div>
        <Field label="Owner Name" value={profile.ownerName || ''} onChange={v => setProfile({ ...profile, ownerName: v })} placeholder="Your full name" />
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Store Type</label>
          <select value={profile.storeType} onChange={e => setProfile({ ...profile, storeType: e.target.value })} className={inputClass}>
            <option value="">Select type…</option>
            {['Retail Shop','Supermarket','Provision Store','Mini Mart','Wholesale','Pharmacy','Restaurant','Other'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Field label="Business Address" value={profile.location} onChange={v => setProfile({ ...profile, location: v })} placeholder="12 Market Road, Lagos" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone" value={profile.phone} onChange={v => setProfile({ ...profile, phone: v })} placeholder="08012345678" type="tel" />
          <Field label="Email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} placeholder="store@email.com" type="email" />
        </div>
        <Field label="Website" value={profile.website || ''} onChange={v => setProfile({ ...profile, website: v })} placeholder="www.mystore.com" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Opening Time" value={profile.openingTime || ''} onChange={v => setProfile({ ...profile, openingTime: v })} type="time" />
          <Field label="Closing Time" value={profile.closingTime || ''} onChange={v => setProfile({ ...profile, closingTime: v })} type="time" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Business Opened" value={profile.openingDate || ''} onChange={v => setProfile({ ...profile, openingDate: v })} type="date" />
          <Field label="Employees" value={String(profile.employees ?? '')} onChange={v => setProfile({ ...profile, employees: Number(v) || undefined })} type="number" placeholder="0" />
        </div>
      </div>

      {/* Rent */}
      <div className={`${card} p-5 space-y-3`}>
        <h3 className="font-display font-bold text-base">Store Rent</h3>
        <p className="text-xs text-muted-foreground -mt-1">Is your store rented?</p>
        <div className="flex gap-2">
          {[{v:true,l:'Yes'},{v:false,l:'No · I own it'}].map(o => (
            <button key={o.l} onClick={() => updateRent({ isRented: o.v })}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-display font-semibold ${rent.isRented===o.v ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
              {o.l}
            </button>
          ))}
        </div>
        {rent.isRented && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Rent Amount (₦)" value={String(rent.amount ?? '')} onChange={v => updateRent({ amount: Number(v) || 0 })} type="number" />
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Frequency</label>
                <select value={rent.frequency || 'yearly'} onChange={e => updateRent({ frequency: e.target.value as RentFrequency })} className={inputClass}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <Field label="Next Due Date" value={rent.dueDate || ''} onChange={v => updateRent({ dueDate: v })} type="date" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Landlord (optional)" value={rent.landlordName || ''} onChange={v => updateRent({ landlordName: v })} />
              <Field label="Landlord Contact" value={rent.landlordContact || ''} onChange={v => updateRent({ landlordContact: v })} />
            </div>
            {rent.amount ? (
              <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-xs text-success">
                Flow will plan for a 10% buffer → target ₦{Math.round((rent.amount || 0) * 1.1).toLocaleString()}
              </div>
            ) : null}
          </div>
        )}
        {!rent.isRented && (
          <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-xs text-success">
            Store Owned · Flow will track maintenance & emergency reserves.
          </div>
        )}
      </div>

      <button onClick={() => { persistProfile(profile); setView('home'); showToast('Profile saved'); }}
        className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Save Profile</button>
    </SubPage>
  );

  if (view === 'flow') return (
    <SubPage title="Flow Settings" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-1`}>
        <ToggleRow label="Enable Flow" description="Master switch — turn on for insights, forecasts and advice." checked={mgr.enabled} onChange={v => updateMgr({ enabled: v })} />
        {mgr.enabled && (
          <>
            <SectionLabel>Forecasts</SectionLabel>
            <ToggleRow label="Revenue Forecasts" checked={mgr.revenueForecasts} onChange={v => updateMgr({ revenueForecasts: v })} />
            <ToggleRow label="Profit Forecasts" checked={mgr.profitForecasts} onChange={v => updateMgr({ profitForecasts: v })} />
            <ToggleRow label="Inventory Forecasts" checked={mgr.inventoryForecasts} onChange={v => updateMgr({ inventoryForecasts: v })} />
            <ToggleRow label="Expense Analysis" checked={mgr.expenseAnalysis} onChange={v => updateMgr({ expenseAnalysis: v })} />
            <SectionLabel>Recommendations</SectionLabel>
            <ToggleRow label="Smart Pricing" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
            <ToggleRow label="Product Suggestions" checked={mgr.productSuggestions} onChange={v => updateMgr({ productSuggestions: v })} />
            <ToggleRow label="Business Advice" checked={mgr.businessAdvice} onChange={v => updateMgr({ businessAdvice: v })} />
            <ToggleRow label="Business Expansion" checked={mgr.businessExpansion} onChange={v => updateMgr({ businessExpansion: v })} />
            <SectionLabel>Tools</SectionLabel>
            <ToggleRow label="Weekly Recaps" checked={mgr.weeklyRecap} onChange={v => updateMgr({ weeklyRecap: v })} />
            <ToggleRow label="Customer Request Tracking" checked={mgr.customerRequests} onChange={v => updateMgr({ customerRequests: v })} />
            <ToggleRow label="Savings Planner" checked={mgr.savingsPlanner} onChange={toggleSavings} />
            <ToggleRow label="Voice Notes" checked={mgr.voiceFeatures} onChange={v => updateMgr({ voiceFeatures: v })} />
            <ToggleRow label="Business Questions" checked={mgr.businessQuestions} onChange={v => updateMgr({ businessQuestions: v })} />
          </>
        )}
      </div>
    </SubPage>
  );

  if (view === 'pricing') return (
    <SubPage title="Pricing" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-display font-semibold">Default Profit Margin</p>
            <p className="text-[11px] text-muted-foreground">Used by smart pricing suggestions.</p>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" value={mgr.defaultMargin}
              onChange={e => updateMgr({ defaultMargin: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 p-2 rounded-lg bg-surface-2 border border-border text-sm text-right focus:outline-none focus:border-primary" />
            <span className="text-sm text-primary font-bold">%</span>
          </div>
        </div>
        <div className="flex gap-2">
          {[20,30,40,50].map(p => (
            <button key={p} onClick={() => updateMgr({ defaultMargin: p })}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold border ${mgr.defaultMargin===p ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
              {p}%
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} p-4`}>
        <ToggleRow label="Auto-Suggest Selling Prices" checked={mgr.autoSuggestPrices} onChange={v => updateMgr({ autoSuggestPrices: v })} />
        <ToggleRow label="Auto-Apply Suggested Prices" checked={mgr.autoApplyPrices} onChange={v => updateMgr({ autoApplyPrices: v })} />
        <ToggleRow label="Show Product Profit" checked={mgr.showProductProfit} onChange={v => updateMgr({ showProductProfit: v })} />
        <ToggleRow label="Smart Pricing Enabled" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
      </div>
    </SubPage>
  );

  if (view === 'inventory') return (
    <SubPage title="Inventory" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <NumberRow label="Low Stock Threshold" value={lowStock} onChange={setLowStock}
          onSave={() => { const n = Number(lowStock); if (!Number.isFinite(n) || n < 0) return showToast('Invalid number', 'error'); saveLowStockThreshold(n); showToast(`Low stock set to ${Math.floor(n)}`); }} />
        <NumberRow label="Critical Stock Threshold" value={String(mgr.criticalStockThreshold)}
          onChange={v => updateMgr({ criticalStockThreshold: Math.max(0, Number(v) || 0) })}
          onSave={() => showToast('Saved')} />
      </div>
      <div className={`${card} p-4`}>
        <ToggleRow label="Restock Suggestions" checked={mgr.restockSuggestions} onChange={v => updateMgr({ restockSuggestions: v })} />
        <ToggleRow label="Inventory Alerts" checked={mgr.inventoryAlerts} onChange={v => updateMgr({ inventoryAlerts: v })} />
        <ToggleRow label="Low Stock Notifications" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />
      </div>
    </SubPage>
  );

  if (view === 'savings') return (
    <SubPage title="Savings Plan" onBack={() => setView('home')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-4">
          <ProgressRing pct={savingsPct} size={72} color="hsl(var(--primary))" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Goal</p>
            <p className="font-display font-bold text-xl text-primary">₦{savings.amount.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Saved ₦{savings.saved.toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat label="Source" value={`${savings.percentage}% of ${savings.source}`} />
          <Stat label="Frequency" value={savings.frequency || 'weekly'} />
          <Stat label="Destination" value={savings.bankName || '—'} />
          <Stat label="Progress" value={`${Math.round(savingsPct)}%`} />
        </div>
        <button onClick={() => setShowSavingsModal(true)} className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Edit Savings Plan</button>
      </div>
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} />
      )}
    </SubPage>
  );

  if (view === 'appearance') return (
    <SubPage title="Appearance" onBack={() => setView('home')}>
      <div className={`${card} p-4 space-y-3`}>
        <h3 className="font-display font-bold text-sm">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => handleThemeChange(t.id)}
              className={`relative p-3 rounded-xl border text-center transition-all ${theme === t.id ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30' : 'bg-surface-2 border-border'}`}>
              {theme === t.id && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">✓</span>}
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg border border-border" style={{ background: t.swatch }}>{t.emoji}</div>
              <p className="font-display font-semibold text-xs">{t.label}</p>
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} p-4`}>
        <ToggleRow label="Mascot Animations" description="Animate Flow across the app." checked={mgr.mascotAnimations} onChange={v => updateMgr({ mascotAnimations: v })} />
        <ToggleRow label="Reduce Motion" checked={mgr.reduceMotion} onChange={v => updateMgr({ reduceMotion: v })} />
        <ToggleRow label="Compact Mode" description="Tighter spacing across cards." checked={mgr.compactMode} onChange={v => updateMgr({ compactMode: v })} />
      </div>
    </SubPage>
  );

  if (view === 'notifications') return (
    <SubPage title="Notifications" onBack={() => setView('home')}>
      <div className={`${card} p-4`}>
        <ToggleRow label="Insights" checked={mgr.notifyInsights} onChange={v => updateMgr({ notifyInsights: v })} />
        <ToggleRow label="Recommendations" checked={mgr.notifyRecommendations} onChange={v => updateMgr({ notifyRecommendations: v })} />
        <ToggleRow label="Alerts" checked={mgr.notifyAlerts} onChange={v => updateMgr({ notifyAlerts: v })} />
        <ToggleRow label="Weekly Recaps" checked={mgr.notifyWeeklyRecap} onChange={v => updateMgr({ notifyWeeklyRecap: v })} />
        <ToggleRow label="Monthly Reports" checked={mgr.notifyMonthlyReports} onChange={v => updateMgr({ notifyMonthlyReports: v })} />
        <ToggleRow label="Savings Reminders" checked={mgr.notifySavingsReminders} onChange={v => updateMgr({ notifySavingsReminders: v })} />
        <ToggleRow label="Customer Request Alerts" checked={mgr.notifyCustomerRequests} onChange={v => updateMgr({ notifyCustomerRequests: v })} />
        <ToggleRow label="Low Stock Alerts" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />
      </div>
    </SubPage>
  );

  if (view === 'security') return (
    <SubPage title="Security" onBack={() => setView('home')}>
      <div className={`${card} p-4`}>
        <ToggleRow label="Biometric Lock" description="Use fingerprint / Face ID where supported." checked={mgr.biometricLock} onChange={v => updateMgr({ biometricLock: v })} />
        <ToggleRow label="PIN Lock" checked={mgr.pinLock} onChange={v => updateMgr({ pinLock: v })} />
      </div>
      <div className={`${card} p-4 space-y-2`}>
        <h3 className="font-display font-bold text-sm">Auto Lock Timer</h3>
        {[
          { v: '1h' as LockTimer, l: '1 Hour' },
          { v: '12h' as LockTimer, l: '12 Hours' },
          { v: 'never' as LockTimer, l: 'Always Open' },
        ].map(opt => (
          <button key={opt.v} onClick={() => setTimer(opt.v)}
            className={`w-full p-3 rounded-lg border text-left flex items-center justify-between ${timer===opt.v ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border'}`}>
            <span className="font-display font-semibold text-sm">{opt.l}</span>
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${timer===opt.v ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
              {timer===opt.v && <span className="text-primary-foreground text-[10px]">✓</span>}
            </span>
          </button>
        ))}
      </div>
      <button onClick={handleLock} className="w-full p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-display font-semibold">🔒 Lock Store Now</button>
    </SubPage>
  );

  if (view === 'data') return (
    <SubPage title="Data & Storage" onBack={() => setView('home')}>
      <div className="grid grid-cols-2 gap-2">
        <DataTile icon="🔄" label="Switch Store" onClick={() => setShowSwitcher(true)} />
        <DataTile icon="🗑" label={`Recently Deleted${trashCount ? ` (${trashCount})` : ''}`} onClick={() => setShowTrash(true)} />
        <DataTile icon="⬆️" label="Export Data" onClick={() => showToast('Use the export menu in Dashboard')} />
        <DataTile icon="⬇️" label="Import Data" onClick={() => showToast('Import coming soon')} />
        <DataTile icon="☁️" label="Backup" onClick={() => showToast('Backup queued')} />
        <DataTile icon="♻️" label="Restore" onClick={() => showToast('Restore coming soon')} />
      </div>
    </SubPage>
  );

  if (view === 'support') return (
    <SubPage title="Support" onBack={() => setView('home')}>
      <div className={`${card} divide-y divide-border`}>
        <SupportRow icon="?" label="Help Center" onClick={() => showToast('Help center coming soon')} />
        <SupportRow icon="💬" label="Contact Support" onClick={() => showToast('Reach us at help@storeflow.app')} />
        <SupportRow icon="ℹ️" label="About StoreFlow" onClick={() => showToast('StoreFlow · v2.4')} />
      </div>
    </SubPage>
  );

  // ============ HOME ============
  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      {/* Store Profile */}
      <button onClick={() => setView('profile')} className={`${card} w-full p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all`}>
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-3xl">
              {store.profile?.photo ? <img src={store.profile.photo} alt="" className="w-full h-full object-cover" /> : '🏪'}
            </div>
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">📷</span>
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-display font-bold text-lg leading-tight truncate">{store.storeName}</h3>
            {profile.location && <p className="text-xs text-muted-foreground flex items-start gap-1"><span>📍</span><span className="line-clamp-2">{profile.location}</span></p>}
            {profile.phone && <p className="text-xs text-muted-foreground flex items-center gap-1">📞 {profile.phone}</p>}
            {profile.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">✉️ {profile.email}</p>}
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-primary">✏️</div>
            <span className="text-[10px] text-muted-foreground font-display font-semibold">Edit</span>
          </div>
        </div>
      </button>

      {/* Flow Card */}
      <button onClick={() => setView('flow')} className={`${card} w-full p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all border ${mgr.enabled ? 'border-success/30 bg-gradient-to-br from-success/10 to-transparent' : 'border-border'}`}>
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <Mascot size={64} mood={mgr.enabled ? 'happy' : 'sleeping'} />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-xl">Flow</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold ${mgr.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${mgr.enabled ? 'bg-success' : 'bg-muted-foreground'}`} />
                {mgr.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
            {mgr.enabled ? (
              <>
                <p className="text-xs text-muted-foreground leading-snug">Your business companion for forecasts, advice and insights.</p>
                <div className="flex items-center gap-2 pt-1">
                  <ProgressRing pct={profileCompletion} size={40} />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Business Profile</p>
                    <p className="text-xs font-display font-semibold">{profileCompletion}% Complete</p>
                  </div>
                </div>
                {latestInsight && (
                  <p className="text-[11px] text-success mt-1 line-clamp-2">{latestInsight.icon} {latestInsight.text}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Turn on Flow to unlock forecasts, recommendations and business insights.</p>
            )}
          </div>
          <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-surface-2 border border-border flex flex-col items-center justify-center text-primary text-xs">
            <span>›</span>
          </div>
        </div>
      </button>

      {/* Setting Tiles */}
      <SettingTile icon="🏷️" color="#F2C94C" title="Pricing" desc="Manage profit margin and pricing." right={<><p className="text-[10px] text-muted-foreground">Default Margin</p><p className="text-base font-display font-bold text-primary">{mgr.defaultMargin}%</p></>} onClick={() => setView('pricing')} />
      <SettingTile icon="📦" color="#27AE60" title="Inventory" desc="Stock alerts and restock preferences." right={<><p className="text-[10px] text-muted-foreground">Low Stock</p><p className="text-base font-display font-bold text-success">{lowStockCount} Items</p></>} onClick={() => setView('inventory')} />
      <SettingTile icon="🐖" color="#9B6BFB" title="Savings Plan" desc="Set goals and automation rules." onClick={() => setView('savings')}
        right={<div className="text-right space-y-1">
          <p className="text-[10px] text-muted-foreground">Goal</p>
          <p className="text-sm font-display font-bold" style={{ color: '#9B6BFB' }}>₦{savings.amount.toLocaleString()}</p>
          <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden ml-auto">
            <div className="h-full rounded-full" style={{ width: `${savingsPct}%`, background: '#9B6BFB' }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{Math.round(savingsPct)}%</p>
        </div>} />

      <SettingTile icon="🎨" color="#5B8FF9" title="Appearance" desc="Customize theme and experience." onClick={() => setView('appearance')}
        right={<div className="flex gap-1.5">
          {THEMES.map(t => (
            <div key={t.id} className={`w-10 h-10 rounded-xl flex items-center justify-center text-base border ${theme===t.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`} style={{ background: t.swatch + '22' }}>
              {t.emoji}
            </div>
          ))}
        </div>} />

      <SettingTile icon="🔔" color="#FF8A3D" title="Notifications" desc="Manage alerts and reminders." onClick={() => setView('notifications')}
        right={<><p className="text-[10px] font-display font-semibold text-warning">{activeNotifTypes} Types Active</p>
          <div className="flex gap-1 mt-1">{['📊','⭐','⚠️','📘','💰'].map((e,i)=><span key={i} className="w-6 h-6 rounded bg-surface-2 border border-border flex items-center justify-center text-[10px]">{e}</span>)}</div></>} />

      <SettingTile icon="🛡️" color="#2EBFB1" title="Security" desc="App lock and security settings." right={<><p className="text-[10px] text-muted-foreground">Lock Timer</p><p className="text-base font-display font-bold" style={{color:'#2EBFB1'}}>{timer==='1h'?'1 Hour':timer==='12h'?'12 Hours':'Always Open'}</p></>} onClick={() => setView('security')} />

      <SettingTile icon="🗄️" color="#3B82F6" title="Data & Storage" desc="Import, export and backup your data." onClick={() => setView('data')}
        right={<div className="flex gap-1">
          {[{e:'⬆️',l:'Export'},{e:'⬇️',l:'Import'},{e:'☁️',l:'Backup'},{e:'⋯',l:'More'}].map(o=>(
            <div key={o.l} className="w-10 h-10 rounded-lg bg-surface-2 border border-border flex flex-col items-center justify-center">
              <span className="text-xs">{o.e}</span>
              <span className="text-[8px] text-muted-foreground">{o.l}</span>
            </div>
          ))}
        </div>} />

      <SettingTile icon="🎧" color="#F2C94C" title="Support" desc="Help, FAQs and contact." onClick={() => setView('support')} />

      {showTrash && <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />}
      {showSwitcher && <StoreSwitcher currentCode={store.accessCode} onSwitch={onUpdate} onClose={() => setShowSwitcher(false)} />}
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} />
      )}
    </div>
  );
}

// ============ small components ============
function Field({ label, value, onChange, placeholder, type='text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} className={inputClass} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-wide text-muted-foreground pt-3 pb-1">{children}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-bold capitalize">{value}</p>
    </div>
  );
}

function NumberRow({ label, value, onChange, onSave }: { label: string; value: string; onChange: (v: string) => void; onSave: () => void }) {
  return (
    <div>
      <p className="text-sm font-display font-semibold mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} className={inputClass + ' flex-1'} />
        <button onClick={onSave} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">Save</button>
      </div>
    </div>
  );
}

function SettingTile({ icon, color, title, desc, right, onClick }: { icon: string; color: string; title: string; desc: string; right?: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={tileBase}>
      <IconBadge color={color}>{icon}</IconBadge>
      <div className="flex-1 min-w-0">
        <h4 className="font-display font-bold text-sm leading-tight">{title}</h4>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{desc}</p>
      </div>
      {right && <div className="shrink-0 border-l border-border pl-3 text-right max-w-[160px]">{right}</div>}
      <span className="shrink-0 text-muted-foreground">›</span>
    </button>
  );
}

function DataTile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-4 rounded-2xl bg-card shadow-card flex flex-col items-center gap-2 hover:ring-1 hover:ring-primary/30 transition-all">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-display font-semibold text-center">{label}</span>
    </button>
  );
}

function SupportRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full p-4 flex items-center gap-3 hover:bg-surface-2 transition-colors">
      <span className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 text-left text-sm font-display font-semibold">{label}</span>
      <span className="text-muted-foreground">›</span>
    </button>
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
          <label className="text-xs text-muted-foreground">Destination Bank</label>
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
          ⚠️ This sets the target in StoreFlow. To actually move money, set up an automated save plan in your banking app.
        </div>

        <button onClick={() => onSave(g)} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90">Save Plan</button>
      </div>
    </div>
  );
}
