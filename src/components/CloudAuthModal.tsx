import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, Mail, User, X, Cloud, LogIn, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';

interface CloudAuthModalProps {
  onClose: () => void;
  onAuthSuccess: (profile: any) => void;
  initialEmail?: string;
  initialPassword?: string;
  initialFullName?: string;
}

export default function CloudAuthModal({ 
  onClose, 
  onAuthSuccess, 
  initialEmail, 
  initialPassword, 
  initialFullName 
}: CloudAuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState(initialPassword || '');
  const [fullName, setFullName] = useState(initialFullName || '');
  const [confirmPassword, setConfirmPassword] = useState(initialPassword || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        console.error("CloudAuthModal: session fetch error on mount:", sessionError);
        return;
      }
      if (session && session.user && session.user.id) {
        supabase
          .from('profiles')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .maybeSingle()
          .then(({ data: profile, error: profileErr }) => {
            if (profileErr) {
              console.error("CloudAuthModal database SELECT error on mount:", profileErr);
            }
            if (profile && profile.id) {
              onAuthSuccess(profile);
            } else if (session.user) {
              // Create missing profile
              supabase
                .from('profiles')
                .insert({
                  auth_user_id: session.user.id,
                  email: session.user.email || email || '',
                  full_name: session.user.email?.split('@')[0] || 'User',
                  role: 'owner'
                })
                .select()
                .maybeSingle()
                .then(({ data: newProfile, error: createProfileErr }) => {
                  if (createProfileErr) {
                    console.error("CloudAuthModal database INSERT error on mount fallback:", createProfileErr);
                  }
                  if (newProfile && newProfile.id) {
                    onAuthSuccess(newProfile);
                  } else {
                    console.error("CloudAuthModal: failed to load or create profile on mount");
                    showToast("Failed to load user profile details.", "error");
                  }
                });
            }
          });
      }
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      return showToast('Please fill all fields', 'error');
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        console.error("Supabase signin error:", error);
        return showToast(error.message || 'Authentication failed. Please check credentials.', 'error');
      }

      if (data && data.user && data.user.id) {
        // Fetch profile
        let { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('auth_user_id', data.user.id)
          .maybeSingle();

        if (profileErr) {
          console.error("CloudAuthModal database SELECT error during login:", profileErr);
        }

        if (!profile || !profile.id) {
          // Fallback create profile
          const { data: newProfile, error: createProfileErr } = await supabase
            .from('profiles')
            .insert({
              auth_user_id: data.user.id,
              email: data.user.email || email.trim(),
              full_name: data.user.email?.split('@')[0] || 'User',
              role: 'owner'
            })
            .select()
            .maybeSingle();

          if (createProfileErr) {
            console.error("CloudAuthModal database INSERT error during login fallback:", createProfileErr);
          }

          profile = newProfile;
        }

        if (profile && profile.id) {
          showToast('Successfully signed in!', 'success');
          onAuthSuccess(profile);
        } else {
          showToast('Failed to retrieve user profile details.', 'error');
        }
      } else {
        showToast('Login response did not return a valid user.', 'error');
      }
    } catch (err: any) {
      console.error("Login execution crash:", err);
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      return showToast('Please fill all fields', 'error');
    }
    if (password !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }
    if (password.length < 6) {
      return showToast('Password must be at least 6 characters', 'error');
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already') || errorMsg.includes('registered') || errorMsg.includes('taken') || errorMsg.includes('exist')) {
          showToast('Account already exists. Logging you in automatically...', 'info');
          setTab('login');
          
          const { data: logData, error: logError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });

          if (logError) {
            console.error("Supabase signin during signup fallback error:", logError);
            return showToast(logError.message || 'Auto-login failed.', 'error');
          }

          if (logData && logData.user && logData.user.id) {
            let { data: profile, error: profileErr } = await supabase
              .from('profiles')
              .select('*')
              .eq('auth_user_id', logData.user.id)
              .maybeSingle();

            if (profileErr) {
              console.error("CloudAuthModal database SELECT error during signup fallback:", profileErr);
            }

            if (!profile || !profile.id) {
              const { data: newProfile, error: createProfileErr } = await supabase
                .from('profiles')
                .insert({
                  auth_user_id: logData.user.id,
                  email: logData.user.email || email.trim(),
                  full_name: fullName.trim() || logData.user.email?.split('@')[0] || 'User',
                  role: 'owner'
                })
                .select()
                .maybeSingle();

              if (createProfileErr) {
                console.error("CloudAuthModal database INSERT error during signup fallback:", createProfileErr);
              }
              profile = newProfile;
            }

            if (profile && profile.id) {
              showToast('Successfully signed in!', 'success');
              onAuthSuccess(profile);
            } else {
              showToast('Failed to retrieve user profile details.', 'error');
            }
          }
          return;
        }
        console.error("Supabase signup error:", error);
        return showToast(error.message || 'Signup failed.', 'error');
      }

      if (data && data.user && data.user.id) {
        // Create profile
        const { data: profile, error: createProfileErr } = await supabase
          .from('profiles')
          .insert({
            auth_user_id: data.user.id,
            email: email.trim(),
            full_name: fullName.trim(),
            role: 'owner'
          })
          .select()
          .maybeSingle();

        if (createProfileErr) {
          console.error("CloudAuthModal database INSERT error during signup:", createProfileErr);
        }

        if (profile && profile.id) {
          showToast('Successfully signed up!', 'success');
          onAuthSuccess(profile);
        } else {
          showToast('Failed to load user profile after signup. Please sign in.', 'error');
        }
      } else {
        showToast('Signup response did not return a valid user.', 'error');
      }
    } catch (err: any) {
      console.error("Signup execution crash:", err);
      showToast(err.message || 'Signup failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-1 border border-border rounded-2xl shadow-xl overflow-hidden animate-scale-up relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-full hover:bg-surface-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">Link Store to Cloud</h2>
              <p className="text-[11px] text-muted-foreground">Sign up or sign in to enable multi-device sync.</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-2 border border-border/85 mb-5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab('signup')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'signup' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Sign Up
            </button>
            <button
              type="button"
              onClick={() => setTab('login')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'login' ? 'bg-surface-1 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In
            </button>
          </div>

          {tab === 'signup' ? (
            <form onSubmit={handleSignUp} className="space-y-3.5 text-left">
              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Create a password (min 6 chars)"
                    className="w-full pl-9 pr-10 py-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-display font-semibold text-xs transition-opacity flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 mt-4 shadow-sm"
              >
                {loading ? 'Creating Account...' : 'Sign Up & Enable Sync'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3.5 text-left">
              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase font-bold">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-2 rounded-lg bg-surface-2 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-display font-semibold text-xs transition-opacity flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 mt-4 shadow-sm"
              >
                {loading ? 'Signing In...' : 'Sign In & Enable Sync'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
