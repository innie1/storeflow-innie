import { useState, useEffect } from 'react';
import { StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';

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
  onLock: () => void;
}

export default function Settings({ store, onLock }: SettingsProps) {
  const [timer, setTimer] = useState<LockTimer>(getLockTimer());

  useEffect(() => {
    saveLockTimer(timer);
    // Update session with new timer
    saveSession(store.accessCode);
  }, [timer, store.accessCode]);

  const options: { value: LockTimer; label: string; desc: string }[] = [
    { value: '1h', label: '1 Hour', desc: 'Auto-lock after 1 hour of inactivity' },
    { value: '12h', label: '12 Hours', desc: 'Auto-lock after 12 hours' },
    { value: 'never', label: 'Always Open', desc: 'Stay logged in until you lock manually' },
  ];

  const handleLock = () => {
    clearSession();
    onLock();
    showToast('Store locked');
  };

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xl">
            👤
          </div>
          <div>
            <h3 className="font-display font-bold text-lg">{store.storeName}</h3>
            <p className="text-xs text-muted-foreground font-mono">{store.accessCode}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-display font-bold text-base">Lock Timer</h3>
        <p className="text-xs text-muted-foreground">Choose how long your store stays unlocked after login.</p>
        
        <div className="space-y-2">
          {options.map(opt => (
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
