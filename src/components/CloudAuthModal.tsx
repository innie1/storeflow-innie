import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';
import { Cloud, Eye, EyeOff, Lock, Mail, User, UserPlus, LogIn, X, Check, Loader2 } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

interface CloudAuthModalProps {
  onClose: () => void;
  onAuthSuccess: (profile: any) => void;
  initialEmail?: string;
  initialFullName?: string;
}

export default function CloudAuthModal({ onClose, onAuthSuccess, initialEmail = '', initialFullName = '' }: CloudAuthModalProps) {
  useBodyScrollLock();
  const [tab, setTab] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState(initialFullName);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resumeExistingSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (cancelled || error || !session?.user?.id) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();
        if (!cancelled && profile?.id) onAuthSuccess(profile);
      } catch (error) {
        console.warn('Cloud auth session check failed:', error);
      }
    };
    resumeExistingSession();
    return () => { cancelled = true; };
  }, [onAuthSuccess]);

  const getOrCreateProfile = async (user: any, fallbackName: string) => {
    if (!user?.id) throw new Error('Authentication did not return a valid user.');

    const { data: existing, error: lookupError } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing?.id) return existing;

    const { data: created, error: createError } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: user.id,
        email: user.email || email.trim(),
        full_name: fallbackName.trim() || user.email?.split('@')[0] || 'Owner',
        role: 'owner',
      })
      .select('*')
      .single();

    if (createError) throw createError;
    if (!created?.id) throw new Error('Your account was created, but the owner profile could not be loaded.');
    return created;
  };

  const finishAuth = async (user: any, name: string, successMessage: string) => {
    const profile = await getOrCreateProfile(user, name);
    showToast(successMessage, 'success');
    onAuthSuccess(profile);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return showToast('Enter your email and password.', 'error');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await finishAuth(data.user, fullName, 'Signed in. Publishing your store…');
    } catch (error: any) {
      console.error('Cloud login failed:', error);
      showToast(error?.message || 'Could not sign in. Please check your details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) return showToast('Complete all fields.', 'error');
    if (password.length < 6) return showToast('Password must be at least 6 characters.', 'error');
    if (password !== confirmPassword) return showToast('Passwords do not match.', 'error');

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;

      if (!data.user?.id) throw new Error('Account creation did not return a user.');
      if (!data.session) {
        showToast('Account created. Check your email to verify it, then sign in here.', 'info');
        setTab('login');
        setPassword('');
        setConfirmPassword('');
        return;
      }

      await finishAuth(data.user, fullName, 'Account created. Publishing your store…');
    } catch (error: any) {
      console.error('Cloud signup failed:', error);
      const message = String(error?.message || 'Could not create your cloud account.');
      if (/already|registered|exists|taken/i.test(message)) {
        setTab('login');
        showToast('That email already has an account. Sign in to continue.', 'info');
      } else {
        showToast(message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface-1 border border-border rounded-2xl shadow-xl overflow-hidden animate-scale-up" onClick={event => event.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-foreground">Publish your store</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Create a secure cloud link so your QR code can work for customers.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-2" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 rounded-xl bg-success/5 border border-success/15 mb-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Check className="w-4 h-4 text-success" /> One account protects and publishes your store
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 ml-6">After publishing, customers can use your QR code or Store ID to find you.</p>
          </div>

          <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-2 border border-border/85 mb-5 text-xs font-semibold">
            <button type="button" onClick={() => setTab('signup')} className={`py-2 rounded-lg flex items-center justify-center gap-1.5 ${tab === 'signup' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              <UserPlus className="w-3.5 h-3.5" /> Create account
            </button>
            <button type="button" onClick={() => setTab('login')} className={`py-2 rounded-lg flex items-center justify-center gap-1.5 ${tab === 'login' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              <LogIn className="w-3.5 h-3.5" /> Sign in
            </button>
          </div>

          {tab === 'signup' ? (
            <form onSubmit={handleSignup} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Your name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary" required />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Confirm password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary" required />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : <><Cloud className="w-4 h-4" /> Create account & publish</>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary" required />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : <><LogIn className="w-4 h-4" /> Sign in & publish</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
