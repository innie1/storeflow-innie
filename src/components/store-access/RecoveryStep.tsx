import { HelpCircle, Mail, Phone } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Getting back into a shop with the recovery questions.
 */
export default function RecoveryStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, loadedStore, recoveryMode, setRecoveryMode, answeredQuestion, setAnsweredQuestion,
    enteredKey, setEnteredKey, inputCode, setInputCode, newPassVal, setNewPassVal,
    confirmNewPassVal, setConfirmNewPassVal, recoveryMethodSelected, handleTriggerSimulatedCode,
    handleVerifyAnswer, handleVerifyRecoveryKey, handleVerifyCode, handleResetPassword,
  } = s;
  return (
    <div className="space-y-4 text-left">
      <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-yellow-500" />
        <span>Owner Password Recovery</span>
      </h3>

      {recoveryMode === 'options' && (
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground leading-normal mb-1">Select a password recovery method below:</p>
          <button
            onClick={() => setRecoveryMode('question')}
            className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-xs text-left cursor-pointer transition-colors"
          >
            <p className="font-bold text-foreground">Answer Security Question</p>
            <p className="text-muted-foreground mt-0.5">"{loadedStore.managerSettings?.recoveryQuestion}"</p>
          </button>
          <button
            onClick={() => setRecoveryMode('key')}
            className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-xs text-left cursor-pointer transition-colors"
          >
            <p className="font-bold text-foreground">Enter Emergency Recovery Key</p>
            <p className="text-muted-foreground mt-0.5">Reset using the key generated during setup.</p>
          </button>
          <button
            onClick={() => handleTriggerSimulatedCode('email')}
            className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-xs text-left cursor-pointer transition-colors flex items-center gap-2.5"
          >
            <Mail className="w-4 h-4 text-primary" />
            <div>
              <p className="font-bold text-foreground">Send recovery code to Email</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">{loadedStore.managerSettings?.recoveryEmail}</p>
            </div>
          </button>
          <button
            onClick={() => handleTriggerSimulatedCode('sms')}
            className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-xs text-left cursor-pointer transition-colors flex items-center gap-2.5"
          >
            <Phone className="w-4 h-4 text-success" />
            <div>
              <p className="font-bold text-foreground">Send recovery code through WhatsApp/SMS</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">{loadedStore.managerSettings?.recoveryPhone}</p>
            </div>
          </button>

          <button
            onClick={() => setMode('login-password')}
            className="w-full p-2.5 text-muted-foreground text-xs text-center hover:text-foreground cursor-pointer mt-2"
          >
            ← Back to Password Login
          </button>
        </div>
      )}

      {recoveryMode === 'question' && (
        <div className="space-y-4">
          <div className="p-3 bg-surface-2 border border-border rounded-lg text-xs">
            <p className="text-muted-foreground">Recovery Question:</p>
            <p className="font-bold text-foreground mt-1">"{loadedStore.managerSettings?.recoveryQuestion}"</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground uppercase font-bold">Your Answer</label>
            <input
              type="text"
              value={answeredQuestion}
              onChange={e => setAnsweredQuestion(e.target.value)}
              placeholder="Enter security answer"
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <button onClick={handleVerifyAnswer} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">
            Verify Answer
          </button>
          <button onClick={() => setRecoveryMode('options')} className="w-full text-center text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            Cancel
          </button>
        </div>
      )}

      {recoveryMode === 'key' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground uppercase font-bold">Emergency Recovery Key</label>
            <input
              type="text"
              value={enteredKey}
              onChange={e => setEnteredKey(e.target.value.toUpperCase())}
              placeholder="SF-XXXX-XXXX-XXXX"
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm text-center font-mono focus:outline-none focus:border-primary"
            />
          </div>
          <button onClick={handleVerifyRecoveryKey} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">
            Verify Recovery Key
          </button>
          <button onClick={() => setRecoveryMode('options')} className="w-full text-center text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            Cancel
          </button>
        </div>
      )}

      {recoveryMode === 'code' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-normal">
            We've simulated sending a 6-digit verification code to the registered{' '}
            <strong>{recoveryMethodSelected === 'email' ? 'Email' : 'WhatsApp/SMS number'}</strong>.
          </p>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground uppercase font-bold">6-Digit Code</label>
            <input
              type="text"
              maxLength={6}
              value={inputCode}
              onChange={e => setInputCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Enter code"
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-center font-mono text-lg focus:outline-none focus:border-primary"
            />
          </div>
          <button onClick={handleVerifyCode} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">
            Verify Code
          </button>
          <button onClick={() => setRecoveryMode('options')} className="w-full text-center text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            Cancel
          </button>
        </div>
      )}

      {recoveryMode === 'reset-pass' && (
        <div className="space-y-4">
          <p className="text-xs text-success font-semibold">✓ Verification successful! Enter your new owner password below.</p>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground uppercase font-bold">New Owner Password</label>
            <input
              type="password"
              value={newPassVal}
              onChange={e => setNewPassVal(e.target.value)}
              placeholder="Enter new password"
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground uppercase font-bold">Confirm New Password</label>
            <input
              type="password"
              value={confirmNewPassVal}
              onChange={e => setConfirmNewPassVal(e.target.value)}
              placeholder="Confirm new password"
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <button onClick={handleResetPassword} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">
            Update Password & Login
          </button>
        </div>
      )}
    </div>
  );
}
