import { useState, useEffect, useRef, useMemo } from 'react';
import {
  StoreData, StoreProfile, ManagerSettings, DEFAULT_MANAGER_SETTINGS,
  SavingsGoal, PaymentInfo, SavingsFrequency, RentInfo, RentFrequency,
} from '@/types/store';
import { saveStore, getTrash, getDashboardStats, getTopSellers, removeStoreFromIndex } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import StoreSwitcher from '@/components/StoreSwitcher';
import ToggleRow from '@/components/Toggle';
import Mascot from '@/components/Mascot';
import { compileBackupPayload, triggerBackupExport, restoreBackupPayload, BackupPayload } from '@/lib/backup-system';
import { LocalBackup, getLocalBackups, saveLocalBackup, deleteLocalBackup } from '@/lib/backup-db';
import { getLowStockThreshold, saveLowStockThreshold } from '@/lib/settings';
import { generateInsights } from '@/lib/manager-intel';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Rocket,
  ShoppingCart,
  CreditCard,
  Package,
  Tag,
  Download,
  Cpu,
  Heart,
  MessageSquare,
  Home,
  PiggyBank,
  BarChart3,
  Trash2,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

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
  | 'appearance' | 'notifications' | 'security' | 'data' | 'support'
  | 'help' | 'faq' | 'about' | 'contact' | 'backups' | 'discount';

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

function SubPage({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-5">
      <div className="flex items-start gap-3.5">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 mt-0.5 transition-colors" aria-label="Back">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ============ MAIN ============
export default function Settings({ store, onUpdate, onLock }: SettingsProps) {
  const [view, setView] = useState<View>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [timer, setTimer] = useState<LockTimer>(getLockTimer());
  const [theme, setTheme] = useState<ThemeId>(getTheme());
  const [showTrash, setShowTrash] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [lowStock, setLowStock] = useState<string>(String(getLowStockThreshold()));
  const [helpOpen, setHelpOpen] = useState<string | null>(null);

  // Backup system state
  const [localBackups, setLocalBackups] = useState<LocalBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<LocalBackup | null>(null);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const list = await getLocalBackups();
      setLocalBackups(list);
    } catch (err) {
      showToast('Failed to load local backups', 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (view === 'backups') {
      loadBackups();
    }
  }, [view]);

  const handleCreateManualBackup = async () => {
    try {
      const payload = compileBackupPayload();
      const dbData: Record<string, string> = {
        index: payload.index,
        deviceMemory: JSON.stringify(payload.deviceMemory),
        lowStock: payload.lowStock || '',
        lockTimer: payload.lockTimer || '',
        theme: payload.theme || '',
      };
      for (const [k, v] of Object.entries(payload.stores)) {
        dbData[k] = v;
      }
      await saveLocalBackup('manual', dbData);
      showToast('✓ Local backup snapshot created');
      loadBackups();
    } catch (err) {
      showToast('Failed to save backup snapshot', 'error');
    }
  };

  const handleDeleteBackup = async (id: string) => {
    try {
      await deleteLocalBackup(id);
      showToast('Snapshot deleted');
      loadBackups();
    } catch (err) {
      showToast('Failed to delete snapshot', 'error');
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreConfirm) return;
    try {
      const dbData = restoreConfirm.data;
      const stores: Record<string, string> = {};
      for (const [k, v] of Object.entries(dbData)) {
        if (k.startsWith('storeflow_') && k !== 'storeflow_index' && k !== 'storeflow_flow_memory') {
          stores[k] = v;
        }
      }
      
      const payload: BackupPayload = {
        version: '1.0',
        timestamp: restoreConfirm.timestamp,
        deviceMemory: dbData.deviceMemory ? JSON.parse(dbData.deviceMemory) : null,
        index: dbData.index || '[]',
        stores,
        lowStock: dbData.lowStock || undefined,
        lockTimer: dbData.lockTimer || undefined,
        theme: dbData.theme || undefined,
      };

      const result = restoreBackupPayload(payload);
      showToast(`✓ Restored: ${result.storesRestoredCount} stores merged successfully`);
      setRestoreConfirm(null);
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      showToast('Failed to restore snapshot', 'error');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string) as BackupPayload;
        if (!payload.version || !payload.index) {
          showToast('Invalid StoreFlow backup file schema', 'error');
          return;
        }
        
        const result = restoreBackupPayload(payload);
        showToast(`✓ Imported: ${result.storesRestoredCount} stores successfully merged`);
        
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err) {
        showToast('Failed to parse backup JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };
  const [showExport, setShowExport] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [delStoreNameInput, setDelStoreNameInput] = useState('');
  const [delCodeInput, setDelCodeInput] = useState('');
  const [delConfirmTextInput, setDelConfirmTextInput] = useState('');
  const [delError, setDelError] = useState('');

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

  // Auto discount input local string states to allow empty inputs
  const [discValStr, setDiscValStr] = useState('');
  const [discMinStr, setDiscMinStr] = useState('');
  const [discMaxStr, setDiscMaxStr] = useState('');

  const handleDiscValChange = (val: string) => {
    setDiscValStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountValue: isNaN(n) ? 0 : n });
  };

  const handleDiscMinChange = (val: string) => {
    setDiscMinStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountMinSubtotal: isNaN(n) ? 0 : n });
  };

  const handleDiscMaxChange = (val: string) => {
    setDiscMaxStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountMaxSubtotal: isNaN(n) ? 0 : n });
  };

  useEffect(() => {
    if (view === 'discount') {
      setDiscValStr(mgr.autoDiscountValue ? String(mgr.autoDiscountValue) : '');
      setDiscMinStr(mgr.autoDiscountMinSubtotal ? String(mgr.autoDiscountMinSubtotal) : '');
      setDiscMaxStr(mgr.autoDiscountMaxSubtotal ? String(mgr.autoDiscountMaxSubtotal) : '');
    }
  }, [view, mgr.autoDiscountValue, mgr.autoDiscountMinSubtotal, mgr.autoDiscountMaxSubtotal]);

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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

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
      {/* Master toggle */}
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Enable Flow" description="Master switch — turn on for insights, forecasts and advice." checked={mgr.enabled} onChange={v => updateMgr({ enabled: v })} />
      </div>

      {!mgr.enabled && (
        <div className="flex flex-col items-center justify-center py-16 px-4 space-y-5">
          <div className="flex justify-center items-center drop-shadow-[0_4px_12px_rgba(99,102,241,0.15)]">
            <Mascot size={140} mood="sleeping" animate={mgr.mascotAnimations} store={store} />
          </div>
          <div className="text-center space-y-1.5 max-w-xs">
            <p className="font-display font-bold text-base text-foreground">Flow is resting 💤</p>
            <p className="text-xs text-muted-foreground leading-normal">
              Flow is currently asleep. Toggle the switch above to wake him up and unlock forecasts, advice, and real-time business helpers.
            </p>
          </div>
        </div>
      )}

      {mgr.enabled && (
        <>
          {/* Forecasts */}
          <div className="px-1">
            <SectionLabel>Forecasts</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Revenue Forecasts" checked={mgr.revenueForecasts} onChange={v => updateMgr({ revenueForecasts: v })} />
            <ToggleRow label="Profit Forecasts" checked={mgr.profitForecasts} onChange={v => updateMgr({ profitForecasts: v })} />
            <ToggleRow label="Inventory Forecasts" checked={mgr.inventoryForecasts} onChange={v => updateMgr({ inventoryForecasts: v })} />
            <ToggleRow label="Expense Analysis" checked={mgr.expenseAnalysis} onChange={v => updateMgr({ expenseAnalysis: v })} />
          </div>

          {/* Recommendations */}
          <div className="px-1">
            <SectionLabel>Recommendations</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Smart Pricing" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
            <ToggleRow label="Product Suggestions" checked={mgr.productSuggestions} onChange={v => updateMgr({ productSuggestions: v })} />
            <ToggleRow label="Business Advice" checked={mgr.businessAdvice} onChange={v => updateMgr({ businessAdvice: v })} />
            <ToggleRow label="Business Expansion" checked={mgr.businessExpansion} onChange={v => updateMgr({ businessExpansion: v })} />
          </div>

          {/* Tools */}
          <div className="px-1">
            <SectionLabel>Tools</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Weekly Recaps" checked={mgr.weeklyRecap} onChange={v => updateMgr({ weeklyRecap: v })} />
            <ToggleRow label="Customer Request Tracking" checked={mgr.customerRequests} onChange={v => updateMgr({ customerRequests: v })} />
            <ToggleRow label="Savings Planner" checked={mgr.savingsPlanner} onChange={toggleSavings} />
            <ToggleRow label="Voice Notes" checked={mgr.voiceFeatures} onChange={v => updateMgr({ voiceFeatures: v })} />
            <ToggleRow label="Auto-Listen on Sales" description="Mic starts automatically when you open the Sales page." checked={mgr.autoVoiceListen} onChange={v => updateMgr({ autoVoiceListen: v })} />
            <ToggleRow label="Auto Print Receipts" description="Automatically trigger receipt printing after recording a sale." checked={mgr.autoPrintReceipt} onChange={v => updateMgr({ autoPrintReceipt: v })} />
            <ToggleRow label="Business Questions" checked={mgr.businessQuestions} onChange={v => updateMgr({ businessQuestions: v })} />
          </div>

          {/* Graph Settings */}
          <div className="px-1 mt-4">
            <SectionLabel>Active Periods Graph</SectionLabel>
          </div>
          <div className={`${card} p-4 space-y-3`}>
            <div>
              <p className="text-sm font-display font-semibold">Graph Interval</p>
              <p className="text-[11px] text-muted-foreground">Select the bucket time interval for the active periods chart.</p>
            </div>
            <div className="flex gap-2">
              {([10, 30, 60] as const).map(interval => (
                <button key={interval} onClick={() => updateMgr({ graphInterval: interval })}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold border transition-colors ${mgr.graphInterval === interval ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
                  {interval === 60 ? '1 Hour' : `${interval} Mins`}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
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
      <div className={`${card} px-4 divide-y divide-border`}>
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
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Restock Suggestions" checked={mgr.restockSuggestions} onChange={v => updateMgr({ restockSuggestions: v })} />
        <ToggleRow label="Inventory Alerts" checked={mgr.inventoryAlerts} onChange={v => updateMgr({ inventoryAlerts: v })} />
        <ToggleRow label="Low Stock Notifications" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />
      </div>
    </SubPage>
  );

  if (view === 'discount') return (
    <SubPage title="Automatic Discounts" onBack={() => setView('home')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow
          label="Enable Automatic Discount"
          description="Automatically calculate and apply a discount at checkout if criteria are met."
          checked={mgr.autoDiscountEnabled ?? false}
          onChange={v => updateMgr({ autoDiscountEnabled: v })}
        />
      </div>

      {mgr.autoDiscountEnabled && (
        <div className={`${card} p-4 space-y-4 animate-fade-in`}>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Discount Type</label>
            <div className="flex rounded-lg bg-surface-2 border border-border overflow-hidden">
              {([['percentage', 'Percentage (%)'], ['flat', 'Flat Amount (₦)']] as const).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => updateMgr({ autoDiscountType: type })}
                  className={`flex-1 px-3 py-2 text-xs font-display font-semibold transition-all ${
                    mgr.autoDiscountType === type ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Discount Value {mgr.autoDiscountType === 'percentage' ? '(%)' : '(₦)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={discValStr}
                onChange={e => handleDiscValChange(e.target.value)}
                className={inputClass + ' flex-1 font-display font-bold text-sm'}
                placeholder="0"
              />
              <span className="text-sm font-bold text-primary">
                {mgr.autoDiscountType === 'percentage' ? '%' : '₦'}
              </span>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <h4 className="text-xs font-display font-bold text-muted-foreground uppercase mb-2">Conditions (Criteria)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Min Subtotal (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={discMinStr}
                  onChange={e => handleDiscMinChange(e.target.value)}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder="0"
                />
                <span className="text-[9px] text-muted-foreground block mt-0.5">e.g. above 10,000</span>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Max Subtotal (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={discMaxStr}
                  onChange={e => handleDiscMaxChange(e.target.value)}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder="0"
                />
                <span className="text-[9px] text-muted-foreground block mt-0.5">e.g. below 50,000</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-[11px] text-success leading-relaxed">
        <strong>How it works:</strong> Automatic discounts apply in the shopping cart when the subtotal falls within your defined criteria range. You can always override or edit the discount manually during checkout.
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
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} animate={mgr.mascotAnimations} store={store} />
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
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Mascot Animations" description="Animate Flow across the app." checked={mgr.mascotAnimations} onChange={v => updateMgr({ mascotAnimations: v })} />
        <ToggleRow label="Number Animations" description="Count up and pulse numeric statistics." checked={mgr.numericAnimations ?? true} onChange={v => updateMgr({ numericAnimations: v })} />
        <ToggleRow label="Reduce Motion" checked={mgr.reduceMotion} onChange={v => updateMgr({ reduceMotion: v })} />
        <ToggleRow label="Compact Mode" description="Tighter spacing across cards." checked={mgr.compactMode} onChange={v => updateMgr({ compactMode: v })} />
      </div>
    </SubPage>
  );

  if (view === 'notifications') return (
    <SubPage title="Notifications" onBack={() => setView('home')}>
      <div className={`${card} px-4 divide-y divide-border`}>
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
      <div className={`${card} px-4 divide-y divide-border`}>
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
    <SubPage title="Data & Storage" subtitle="Manage your store data safely" onBack={() => setView('home')}>
      <div className="grid grid-cols-2 gap-3">
        <DataTile 
          icon={<RefreshCw className="w-4.5 h-4.5" />} 
          label="Switch Store" 
          subtitle="Switch between your stores"
          iconBg="rgba(99, 102, 241, 0.15)"
          iconColor="#818CF8"
          onClick={() => setShowSwitcher(true)} 
        />
        <DataTile 
          icon={<Trash2 className="w-4.5 h-4.5" />} 
          label={trashCount ? `Recently Deleted (${trashCount})` : 'Recently Deleted'}
          subtitle="View and restore deleted items"
          iconBg="rgba(239, 68, 68, 0.15)"
          iconColor="#F87171"
          onClick={() => setShowTrash(true)} 
        />
        <DataTile 
          icon={<ShieldCheck className="w-4.5 h-4.5" />} 
          label="Backups & Restore" 
          subtitle="Backup and restore your data"
          iconBg="rgba(59, 130, 246, 0.15)"
          iconColor="#60A5FA"
          onClick={() => setView('backups')} 
        />
        <DataTile 
          icon={<Download className="w-4.5 h-4.5" />} 
          label="Raw Export" 
          subtitle="Export your data (CSV)"
          iconBg="rgba(16, 185, 129, 0.15)"
          iconColor="#34D399"
          onClick={() => setShowExport(true)} 
        />
      </div>
      {showTrash && (
        <RecentlyDeleted
          store={store}
          onUpdate={onUpdate}
          onClose={() => setShowTrash(false)}
        />
      )}
      {showSwitcher && (
        <StoreSwitcher
          currentCode={store.accessCode}
          onSwitch={onUpdate}
          onClose={() => setShowSwitcher(false)}
        />
      )}
      {showExport && (
        <ExportSheet store={store} onClose={() => setShowExport(false)} />
      )}

      <div className="pt-5 border-t border-border mt-5">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full p-4.5 rounded-2xl bg-red-950/20 hover:bg-red-950/30 border border-red-500/25 text-left flex items-center justify-between transition-all duration-200 active:scale-[0.99] group"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-red-400">Delete Store</h4>
              <p className="text-[11px] text-red-500/80 leading-snug mt-0.5">Permanent Action · This action cannot be undone.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-500/50 group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => {
          setShowDeleteModal(false);
          setDelStoreNameInput('');
          setDelCodeInput('');
          setDelConfirmTextInput('');
          setDelError('');
        }}>
          <div className="w-full max-w-sm bg-card border border-destructive/30 rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-1.5">
              <div className="text-3xl">⚠️</div>
              <h3 className="font-display font-bold text-lg text-destructive">Delete Store?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This action is permanent and cannot be undone. Answer the following security questions to proceed.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">1. What is this store's name?</label>
                <input
                  value={delStoreNameInput}
                  onChange={e => setDelStoreNameInput(e.target.value)}
                  placeholder="Type store name..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">2. What is this store's access code?</label>
                <input
                  value={delCodeInput}
                  onChange={e => setDelCodeInput(e.target.value)}
                  placeholder="Type 6-character code..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-mono focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">3. Confirm by typing "DELETE STORE"</label>
                <input
                  value={delConfirmTextInput}
                  onChange={e => setDelConfirmTextInput(e.target.value)}
                  placeholder="Type DELETE STORE..."
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none"
                />
              </div>
            </div>

            {delError && (
              <p className="text-xs text-destructive text-center font-semibold bg-destructive/10 p-2 rounded-lg border border-destructive/20">{delError}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDelStoreNameInput('');
                  setDelCodeInput('');
                  setDelConfirmTextInput('');
                  setDelError('');
                }}
                className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const matchesName = delStoreNameInput.trim().toLowerCase() === store.storeName.toLowerCase();
                  const matchesCode = delCodeInput.trim().toUpperCase() === store.accessCode.toUpperCase();
                  const matchesConfirm = delConfirmTextInput.trim() === 'DELETE STORE';

                  if (!matchesName) {
                    setDelError('Incorrect store name');
                    return;
                  }
                  if (!matchesCode) {
                    setDelError('Incorrect access code');
                    return;
                  }
                  if (!matchesConfirm) {
                    setDelError('Type DELETE STORE exactly');
                    return;
                  }

                  removeStoreFromIndex(store.accessCode);
                  onLock();
                  showToast('Store successfully deleted');
                }}
                className="flex-1 p-3 rounded-xl bg-destructive text-white font-display font-bold text-xs active:scale-[0.98] transition-transform"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </SubPage>
  );

  if (view === 'backups') {
    return (
      <SubPage title="Backups & Restore" onBack={() => setView('data')}>
        {/* Toggle for Auto-backups */}
        <div className={`${card} px-4 divide-y divide-border`}>
          <ToggleRow
            label="Automatic Backups"
            description="Create a local recovery snapshot in IndexedDB automatically after every sale checkout and expense entry."
            checked={mgr.autoBackupsEnabled ?? false}
            onChange={(v) => updateMgr({ autoBackupsEnabled: v })}
          />
        </div>

        {/* Global Import/Export actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              triggerBackupExport();
              showToast('Backup file exported');
            }}
            className="p-4 rounded-2xl bg-card shadow-card flex flex-col items-center justify-center gap-2 hover:ring-1 hover:ring-primary/30 transition-all text-center"
          >
            <span className="text-2xl">📤</span>
            <span className="font-display font-semibold text-xs text-foreground">Export Backup</span>
            <span className="text-[9px] text-muted-foreground">Download database JSON</span>
          </button>
          
          <label className="p-4 rounded-2xl bg-card shadow-card flex flex-col items-center justify-center gap-2 hover:ring-1 hover:ring-primary/30 transition-all text-center cursor-pointer">
            <span className="text-2xl">📥</span>
            <span className="font-display font-semibold text-xs text-foreground">Import Backup</span>
            <span className="text-[9px] text-muted-foreground">Upload and restore JSON</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
          </label>
        </div>

        {/* Manual backup action */}
        <button
          onClick={handleCreateManualBackup}
          className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:opacity-95 transition-opacity"
        >
          💾 Create Manual Backup Snapshot
        </button>

        {/* Local restore points list */}
        <div className={`${card} p-4 space-y-3`}>
          <h3 className="font-display font-bold text-sm">Local Snapshots</h3>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Restore points saved locally in IndexedDB database.
          </p>

          {loadingBackups ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Loading snapshots...</div>
          ) : localBackups.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">No local snapshots created yet.</div>
          ) : (
            <div className="space-y-2">
              {localBackups.map((b) => (
                <div key={b.id} className="p-3 rounded-xl bg-surface-2 border border-border flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-xs text-foreground">
                      {b.type === 'auto_save' ? '🔄 Auto-Save' : '👤 Manual Backup'}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {new Date(b.timestamp).toLocaleString()} · {(b.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setRestoreConfirm(b)}
                      className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-display font-bold transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(b.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors text-[10px]"
                      title="Delete snapshot"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Restore Confirmation Modal */}
        {restoreConfirm && (
          <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-3xl">⚠️</div>
                <h3 className="font-display font-bold text-lg">Restore this snapshot?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This will restore the database to the state recorded on <strong className="text-foreground">{new Date(restoreConfirm.timestamp).toLocaleString()}</strong>.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setRestoreConfirm(null)}
                  className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreBackup}
                  className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs"
                >
                  Confirm Restore
                </button>
              </div>
            </div>
          </div>
        )}
      </SubPage>
    );
  }

  // ===== ABOUT =====
  if (view === 'about') return (
    <SubPage title="About StoreFlow" onBack={() => setView('support')}>
      <div className={`${card} p-6 flex flex-col items-center text-center gap-4`}>
        <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/25 flex items-center justify-center text-4xl">
          🏪
        </div>
        <div>
          <h2 className="font-display font-bold text-2xl">StoreFlow</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Version 1.0 · Innie Group</p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A modern business management platform for small businesses, supermarkets, kiosks, pharmacies, boutiques, restaurants, and growing stores.
        </p>
      </div>

      <div className={`${card} p-4 space-y-3`}>
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Our Mission</p>
        <ul className="space-y-2">
          {([
            ['📈', 'Help you make better business decisions'],
            ['💸', 'Reduce losses and increase profits'],
            ['📊', 'Track business growth over time'],
            ['🔮', 'Predict future performance'],
            ['🐖', 'Save for business goals'],
            ['🤝', 'Understand what customers want'],
            ['🏪', 'Make store management easier'],
          ] as [string, string][]).map(([icon, text]) => (
            <li key={text} className="flex items-start gap-2.5 text-sm text-foreground/85">
              <span className="shrink-0 leading-5">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${card} px-4 divide-y divide-border`}>
        <div className="py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Developer</span>
          <span className="text-sm font-display font-semibold">Innie Group</span>
        </div>
        <div className="py-3.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-sm font-display font-semibold">1.0</span>
        </div>
        <div className="py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground shrink-0">Email</span>
          <a href="mailto:inniegroup@gmail.com" className="text-sm font-semibold text-primary truncate">
            inniegroup@gmail.com
          </a>
        </div>
        <div className="py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground shrink-0">WhatsApp</span>
          <a href="https://wa.me/2347025517388" target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-success">
            07025517388
          </a>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 text-center space-y-1">
        <p className="text-sm text-muted-foreground">Thank you for choosing StoreFlow.</p>
        <p className="font-display font-bold text-primary">Your growth is our mission. 🌱</p>
      </div>
    </SubPage>
  );

  // ===== CONTACT =====
  if (view === 'contact') return (
    <SubPage title="Contact Support" onBack={() => setView('support')}>
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center text-2xl shrink-0">💬</div>
          <div>
            <p className="font-display font-bold text-sm">WhatsApp Support</p>
            <p className="text-xs text-muted-foreground">Chat directly with the StoreFlow team</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow.', '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-success text-white font-display font-bold text-sm"
          >
            💬 Open WhatsApp
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('07025517388');
              showToast('WhatsApp phone number copied');
            }}
            className="px-4 rounded-xl bg-surface-2 border border-border text-sm font-semibold hover:bg-surface-3 transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Phone: 07025517388</p>
      </div>

      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">📧</div>
          <div>
            <p className="font-display font-bold text-sm">Email Support</p>
            <p className="text-xs text-muted-foreground">Send a detailed issue or request</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Support%20Request&body=Hello%20StoreFlow%20Team,%0A%0AI%20need%20help%20with:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
          >
            ✉️ Email Support
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText('inniegroup@gmail.com');
              showToast('Support email copied');
            }}
            className="px-4 rounded-xl bg-surface-2 border border-border text-sm font-semibold hover:bg-surface-3 transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">Email: inniegroup@gmail.com</p>
      </div>

      <button
        onClick={() => setShowContactPopup(true)}
        className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-success text-primary-foreground font-display font-bold text-sm shadow-md hover:opacity-95 transition-all"
      >
        ✨ Show More Support Options
      </button>

      <div className={`${card} p-4 text-center space-y-1`}>
        <p className="text-xs font-semibold text-foreground">Support Hours</p>
        <p className="text-xs text-muted-foreground">Monday - Sunday</p>
        <p className="text-[10px] text-muted-foreground">StoreFlow Support Team · Innie Group</p>
      </div>
    </SubPage>
  );

  // ===== FAQ =====
  if (view === 'faq') return (
    <SubPage title="Frequently Asked Questions" onBack={() => setView('support')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        {([
          ['Does StoreFlow work offline?', 'Yes. Most features work offline and data syncs when available.'],
          ['Can I manage multiple stores?', 'Yes. Use the Switch Store feature in Settings → Data & Storage.'],
          ['Can I restore deleted items?', 'Yes. Visit Settings → Data & Storage → Recently Deleted. Nothing is permanently deleted immediately.'],
          ['Can Flow predict future sales?', 'Yes. Predictions become more accurate as more sales and expense data is recorded.'],
          ['Does Flow learn from my business?', 'Yes. Flow learns from your sales history, inventory, expenses, customer requests, and business information.'],
          ['Can I disable Flow?', 'Yes. Flow can be turned off at any time in Settings → Flow Settings.'],
          ['Can I track partial payments and debts?', 'Yes. StoreFlow automatically creates and tracks outstanding balances for partial payments.'],
          ['Can I upload a store logo?', 'Yes. Your logo appears throughout the app. Add it in Settings → Edit Profile.'],
          ['Can StoreFlow help me save money?', 'Yes. The Savings Plan feature and Flow recommendations help you build financial discipline over time.'],
          ['Is my data safe?', 'Yes. StoreFlow stores and protects your business information securely on your device.'],
        ] as [string, string][]).map(([q, a]) => (
          <div key={q}>
            <button
              className="w-full text-left flex items-start justify-between gap-3 py-4"
              onClick={() => setHelpOpen(helpOpen === q ? null : q)}
            >
              <p className="text-sm font-display font-semibold text-foreground leading-snug">{q}</p>
              <span className="shrink-0 text-muted-foreground text-xs mt-0.5">
                {helpOpen === q ? '▴' : '▾'}
              </span>
            </button>
            {helpOpen === q && (
              <p className="pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">{a}</p>
            )}
          </div>
        ))}
      </div>
    </SubPage>
  );

  // ===== HELP CENTER =====
  if (view === 'help') {
    const topics = [
      {
        id: 'start', icon: <Rocket className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'Getting Started',
        body: (
          <div className="space-y-2">
            <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
              {['Create your store profile', 'Add your products', 'Record sales daily', 'Record expenses', 'Set profit margins', 'Configure savings goals', 'Turn on Flow for insights and recommendations', 'Review your dashboard regularly'].map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="text-[10px] text-muted-foreground italic mt-1.5">The more data you record, the smarter StoreFlow becomes.</p>
          </div>
        ),
      },
      {
        id: 'sales', icon: <ShoppingCart className="w-4 h-4" />, iconBg: 'rgba(99, 102, 241, 0.12)', iconColor: '#818CF8', title: 'Making a Sale',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <ol className="list-decimal list-inside space-y-1">
              {['Open the Sales page', 'Search or select products', 'Add products to cart', 'Click Complete Sale', 'Select payment type', 'Save sale'].map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="text-[10px] italic mt-1">Inventory automatically updates after each sale.</p>
          </div>
        ),
      },
      {
        id: 'partial', icon: <CreditCard className="w-4 h-4" />, iconBg: 'rgba(245, 158, 11, 0.12)', iconColor: '#FBBF24', title: 'Partial Payments',
        body: (
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>When a customer pays part of their total, StoreFlow automatically creates a Pending Balance. The sale is still recorded fully.</p>
            <div className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span>Customer buys</span><strong className="text-foreground">₦2,500</strong></div>
              <div className="flex justify-between"><span>Customer pays</span><strong className="text-foreground">₦2,000</strong></div>
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Pending balance</span><strong className="text-warning font-bold">₦500</strong></div>
            </div>
            <div>
              <p className="font-semibold text-foreground/80 mb-1">When customer pays later:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                {['Open Pending Balance', 'Tap Record Payment', 'Enter amount paid', 'Balance updates automatically'].map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
            <p className="text-[10px] italic">Find all balances at: Sales → Pending Balances</p>
          </div>
        ),
      },
      {
        id: 'inventory', icon: <Package className="w-4 h-4" />, iconBg: 'rgba(249, 115, 22, 0.12)', iconColor: '#FB923C', title: 'Adding Products',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Go to <strong className="text-foreground">Inventory → Add Product</strong> and enter:</p>
            <ul className="space-y-1 text-[11px]">
              {['Product Name', 'Category', 'Cost Price', 'Selling Price', 'Quantity', 'Barcode (optional)'].map(f => (
                <li key={f} className="flex items-center gap-1.5"><span className="text-primary text-[6px]">●</span>{f}</li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        id: 'pricing', icon: <Tag className="w-4 h-4" />, iconBg: 'rgba(234, 179, 8, 0.12)', iconColor: '#FACC15', title: 'Auto Pricing',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>When Auto Pricing is on, StoreFlow suggests a selling price based on cost + desired margin.</p>
            <div className="bg-surface-2 border border-border rounded-lg p-3 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span>Cost Price</span><strong className="text-foreground">₦1,000</strong></div>
              <div className="flex justify-between"><span>Margin</span><strong className="text-foreground">20%</strong></div>
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Suggested Price</span><strong className="text-success font-bold">₦1,200</strong></div>
            </div>
            <p className="text-[10px] italic">Enable in Settings → Pricing.</p>
          </div>
        ),
      },
      {
        id: 'batch', icon: <Download className="w-4 h-4" />, iconBg: 'rgba(16, 185, 129, 0.12)', iconColor: '#34D399', title: 'Batch Import',
        body: (
          <p className="text-xs text-muted-foreground leading-relaxed">Import multiple products at once. Before saving, StoreFlow shows a preview screen where you can edit products, correct prices or names, and remove mistakes — then approve and save all at once.</p>
        ),
      },
      {
        id: 'flow', icon: <Cpu className="w-4 h-4" />, iconBg: 'rgba(6, 182, 212, 0.12)', iconColor: '#22D3EE', title: 'Flow Assistant',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Flow analyzes your sales, expenses, inventory, debts, and trends to give tailored recommendations.</p>
            <ul className="space-y-1 text-[11px]">
              {['Predict revenue and profits', 'Detect slow and fast-moving products', 'Suggest savings targets', 'Analyze rent and expense impact', 'Forecast busy periods and daily sales', 'Answer business questions (Ask Advice)', 'Suggest products worth stocking'].map(f => (
                <li key={f} className="flex items-center gap-1.5"><span className="text-success text-[6px]">●</span>{f}</li>
              ))}
            </ul>
            <p className="text-[10px] italic mt-1">Flow helps you make smarter decisions — it does not replace them.</p>
          </div>
        ),
      },
      {
        id: 'health', icon: <Heart className="w-4 h-4" />, iconBg: 'rgba(244, 63, 94, 0.12)', iconColor: '#F43F5E', title: 'Store Health Score',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Your Store Health Score reflects overall business performance based on revenue, profit, expenses, inventory levels, savings progress, and outstanding balances. A higher score means a healthier, more profitable business.</p>
            <p className="text-[10px] italic">Tap the score on your dashboard for a full breakdown.</p>
          </div>
        ),
      },
      {
        id: 'requests', icon: <MessageSquare className="w-4 h-4" />, iconBg: 'rgba(20, 184, 166, 0.12)', iconColor: '#2DD4BF', title: 'Customer Requests',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>When a customer asks for a product you don't have, record their request. StoreFlow tracks the product name, frequency, number of requests, and last request date.</p>
            <p>Flow uses this data to recommend which products to stock next.</p>
          </div>
        ),
      },
      {
        id: 'rent', icon: <Home className="w-4 h-4" />, iconBg: 'rgba(59, 130, 246, 0.12)', iconColor: '#60A5FA', title: 'Rent Analysis',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Rented store:</strong> Flow calculates weekly and monthly savings targets to cover rent, including a 10% buffer for increases. It also shows how rent affects your profitability.</p>
            <p><strong className="text-foreground">Owned store:</strong> Flow estimates annual savings, emergency reserves, and property maintenance suggestions.</p>
            <p className="text-[10px] italic">Configure in Settings → Edit Profile.</p>
          </div>
        ),
      },
      {
        id: 'savings', icon: <PiggyBank className="w-4 h-4" />, iconBg: 'rgba(244, 63, 94, 0.12)', iconColor: '#FB7185', title: 'Savings Plan',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Choose between percentage saving (e.g. 10% of profit) or a fixed amount (e.g. ₦5,000 weekly or ₦20,000 monthly). Plans can be enabled or paused at any time.</p>
            <p className="text-[10px] italic">Set up in Settings → Savings Plan.</p>
          </div>
        ),
      },
      {
        id: 'graphs', icon: <BarChart3 className="w-4 h-4" />, iconBg: 'rgba(139, 92, 246, 0.12)', iconColor: '#A78BFA', title: 'Graphs & Activity',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>The Sales Activity graph shows 30-minute intervals by default (Today view). Switch timeframes:</p>
            <ul className="space-y-1 text-[11px]">
              {['Today (hourly)', '7 Days', '14 Days', '30 Days', '1 Year', 'Lifetime'].map(f => (
                <li key={f} className="flex items-center gap-1.5"><span className="text-primary text-[6px]">●</span>{f}</li>
              ))}
            </ul>
            <p>The Dashboard Sales Trend chart can also be filtered by Today, 1 Week, 14 Days, 30 Days, or All Time.</p>
          </div>
        ),
      },
      {
        id: 'trash', icon: <Trash2 className="w-4 h-4" />, iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#F87171', title: 'Data Recovery',
        body: (
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>Nothing is permanently deleted immediately. Deleted products, sales, expenses, and categories all go to Trash and can be restored at any time.</p>
            <p className="text-[10px] italic">Access via: Settings → Data & Storage → Recently Deleted</p>
          </div>
        ),
      },
    ];

    const filteredTopics = topics.filter(topic => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return topic.title.toLowerCase().includes(query) || topic.id.toLowerCase().includes(query);
    });

    return (
      <SubPage title="Help Center" subtitle="Learn, explore and grow your business" onBack={() => { setView('support'); setSearchQuery(''); }}>
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border shadow-sm">
          {filteredTopics.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No matching help articles found.
            </div>
          ) : (
            filteredTopics.map(topic => {
              const isOpen = helpOpen === topic.id;
              return (
                <div key={topic.id} className="transition-all">
                  <button
                    className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2 group"
                    onClick={() => setHelpOpen(isOpen ? null : topic.id)}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: topic.iconBg, color: topic.iconColor }}>
                        {topic.icon}
                      </div>
                      <span className="text-sm font-display font-semibold text-foreground group-hover:text-primary transition-colors">{topic.title}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90 text-primary' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="p-5 bg-black/15 border-t border-border/80 animate-fade-in">
                      {topic.body}
                    </div>
                  )}
                </div>
              );
            })
          )}
          
          {/* Search bar inside the card container at the bottom */}
          <div className="p-4 border-t border-border/60 bg-black/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search help articles..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
        </div>
      </SubPage>
    );
  }

  // ===== SUPPORT HOME =====
  if (view === 'support') return (
    <SubPage title="Support" onBack={() => setView('home')}>
      <div className={`${card} divide-y divide-border`}>
        <SupportRow icon="📖" label="Help Center" onClick={() => { setHelpOpen(null); setView('help'); }} />
        <SupportRow icon="❓" label="FAQ" onClick={() => { setHelpOpen(null); setView('faq'); }} />
        <SupportRow icon="💬" label="Contact Support" onClick={() => setView('contact')} />
        <SupportRow icon="ℹ️" label="About StoreFlow" onClick={() => setView('about')} />
      </div>
    </SubPage>
  );

  // ============ HOME ============
  return (
    <div className="animate-fade-in space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* Left column — profile + Flow */}
        <div className="md:col-span-5 space-y-4">
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
                <Mascot size={64} mood={mgr.enabled ? 'happy' : 'sleeping'} animate={mgr.mascotAnimations} store={store} />
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
        </div>

        {/* Right column — settings tiles */}
        <div className="md:col-span-7 space-y-3">
          <SettingTile icon="🏷️" color="#F2C94C" title="Pricing" desc="Manage profit margin and pricing." right={<><p className="text-[10px] text-muted-foreground">Default Margin</p><p className="text-base font-display font-bold text-primary">{mgr.defaultMargin}%</p></>} onClick={() => setView('pricing')} />
          <SettingTile icon="💸" color="#10B981" title="Discounts" desc="Automatic checkout discount settings."
            right={<>
              <p className="text-[10px] text-muted-foreground">{mgr.autoDiscountEnabled ? 'Active' : 'Disabled'}</p>
              {mgr.autoDiscountEnabled && (
                <p className="text-sm font-display font-bold text-success">
                  {mgr.autoDiscountType === 'percentage' ? `${mgr.autoDiscountValue}%` : `₦${(mgr.autoDiscountValue || 0).toLocaleString()}`}
                </p>
              )}
            </>}
            onClick={() => setView('discount')} />
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
              <div className="flex gap-1 mt-1">{['📊','⭐','⚠️','📘','💰'].map((e,i)=><span key={i} className="w-6 h-6 rounded bg-surface-2 border border-border flex items-center justify-center text-[10px]">{e}</span>)}</div></> } />

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
        </div>
      </div>

      {showTrash && <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />}
      {showSwitcher && <StoreSwitcher currentCode={store.accessCode} onSwitch={onUpdate} onClose={() => setShowSwitcher(false)} />}
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} animate={mgr.mascotAnimations} store={store} />
      )}
      {showContactPopup && (
        <ContactOptionsSheet storeName={store.storeName} onClose={() => setShowContactPopup(false)} />
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
  return (
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold pt-2 pb-1 px-1">
      {children}
    </p>
  );
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

function DataTile({ icon, label, subtitle, onClick, iconBg, iconColor }: { icon: React.ReactNode; label: string; subtitle: string; onClick: () => void; iconBg: string; iconColor: string }) {
  return (
    <button onClick={onClick} className="p-4.5 rounded-2xl bg-card border border-border flex flex-col gap-3.5 hover:border-primary/40 transition-all text-left w-full cursor-pointer active:scale-[0.98]">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className="space-y-1">
        <h4 className="font-display font-bold text-sm text-foreground">{label}</h4>
        <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
      </div>
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
function SavingsModal({ initial, onClose, onSave, animate = true, store }: { initial: SavingsGoal; onClose: () => void; onSave: (g: SavingsGoal) => void; animate?: boolean; store?: StoreData }) {
  const [g, setG] = useState<SavingsGoal>(initial);
  const inp = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary";
  const freqs: SavingsFrequency[] = ['daily', 'weekly', 'monthly'];
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Mascot size={36} mood="happy" animate={animate} store={store} />
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

// ============ EXPORT SHEET ============
function ExportSheet({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const stats = getDashboardStats(store);
  const topSellers = getTopSellers(store, 5);

  const buildReport = () => {
    const p = store.profile;
    let r = `\ud83d\udcca PERFORMANCE REPORT\n`;
    r += `==============================\n`;
    r += `${store.storeName}\n`;
    if (p?.location) r += `\ud83d\udccd ${p.location}\n`;
    r += `\ud83d\udcc5 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    r += `==============================\n\n`;
    r += `\ud83d\udcb0 OVERVIEW\n`;
    r += `Gross Revenue: \u20a6${stats.totalRevenue.toLocaleString()}\n`;
    r += `Total Expenses: \u20a6${stats.totalExpenses.toLocaleString()}\n`;
    r += `Net Income: \u20a6${stats.netIncome.toLocaleString()}\n`;
    r += `Profit: \u20a6${stats.totalProfit.toLocaleString()}\n`;
    r += `Inventory Value: \u20a6${stats.inventoryValue.toLocaleString()}\n`;
    r += `Total Sales: ${stats.totalSales}\n`;
    r += `Products: ${stats.totalProducts}\n`;
    r += `Low Stock Items: ${stats.lowStockProducts.length}\n\n`;
    const soldMap = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    store.sales.forEach(s => {
      const e = soldMap.get(s.productId) || { name: s.productName, qty: 0, revenue: 0, profit: 0 };
      e.qty += s.quantity; e.revenue += s.total; e.profit += s.profit;
      soldMap.set(s.productId, e);
    });
    if (soldMap.size > 0) {
      r += `\ud83d\udce6 SOLD ITEMS\n------------------------------\n`;
      Array.from(soldMap.values()).sort((a, b) => b.revenue - a.revenue).forEach(i => {
        r += `${i.name}: ${i.qty} sold \u2014 \u20a6${i.revenue.toLocaleString()} (profit: \u20a6${i.profit.toLocaleString()})\n`;
      });
      r += '\n';
    }
    r += `\ud83c\udfea INVENTORY\n------------------------------\n`;
    store.products.filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity).forEach(p => {
      r += `${p.name}: ${p.quantity} left (\u20a6${p.sellingPrice.toLocaleString()} each)\n`;
    });
    if (stats.lowStockProducts.length > 0) {
      r += `\n\u26a0\ufe0f LOW STOCK\n------------------------------\n`;
      stats.lowStockProducts.forEach(p => { r += `${p.name}: only ${p.quantity} left!\n`; });
    }
    if (topSellers.length > 0) {
      r += `\n\ud83c\udfc6 TOP SELLERS\n------------------------------\n`;
      topSellers.forEach((t, i) => { r += `${i + 1}. ${t.name} \u2014 ${t.totalSold} units (\u20a6${t.revenue.toLocaleString()})\n`; });
    }
    r += `\n==============================\nGenerated by StoreFlow\n`;
    return r;
  };

  const buildCSV = () => {
    let csv = 'Type,Name,Category,Cost Price,Selling Price,Quantity,Value\n';
    store.products.forEach(p => {
      csv += `Product,"${p.name}","${p.category}",${p.costPrice},${p.sellingPrice},${p.quantity},${p.costPrice * p.quantity}\n`;
    });
    csv += '\nDate,Product,Quantity,Unit Price,Total,Profit\n';
    store.sales.forEach(s => {
      csv += `${new Date(s.date).toLocaleDateString()},"${s.productName}",${s.quantity},${s.unitPrice},${s.total},${s.profit}\n`;
    });
    return csv;
  };

  const download = (content: string, name: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const slug = store.storeName.replace(/\s+/g, '_');

  const handlePDF = async () => {
    setLoading('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      let y = 15;
      const row = (left: string, right: string, bold = false) => {
        if (y > 272) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(10); doc.setTextColor(20, 20, 20);
        doc.text(left, 15, y);
        doc.setFont('helvetica', 'bold');
        doc.text(right, W - 15, y, { align: 'right' });
        y += 7;
      };
      const heading = (text: string, r = 99, g = 102, b = 241) => {
        if (y > 272) { doc.addPage(); y = 15; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.setTextColor(r, g, b); doc.text(text, 15, y); y += 7;
        doc.setTextColor(20, 20, 20);
      };
      // Header banner
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, W, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text('StoreFlow', 15, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text('Performance Report', 15, 20);
      doc.text(new Date().toLocaleDateString(), W - 15, 20, { align: 'right' });
      y = 38;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20);
      doc.text(store.storeName, 15, y); y += 7;
      if (store.profile?.location) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
        doc.text(store.profile.location, 15, y); y += 7;
      }
      y += 3;
      heading('OVERVIEW');
      row('Gross Revenue', `\u20a6${stats.totalRevenue.toLocaleString()}`);
      row('Total Expenses', `\u20a6${stats.totalExpenses.toLocaleString()}`);
      row('Net Income', `\u20a6${stats.netIncome.toLocaleString()}`, true);
      row('Profit', `\u20a6${stats.totalProfit.toLocaleString()}`, true);
      row('Inventory Value', `\u20a6${stats.inventoryValue.toLocaleString()}`);
      row('Total Sales', `${stats.totalSales}`);
      row('Products', `${stats.totalProducts}`);
      row('Low Stock Items', `${stats.lowStockProducts.length}`);
      y += 3;
      if (topSellers.length > 0) {
        heading('TOP SELLERS');
        topSellers.forEach((t, i) => {
          if (y > 272) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
          doc.text(`${i + 1}. ${t.name} \u2014 ${t.totalSold} units  \u20a6${t.revenue.toLocaleString()}`, 15, y);
          y += 7;
        });
        y += 3;
      }
      if (stats.lowStockProducts.length > 0) {
        heading('LOW STOCK ALERTS', 220, 38, 38);
        stats.lowStockProducts.forEach(p => {
          if (y > 272) { doc.addPage(); y = 15; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(180, 30, 30);
          doc.text(`\u2022 ${p.name}: only ${p.quantity} left`, 15, y); y += 7;
        });
      }
      // Footer
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFillColor(245, 245, 250);
        doc.rect(0, 285, W, 12, 'F');
        doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
        doc.text('Generated by StoreFlow \u00b7 Innie Group', W / 2, 292, { align: 'center' });
        doc.text(`Page ${i} of ${pages}`, W - 15, 292, { align: 'right' });
      }
      doc.save(`StoreFlow_Report_${slug}.pdf`);
      showToast('PDF exported!');
    } catch {
      showToast('PDF export failed', 'error');
    }
    setLoading(null); onClose();
  };

  const handleText = () => {
    setLoading('text');
    download(buildReport(), `StoreFlow_${slug}.txt`, 'text/plain');
    showToast('Text report downloaded');
    setLoading(null); onClose();
  };

  const handleCSV = () => {
    setLoading('csv');
    download(buildCSV(), `StoreFlow_${slug}.csv`, 'text/csv');
    showToast('CSV downloaded');
    setLoading(null); onClose();
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildReport())}`, '_blank');
    onClose();
  };

  const handleShare = async () => {
    const text = buildReport();
    if (navigator.share) {
      try { await navigator.share({ title: `StoreFlow Report \u2014 ${store.storeName}`, text }); }
      catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Report copied to clipboard');
    }
    onClose();
  };

  const options = [
    { id: 'pdf',  icon: '\ud83d\udcc4', label: 'Export as PDF',      sub: 'Formatted report saved to your device', color: 'text-destructive', action: handlePDF },
    { id: 'text', icon: '\ud83d\udcdd', label: 'Export as Text',     sub: 'Plain text .txt file',                 color: 'text-foreground',  action: handleText },
    { id: 'csv',  icon: '\ud83d\udcca', label: 'Export as CSV',      sub: 'Spreadsheet-ready data file',          color: 'text-success',     action: handleCSV },
    { id: 'wa',   icon: '\ud83d\udcac', label: 'Share to WhatsApp',  sub: 'Send report via WhatsApp',             color: 'text-success',     action: handleWhatsApp },
    { id: 'share',icon: '\ud83d\udce4', label: 'Share\u2026',        sub: 'Send with any app on your device',     color: 'text-primary',     action: handleShare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up"
        style={{ maxWidth: '448px', margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-3">
          <h3 className="font-display font-bold text-lg">Export Data</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Choose export format or sharing method</p>
        </div>
        <div className="px-4 space-y-1">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={opt.action}
              disabled={loading !== null}
              className="w-full flex items-center gap-4 p-3 rounded-2xl text-left transition-colors hover:bg-surface-2 active:bg-surface-2 disabled:opacity-60"
            >
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-xl shrink-0">
                {loading === opt.id ? '\u23f3' : opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-display font-semibold ${opt.color}`}>{opt.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</p>
              </div>
              <span className="shrink-0 text-muted-foreground text-lg">›</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-4">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl border border-border text-muted-foreground font-display font-semibold text-sm transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface ContactOptionsSheetProps {
  storeName: string;
  onClose: () => void;
}

function ContactOptionsSheet({ storeName, onClose }: ContactOptionsSheetProps) {
  const [activeTab, setActiveTab] = useState<'menu' | 'bug' | 'feature'>('menu');
  const [bugSubject, setBugSubject] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [featureDesc, setFeatureDesc] = useState('');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied`);
  };

  const options = [
    {
      id: 'wa',
      icon: '💬',
      label: 'WhatsApp Support',
      desc: 'Chat directly with the StoreFlow team.',
      action: () => {
        window.open('https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow.', '_blank');
      }
    },
    {
      id: 'email',
      icon: '✉️',
      label: 'Email Support',
      desc: 'Send a detailed issue or request.',
      action: () => {
        window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Support%20Request&body=Hello%20StoreFlow%20Team,%0A%0AI%20need%20help%20with:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
      }
    },
    {
      id: 'bug',
      icon: '🪲',
      label: 'Report a Bug',
      desc: 'Tell us about an issue in the app.',
      action: () => setActiveTab('bug')
    },
    {
      id: 'feature',
      icon: '💡',
      label: 'Suggest a Feature',
      desc: 'Help improve StoreFlow by sharing your ideas.',
      action: () => setActiveTab('feature')
    },
    {
      id: 'partner',
      icon: '🤝',
      label: 'Business Partnership',
      desc: 'Discuss supplier partnerships, promotions, and opportunities.',
      action: () => {
        window.open('mailto:inniegroup@gmail.com?subject=StoreFlow%20Business%20Partnership%20Proposal&body=Hello%20StoreFlow%20Team,%0A%0AI%20would%20like%20to%20discuss%20a%20business%20partnership/promotion%20opportunity%20with%20StoreFlow.%0A%0AStore%20Name:%20' + encodeURIComponent(storeName) + '%0A%0ADetails:%0A%0A_________________________%0A%0AThank%20you.', '_blank');
      }
    }
  ];

  const handleSendBug = () => {
    if (!bugSubject.trim() || !bugDesc.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    const subject = `StoreFlow Bug Report: ${bugSubject}`;
    const body = `Hello StoreFlow Team,

I found a bug in the app.

Issue Summary:
${bugSubject}

Description & Steps to Reproduce:
${bugDesc}

Store Name: ${storeName}
OS/Browser: ${navigator.userAgent}
Screen Size: ${window.innerWidth}x${window.innerHeight}

Thank you.`;

    window.open(`mailto:inniegroup@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    showToast('Mail client opened');
    setActiveTab('menu');
  };

  const handleSendFeature = () => {
    if (!featureName.trim() || !featureDesc.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    const subject = `StoreFlow Feature Suggestion: ${featureName}`;
    const body = `Hello StoreFlow Team,

I would like to suggest a new feature for StoreFlow.

Feature Suggestion:
${featureName}

Description:
${featureDesc}

Store Name: ${storeName}

Thank you.`;

    window.open(`mailto:inniegroup@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    showToast('Mail client opened');
    setActiveTab('menu');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
        style={{ maxWidth: '448px', margin: '0 auto', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>

        {activeTab === 'menu' && (
          <>
            <div className="px-5 pb-2 shrink-0">
              <h3 className="font-display font-bold text-xl text-primary">Contact Us</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Support Hours: Monday - Sunday</p>
              <p className="text-[10px] text-muted-foreground">StoreFlow Support Team · Innie Group</p>
            </div>

            <div className="px-4 space-y-1 overflow-y-auto max-h-[50vh] no-scrollbar">
              {options.map(opt => (
                <button
                  key={opt.id}
                  onClick={opt.action}
                  className="w-full flex items-center gap-3.5 p-3 rounded-2xl text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
                >
                  <div className="w-10 h-10 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-lg shrink-0">
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-bold text-foreground">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-base">›</span>
                </button>
              ))}
            </div>

            {/* Quick Copy Section */}
            <div className="px-5 py-3 border-t border-border mt-3 space-y-2 bg-surface-2/40 shrink-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">StoreFlow Contact Details</p>
              
              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-card border border-border">
                <span className="text-muted-foreground">WhatsApp: <strong className="text-foreground">07025517388</strong></span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleCopy('07025517388', 'WhatsApp phone number')}
                    className="px-2.5 py-1 rounded bg-success/10 text-success text-[10px] font-semibold"
                  >
                    Copy
                  </button>
                  <a
                    href="https://wa.me/2347025517388?text=Hello%20StoreFlow%20Team,%20I%20need%20assistance%20with%20StoreFlow."
                    target="_blank" rel="noopener noreferrer"
                    className="w-5 h-5 flex items-center justify-center text-xs"
                    title="Open chat"
                  >
                    💬
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-card border border-border">
                <span className="text-muted-foreground truncate mr-2">Email: <strong className="text-foreground">inniegroup@gmail.com</strong></span>
                <button
                  onClick={() => handleCopy('inniegroup@gmail.com', 'Support email address')}
                  className="px-2.5 py-1 rounded bg-primary/10 text-primary text-[10px] font-semibold shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'bug' && (
          <div className="px-5 pb-2 flex-1 flex flex-col min-h-0">
            <div className="py-2 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-lg text-destructive">Report a Bug 🪲</h3>
              <button onClick={() => setActiveTab('menu')} className="text-xs text-muted-foreground hover:underline">Back</button>
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto pb-4 no-scrollbar">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Subject / Short Summary</label>
                <input
                  type="text"
                  placeholder="e.g. Sales checkout is slow"
                  value={bugSubject}
                  onChange={e => setBugSubject(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-destructive"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Details & Steps to Reproduce</label>
                <textarea
                  placeholder="Tell us what you did, what you expected, and what actually happened..."
                  value={bugDesc}
                  onChange={e => setBugDesc(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-destructive resize-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 text-[10px] text-muted-foreground/80 space-y-1">
                <p className="font-semibold text-destructive/80">Included System Details (automatic):</p>
                <p className="truncate">Device: {navigator.userAgent}</p>
                <p>Store: {storeName}</p>
              </div>
            </div>

            <div className="py-3 border-t border-border flex gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('menu')}
                className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendBug}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-display font-bold"
              >
                Open Mail to Send
              </button>
            </div>
          </div>
        )}

        {activeTab === 'feature' && (
          <div className="px-5 pb-2 flex-1 flex flex-col min-h-0">
            <div className="py-2 flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-lg text-primary">Suggest a Feature 💡</h3>
              <button onClick={() => setActiveTab('menu')} className="text-xs text-muted-foreground hover:underline">Back</button>
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto pb-4 no-scrollbar">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Feature Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dark mode automatic toggle"
                  value={featureName}
                  onChange={e => setFeatureName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Description & Why it's useful</label>
                <textarea
                  placeholder="Describe your idea and how it would help you run your store..."
                  value={featureDesc}
                  onChange={e => setFeatureDesc(e.target.value)}
                  rows={5}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="py-3 border-t border-border flex gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('menu')}
                className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendFeature}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-bold"
              >
                Open Mail to Send
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pb-4 pt-1 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl border border-border text-muted-foreground font-display font-semibold text-sm transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
