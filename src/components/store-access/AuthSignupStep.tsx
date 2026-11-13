import { Eye, EyeOff, UserPlus } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Making a cloud account.
 */
export default function AuthSignupStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, authEmail, setAuthEmail, authPassword, setAuthPassword, authFullName, setAuthFullName,
    authConfirmPassword, setAuthConfirmPassword, showAuthPassword, setShowAuthPassword, loadingAuth,
    handleAuthSignUp,
  } = s;
  return (
    <form onSubmit={handleAuthSignUp} className="space-y-4 text-left p-5 rounded-2xl bg-surface-2 border border-border/80 shadow-md">
      <h3 className="font-display font-bold text-lg text-foreground flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-primary" />
        <span>Create Cloud Account</span>
      </h3>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Full Name</label>
        <input
          type="text"
          value={authFullName}
          onChange={e => setAuthFullName(e.target.value)}
          placeholder="John Doe"
          className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          required
        />
      </div>
      
      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Email Address</label>
        <input
          type="email"
          value={authEmail}
          onChange={e => setAuthEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Password</label>
        <div className="relative">
          <input
            type={showAuthPassword ? 'text' : 'password'}
            value={authPassword}
            onChange={e => setAuthPassword(e.target.value)}
            placeholder="Create a password"
            className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-sm focus:outline-none focus:border-primary pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowAuthPassword(!showAuthPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Confirm Password</label>
        <input
          type="password"
          value={authConfirmPassword}
          onChange={e => setAuthConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loadingAuth}
        className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {loadingAuth ? 'Creating Account...' : 'Sign Up'}
      </button>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => setMode('auth-login')}
          className="text-xs text-primary font-semibold hover:underline"
        >
          Already have an account? Sign In
        </button>
      </div>

      <button
        type="button"
        onClick={() => setMode('create-choice')}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2"
      >
        ← Back to Setup Options
      </button>
    </form>
  );
}
