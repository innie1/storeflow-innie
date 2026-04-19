import { useState, useEffect } from 'react';
import { StoreData, StoreProfile } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';

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
  const [profile, setProfile] = useState<StoreProfile>(
    store.profile || { storeType: '', location: '', phone: '', email: '' }
  );

  const handleThemeChange = (t: ThemeId) => {
    setTheme(t);
    applyTheme(t);
    showToast(`Theme: ${THEMES.find(x => x.id === t)?.label}`);
  };

  useEffect(() => {
    saveLockTimer(timer);
    saveSession(store.accessCode);
  }, [timer, store.accessCode]);

  const timerOptions: { value: LockTimer; label: string; desc: string }[] = [
    { value: '1h', label: '1 Hour', desc: 'Auto-lock after 1 hour of inactivity' },
    { value: '12h', label: '12 Hours', desc: 'Auto-lock after 12 hours' },
    { value: 'never', label: 'Always Open', desc: 'Stay logged in until you lock manually' },
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
      {/* Store Profile */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xl">
              🏪
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">{store.storeName}</h3>
              <p className="text-xs text-muted-foreground font-mono">{store.accessCode}</p>
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors font-display font-semibold"
          >
            {editing ? '✕ Cancel' : '✏️ Edit'}
          </button>
        </div>

        {!editing && store.profile && (
          <div className="space-y-2 text-sm">
            {store.profile.storeType && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="text-foreground">{store.profile.storeType}</span>
              </div>
            )}
            {store.profile.location && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location:</span>
                <span className="text-foreground">{store.profile.location}</span>
              </div>
            )}
            {store.profile.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="text-foreground">{store.profile.phone}</span>
              </div>
            )}
            {store.profile.email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="text-foreground">{store.profile.email}</span>
              </div>
            )}
            {!store.profile.storeType && !store.profile.location && !store.profile.phone && !store.profile.email && (
              <p className="text-xs text-muted-foreground text-center">No profile info yet. Tap Edit to add.</p>
            )}
          </div>
        )}

        {editing && (
          <div className="space-y-3">
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

      {/* Lock Timer */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-display font-bold text-base">Lock Timer</h3>
        <p className="text-xs text-muted-foreground">Choose how long your store stays unlocked after login.</p>
        <div className="space-y-2">
          {timerOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimer(opt.value)}
              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                timer === opt.value
                  ? 'bg-primary/10 border-primary/40 text-foreground'
                  : 'bg-surface-2 border-border text-muted-foreground hover:border-primary/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-sm">{opt.label}</span>
                {timer === opt.value && <span className="text-primary text-sm">✓</span>}
              </div>
              <p className="text-xs mt-0.5 opacity-70">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleLock}
        className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-display font-semibold hover:bg-destructive/20 transition-colors"
      >
        🔒 Lock Store Now
      </button>
    </div>
  );
}
