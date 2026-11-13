import { Eye, EyeOff, Lock } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Signing in to a shop with a password.
 */
export default function PasswordLoginStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, showPassword, setShowPassword, selectedUser, inputPassword, setInputPassword,
    isPasswordWrong, setIsPasswordWrong, setRecoveryMode, handleVerifyPassword,
  } = s;
  return (
    <form onSubmit={handleVerifyPassword} className="space-y-4 text-left">
      {isPasswordWrong && (
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .input-shake {
            animation: shake 0.25s ease-in-out;
          }
        `}</style>
      )}
      <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
        <Lock className="w-4 h-4 text-yellow-500" />
        <span>Password Required: {selectedUser.name}</span>
      </h3>
      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold">Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={inputPassword}
            onChange={e => {
              setInputPassword(e.target.value);
              setIsPasswordWrong(false);
            }}
            placeholder="Enter Password"
            autoFocus
            className={`w-full p-2.5 rounded-lg text-sm focus:outline-none pr-10 transition-all ${
              isPasswordWrong
                ? 'border-destructive text-destructive bg-destructive/10 placeholder:text-destructive/60 focus:border-destructive focus:ring-destructive input-shake border-2'
                : 'bg-surface-2 border border-border text-foreground focus:border-primary'
            }`}
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
      <div className="flex justify-between items-center text-xs">
        {selectedUser.isOwner ? (
          <button
            type="button"
            onClick={() => {
              setMode('recovery');
              setRecoveryMode('options');
            }}
            className="text-primary hover:underline cursor-pointer font-semibold"
          >
            Forgot Password?
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">Admin/Manager credentials required</span>
        )}
      </div>
      <button type="submit" className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
        Login to Store
      </button>
      <button
        type="button"
        onClick={() => setMode('login-select')}
        className="w-full p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer"
      >
        ← Back to Profiles
      </button>
    </form>
  );
}
