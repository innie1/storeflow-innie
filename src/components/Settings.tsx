import { useState, useEffect } from 'react';
import { StoreData, StoreProfile } from '@/types/store';
import { saveStore, getTrash } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import StoreSwitcher from '@/components/StoreSwitcher';
import { getLowStockThreshold, saveLowStockThreshold } from '@/lib/settings';

export type LockTimer = '1h' | '12h' | 'never';

const LOCK_TIMER_KEY = 'storeflow_lock_timer';
const SESSION_KEY = 'storeflow_session';

interface SessionData {
  accessCode: string;
  loginAt: number;
  lockTimer: LockTimer;
}

export function saveLockTimer(timer: LockTimer) {
  localStorage.setItem(LOCK_TIMER_KEY, timer);
}

export function getLockTimer(): LockTimer {
  return (localStorage.getItem(LOCK_TIMER_KEY) as LockTimer) || '1h';
}

export function saveSession(accessCode: string) {
  const session: SessionData = {
    accessCode,
    loginAt: Date.now(),
    lockTimer: getLockTimer(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getActiveSession(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session: SessionData = JSON.parse(raw);
    const timer = getLockTimer();
    if (timer === 'never') return session.accessCode;
    const maxMs = timer === '1h' ? 3600000 : 43200000;
    if (Date.now() - session.loginAt > maxMs) {
      clearSession();
      return null;
    }
    return session.accessCode;
  } catch {
    return null;
  }
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
  const trashCount = getTrash(store).length;

  const handleThemeChange = (t: ThemeId) => {
    setTheme(t);
    applyTheme(t);
    showToast(`Theme: ${THEMES.find(x => x.id === t)?.label}`);
  };

  useEffect(() => {
    saveLockTimer(timer);
    saveSession(store.accessCode);
  }, [timer, store.accessCode]);

  const timerOptions: { value: LockTimer; label: string; desc: string; icon: string }[] = [
    { value: '1h', label: '1 Hour', desc: 'Auto-lock after 1 hour', icon: '🕐' },
    { value: '12h', label: '12 Hours', desc: 'Auto-lock after 12 hours', icon: '🕐' },
    { value: 'never', label: 'Always Open', desc: 'Stay logged in until you lock manually', icon: '🔓' },
  ];

  const handleSaveProfile = () => {
    const updated = { ...store, profile };
    saveStore(updated);
    onUpdate(updated);
    setEditing(false);
    showToast('Profile updated');
  };

  const handleLock = () => {
    clearSession();
    onLock();
    showToast('Store locked');
  };

  const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm";

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      {/* Store Profile Card */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-2xl">
              🏪
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">{store.storeName}</h3>
              <p className="text-xs text-muted-foreground font-mono">{store.accessCode}</p>
              {store.profile?.storeType && store.profile?.location && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  📍 {store.profile.storeType} • {store.profile.location}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors font-display font-semibold"
          >
            {editing ? '✕ Cancel' : '✏️ Edit'}
          </button>
        </div>

        {editing && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Store Type</label>
              <select
                value={profile.storeType}
                onChange={e => setProfile({ ...profile, storeType: e.target.value })}
                className={inputClass}
              >
                <option value="">Select type...</option>
                {['Retail Shop', 'Supermarket', 'Provision Store', 'Mini Mart', 'Wholesale', 'Pharmacy', 'Restaurant', 'Other'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Location / Address</label>
              <input
                value={profile.location}
                onChange={e => setProfile({ ...profile, location: e.target.value })}
                placeholder="e.g. 12 Market Road, Lagos"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Phone Number</label>
              <input
                value={profile.phone}
                onChange={e => setProfile({ ...profile, phone: e.target.value })}
                placeholder="e.g. 08012345678"
                type="tel"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                value={profile.email}
                onChange={e => setProfile({ ...profile, email: e.target.value })}
                placeholder="e.g. store@example.com"
                type="email"
                className={inputClass}
              />
            </div>
            <button
              onClick={handleSaveProfile}
              className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity"
            >
              Save Profile
            </button>
          </div>
        )}
      </div>

      {/* Appearance - Compact horizontal theme cards */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <h3 className="font-display font-bold text-base">Appearance</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => handleThemeChange(t.id)}
              className={`relative p-3 rounded-xl border text-center transition-all ${
                theme === t.id
                  ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
                  : 'bg-surface-2 border-border hover:border-primary/30'
              }`}
            >
              {theme === t.id && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">✓</span>
              )}
              <div
                className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg border border-border"
                style={{ background: t.swatch }}
              >
                {t.emoji}
              </div>
              <p className="font-display font-semibold text-xs text-foreground">{t.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Low Stock Threshold */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-base">Low Stock Alert</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Items at or below this quantity are flagged as low stock</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={lowStock}
            onChange={e => setLowStock(e.target.value)}
            className={inputClass + ' flex-1'}
          />
          <button
            onClick={() => {
              const n = Number(lowStock);
              if (!Number.isFinite(n) || n < 0) return showToast('Enter a valid number', 'error');
              saveLowStockThreshold(n);
              showToast(`Low-stock threshold set to ${Math.floor(n)}`);
            }}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>

      {/* Lock Timer */}
      <div className="bg-card shadow-card rounded-xl p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-base">Lock Timer</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Choose how long your store stays unlocked</p>
        </div>
        <div className="space-y-2">
          {timerOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimer(opt.value)}
              className={`w-full p-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${
                timer === opt.value
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-surface-2 border-border hover:border-primary/20'
              }`}
            >
              <span className="text-lg">{opt.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-sm text-foreground">{opt.label}</span>
                </div>
                <p className="text-[11px] mt-0.5 text-muted-foreground">{opt.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                timer === opt.value ? 'border-primary bg-primary' : 'border-muted-foreground'
              }`}>
                {timer === opt.value && <span className="text-primary-foreground text-[10px]">✓</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Switch Store */}
      <button
        onClick={() => setShowSwitcher(true)}
        className="w-full p-3 rounded-xl bg-card shadow-card flex items-center justify-between hover:ring-1 hover:ring-primary/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div className="text-left">
            <p className="font-display font-semibold text-sm">Switch Store</p>
            <p className="text-[11px] text-muted-foreground">Manage and switch between your stores on this device</p>
          </div>
        </div>
        <span className="text-muted-foreground">›</span>
      </button>

      {/* Recently Deleted */}
      <button
        onClick={() => setShowTrash(true)}
        className="w-full p-3 rounded-xl bg-card shadow-card flex items-center justify-between hover:ring-1 hover:ring-primary/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗑</span>
          <div className="text-left">
            <p className="font-display font-semibold text-sm">Recently Deleted</p>
            <p className="text-[11px] text-muted-foreground">Restore items deleted in the last 7 days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trashCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-display font-semibold">
              {trashCount}
            </span>
          )}
          <span className="text-muted-foreground">›</span>
        </div>
      </button>

      <button
        onClick={handleLock}
        className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-display font-semibold hover:bg-destructive/20 transition-colors"
      >
        🔒 Lock Store Now
      </button>

      {showTrash && (
        <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />
      )}
      {showSwitcher && (
        <StoreSwitcher
          currentCode={store.accessCode}
          onSwitch={onUpdate}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  );
}
