import { useState, useEffect } from 'react';
import { createStore, loadStore, saveStore } from '@/lib/store-data';
import { StoreData, StoreCategory, StaffMember } from '@/types/store';
import { showToast } from '@/components/Toast';
import Mascot, { MascotMood } from '@/components/Mascot';
import { Eye, EyeOff, Key, Shield, HelpCircle, Lock, Mail, Phone, Users } from 'lucide-react';

interface StoreAccessProps {
  onStoreLoaded: (store: StoreData) => void;
}

const CATEGORIES: { id: StoreCategory; label: string; icon: string; desc: string }[] = [
  { id: 'retail', label: 'Retail Store', icon: '🛒', desc: 'Products, inventory and sales' },
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', desc: 'Menu items and orders' },
  { id: 'games', label: 'Games & Entertainment', icon: '🎮', desc: 'PlayStation, Snooker, etc.' },
  { id: 'other', label: 'Other', icon: '🏪', desc: 'Custom setup' },
];

const QUESTIONS = [
  'What is your favorite food?',
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was the name of your primary school?',
];

export default function StoreAccess({ onStoreLoaded }: StoreAccessProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'access' | 'setup-security' | 'login-select' | 'login-password' | 'login-pin' | 'recovery'>('choose');
  
  // Create / Access basic states
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState<StoreCategory>('retail');
  const [accessCode, setAccessCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [accessMood, setAccessMood] = useState<MascotMood>('idle');
  const [loadedStore, setLoadedStore] = useState<StoreData | null>(null);

  // Security Setup states
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState(QUESTIONS[0]);
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');

  // Login authentication states
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; role: string; isOwner: boolean } | null>(null);
  const [inputPassword, setInputPassword] = useState('');
  const [pinBuffer, setPinBuffer] = useState('');

  // Recovery states
  const [recoveryMode, setRecoveryMode] = useState<'options' | 'question' | 'key' | 'code' | 'reset-pass'>('options');
  const [answeredQuestion, setAnsweredQuestion] = useState('');
  const [enteredKey, setEnteredKey] = useState('');
  const [simulatedCode, setSimulatedCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [newPassVal, setNewPassVal] = useState('');
  const [recoveryMethodSelected, setRecoveryMethodSelected] = useState<'email' | 'sms'>('email');

  // Change mood on mode switches
  useEffect(() => {
    if (mode === 'create') {
      setAccessMood('thinking');
      const t = setTimeout(() => setAccessMood('idle'), 1500);
      return () => clearTimeout(t);
    } else if (mode === 'access') {
      setAccessMood('confident');
      const t = setTimeout(() => setAccessMood('idle'), 1500);
      return () => clearTimeout(t);
    } else if (mode === 'setup-security') {
      setAccessMood('thinking');
    } else if (mode === 'login-password' || mode === 'login-pin') {
      setAccessMood('idle');
    } else {
      setAccessMood('idle');
    }
  }, [mode]);

  // Revert back to idle after typing pause
  useEffect(() => {
    if (!storeName && !accessCode) return;
    const t = setTimeout(() => {
      setAccessMood('idle');
    }, 1500);
    return () => clearTimeout(t);
  }, [storeName, accessCode]);

  const handleCreate = () => {
    if (!storeName.trim()) {
      setAccessMood('worried');
      return showToast('Enter a store name', 'error');
    }
    const store = createStore(storeName.trim(), category);
    setNewCode(store.accessCode);
    setLoadedStore(store);
    
    // Generate recovery key
    const randPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randPart3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `SF-${randPart1}-${randPart2}-${randPart3}`;
    setGeneratedRecoveryKey(key);

    setAccessMood('celebrating');
  };

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerPassword.trim() || ownerPassword.length < 4) {
      return showToast('Password must be at least 4 characters', 'error');
    }
    if (!recoveryEmail.trim() || !recoveryPhone.trim() || !recoveryAnswer.trim()) {
      return showToast('Please fill all recovery details', 'error');
    }
    if (!loadedStore) return;

    // Update settings
    const updatedStore: StoreData = {
      ...loadedStore,
      managerSettings: {
        ...(loadedStore.managerSettings || {}),
        enabled: loadedStore.managerSettings?.enabled ?? true,
        voiceGender: loadedStore.managerSettings?.voiceGender ?? 'young-male',
        criticalStockThreshold: loadedStore.managerSettings?.criticalStockThreshold ?? 2,
        mascotAnimations: loadedStore.managerSettings?.mascotAnimations ?? true,
        numericAnimations: loadedStore.managerSettings?.numericAnimations ?? true,
        reduceMotion: loadedStore.managerSettings?.reduceMotion ?? false,
        compactMode: loadedStore.managerSettings?.compactMode ?? false,
        biometricLock: loadedStore.managerSettings?.biometricLock ?? false,
        pinLock: loadedStore.managerSettings?.pinLock ?? false,
        revenueForecasts: loadedStore.managerSettings?.revenueForecasts ?? true,
        profitForecasts: loadedStore.managerSettings?.profitForecasts ?? true,
        inventoryForecasts: loadedStore.managerSettings?.inventoryForecasts ?? true,
        expenseAnalysis: loadedStore.managerSettings?.expenseAnalysis ?? true,
        smartPricing: loadedStore.managerSettings?.smartPricing ?? true,
        productSuggestions: loadedStore.managerSettings?.productSuggestions ?? true,
        savingsPlanner: loadedStore.managerSettings?.savingsPlanner ?? true,
        voiceFeatures: loadedStore.managerSettings?.voiceFeatures ?? true,
        autoVoiceListen: loadedStore.managerSettings?.autoVoiceListen ?? false,
        weeklyRecap: loadedStore.managerSettings?.weeklyRecap ?? true,
        customerRequests: loadedStore.managerSettings?.customerRequests ?? true,
        businessAdvice: loadedStore.managerSettings?.businessAdvice ?? true,
        businessExpansion: loadedStore.managerSettings?.businessExpansion ?? true,
        businessQuestions: loadedStore.managerSettings?.businessQuestions ?? true,
        defaultMargin: loadedStore.managerSettings?.defaultMargin ?? 30,
        autoSuggestPrices: loadedStore.managerSettings?.autoSuggestPrices ?? true,
        autoApplyPrices: loadedStore.managerSettings?.autoApplyPrices ?? false,
        showProductProfit: loadedStore.managerSettings?.showProductProfit ?? true,
        restockSuggestions: loadedStore.managerSettings?.restockSuggestions ?? true,
        inventoryAlerts: loadedStore.managerSettings?.inventoryAlerts ?? true,
        notifyInsights: loadedStore.managerSettings?.notifyInsights ?? true,
        notifyRecommendations: loadedStore.managerSettings?.notifyRecommendations ?? true,
        notifyAlerts: loadedStore.managerSettings?.notifyAlerts ?? true,
        notifyWeeklyRecap: loadedStore.managerSettings?.notifyWeeklyRecap ?? true,
        notifyMonthlyReports: loadedStore.managerSettings?.notifyMonthlyReports ?? false,
        notifySavingsReminders: loadedStore.managerSettings?.notifySavingsReminders ?? true,
        notifyCustomerRequests: loadedStore.managerSettings?.notifyCustomerRequests ?? true,
        notifyLowStock: loadedStore.managerSettings?.notifyLowStock ?? true,
        ownerPassword: ownerPassword.trim(),
        recoveryEmail: recoveryEmail.trim(),
        recoveryPhone: recoveryPhone.trim(),
        recoveryQuestion,
        recoveryAnswer: recoveryAnswer.trim().toLowerCase(),
        emergencyRecoveryKey: generatedRecoveryKey,
      }
    };

    saveStore(updatedStore);
    setLoadedStore(updatedStore);
    showToast('Store secured successfully!');

    // Log in session as Owner
    const ownerUser = {
      name: 'Owner',
      role: 'owner',
      permissions: { sales: true, inventory: true, reports: true, settings: true }
    };
    sessionStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
    onStoreLoaded(updatedStore);
  };

  const handleAccess = () => {
    const store = loadStore(accessCode.trim());
    if (!store) {
      setAccessMood('angry');
      return showToast('Invalid access code', 'error');
    }
    
    setLoadedStore(store);

    // Check if security exists
    if (store.managerSettings?.ownerPassword) {
      setMode('login-select');
    } else {
      // Prompt security setup
      const randPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randPart3 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const key = `SF-${randPart1}-${randPart2}-${randPart3}`;
      setGeneratedRecoveryKey(key);
      setMode('setup-security');
    }
  };

  const handleSelectLoginProfile = (user: { id: string; name: string; role: string; isOwner: boolean }) => {
    setSelectedUser(user);
    if (user.isOwner || user.role === 'manager' || user.role === 'admin') {
      setInputPassword('');
      setMode('login-password');
    } else {
      setPinBuffer('');
      setMode('login-pin');
    }
  };

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadedStore || !selectedUser) return;

    if (selectedUser.isOwner) {
      if (inputPassword === loadedStore.managerSettings?.ownerPassword) {
        setAccessMood('happy');
        showToast(`Welcome Owner!`);
        const ownerUser = {
          name: 'Owner',
          role: 'owner',
          permissions: { sales: true, inventory: true, reports: true, settings: true }
        };
        sessionStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
        onStoreLoaded(loadedStore);
      } else {
        setAccessMood('angry');
        showToast('Incorrect owner password', 'error');
      }
    } else {
      // Staff password-based authentication (if Admin or Manager)
      const staff = (loadedStore.staffMembers || []).find(s => s.id === selectedUser.id);
      if (staff && inputPassword === staff.pin) { // Admin and manager use staff.pin as password
        setAccessMood('happy');
        showToast(`Welcome ${staff.name}!`);
        const sessionUser = {
          id: staff.id,
          name: staff.name,
          role: staff.role,
          permissions: staff.permissions
        };
        sessionStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
        onStoreLoaded(loadedStore);
      } else {
        setAccessMood('angry');
        showToast('Incorrect password', 'error');
      }
    }
  };

  const handlePinKeyPress = (digit: string) => {
    if (pinBuffer.length >= 6) return;
    const nextPin = pinBuffer + digit;
    setPinBuffer(nextPin);

    // Auto verify if exact length
    if (loadedStore && selectedUser) {
      const staff = (loadedStore.staffMembers || []).find(s => s.id === selectedUser.id);
      if (staff && nextPin === staff.pin) {
        setAccessMood('happy');
        showToast(`Welcome ${staff.name}!`);
        const sessionUser = {
          id: staff.id,
          name: staff.name,
          role: staff.role,
          permissions: staff.permissions
        };
        sessionStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
        onStoreLoaded(loadedStore);
      } else if (staff && nextPin.length >= staff.pin.length) {
        // Clear pin after full length incorrect try
        setTimeout(() => {
          setPinBuffer('');
          showToast('Incorrect PIN', 'error');
        }, 150);
      }
    }
  };

  const handleTriggerSimulatedCode = (method: 'email' | 'sms') => {
    if (!loadedStore) return;
    setRecoveryMethodSelected(method);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSimulatedCode(code);
    setInputCode('');
    
    const target = method === 'email' ? loadedStore.managerSettings?.recoveryEmail : loadedStore.managerSettings?.recoveryPhone;
    showToast(`[SIMULATION] Verification Code sent to ${target}: ${code}`, 'info', 8000);
    setRecoveryMode('code');
  };

  const handleVerifyAnswer = () => {
    if (!loadedStore) return;
    if (answeredQuestion.trim().toLowerCase() === loadedStore.managerSettings?.recoveryAnswer?.toLowerCase()) {
      setRecoveryMode('reset-pass');
      setNewPassVal('');
    } else {
      showToast('Incorrect security answer', 'error');
    }
  };

  const handleVerifyRecoveryKey = () => {
    if (!loadedStore) return;
    if (enteredKey.trim() === loadedStore.managerSettings?.emergencyRecoveryKey) {
      setRecoveryMode('reset-pass');
      setNewPassVal('');
    } else {
      showToast('Incorrect emergency recovery key', 'error');
    }
  };

  const handleVerifyCode = () => {
    if (inputCode === simulatedCode && simulatedCode) {
      setRecoveryMode('reset-pass');
      setNewPassVal('');
    } else {
      showToast('Incorrect verification code', 'error');
    }
  };

  const handleResetPassword = () => {
    if (!loadedStore) return;
    if (newPassVal.trim().length < 4) {
      return showToast('Password must be at least 4 characters', 'error');
    }
    const updatedStore = {
      ...loadedStore,
      managerSettings: {
        ...(loadedStore.managerSettings || {}),
        ownerPassword: newPassVal.trim()
      }
    };
    saveStore(updatedStore);
    setLoadedStore(updatedStore);
    showToast('Password updated! Please log in.');
    setMode('login-select');
    setRecoveryMode('options');
  };

  // Compile selectable profiles
  const profiles = [];
  if (loadedStore) {
    profiles.push({ id: 'owner', name: loadedStore.storeName + ' Owner', role: 'owner', isOwner: true });
    (loadedStore.staffMembers || []).forEach(s => {
      profiles.push({ id: s.id, name: s.name, role: s.role, isOwner: false });
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center text-center mb-6">
          <Mascot size={80} mood={accessMood} className="mb-3" />
          <h1 className="font-display text-4xl font-bold text-primary mb-2 select-none">StoreFlow</h1>
          <p className="text-muted-foreground text-sm">Offline-first store management</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Create New Store
            </button>
            <button
              onClick={() => setMode('access')}
              className="w-full p-4 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-lg hover:bg-surface-3 transition-colors border border-border cursor-pointer"
            >
              Access Existing Store
            </button>
          </div>
        )}

        {mode === 'create' && !newCode && (
          <div className="space-y-4 text-left">
            <div>
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Store Name</label>
              <input
                value={storeName}
                onChange={e => {
                  setStoreName(e.target.value);
                  setAccessMood('thinking');
                }}
                placeholder="e.g. Blessed Nnamdi Store"
                className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-2">Business Category</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategory(c.id);
                      setAccessMood('thinking');
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      category === c.id
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-surface-2 border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="text-xl mb-1">{c.icon}</div>
                    <p className="font-display font-semibold text-xs text-foreground">{c.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleCreate} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
              Create Store
            </button>
            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground cursor-pointer">
              ← Back
            </button>
          </div>
        )}

        {mode === 'create' && newCode && (
          <div className="space-y-4 text-center">
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
          </div>
        )}

        {mode === 'setup-security' && (
          <form onSubmit={handleSaveSecurity} className="space-y-4 text-left">
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

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs text-muted-foreground uppercase font-bold">Recovery Email</label>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  placeholder="inniegroup@gmail.com"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-muted-foreground uppercase font-bold">Phone Number</label>
                <input
                  type="tel"
                  value={recoveryPhone}
                  onChange={e => setRecoveryPhone(e.target.value)}
                  placeholder="07025517388"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
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

            <button type="submit" className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
              Save Security & Enter Store
            </button>
          </form>
        )}

        {mode === 'access' && (
          <div className="space-y-4 text-left">
            <div>
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Access Code</label>
              <input
                value={accessCode}
                onChange={e => {
                  setAccessCode(e.target.value.toUpperCase());
                  setAccessMood('thinking');
                }}
                placeholder="Enter 6-character code"
                maxLength={6}
                className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground text-center font-mono text-2xl tracking-widest placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-primary"
              />
            </div>
            <button onClick={handleAccess} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
              Access Store
            </button>
            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer">
              ← Back
            </button>
          </div>
        )}

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

        {mode === 'login-password' && selectedUser && (
          <form onSubmit={handleVerifyPassword} className="space-y-4 text-left">
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
                  onChange={e => setInputPassword(e.target.value)}
                  placeholder="Enter Password"
                  autoFocus
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
        )}

        {mode === 'login-pin' && selectedUser && (
          <div className="space-y-4 text-left">
            <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-yellow-500" />
              <span>PIN Code Required: {selectedUser.name}</span>
            </h3>
            
            <div className="flex justify-center gap-2.5 py-4">
              {[0, 1, 2, 3].map(idx => {
                const filled = pinBuffer.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border border-border transition-all ${
                      filled ? 'bg-primary border-primary scale-110 gold-glow' : 'bg-surface-2'
                    }`}
                  />
                );
              })}
            </div>

            {/* Numeric PIN Pad Grid */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                <button
                  key={digit}
                  onClick={() => handlePinKeyPress(digit)}
                  className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-foreground font-display font-bold text-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={() => setPinBuffer('')}
                className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-destructive text-xs font-bold active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
              >
                Clear
              </button>
              <button
                onClick={() => handlePinKeyPress('0')}
                className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-foreground font-display font-bold text-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
              >
                0
              </button>
              <button
                onClick={() => setPinBuffer(p => p.slice(0, -1))}
                className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-foreground text-sm font-bold active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
              >
                ⌫
              </button>
            </div>

            <button
              onClick={() => setMode('login-select')}
              className="w-full mt-4 p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer"
            >
              ← Back to Profiles
            </button>
          </div>
        )}

        {mode === 'recovery' && loadedStore && (
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
                <button onClick={handleResetPassword} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 cursor-pointer">
                  Update Password & Login
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
