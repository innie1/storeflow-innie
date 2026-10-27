import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, KeyRound, Smartphone, XCircle } from 'lucide-react';
import {
  deviceLabel, identifyWorker, issueRecoveryCode, joinErrorText, joinStatus, normaliseRecoveryCode, readJoin,
  recoverAccess, redeemCode, requestAccess, writeJoin, type JoinRecord, type StaffMatch,
} from '@/lib/staff-join';
import { inAppBrowser, keepPhoneData, openInChromeLink } from '@/lib/phone-keep';

/**
 * "Join a Store", for somebody who works at a shop that uses StoreFlow.
 *
 * Store ID and their own PIN, then "You are Faith?", then a request the owner
 * approves with a 6-digit code. The worker never sees or needs the owner's
 * email, password or access code. Leaving and coming back picks the request
 * up where it was.
 *
 * Once approved the phone shows a recovery code to keep as a screenshot. A
 * phone that has lost what it knew - its browser data cleared, or opened in
 * another browser - comes back with Store ID, PIN and that code, and needs
 * the owner for nothing.
 */

interface Props {
  onBack: () => void;
  /** The Store ID an invite QR brought, filled in for the worker. */
  initialStoreRef?: string;
}

type Step = 'details' | 'recover' | 'confirm' | 'waiting' | 'done' | 'rejected';

const POLL_MS = 8000;

const roleLabel = (role?: string) => role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

function stepFor(record: JoinRecord | null): Step {
  if (!record) return 'details';
  if (record.status === 'authorized') return 'done';
  if (record.status === 'rejected' || record.status === 'revoked') return 'rejected';
  return 'waiting';
}

export default function JoinStore({ onBack, initialStoreRef = '' }: Props) {
  const [record, setRecord] = useState<JoinRecord | null>(readJoin);
  const [step, setStep] = useState<Step>(() => stepFor(readJoin()));
  const [storeRef, setStoreRef] = useState(initialStoreRef);
  const [pin, setPin] = useState('');
  const [storeName, setStoreName] = useState('');
  const [matches, setMatches] = useState<StaffMatch[]>([]);
  const [chosen, setChosen] = useState<StaffMatch | null>(null);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeReady, setCodeReady] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  /** The recovery code to screenshot - shown once, the cloud keeps only its hash. */
  const [recoveryCode, setRecoveryCode] = useState('');
  const elsewhere = inAppBrowser();
  const chromeLink = elsewhere ? openInChromeLink() : '';
  const recordRef = useRef(record);
  recordRef.current = record;

  useEffect(() => { void deviceLabel().then(setLabel); }, []);

  const keep = (next: JoinRecord | null) => {
    writeJoin(next);
    setRecord(next);
    setStep(stepFor(next));
  };

  // While waiting, ask now and then whether the owner has answered. Only while
  // this screen is open and in front - it costs a request each time.
  useEffect(() => {
    if (step !== 'waiting' || !record) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const current = recordRef.current;
      if (!current) return;
      const result = await joinStatus(current.requestId);
      if (stopped || 'error' in result) return;
      setCodeReady(result.code_ready);
      if (result.status !== current.status) keep({ ...current, status: result.status });
    };
    void check();
    const timer = window.setInterval(check, POLL_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [step, record?.requestId]);

  const findMe = async () => {
    setError('');
    if (!storeRef.trim()) return setError('Type the Store ID the owner gave you.');
    if (!/^\d{4}$/.test(pin.trim())) return setError('Your staff PIN is 4 digits.');
    setBusy(true);
    const result = await identifyWorker(storeRef, pin);
    setBusy(false);
    if ('error' in result) return setError(joinErrorText(result.error));
    setStoreName(result.store_name);
    setMatches(result.matches);
    setChosen(result.matches.length === 1 ? result.matches[0] : null);
    setStep('confirm');
  };

  const ask = async () => {
    if (!chosen) return setError('Choose which one is you.');
    setError('');
    setBusy(true);
    const result = await requestAccess(storeRef, pin, chosen.staff_id, label.trim() || 'Phone');
    setBusy(false);
    if ('error' in result) return setError(joinErrorText(result.error));
    setPin('');
    keep({
      requestId: result.request_id,
      storeRef,
      storeName: result.store_name,
      staffId: chosen.staff_id,
      staffName: result.staff_name,
      staffRole: result.staff_role,
      status: result.status,
    });
  };

  const enterCode = async () => {
    if (!record) return;
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setError('The code has 6 digits.');
    setError('');
    setBusy(true);
    const result = await redeemCode(record.requestId, digits);
    setBusy(false);
    if ('error' in result) {
      setCode('');
      if (result.error === 'no_code' || result.error === 'expired') setCodeReady(false);
      return setError(joinErrorText(result.error, result.tries_left));
    }
    keep({ ...record, status: 'authorized' });
    void keepPhoneData();
    const issued = await issueRecoveryCode(record.requestId);
    if (!('error' in issued)) setRecoveryCode(issued.recovery_code);
  };

  const recover = async () => {
    setError('');
    if (!storeRef.trim()) return setError('Type the Store ID the owner gave you.');
    if (!/^\d{4}$/.test(pin.trim())) return setError('Your staff PIN is 4 digits.');
    if (recoveryInput.replace(/-/g, '').length !== 12) return setError('The recovery code has 12 letters and numbers.');
    setBusy(true);
    const result = await recoverAccess(storeRef, pin, recoveryInput, label.trim() || 'Phone');
    setBusy(false);
    if ('error' in result) return setError(joinErrorText(result.error));
    setPin('');
    setRecoveryInput('');
    setRecoveryCode(result.recovery_code);
    keep({
      requestId: result.request_id,
      storeRef,
      storeName: result.store_name,
      staffId: result.staff_id,
      staffName: result.staff_name,
      staffRole: result.staff_role,
      status: 'authorized',
    });
    void keepPhoneData();
  };

  const startOver = () => {
    keep(null);
    setStoreRef('');
    setPin('');
    setCode('');
    setError('');
  };

  const input = 'w-full h-12 px-3 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary';
  const primary = 'w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-black disabled:opacity-60 active:scale-[0.98] transition';

  return (
    <div className="space-y-4 text-left animate-fade-in">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {elsewhere && (step === 'details' || step === 'recover') && (
        <div role="alert" className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-sm space-y-2">
          <p className="flex gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
            This opened inside {elsewhere}, not in Chrome.
          </p>
          <p className="text-muted-foreground">
            Join here and this phone is approved only inside {elsewhere}. Open StoreFlow from Chrome later and you would have to join all over again.
          </p>
          {chromeLink
            ? <a href={chromeLink} className="block w-full h-10 leading-10 text-center rounded-lg bg-amber-500 text-black font-display font-bold">Open in Chrome</a>
            : <p className="text-muted-foreground">Tap the menu (⋮) and choose <span className="font-semibold text-foreground">Open in browser</span>.</p>}
        </div>
      )}

      {step === 'details' && (
        <>
          <div>
            <h3 className="font-display font-black text-xl">Join a Store</h3>
            <p className="text-sm text-muted-foreground mt-1">
              For people who work at a shop that uses StoreFlow. You need the shop's Store ID and your own staff PIN.
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Store ID</span>
            <input
              value={storeRef}
              onChange={e => { setStoreRef(e.target.value.toUpperCase()); setError(''); }}
              placeholder="SF-XXXXXX"
              autoCapitalize="characters"
              autoComplete="off"
              className={`${input} font-mono tracking-wider`}
            />
            {initialStoreRef && storeRef === initialStoreRef && (
              <span className="block mt-1 text-[11px] text-muted-foreground">Filled in from the shop's invite.</span>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Your staff PIN</span>
            <input
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={!!initialStoreRef}
              placeholder="4 digits"
              className={`${input} ${pin ? 'tracking-[0.5em]' : ''}`}
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={findMe} disabled={busy} className={primary}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <button type="button" onClick={() => { setStep('recover'); setError(''); }} className="w-full text-sm text-primary font-semibold">
            I joined before and have a recovery code
          </button>
        </>
      )}

      {step === 'recover' && (
        <>
          <div>
            <h3 className="font-display font-black text-xl">Back in with your recovery code</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The code you were shown when this shop first let you in - look for the screenshot. No need to ask the owner.
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Store ID</span>
            <input
              value={storeRef}
              onChange={e => { setStoreRef(e.target.value.toUpperCase()); setError(''); }}
              placeholder="SF-XXXXXX"
              autoCapitalize="characters"
              autoComplete="off"
              className={`${input} font-mono tracking-wider`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Your staff PIN</span>
            <input
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4 digits"
              className={`${input} ${pin ? 'tracking-[0.5em]' : ''}`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Recovery code</span>
            <input
              value={recoveryInput}
              onChange={e => { setRecoveryInput(normaliseRecoveryCode(e.target.value)); setError(''); }}
              placeholder="XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className={`${input} font-mono tracking-wider text-center`}
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={recover} disabled={busy} className={primary}>
            {busy ? 'Checking…' : 'Get back in'}
          </button>
          <button type="button" onClick={() => { setStep('details'); setError(''); }} className="w-full text-sm text-muted-foreground">
            I don't have a recovery code
          </button>
        </>
      )}

      {step === 'confirm' && (
        <>
          <div>
            <p className="text-xs text-muted-foreground">Request access to</p>
            <h3 className="font-display font-black text-xl">{storeName}</h3>
          </div>
          {matches.length > 1 && <p className="text-sm text-muted-foreground">More than one worker has that PIN. Which one is you?</p>}
          <div className="space-y-2">
            {matches.map(match => (
              <button
                key={match.staff_id}
                type="button"
                onClick={() => setChosen(match)}
                className={`w-full p-3 rounded-xl border text-left ${chosen?.staff_id === match.staff_id ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
              >
                <p className="font-display font-bold">{matches.length === 1 ? `You are ${match.name}` : match.name}</p>
                {match.role && <p className="text-xs text-muted-foreground">{roleLabel(match.role)}</p>}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">This phone</span>
            <div className="relative">
              <Smartphone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={label} onChange={e => setLabel(e.target.value.slice(0, 60))} className={`${input} pl-9`} />
            </div>
          </label>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={ask} disabled={busy || !chosen} className={primary}>
            {busy ? 'Sending…' : 'Request Access'}
          </button>
          <button type="button" onClick={() => { setStep('details'); setError(''); }} className="w-full text-sm text-muted-foreground">
            That's not me
          </button>
        </>
      )}

      {step === 'waiting' && record && (
        <>
          <div className="text-center">
            <Clock className="w-12 h-12 mx-auto text-amber-500" />
            <h3 className="mt-2 font-display font-black text-xl">Waiting for the owner</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {record.staffName} asked to join <span className="font-semibold text-foreground">{record.storeName}</span> on this phone.
              Ask the owner to approve it. They will give you a 6-digit code.
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              {codeReady ? 'The owner has approved. Enter the code they gave you' : 'Code from the owner'}
            </span>
            <input
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={`${input} text-center text-2xl font-display font-black tracking-[0.4em]`}
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="button" onClick={enterCode} disabled={busy} className={primary}>
            {busy ? 'Checking…' : 'Enter code'}
          </button>
          <button type="button" onClick={startOver} className="w-full text-sm text-muted-foreground">Cancel this request</button>
        </>
      )}

      {step === 'done' && record && (
        <div className="text-center space-y-3">
          <CheckCircle2 className="w-14 h-14 mx-auto text-success" />
          <h3 className="font-display font-black text-xl">This phone is approved</h3>
          <p className="text-sm text-muted-foreground">
            {record.staffName} can use <span className="font-semibold text-foreground">{record.storeName}</span> on this phone.
          </p>
          {recoveryCode && <RecoveryCodeCard code={recoveryCode} />}
          <p className="text-xs text-muted-foreground">
            Always open StoreFlow the same way - best from its icon on your home screen. Opened from WhatsApp or another browser, this phone will not know the shop.
          </p>
          <button type="button" onClick={onBack} className={primary}>
            {recoveryCode ? "I've taken a screenshot - sign in" : 'Sign in now'}
          </button>
        </div>
      )}

      {step === 'rejected' && record && (
        <div className="text-center space-y-3">
          <XCircle className="w-14 h-14 mx-auto text-destructive" />
          <h3 className="font-display font-black text-xl">Not approved</h3>
          <p className="text-sm text-muted-foreground">The owner of {record.storeName} did not approve this phone. You can ask again.</p>
          <button type="button" onClick={startOver} className={primary}>Ask again</button>
        </div>
      )}
    </div>
  );
}

/** The recovery code, big enough to read back off a screenshot. */
export function RecoveryCodeCard({ code }: { code: string }) {
  return (
    <div className="p-4 rounded-2xl border-2 border-primary/50 bg-primary/5 text-center space-y-2">
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <KeyRound className="w-4 h-4" /> Your recovery code
      </p>
      <p className="font-mono font-black text-2xl tracking-wider select-all" data-testid="recovery-code">{code}</p>
      <p className="text-xs text-muted-foreground">
        Take a screenshot now. If this phone ever forgets the shop, this code, the Store ID and your PIN let you back in without the owner. It is shown only once.
      </p>
    </div>
  );
}
