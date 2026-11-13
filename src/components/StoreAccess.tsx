import Mascot from '@/components/Mascot';
import { Users, Cloud } from 'lucide-react';
import JoinStore from '@/components/staff/JoinStore';
import WorkerSignIn from '@/components/staff/WorkerSignIn';
import { readJoin } from '@/lib/staff-join';
import { forgetWorkerPhone } from '@/lib/staff-session';
import InviteSwitchPrompt from '@/components/staff/InviteSwitchPrompt';
import { StoreAccessProps } from './store-access/model';
import CreateFlowProgress from './store-access/CreateFlowProgress';
import { useStoreAccess } from './store-access/useStoreAccess';
import AuthLoginStep from './store-access/AuthLoginStep';
import AuthSignupStep from './store-access/AuthSignupStep';
import AuthStoreSelectStep from './store-access/AuthStoreSelectStep';
import AuthStoreCreateStep from './store-access/AuthStoreCreateStep';
import CreateStoreStep from './store-access/CreateStoreStep';
import SetupSecurityStep from './store-access/SetupSecurityStep';
import AccessCodeStep from './store-access/AccessCodeStep';
import AccessQrScanner from './store-access/AccessQrScanner';
import PasswordLoginStep from './store-access/PasswordLoginStep';
import PinLoginStep from './store-access/PinLoginStep';
import RecoveryStep from './store-access/RecoveryStep';

export default function StoreAccess(props: StoreAccessProps) {
  const s = useStoreAccess(props);
  const {
    onStoreLoaded, invitedRef, askSwitch, setAskSwitch, mode, setMode, dropInvite, flowMessage,
    flowMsgKey, newCode, setNewCode, accessMood, loadedStore, selectedUser, showQRScanner,
    handleSkipSecurity, handleSelectLoginProfile, profiles,
  } = s;

  return (
    <div className="w-full min-h-screen overflow-y-auto flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-md animate-fade-in my-auto">
        <div className="flex flex-col items-center text-center mb-6">
          <Mascot
            size={mode === 'choose' ? 96 : (mode === 'setup-security' || mode === 'create' && !!newCode) && accessMood === 'celebrating' ? 100 : 76}
            mood={accessMood}
            className="mb-3"
            externalMessage={flowMessage}
            externalMessageKey={flowMsgKey}
          />
          <h1 className="wordmark text-4xl font-bold mb-2 select-none"><span className="text-foreground">Store</span><span className="text-primary">Flow</span></h1>
          <p className="text-muted-foreground text-sm">Offline-first store management</p>
        </div>

        {/* On a worker's own approved phone, their shop comes first. The two
            owner buttons below are left exactly as they are. */}
        {mode === 'choose' && <WorkerSignIn onSignedIn={onStoreLoaded} />}

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create-choice')}
              style={{ animationDelay: '80ms' }}
              className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-lg hover:opacity-90 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer active:scale-95 shadow-md animate-fade-in"
            >
              Create New Store
            </button>

            <button
              onClick={() => setMode('access-choice')}
              style={{ animationDelay: '160ms' }}
              className="w-full p-4 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-lg hover:bg-surface-3 hover:-translate-y-0.5 hover:shadow-md transition-all border border-border cursor-pointer active:scale-95 animate-fade-in"
            >
              Access Existing Store
            </button>
          </div>
        )}

        {/* For a worker on their own phone. Kept apart from, and quieter
            than, the two buttons above, which are the owner's way in. */}
        {mode === 'choose' && readJoin()?.status !== 'authorized' && (
          <button
            type="button"
            onClick={() => setMode('join')}
            className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Work here? <span className="font-semibold text-primary underline-offset-2 hover:underline">Join a Store</span>
          </button>
        )}

        {mode === 'join' && <JoinStore onBack={() => { dropInvite(); setMode('choose'); }} initialStoreRef={invitedRef} />}

        {askSwitch && invitedRef && (
          <InviteSwitchPrompt
            invitedRef={invitedRef}
            currentName={readJoin()?.storeName || ''}
            kind="worker"
            onJoin={() => { forgetWorkerPhone(); setAskSwitch(false); setMode('join'); }}
            onStay={() => { setAskSwitch(false); dropInvite(); }}
          />
        )}

        {mode === 'create-choice' && (
          <div className="space-y-3 text-center">
            <h3 className="font-display font-bold text-lg text-foreground">How do you want to set this up?</h3>

            <button
              onClick={() => setMode('create')}
              className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-lg hover:opacity-90 transition-opacity cursor-pointer active:scale-95 transition-all shadow-md text-left"
            >
              Quick Setup — Access Code
              <span className="block text-xs font-normal opacity-80 mt-0.5">Fastest way in, works on this device</span>
            </button>

            <button
              onClick={() => setMode('auth-signup')}
              className="w-full p-4 rounded-lg bg-surface-2 border border-primary/40 text-foreground font-display font-semibold text-lg hover:border-primary transition-colors cursor-pointer active:scale-95 transition-all flex items-center gap-2 text-left"
            >
              <Cloud className="w-5 h-5 text-primary shrink-0" />
              <span>
                Cloud Account — Email
                <span className="block text-xs font-normal text-muted-foreground mt-0.5">Backs up your store, works across devices</span>
              </span>
            </button>

            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground cursor-pointer">
              ← Back
            </button>
          </div>
        )}

        {mode === 'access-choice' && (
          <div className="space-y-3 text-center">
            <h3 className="font-display font-bold text-lg text-foreground">How do you want to sign in?</h3>

            <button
              onClick={() => setMode('access')}
              className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-lg hover:opacity-90 transition-opacity cursor-pointer active:scale-95 transition-all shadow-md text-left"
            >
              Access Code
              <span className="block text-xs font-normal opacity-80 mt-0.5">The code your store was created with</span>
            </button>

            <button
              onClick={() => setMode('auth-login')}
              className="w-full p-4 rounded-lg bg-surface-2 border border-primary/40 text-foreground font-display font-semibold text-lg hover:border-primary transition-colors cursor-pointer active:scale-95 transition-all flex items-center gap-2 text-left"
            >
              <Cloud className="w-5 h-5 text-primary shrink-0" />
              <span>
                Email Account
                <span className="block text-xs font-normal text-muted-foreground mt-0.5">Sign in with the email you registered</span>
              </span>
            </button>

            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground cursor-pointer">
              ← Back
            </button>
          </div>
        )}

        {mode === 'auth-login' && <AuthLoginStep s={s} />}

        {mode === 'auth-signup' && <AuthSignupStep s={s} />}

        {mode === 'auth-store-select' && <AuthStoreSelectStep s={s} />}

        {mode === 'auth-store-create' && <AuthStoreCreateStep s={s} />}

        {mode === 'create' && !newCode && <CreateStoreStep s={s} />}

        {mode === 'create' && newCode && (
          <div className="space-y-4 text-center">
            <CreateFlowProgress step={4} of={5} />
            <p className="text-success text-sm font-semibold">✓ Store created successfully!</p>
            <div>
              <p className="text-muted-foreground text-sm mb-2">Your access code:</p>
              <div className="p-4 rounded-lg bg-surface-2 border border-primary/30 gold-glow">
                <span className="font-mono text-3xl tracking-widest text-primary font-bold">{newCode}</span>
              </div>
              <p className="text-muted-foreground text-xs mt-2">Save this code! You'll need it to access your store from any device.</p>
            </div>
            <button onClick={() => setMode('setup-security')} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
              Continue to Secure Store →
            </button>
            <button onClick={handleSkipSecurity} className="w-full p-2 text-muted-foreground text-xs hover:text-foreground cursor-pointer">
              Skip for now — go to my store
            </button>
            <button onClick={() => setNewCode('')} className="w-full p-2 text-muted-foreground text-xs hover:text-foreground text-center cursor-pointer">
              ← Back to change store details
            </button>
          </div>
        )}

        {mode === 'setup-security' && <SetupSecurityStep s={s} />}

        {mode === 'access' && <AccessCodeStep s={s} />}

        {/* QR Scanner Overlay for Store Identification */}
        {showQRScanner && <AccessQrScanner s={s} />}

        {mode === 'login-select' && (
          <div className="space-y-4 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-yellow-500" />
              <h3 className="font-display font-bold text-sm text-foreground">Select Login Profile</h3>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectLoginProfile(p)}
                  className="w-full p-3.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 flex items-center justify-between text-sm text-left cursor-pointer transition-all"
                >
                  <div>
                    <p className="font-display font-bold text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">{p.role}</p>
                  </div>
                  <span className="text-muted-foreground text-xs font-mono">Select ›</span>
                </button>
              ))}
            </div>
            <button onClick={() => setMode('access')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer">
              ← Back to Access Code
            </button>
          </div>
        )}

        {mode === 'login-password' && selectedUser && <PasswordLoginStep s={s} />}

        {mode === 'login-pin' && selectedUser && <PinLoginStep s={s} />}

        {mode === 'recovery' && loadedStore && <RecoveryStep s={s} />}
      </div>
    </div>
  );
}
