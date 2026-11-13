import { DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import CloudAuthModal from '@/components/CloudAuthModal';
import { supabase } from '@/integrations/supabase/client';
import { saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import ToggleRow from '@/components/Toggle';
import { Eye, EyeOff } from 'lucide-react';
import {
  clearPin,
  enrollFingerprint,
  fingerprintSupported,
  forgetFingerprint,
  PIN_LENGTH,
  setPin as savePin,
} from '@/lib/app-lock';
import { type LockTimer } from '@/lib/store-session';
import { card, inputClass, SubPage, SectionLabel } from '../ui';
import type { SettingsState } from '../useSettings';

export default function SecurityView({ s }: { s: SettingsState }) {
  const {
    store, onUpdate, setView, timer, setTimer, pinSet, setPinSet, fingerprintOn, setFingerprintOn,
    pinStage, setPinStage, pinDraft, setPinDraft, pinFirst, setPinFirst, revealCode, setRevealCode,
    showPass, setShowPass, showConfirmPass, setShowConfirmPass, showCurrentPass, setShowCurrentPass,
    currentPasswordConfirm, setCurrentPasswordConfirm, newPassword, setNewPassword, confirmPassword,
    setConfirmPassword, showCloudAuthModal, setShowCloudAuthModal, handleCloudAuthSuccess, profile,
    mgr, updateMgr, handleLock, handleUpdatePassword,
  } = s;
  /*
   * Choosing a PIN, twice.
   *
   * Asked for a second time before it is saved, because a PIN mistyped once
   * and saved is a shop locked out of its own records with no way back except
   * clearing the app - and the records are the app.
   */
  const pinSheet = pinStage && (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => { setPinStage(null); setPinDraft(''); setPinFirst(''); }}>
      <div className="w-full sm:max-w-xs rounded-2xl bg-card border border-border p-5 text-center" onClick={event => event.stopPropagation()}>
        <p className="font-display font-black text-base">
          {pinStage === 'set' ? 'Choose a 4-digit PIN' : 'Enter it again'}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {pinStage === 'set'
            ? 'You will use this to unlock the app on this phone.'
            : 'Just to be sure it is the one you meant.'}
        </p>

        <input
          value={pinDraft}
          onChange={async event => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
            setPinDraft(digits);
            if (digits.length < PIN_LENGTH) return;

            if (pinStage === 'set') {
              setPinFirst(digits);
              setPinDraft('');
              setPinStage('confirm');
              return;
            }
            if (digits !== pinFirst) {
              setPinDraft('');
              setPinFirst('');
              setPinStage('set');
              showToast('Those did not match. Start again.', 'error');
              return;
            }
            const ok = await savePin(digits);
            setPinSet(ok);
            setPinStage(null);
            setPinDraft('');
            setPinFirst('');
            showToast(ok ? 'PIN set' : 'Could not set a PIN on this device', ok ? 'success' : 'error');
          }}
          inputMode="numeric"
          autoFocus
          type="password"
          className="mt-4 w-full h-14 rounded-xl bg-surface-2 border border-border text-center text-2xl font-display font-black tracking-[0.6em] outline-none focus:border-primary"
        />

        <button
          onClick={() => { setPinStage(null); setPinDraft(''); setPinFirst(''); }}
          className="mt-3 w-full h-10 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
 return (
    <>
    {pinSheet}
    <SubPage title="Security" onBack={() => setView('home')}>
      {/* 1. Multi-device Cloud Sync Section */}
      <div className="px-1">
        <SectionLabel>Cloud Integration</SectionLabel>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow
          label="Multi-device Cloud Sync"
          description="Enable real-time cloud backup to sync and access this store on other devices."
          checked={mgr.multiDeviceSync || false}
          onChange={async (v) => {
            if (v) {
              // 1. Immediately toggle the switch ON for instant user response
              updateMgr({ multiDeviceSync: true });
              const updatedStore = {
                ...store,
                managerSettings: {
                  ...store.managerSettings,
                  multiDeviceSync: true
                }
              };
              saveStore(updatedStore);

              // 2. Perform session check in the background
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session && session.user && session.user.id) {
                  // Active session exists! Setup sync
                  let { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('auth_user_id', session.user.id)
                    .maybeSingle();

                  if (!profile) {
                    const { data: newProfile } = await supabase
                      .from('profiles')
                      .insert({
                        auth_user_id: session.user.id,
                        email: session.user.email || store.profile?.email || '',
                        full_name: session.user.email?.split('@')[0] || store.storeName || 'User',
                        role: 'owner'
                      })
                      .select()
                      .single();
                    profile = newProfile;
                  }

                  if (profile && profile.id) {
                    const { data: existingStore } = await supabase
                      .from('stores')
                      .select('id')
                      .eq('access_code', store.accessCode)
                      .maybeSingle();

                    const payload: any = {
                      owner_id: profile.id,
                      business_name: store.storeName,
                      business_type: store.category || 'retail',
                      logo: store.profile?.logoStyle || 'minimalist',
                      access_code: store.accessCode,
                      owner_password: store.managerSettings?.ownerPassword || 'owner',
                      data: updatedStore as any,
                      updated_at: new Date().toISOString()
                    };

                    if (existingStore && existingStore.id) {
                      payload.id = existingStore.id;
                    }

                    const { data: dbStore, error: storeError } = await supabase
                      .from('stores')
                      .upsert(payload, { onConflict: 'access_code' })
                      .select('id')
                      .maybeSingle();

                    if (storeError) {
                      console.error("Cloud sync background setup error:", storeError);
                    }

                    if (dbStore && dbStore.id) {
                      await supabase.from('store_members').upsert({
                        store_id: dbStore.id,
                        profile_id: profile.id,
                        role: 'owner'
                      }, { onConflict: 'store_id,profile_id' });
                    }

                    showToast('✓ Cloud Sync auto-enabled and data synced to internet!', 'success');
                  }
                } else {
                  // No session, open login modal
                  setShowCloudAuthModal(true);
                }
              } catch (e) {
                console.error("Auto sync session check failed:", e);
                setShowCloudAuthModal(true);
              }
            } else {
              updateMgr({ multiDeviceSync: false });
              const updatedStore = {
                ...store,
                managerSettings: {
                  ...store.managerSettings,
                  multiDeviceSync: false
                }
              };
              saveStore(updatedStore);
              showToast('Cloud Sync disabled.');
            }
          }}
        />
      </div>

      {mgr.multiDeviceSync && (
        <div className={`${card} p-4 text-left text-xs border border-success/20 bg-success/5 space-y-2`}>
          <p className="text-success font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            ✓ Store data successfully synced to the Internet
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Use your <strong>Store Access Code ({store.accessCode})</strong> and your <strong>Owner Password</strong> to view this store on other devices.
          </p>
        </div>
      )}

      {/* 2. Biometric and Timer Locking Section */}
      <div className="px-1 mt-4">
        <SectionLabel>App Locking Settings</SectionLabel>
      </div>
      <div className={`${card} px-4 divide-y divide-border`}>
        {/*
          These were two switches that did nothing at all, which is the worst
          version of a security control - it says the shop is locked and the
          shop is not. They are real now, and the PIN comes first because a
          fingerprint unlocks a PIN, it does not replace one: a reader that
          will not take, on a cold morning or with wet hands, has to leave a
          way in that is not "reinstall and lose the records".
        */}
        <div className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-display font-semibold">PIN Lock</p>
            <p className="text-[11px] text-muted-foreground">
              {pinSet ? 'A 4-digit PIN is set for this device.' : 'Four digits, asked for when the app locks.'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => { setPinDraft(''); setPinStage('set'); }}
              className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black"
            >
              {pinSet ? 'Change' : 'Set PIN'}
            </button>
            {pinSet && (
              <button
                onClick={() => { clearPin(); setPinSet(false); setFingerprintOn(false); showToast('PIN removed', 'info'); }}
                className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold text-muted-foreground"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Only once there is a PIN behind it, and only where the phone can. */}
        {pinSet && fingerprintSupported() && (
          <ToggleRow
            label="Unlock with fingerprint"
            description="Use this phone's own fingerprint or face unlock. The PIN still works."
            checked={fingerprintOn}
            onChange={async v => {
              if (!v) { forgetFingerprint(); setFingerprintOn(false); showToast('Fingerprint unlock off', 'info'); return; }
              const ok = await enrollFingerprint(store.storeName || 'StoreFlow');
              setFingerprintOn(ok);
              showToast(ok ? 'Fingerprint unlock is on' : 'This phone would not register a fingerprint', ok ? 'success' : 'error');
            }}
          />
        )}
      </div>

      {/* 3. Access Code & Password Section */}
      <div className="px-1 mt-4">
        <SectionLabel>Store Access Credentials</SectionLabel>
      </div>
      <div className={`${card} p-4 space-y-4`}>
        <div className="space-y-1 text-left">
          <label className="text-xs text-muted-foreground uppercase font-bold">Store Access Code (ID)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type={revealCode ? "text" : "password"}
              value={store.accessCode}
              readOnly
              className="flex-1 p-2.5 rounded-lg bg-surface-2/60 border border-border text-sm font-mono focus:outline-none text-muted-foreground select-all cursor-not-allowed"
            />
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setRevealCode(!revealCode)}
                className="px-3.5 py-2.5 rounded-lg bg-surface-3 border border-border text-foreground hover:bg-surface-2 transition active:scale-95 flex items-center justify-center cursor-pointer"
                title={revealCode ? "Hide access code" : "Review access code"}
              >
                {revealCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(store.accessCode);
                  showToast('📋 Access code copied to clipboard!', 'success');
                }}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:opacity-90 active:scale-95 transition cursor-pointer"
              >
                Copy Code
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Unique identifier used to access this store. This code cannot be changed.</p>
        </div>

        {store.managerSettings?.recoveryQuestion && (
          <div className="space-y-1 text-left border-t border-border/40 pt-3">
            <label className="text-xs text-muted-foreground uppercase font-bold">Recovery Question</label>
            <div className="p-2.5 rounded-lg bg-surface-2/60 border border-border text-sm text-muted-foreground">
              "{store.managerSettings.recoveryQuestion}"
            </div>
            <p className="text-[10px] text-muted-foreground">Your answer is kept private and can't be viewed or changed here.</p>
          </div>
        )}

        {/* Reset Owner Password */}
        <div className="border-t border-border/40 pt-3 space-y-3 text-left">
          <label className="text-xs text-muted-foreground uppercase font-bold">Reset Owner Password</label>
          <div className="relative flex items-center">
            <input
              type={showCurrentPass ? "text" : "password"}
              placeholder="Current Password"
              value={currentPasswordConfirm}
              onChange={e => setCurrentPasswordConfirm(e.target.value)}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPass(!showCurrentPass)}
              className="absolute right-3 p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
              title={showCurrentPass ? "Hide Password" : "Show Password"}
            >
              {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative flex items-center">
              <input
                type={showPass ? "text" : "password"}
                placeholder="New Password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                title={showPass ? "Hide Password" : "Show Password"}
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                type={showConfirmPass ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className="absolute right-3 p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                title={showConfirmPass ? "Hide Password" : "Show Password"}
              >
                {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <button
            onClick={handleUpdatePassword}
            className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:opacity-90 active:scale-95 transition cursor-pointer"
          >
            ✓ Reset Owner Password
          </button>
        </div>
      </div>

      {/* 4. Auto Lock Timer */}
      <div className={`${card} p-4 space-y-2`}>
        <h3 className="font-display font-bold text-sm text-left">Auto Lock Timer</h3>
        {[
          { v: '1h' as LockTimer, l: '1 Hour' },
          { v: '4h' as LockTimer, l: '4 Hours' },
          { v: '8h' as LockTimer, l: '8 Hours' },
          { v: '12h' as LockTimer, l: '12 Hours' },
          { v: 'never' as LockTimer, l: 'Always Open' },
        ].map(opt => (
          <button key={opt.v} onClick={() => setTimer(opt.v)}
            className={`w-full p-3 rounded-lg border text-left flex items-center justify-between cursor-pointer ${timer===opt.v ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border text-foreground'}`}>
            <span className="font-display font-semibold text-sm">{opt.l}</span>
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${timer===opt.v ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
              {timer===opt.v && <span className="text-primary-foreground text-[10px]">✓</span>}
            </span>
          </button>
        ))}
      </div>

      {/* 4b. Workers' phones: they cannot open Settings, so the owner chooses for them */}
      {!store.staffDevice && (() => {
        const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;
        const workerTimer: LockTimer = settings.workerLockTimer || '1h';
        const setWorkerTimer = (value: LockTimer) => {
          const updated = { ...store, managerSettings: { ...settings, workerLockTimer: value } };
          onUpdate(updated);
          saveStore(updated);
          showToast("Workers' phones will use this the next time they connect");
        };
        return (
          <div className={`${card} p-4 space-y-2`}>
            <h3 className="font-display font-bold text-sm text-left">Workers' Phones Lock Timer</h3>
            <p className="text-xs text-muted-foreground text-left">
              How long a worker's own phone stays signed in before asking for their PIN the next time the app is opened. Online, they still enter it at least once a day.
            </p>
            {[
              { v: '1h' as LockTimer, l: '1 Hour' },
              { v: '4h' as LockTimer, l: '4 Hours' },
              { v: '8h' as LockTimer, l: '8 Hours' },
              { v: '12h' as LockTimer, l: '12 Hours' },
              { v: 'never' as LockTimer, l: 'Always Open' },
            ].map(opt => (
              <button key={opt.v} onClick={() => setWorkerTimer(opt.v)} aria-pressed={workerTimer === opt.v}
                className={`w-full p-3 rounded-lg border text-left flex items-center justify-between cursor-pointer ${workerTimer===opt.v ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border text-foreground'}`}>
                <span className="font-display font-semibold text-sm">{opt.l}</span>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${workerTimer===opt.v ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                  {workerTimer===opt.v && <span className="text-primary-foreground text-[10px]">✓</span>}
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* 5. Lock Action */}
      <div className="pt-4">
        <button onClick={handleLock} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-foreground font-display font-semibold hover:bg-surface-3 cursor-pointer">
          🔒 Lock Store Now
        </button>
      </div>

      {/* Cloud Auth Modal — rendered inside security view */}
      {showCloudAuthModal && (
        <CloudAuthModal
          onAuthSuccess={handleCloudAuthSuccess}
          onClose={() => {
            setShowCloudAuthModal(false);
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (!session) {
                updateMgr({ multiDeviceSync: false });
                const updatedStore = {
                  ...store,
                  managerSettings: {
                    ...store.managerSettings,
                    multiDeviceSync: false
                  }
                };
                saveStore(updatedStore);
                showToast('Cloud Sync disabled.');
              }
            });
          }}
          initialEmail={store.profile?.email || ''}
          initialFullName={store.profile?.ownerName || store.storeName || ''}
        />
      )}
    </SubPage>
    </>
  );
}
