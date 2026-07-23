import { useState, useEffect } from 'react';
import { createStore, loadStore, saveStore } from '@/lib/store-data';
import { StoreData, StoreCategory, StaffMember } from '@/types/store';
import { showToast } from '@/components/Toast';
import Mascot, { MascotMood } from '@/components/Mascot';
import StoreLogo, { LOGO_STYLES } from '@/components/StoreLogo';
import { Eye, EyeOff, Key, Shield, HelpCircle, Lock, Mail, Phone, Users, Cloud, Database, Sparkles, Plus, Check, LogIn, UserPlus, Building, ArrowLeft, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateStoreUrl, parseScannedQRText } from '@/lib/qr-code';
import QRScannerPage from '@/components/qr/QRScannerPage';

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
  const [mode, setMode] = useState<'choose' | 'create' | 'access' | 'setup-security' | 'login-select' | 'login-password' | 'login-pin' | 'recovery' | 'auth-login' | 'auth-signup' | 'auth-store-select' | 'auth-store-create'>('choose');

  // Supabase Auth States
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [userStores, setUserStores] = useState<any[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  
  // Create / Access basic states
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState<StoreCategory>('retail');
  const [retailType, setRetailType] = useState('provision_retail');
  const [selectedLogoStyle, setSelectedLogoStyle] = useState('minimalist');
  const [accessCode, setAccessCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [accessMood, setAccessMood] = useState<MascotMood>('idle');
  const [loadedStore, setLoadedStore] = useState<StoreData | null>(null);

  // Security Setup states
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
  const [isPasswordWrong, setIsPasswordWrong] = useState(false);

  // Recovery states
  const [recoveryMode, setRecoveryMode] = useState<'options' | 'question' | 'key' | 'code' | 'reset-pass'>('options');
  const [answeredQuestion, setAnsweredQuestion] = useState('');
  const [enteredKey, setEnteredKey] = useState('');
  const [simulatedCode, setSimulatedCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [newPassVal, setNewPassVal] = useState('');
  const [confirmNewPassVal, setConfirmNewPassVal] = useState('');
  const [recoveryMethodSelected, setRecoveryMethodSelected] = useState<'email' | 'sms'>('email');

  // QR Scanner state for store identification
  const [showQRScanner, setShowQRScanner] = useState(false);

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
    const store = createStore(storeName.trim(), category, category === 'retail' ? retailType : undefined, selectedLogoStyle);
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
    if (ownerPassword !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }
    if (!recoveryEmail.trim() || !recoveryPhone.trim() || !recoveryAnswer.trim()) {
      return showToast('Please fill all recovery details', 'error');
    }
    if (!loadedStore) return;

    // Update settings
    const updatedStore: StoreData = {
      ...loadedStore,
      profile: {
        ...(loadedStore.profile || {}),
        email: recoveryEmail.trim(),
        phone: recoveryPhone.trim(),
        logoStyle: loadedStore.profile?.logoStyle || selectedLogoStyle || 'minimalist'
      },
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
    localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
    onStoreLoaded(updatedStore);
  };

  // Let a new merchant into the app without filling the full security form now.
  // The store still works fine without it -- login-select just won't be gated
  // by a password until they set one, same as any store mid-setup.
  const handleSkipSecurity = () => {
    if (!loadedStore) return;
    saveStore(loadedStore);
    showToast('You can secure your store anytime from Settings');

    const ownerUser = {
      name: 'Owner',
      role: 'owner',
      permissions: { sales: true, inventory: true, reports: true, settings: true }
    };
    localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
    onStoreLoaded(loadedStore);
  };

  const proceedWithStore = (store: StoreData) => {
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

  // Simple retry wrapper for Supabase client calls
  const runWithRetry = async <T,>(fn: () => Promise<{ data: T | null; error: any }>, retries = 3, delay = 1000): Promise<{ data: T | null; error: any }> => {
    let lastError: any = null;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fn();
        if (!res.error) {
          return res;
        }
        lastError = res.error;
        const msg = (res.error.message || '').toLowerCase();
        if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('connection')) {
          return res; // Database policy error - return immediately
        }
      } catch (err: any) {
        lastError = err;
      }
      console.warn(`Query failed, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
    return { data: null, error: lastError || new Error("Failed after retries") };
  };

  // Comprehensive cloud store lookup helper
  const loadCloudStoreData = async (profile: any, accessCodeText?: string, storeIdText?: string) => {
    console.log("Detail Log: Starting cloud store lookup. Auth status:", profile ? "authenticated" : "unauthenticated", "User profile ID:", profile?.id, "Access code to search:", accessCodeText, "Store ID to search:", storeIdText);

    try {
      let matchingStores: any[] = [];

      // 1. Prioritized search by access_code if specified
      if (accessCodeText) {
        const queryVal = accessCodeText.trim().toUpperCase();
        console.log(`Detail Log: SQL SELECT * FROM public.stores WHERE access_code = '${queryVal}'`);
        const { data: storeByCode, error: codeErr } = await runWithRetry(() => supabase
          .from('stores')
          .select('*')
          .eq('access_code', queryVal)
          .maybeSingle()
        );

        if (codeErr) {
          console.error(`Detail Log: Query failed for access_code = '${queryVal}':`, codeErr);
        } else {
          console.log(`Detail Log: Supabase response for access_code '${queryVal}' query:`, storeByCode);
          if (!storeByCode) {
            console.warn(`Detail Log: No store found with access_code = '${queryVal}'. Reason: Table exists but returned zero rows (either the code is incorrect, RLS blocks public read, or the record does not exist in the cloud).`);
          } else {
            matchingStores.push(storeByCode);
          }
        }
      }

      // 2. Search by permanent Store ID if specified
      if (storeIdText) {
        console.log(`Detail Log: SQL SELECT * FROM public.stores WHERE id = '${storeIdText}'`);
        const { data: storeByPk, error: pkErr } = await runWithRetry(() => supabase
          .from('stores')
          .select('*')
          .eq('id', storeIdText)
          .maybeSingle()
        );

        if (pkErr) {
          console.error(`Detail Log: Query failed for storeId = '${storeIdText}':`, pkErr);
        } else {
          console.log(`Detail Log: Supabase response for storeId '${storeIdText}' query:`, storeByPk);
          if (!storeByPk) {
            console.warn(`Detail Log: No store found with storeId = '${storeIdText}'.`);
          } else {
            matchingStores.push(storeByPk);
          }
        }
      }

      // 3. Search by owner_id (Profile UUID) and memberships if authenticated
      if (profile && profile.id) {
        console.log(`Detail Log: SQL SELECT * FROM public.stores WHERE owner_id = '${profile.id}'`);
        const { data: owned, error: err } = await runWithRetry(() => supabase
          .from('stores')
          .select('*')
          .eq('owner_id', profile.id)
        );
        
        if (err) {
          console.error(`Detail Log: Query failed for owner_id = '${profile.id}':`, err);
        } else if (owned && owned.length > 0) {
          console.log(`Detail Log: Found ${owned.length} stores for owner_id:`, owned.map(s => s.id));
          matchingStores = [...matchingStores, ...owned];
        }

        // Search by store memberships
        console.log(`Detail Log: SQL SELECT store_id FROM public.store_members WHERE profile_id = '${profile.id}'`);
        const { data: memberships, error: memErr } = await runWithRetry(() => supabase
          .from('store_members')
          .select('store_id')
          .eq('profile_id', profile.id)
        );

        if (memErr) {
          console.error(`Detail Log: Query failed for store memberships where profile_id = '${profile.id}':`, memErr);
        } else if (memberships && memberships.length > 0) {
          const storeIds = memberships.map(m => m.store_id);
          console.log("Detail Log: Found store membership IDs:", storeIds);
          
          const { data: memberStores, error: memStoresErr } = await runWithRetry(() => supabase
            .from('stores')
            .select('*')
            .in('id', storeIds)
          );

          if (memStoresErr) {
            console.error("Detail Log: Query failed for stores by membership IDs:", memStoresErr);
          } else if (memberStores) {
            console.log(`Detail Log: Found ${memberStores.length} stores via memberships`);
            matchingStores = [...matchingStores, ...memberStores];
          }
        }
      }

      // De-duplicate stores by ID
      const uniqueStores = matchingStores.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      console.log("Detail Log: Total unique stores resolved:", uniqueStores.length);
      return uniqueStores;
    } catch (e) {
      console.error("Detail Log: Failed to perform cloud store query execution:", e);
      return [];
    }
  };

  const handleAccess = async () => {
    const code = accessCode.trim().toUpperCase();
    if (!code || code.length < 6) {
      return showToast('Please enter a valid 6-character access code', 'error');
    }

    const localStore = loadStore(code);
    if (localStore) {
      proceedWithStore(localStore);
      return;
    }

    // Try to load from Supabase cloud sync
    setAccessMood('thinking' as any);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentProfile = session?.user?.id ? await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => data) : null;

      const remoteStores = await loadCloudStoreData(currentProfile || null, code);
      if (remoteStores && remoteStores.length > 0) {
        const selectedRow = remoteStores[0];
        if (selectedRow && selectedRow.data) {
          const remoteStore = selectedRow.data as StoreData;
          // Previously this wrote raw cloud data to a mismatched localStorage
          // key (`storeflow_store_${code}` instead of the key loadStore()
          // actually reads, `storeflow_${code}`), so it was never found on
          // the next cold load — meaning cloud-loaded stores always bypassed
          // the local cache-hit path (and its scheduled-savings check) and
          // silently re-fetched from the cloud every time. saveStore() both
          // writes to the correct key and runs the same
          // runScheduledSavingsDeduction() check the local path gets, so a
          // due savings deduction is never missed just because someone
          // logged in via cloud recovery instead of the local cache.
          saveStore(remoteStore);
          setAccessMood('happy' as any);
          showToast('Cloud backup loaded successfully!', 'success');
          proceedWithStore(loadStore(remoteStore.accessCode) || remoteStore);
          return;
        }
      }
      
      setAccessMood('angry');
      showToast('Store not found locally or in cloud backup', 'error');
    } catch (err: any) {
      console.error("handleAccess failed to load store:", err);
      setAccessMood('angry');
      showToast('Failed to connect to cloud storage. Please check connection.', 'error');
    }
  };

  const handleSelectLoginProfile = (user: { id: string; name: string; role: string; isOwner: boolean }) => {
    setSelectedUser(user);
    setIsPasswordWrong(false);
    if (user.isOwner) {
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
        localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
        onStoreLoaded(loadedStore);
      } else {
        setAccessMood('angry');
        setIsPasswordWrong(true);
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
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
        localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
        onStoreLoaded(loadedStore);
      } else {
        setAccessMood('angry');
        setIsPasswordWrong(true);
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        showToast('Incorrect password', 'error');
      }
    }
  };

  const handlePinKeyPress = (digit: string) => {
    if (pinBuffer.length >= 4) return;
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
        localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
        onStoreLoaded(loadedStore);
      } else if (staff && nextPin.length >= 4) {
        // Clear pin after full length incorrect try
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
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
    if (newPassVal !== confirmNewPassVal) {
      return showToast('Passwords do not match', 'error');
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

  // Handle Auth Sign Up
  const handleAuthSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim() || !authFullName.trim()) {
      setAccessMood('worried');
      return showToast('Please fill all fields', 'error');
    }
    if (authPassword !== authConfirmPassword) {
      setAccessMood('worried');
      return showToast('Passwords do not match', 'error');
    }
    if (authPassword.length < 6) {
      setAccessMood('worried');
      return showToast('Password must be at least 6 characters', 'error');
    }

    setLoadingAuth(true);
    setAccessMood('thinking');

    try {
      console.log("Detail Log: Initiating supabase.auth.signUp with email =", authEmail.trim());
      const result = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      console.log("Detail Log: Complete supabase.auth.signUp response:", JSON.stringify(result, null, 2));

      const { data: authData, error: signUpError } = result;

      if (signUpError) {
        setAccessMood('angry' as any);
        console.error("Detail Log: signUp failed:", signUpError);
        
        const errCodeStr = signUpError.code ? ` [Code: ${signUpError.code}]` : '';
        const statusStr = signUpError.status ? ` [Status: ${signUpError.status}]` : '';
        const exactErrorText = `Signup failed: ${signUpError.message}${errCodeStr}${statusStr}`;
        
        return showToast(exactErrorText, 'error');
      }

      if (!authData || !authData.user || !authData.user.id) {
        setAccessMood('angry' as any);
        console.error("Detail Log: signUp response did not return a valid user payload", authData);
        return showToast('Signup response did not return a valid authenticated user.', 'error');
      }

      // Create public profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .insert({
          auth_user_id: authData.user.id,
          email: authEmail.trim(),
          full_name: authFullName.trim(),
          role: 'owner',
        })
        .select()
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError);
      }

      setActiveProfile(profileData || { email: authEmail.trim(), full_name: authFullName.trim() });
      setAccessMood('happy');
      showToast('Account created! Let\'s set up your store.', 'success');
      setMode('auth-store-create');
    } catch (err: any) {
      setAccessMood('angry' as any);
      showToast(err.message || 'An error occurred during sign up', 'error');
    } finally {
      setLoadingAuth(false);
    }
  };

  // Handle Auth Sign In
  const handleAuthSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAccessMood('worried');
      return showToast('Please fill all fields', 'error');
    }

    setLoadingAuth(true);
    setAccessMood('thinking');

    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (signInError) {
        setAccessMood('angry' as any);
        return showToast(signInError.message, 'error');
      }

      if (!authData.user) {
        setAccessMood('angry' as any);
        return showToast('Login failed', 'error');
      }

      // Get or create profile
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (!profile) {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({
            auth_user_id: authData.user.id,
            email: authData.user.email || authEmail.trim(),
            full_name: authData.user.email?.split('@')[0] || 'User',
            role: 'owner'
          })
          .select()
          .single();
        profile = newProfile;
      }

      setActiveProfile(profile);

      if (profile && profile.id) {
        // Query stores owned by user using our comprehensive, de-duplicated and retry-enabled helper
        const allStores = await loadCloudStoreData(profile, accessCode || undefined);

        setUserStores(allStores);
        setAccessMood('happy');
        showToast('Login successful!', 'success');

        if (allStores.length > 0) {
          setMode('auth-store-select');
        } else {
          console.warn("No StoreFlow business found for account:", profile.email);
          showToast('No StoreFlow business found for this account.', 'info');
          setMode('auth-store-create');
        }
      }
    } catch (err: any) {
      setAccessMood('angry' as any);
      showToast(err.message || 'An error occurred during sign in', 'error');
    } finally {
      setLoadingAuth(false);
    }
  };

  // Handle Create Store for Cloud account
  const handleCreateCloudStore = async () => {
    if (!storeName.trim()) {
      setAccessMood('worried');
      return showToast('Enter a store name', 'error');
    }
    if (!activeProfile || !activeProfile.id) {
      return showToast('Active user session not found. Please log in again.', 'error');
    }

    setLoadingAuth(true);
    setAccessMood('thinking');

    try {
      const store = createStore(storeName.trim(), category, category === 'retail' ? retailType : undefined, selectedLogoStyle);
      
      if (store.managerSettings) {
        store.managerSettings.multiDeviceSync = true;
        store.managerSettings.ownerPassword = ownerPassword.trim() || store.managerSettings.ownerPassword || 'owner';
      }

      const storeId = store.storeId || store.accessCode;
      const storeUrl = generateStoreUrl(storeId);

      const { data: dbStore, error: storeError } = await supabase
        .from('stores')
        .insert({
          owner_id: activeProfile.id,
          business_name: storeName.trim(),
          business_type: category,
          logo: selectedLogoStyle,
          access_code: store.accessCode,
          owner_password: store.managerSettings?.ownerPassword || 'owner',
          store_id: storeId,
          qr_code: storeUrl,
          barcode: storeId,
          data: store as any
        })
        .select()
        .single();

      if (storeError || !dbStore || !dbStore.id) {
        setAccessMood('angry' as any);
        console.error("Cloud store creation failed:", storeError);
        return showToast(storeError?.message || 'Failed to create store in the cloud database.', 'error');
      }

      await supabase.from('store_members').insert({
        store_id: dbStore.id,
        profile_id: activeProfile.id,
        role: 'owner'
      });

      localStorage.setItem('storeflow_store_' + store.accessCode, JSON.stringify(store));

      const ownerUser = {
        name: activeProfile.full_name || 'Owner',
        role: 'owner',
        permissions: { sales: true, inventory: true, reports: true, settings: true }
      };
      localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));

      setAccessMood('celebrating');
      showToast('Cloud Store created successfully!', 'success');
      onStoreLoaded(store);
    } catch (err: any) {
      setAccessMood('angry' as any);
      showToast(err.message || 'Failed to create cloud store', 'error');
    } finally {
      setLoadingAuth(false);
    }
  };

  // Handle loading a cloud store
  const handleLoadCloudStore = async (storeRow: any) => {
    if (!storeRow.data) {
      return showToast('Store data is empty', 'error');
    }

    setLoadingAuth(true);
    setAccessMood('thinking');

    try {
      const storeData = storeRow.data as StoreData;
      if (storeData.managerSettings) {
        storeData.managerSettings.multiDeviceSync = true;
      }

      localStorage.setItem('storeflow_store_' + storeData.accessCode, JSON.stringify(storeData));

      const role = activeProfile?.role || 'owner';
      const sessionUser = {
        name: activeProfile?.full_name || 'Owner',
        role: role,
        permissions: { sales: true, inventory: true, reports: true, settings: true }
      };
      localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));

      setAccessMood('happy');
      showToast(`Logged in to ${storeData.storeName}!`, 'success');
      onStoreLoaded(storeData);
    } catch (err: any) {
      setAccessMood('angry' as any);
      showToast('Failed to load cloud store data', 'error');
    } finally {
      setLoadingAuth(false);
    }
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
          <h1 className="font-display text-4xl font-bold mb-2 select-none"><span className="text-foreground">Store</span><span className="text-primary">Flow</span></h1>
          <p className="text-muted-foreground text-sm">Offline-first store management</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-lg hover:opacity-90 transition-opacity cursor-pointer active:scale-95 transition-all shadow-md"
            >
              Create New Store
            </button>
            <p className="text-[10px] text-muted-foreground text-center -mt-1.5">Quick setup on this device, using a store access code</p>

            <button
              onClick={() => setMode('access')}
              className="w-full p-4 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-lg hover:bg-surface-3 transition-colors border border-border cursor-pointer active:scale-95 transition-all"
            >
              Access Existing Store
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground uppercase font-bold">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              onClick={() => setMode('auth-login')}
              className="w-full p-4 rounded-lg bg-surface-2 border border-primary/40 text-foreground font-display font-semibold text-lg hover:border-primary transition-colors cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Cloud className="w-5 h-5 text-primary" /> Sign In / Sign Up with Email
            </button>
            <p className="text-[10px] text-muted-foreground text-center -mt-1.5">Recommended — backs up your store to the cloud and works across devices</p>
          </div>
        )}

        {mode === 'auth-login' && (
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
              onClick={() => setMode('choose')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              ← Back to Workspace Options
            </button>
          </form>
        )}

        {mode === 'auth-signup' && (
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
              onClick={() => setMode('choose')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              ← Back to Workspace Options
            </button>
          </form>
        )}

        {mode === 'auth-store-select' && (
          <div className="space-y-4 text-left p-5 rounded-2xl bg-surface-2 border border-border/80 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                <span>Your Cloud Stores</span>
              </h3>
              <button
                onClick={() => setMode('auth-store-create')}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Create New
              </button>
            </div>
            
            <p className="text-xs text-muted-foreground">Select a store from your account to synchronize and launch.</p>

            <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
              {userStores.map((s) => {
                const icon = CATEGORIES.find(cat => cat.id === s.business_type)?.icon || '🏪';
                return (
                  <button
                    key={s.id}
                    onClick={() => handleLoadCloudStore(s)}
                    disabled={loadingAuth}
                    className="w-full p-3.5 rounded-xl bg-surface-3 hover:bg-surface-4 border border-border/80 flex items-center justify-between text-sm text-left transition-all active:scale-95 disabled:opacity-50 cursor-pointer animate-fade-in"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <p className="font-display font-bold text-foreground leading-snug">{s.business_name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">{s.business_type}</p>
                      </div>
                    </div>
                    <span className="text-primary text-xs font-semibold flex items-center gap-1">Load Store</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                supabase.auth.signOut();
                setActiveProfile(null);
                setMode('auth-login');
              }}
              className="w-full text-center text-xs text-destructive hover:underline mt-4 cursor-pointer"
            >
              Sign Out from {activeProfile?.email}
            </button>
          </div>
        )}

        {mode === 'auth-store-create' && (
          <div className="space-y-4 text-left p-5 rounded-2xl bg-surface-2 border border-border/80 shadow-md">
            <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              <span>Create Cloud Store</span>
            </h3>

            <div>
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Store Name</label>
              <input
                value={storeName}
                onChange={e => {
                  setStoreName(e.target.value);
                  setAccessMood('thinking');
                }}
                placeholder="e.g. Blessed Nnamdi Store"
                className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
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
                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      category === c.id
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-surface-3 border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="text-xl mb-1">{c.icon}</div>
                    <p className="font-display font-semibold text-xs text-foreground">{c.label}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {category === 'retail' && (
              <div className="space-y-1">
                <label className="block text-xs text-muted-foreground uppercase font-bold">Select Retail Type</label>
                <select
                  value={retailType}
                  onChange={e => setRetailType(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-xs focus:outline-none focus:border-primary focus:bg-surface-3 [&>option]:bg-card"
                >
                  <option value="provision_retail">Sales of Provision (Retail Provision)</option>
                  <option value="provision_wholesale">Wholesale for Provision</option>
                  <option value="pharmacy">Pharmacy / Chemist</option>
                  <option value="electronics">Electronics Store</option>
                  <option value="gasoline">Gasoline / Gas Filling Station</option>
                  <option value="other">Other / General Retail</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Select Store Logo Concept</label>
              <div className="grid grid-cols-5 gap-2">
                {LOGO_STYLES.map(style => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSelectedLogoStyle(style.id)}
                    className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      selectedLogoStyle === style.id ? 'bg-primary/10 border-primary ring-1 ring-primary/30' : 'bg-surface-3 border-border hover:border-primary/30'
                    }`}
                  >
                    <StoreLogo storeName={storeName || 'Store'} selectedStyle={style.id} className="w-8 h-8" />
                    <span className="text-[7px] text-center text-muted-foreground font-bold leading-tight">{style.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Owner Password (Optional)</label>
              <input
                type="password"
                value={ownerPassword}
                onChange={e => setOwnerPassword(e.target.value)}
                placeholder="Leave blank for 'owner'"
                className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <button
              onClick={handleCreateCloudStore}
              disabled={loadingAuth}
              className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loadingAuth ? 'Creating Cloud Store...' : 'Create Cloud Store'}
            </button>

            {userStores.length > 0 && (
              <button
                onClick={() => setMode('auth-store-select')}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2 animate-fade-in"
              >
                ← Back to Store List
              </button>
            )}
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
            {category === 'retail' && (
              <div className="space-y-1">
                <label className="block text-xs text-muted-foreground uppercase font-bold">Select Retail Type</label>
                <select
                  value={retailType}
                  onChange={e => setRetailType(e.target.value)}
                  className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:bg-surface-2 [&>option]:bg-card"
                >
                  <option value="provision_retail">Sales of Provision (Retail Provision)</option>
                  <option value="provision_wholesale">Wholesale for Provision</option>
                  <option value="pharmacy">Pharmacy / Chemist</option>
                  <option value="electronics">Electronics Store</option>
                  <option value="gasoline">Gasoline / Gas Filling Station</option>
                  <option value="other">Other / General Retail</option>
                </select>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  * Sales or wholesale of provisions will preload default items. Other types start empty.
                </p>
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Select Store Logo Concept</label>
              <div className="grid grid-cols-5 gap-2">
                {LOGO_STYLES.map(style => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSelectedLogoStyle(style.id)}
                    className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      selectedLogoStyle === style.id ? 'bg-primary/10 border-primary ring-1 ring-primary/30' : 'bg-surface-2 border-border hover:border-primary/30'
                    }`}
                  >
                    <StoreLogo storeName={storeName || 'Store'} selectedStyle={style.id} className="w-8 h-8" />
                    <span className="text-[7.5px] text-center text-muted-foreground font-bold leading-tight">{style.label}</span>
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
            <button
              type="button"
              onClick={handleSkipSecurity}
              className="w-full p-2 text-muted-foreground text-xs hover:text-foreground text-center cursor-pointer"
            >
              Skip for now — I'll set this up later
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
            <button
              onClick={() => setShowQRScanner(true)}
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground font-display font-bold hover:bg-surface-3 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Scan Store QR Code
            </button>
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setMode('auth-login')}
                className="text-xs text-primary font-semibold hover:underline flex items-center justify-center gap-1.5 mx-auto"
              >
                <Cloud className="w-3.5 h-3.5" /> Or Login with Email
              </button>
            </div>
            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer">
              ← Back
            </button>
          </div>
        )}

        {/* QR Scanner Overlay for Store Identification */}
        {showQRScanner && (
          <QRScannerPage
            onScanSuccess={(decodedText: string) => {
              setShowQRScanner(false);

              // Try to extract a store ID from the scanned QR
              const parsed = parseScannedQRText(decodedText);
              if (parsed && parsed.storeId) {
                setAccessCode(parsed.storeId.toUpperCase());
                setAccessMood('happy');
                showToast('Store QR code scanned! Accessing store...', 'success');

                // Auto-trigger access with the extracted code
                setTimeout(() => {
                  const code = parsed.storeId.toUpperCase();
                  // Try local first
                  const localStore = loadStore(code);
                  if (localStore) {
                    proceedWithStore(localStore);
                    return;
                  }

                  // Also try scanning all local stores by storeId field
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('storeflow_store_')) {
                      try {
                        const raw = localStorage.getItem(key);
                        if (raw) {
                          const data = JSON.parse(raw) as StoreData;
                          if (data.storeId === parsed.storeId || data.accessCode === code) {
                            proceedWithStore(data);
                            return;
                          }
                        }
                      } catch { /* skip */ }
                    }
                  }

                  // Try cloud lookup
                  (async () => {
                    setAccessMood('thinking' as any);
                    try {
                      let cloudStore = null;
                      // Try by store_id
                      const { data: byId } = await supabase
                        .from('stores')
                        .select('*')
                        .eq('store_id', parsed.storeId)
                        .maybeSingle();
                      cloudStore = byId;

                      // Fallback: by access_code
                      if (!cloudStore) {
                        const { data: byCode } = await supabase
                          .from('stores')
                          .select('*')
                          .eq('access_code', code)
                          .maybeSingle();
                        cloudStore = byCode;
                      }

                      if (cloudStore && cloudStore.data) {
                        const remoteStore = cloudStore.data as StoreData;
                        localStorage.setItem(`storeflow_store_${remoteStore.accessCode}`, JSON.stringify(remoteStore));
                        setAccessMood('happy' as any);
                        showToast('Cloud store loaded!', 'success');
                        proceedWithStore(remoteStore);
                        return;
                      }

                      setAccessMood('angry');
                      showToast('Store not found. Try entering the access code manually.', 'error');
                    } catch {
                      setAccessMood('angry');
                      showToast('Failed to look up store. Check your connection.', 'error');
                    }
                  })();
                }, 300);
              } else {
                setAccessMood('worried');
                showToast('Could not identify a store from this QR code', 'error');
              }
            }}
            onClose={() => setShowQRScanner(false)}
          />
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
        )}
      </div>
    </div>
  );
}
