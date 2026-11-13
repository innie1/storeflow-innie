import { Eye, EyeOff, LogIn } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Signing in to a cloud account.
 */
export default function AuthLoginStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, authEmail, setAuthEmail, authPassword, setAuthPassword, showAuthPassword,
    setShowAuthPassword, loadingAuth, handleAuthSignIn,
  } = s;
  return (
    <form onSubmit={handleAuthSignIn} className="space-y-4 text-left p-5 rounded-2xl bg-surface-2 border border-border/80 shadow-md">
      <h3 className="font-display font-bold text-lg text-foreground flex items-center gap-2">
        <LogIn className="w-5 h-5 text-primary" />
        <span>Sign In to Cloud</span>
      </h3>
      
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
            placeholder="Enter your password"
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

      <button
        type="submit"
        disabled={loadingAuth}
        className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {loadingAuth ? 'Signing In...' : 'Sign In'}
      </button>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => setMode('auth-signup')}
          className="text-xs text-primary font-semibold hover:underline"
        >
          Don't have an account? Sign Up
        </button>
      </div>
      
      <button
        type="button"
        onClick={() => setMode('access-choice')}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2"
      >
        ← Back to Sign In Options
      </button>
    </form>
  );
}
