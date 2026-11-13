import { showToast } from '@/components/Toast';
import ContactPickButton from '@/components/ContactPickButton';
import { Eye, EyeOff, Shield } from 'lucide-react';
import { QUESTIONS } from './model';
import CreateFlowProgress from './CreateFlowProgress';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Protecting a new shop: password, PIN and recovery questions.
 */
export default function SetupSecurityStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, loadingAuth, ownerPassword, setOwnerPassword, confirmPassword, setConfirmPassword,
    showPassword, setShowPassword, recoveryEmail, setRecoveryEmail, recoveryPhone, setRecoveryPhone,
    ownerName, setOwnerName, recoveryQuestion, setRecoveryQuestion, recoveryAnswer,
    setRecoveryAnswer, generatedRecoveryKey, handleSaveSecurity, handleSkipSecurity,
  } = s;
  return (
    <form onSubmit={handleSaveSecurity} className="space-y-4 text-left">
      <CreateFlowProgress step={5} of={5} />
      <div className="p-3.5 rounded-xl bg-yellow-500/10 border border-yellow-500/25 flex gap-2.5 items-start">
        <Shield className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-yellow-500 font-bold uppercase tracking-wider">Secure Your Store</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Please setup the Owner password and recovery details to secure your business insights and backup systems.</p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Owner Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={ownerPassword}
            onChange={e => setOwnerPassword(e.target.value)}
            placeholder="Create secure password"
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Confirm Owner Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm secure password"
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/*
        Asked here, where the shop is already giving its details.

        The profile screen has an Owner Name field and nothing ever
        filled it, because nothing ever asked - so a merchant who had
        just typed their shop name, email and phone opened their profile
        and found a blank where their own name should be, which reads as
        the app having lost it.
      */}
      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Your Name</label>
        <input
          value={ownerName}
          onChange={e => setOwnerName(e.target.value)}
          placeholder="The owner's full name"
          className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground uppercase font-bold">Recovery Email</label>
          <input
            type="email"
            value={recoveryEmail}
            onChange={e => setRecoveryEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground uppercase font-bold">Phone Number</label>
          <div className="relative">
            <input
              type="tel"
              value={recoveryPhone}
              onChange={e => setRecoveryPhone(e.target.value)}
              placeholder="0801 234 5678"
              className="w-full p-2.5 pr-11 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
            />
            {/* The owner's own number, which is the one they are least
                likely to want to type and most need to be right - it is
                how they get back in. */}
            <ContactPickButton onPick={(phone, pickedName) => {
              setRecoveryPhone(phone);
              if (pickedName && !ownerName.trim()) setOwnerName(pickedName);
            }} />
          </div>
        </div>
      </div>

      <div className="space-y-3.5">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground uppercase font-bold">Recovery Question</label>
          <select
            value={recoveryQuestion}
            onChange={e => setRecoveryQuestion(e.target.value)}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          >
            {QUESTIONS.map((q, idx) => (
              <option key={idx} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground uppercase font-bold">Security Answer</label>
          <input
            type="text"
            value={recoveryAnswer}
            onChange={e => setRecoveryAnswer(e.target.value)}
            placeholder="Enter answer"
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Generated Recovery Key Notice */}
      <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 space-y-2">
        <p className="text-xs text-destructive font-bold flex items-center gap-1.5">
          <span>⚠️ Save This Key Safely</span>
        </p>
        <div className="p-2 bg-black/40 rounded border border-border/80 flex items-center justify-between">
          <span className="font-mono text-sm text-primary tracking-wider font-bold select-all">{generatedRecoveryKey}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(generatedRecoveryKey);
              showToast('✓ Key copied to clipboard');
            }}
            className="text-[10px] bg-surface-3 hover:bg-surface-4 text-foreground px-2 py-1 rounded cursor-pointer"
          >
            Copy
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-normal">
          This is your Emergency Recovery Key. Store it in a safe place. You will need it to unlock your store if you lose your password.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground leading-normal">
        Your recovery email and owner password also open your StoreFlow account, which backs the store up online so your workers can join from their own phones.
      </p>
      <button type="submit" disabled={loadingAuth} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
        {loadingAuth ? 'Securing & backing up…' : 'Save Security & Enter Store'}
      </button>
      <button
        type="button"
        onClick={handleSkipSecurity}
        className="w-full p-2 text-muted-foreground text-xs hover:text-foreground text-center cursor-pointer"
      >
        Skip for now — I'll set this up later
      </button>
      <button
        type="button"
        onClick={() => setMode('create')}
        className="w-full p-2 text-muted-foreground text-xs hover:text-foreground text-center cursor-pointer"
      >
        ← Back to my code
      </button>
    </form>
  );
}
