import { getPendingStoreSync, markStoreInCloud } from '@/lib/store-cloud-sync';
import { useState, useEffect, useMemo } from 'react';
import { createStore, loadStore, saveStore, getStoreIndex } from '@/lib/store-data';
import { getBusinessTemplate } from '@/lib/business-runtime';
import { applyBusinessTemplate, businessCategoryFor, listBusinessTypes } from '@/lib/business-templates';
import { StoreData, StoreCategory, StoreType } from '@/types/store';
import { showToast } from '@/components/Toast';
import { MascotMood } from '@/components/Mascot';
import { LOGO_STYLES } from '@/components/StoreLogo';
import { supabase } from '@/integrations/supabase/client';
import { generateStoreUrl } from '@/lib/qr-code';
import { clearInvite, normaliseStoreRef, pendingInvite, readJoin } from '@/lib/staff-join';
import {
  connectOwnerAccount,
  ownerAccountMessage,
  OWNER_ACCOUNT_MIN_PASSWORD,
} from '@/lib/owner-cloud-account';
import { StoreAccessProps, QUESTIONS } from './model';

/**
 * Everything the way into a shop needs: which step the person is on,
 * what they have typed, the cloud account, the shop being opened or
 * created, and the handlers that move between the steps.
 *
 * StoreAccess frames the screen; each step is its own part in this folder,
 * reading what it needs from the object this returns.
 */
export function useStoreAccess(props: StoreAccessProps) {
  const { onStoreLoaded } = props;
  /*
   * A worker who scanned a shop's invite QR lands on Join a Store with the
   * Store ID filled in. The link was kept at start-up (captureInviteFromUrl),
   * so it survives a shop that was open for a moment first.
   *
   * A phone that already works at that very shop just signs in as usual. One
   * that works at - or is waiting to join - a different shop is asked first,
   * because joining means leaving the other.
   */
  const [invitedRef, setInvitedRef] = useState(pendingInvite);
  const [askSwitch, setAskSwitch] = useState(() => {
    const joined = readJoin();
    return !!invitedRef && !!joined && normaliseStoreRef(joined.storeRef) !== invitedRef;
  });
  const [mode, setMode] = useState<'choose' | 'join' | 'create-choice' | 'access-choice' | 'create' | 'access' | 'setup-security' | 'login-select' | 'login-password' | 'login-pin' | 'recovery' | 'auth-login' | 'auth-signup' | 'auth-store-select' | 'auth-store-create'>(() => {
    if (!invitedRef || askSwitch) return 'choose';
    if (readJoin()?.status === 'authorized') { clearInvite(); return 'choose'; }
    return 'join';
  });
  const dropInvite = () => { clearInvite(); setInvitedRef(''); };
  // Flow's contextual speech bubble through this flow — bump flowMsgKey to
  // force the same line to replay (e.g. two wrong passwords in a row).
  const [flowMessage, setFlowMessage] = useState<string | null>(null);
  const [flowMsgKey, setFlowMsgKey] = useState(0);
  const say = (text: string) => { setFlowMessage(text); setFlowMsgKey(k => k + 1); };
  const sayRandom = (lines: string[]) => say(lines[Math.floor(Math.random() * lines.length)]);
  const FLOW_WRONG_LINES = [
    "Nope, that's not it. Try again! 🙅",
    "Hmm, that's not matching up. One more try?",
    "Not quite — double-check and go again.",
    "That's wrong. I know, I know — just try again. 😅",
  ];
  const FLOW_WELCOME_BACK_LINES = [
    "Welcome back! Let's get to work. 👋",
    "That's it — you're in! 🎉",
    "Perfect. Good to see you again!",
  ];
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
  const [businessType, setBusinessType] = useState('provision');
  const [selectedLogoStyle, setSelectedLogoStyle] = useState(() => LOGO_STYLES[Math.floor(Math.random() * LOGO_STYLES.length)].id);
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
  const [ownerName, setOwnerName] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState(QUESTIONS[0]);
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  // Login authentication states
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; role: string; isOwner: boolean } | null>(null);
  const [inputPassword, setInputPassword] = useState('');
  const [pinBuffer, setPinBuffer] = useState('');
  const [isPasswordWrong, setIsPasswordWrong] = useState(false);
  const [wrongPasswordCount, setWrongPasswordCount] = useState(0);
  // Recovery states
  const [createStep, setCreateStep] = useState<'name' | 'type' | 'logo'>('name');
  // businessType starts at 'provision' and a logo style is picked at random on
  // mount, so neither can tell you whether the merchant has actually decided.
  // Without this Flow congratulated a choice nobody had made.
  const [pickedType, setPickedType] = useState(false);
  const [pickedLogo, setPickedLogo] = useState(false);
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
      // Held rather than dropped back to idle after a second and a half: the
      // create flow drives its own mood per question, and letting this one
      // overwrite it made Flow go blank halfway through a sentence.
      setAccessMood('thinking');
      return;
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
  // Flow talks through each step, so it feels like he's actually guiding
  // setup rather than just decorating the screen.
  useEffect(() => {
    const lines: Partial<Record<typeof mode, string>> = {
      'choose': "Hey, I'm Flow! Let's do this. 👋",
      'create-choice': "Create a store with me — I'm good with this!",
      'access-choice': "Getting back into your store? I've got you.",
      'create': "First, the basics — name your store and pick a type. I know exactly what goes where.",
      'setup-security': "Almost there! Just lock things down with a password.",
      'access': "Pop in your store code — I'll find it for you.",
      'login-select': "Who's this? Pick your profile and let's go.",
      'login-password': "Your password, please — don't worry, I've got you.",
      'login-pin': "Enter your PIN — nice and easy.",
      'recovery': "Lost access? No stress, let's sort it out together.",
      'auth-store-select': "Pick a store, or start a fresh one with me.",
      'auth-store-create': "New store, new start — let's build it.",
    };
    // The whole of "tell us about your shop" is one mode, so keying on mode
    // alone meant Flow said its piece at the name field and then stood there
    // through the type and logo questions saying nothing. It follows each
    // question now, and reacts to what has actually been chosen.
    if (mode === 'create' && !newCode) {
      if (createStep === 'name') {
        setAccessMood('thinking');
        say(storeName.trim()
          ? `${storeName.trim()} — good name. Hit continue when you're happy.`
          : "What are we calling your shop? Type it and I'll take it from there.");
        return;
      }
      if (createStep === 'type') {
        setAccessMood(pickedType ? 'happy' : 'thinking');
        say(pickedType
          ? 'Good pick — I know exactly how that shop runs.'
          : `What sort of business is ${storeName.trim() || 'it'}? Tap the closest one.`);
        return;
      }
      if (createStep === 'logo') {
        setAccessMood(pickedLogo ? 'confident' : 'thinking');
        say(pickedLogo
          ? "Looks sharp. Create the store and we're in."
          : 'Pick a look. You can change it later.');
        return;
      }
    }

    // The store is made: Flow says so, rather than going back to the start.
    if (mode === 'create' && newCode) {
      setAccessMood('happy');
      say('Your store is ready. Keep this code safe.');
      return;
    }

    const line = lines[mode];
    if (line) say(line);
  }, [mode, createStep, newCode, storeName, pickedType, pickedLogo]);
  // Revert back to idle after typing pause.
  //
  // Not during store creation: each of those three questions sets its own
  // mood, and this timer was overwriting it a second and a half later — which
  // is most of why Flow looked lively at the name field and dead everywhere
  // after it.
  useEffect(() => {
    if (mode === 'create' && !newCode) return;
    if (!storeName && !accessCode) return;
    const t = setTimeout(() => {
      setAccessMood('idle');
    }, 1500);
    return () => clearTimeout(t);
  }, [storeName, accessCode, mode, newCode]);
  // Maps the "Select Retail Type" dropdown to the customer-facing StoreType,
  // so the store actually gets created as what it is (laundry, gas filling,
  // etc.) instead of always defaulting to provision until someone remembers
  // to change it in Settings afterward.
  const retailTypeToStoreType = (rt: string): StoreType => {
    switch (rt) {
      case 'clothing': return 'clothing';
      case 'food': return 'food';
      case 'electronics': return 'electronics';
      case 'laundry': return 'laundry';
      case 'gasoline': return 'gas_filling';
      case 'provision_retail':
      case 'provision_wholesale':
        return 'provision';
      default: return 'provision';
    }
  };
  /*
   * From the registry, not a copy of it.
   *
   * This was a hand-written list beside the one the templates already define -
   * the same duplication that let the Switch Store sheet drift until it could
   * not create a laundry at all. Renaming a trade in one place and not the
   * other is how the two disagree, so there is only one place now, and it
   * carries the commonest-first order with it.
   */
  const BUSINESS_CHOICES = listBusinessTypes().map(entry => [entry.type, entry.name, entry.icon] as const);
  // Shared with the Switch Store sheet, so the two creation paths cannot
  // disagree about what a trade is again.
  const businessCategory = businessCategoryFor;
  const businessStoreType = (type: string): StoreType => type as StoreType;
  const handleCreate = () => {
    if (!storeName.trim()) {
      setAccessMood('worried');
      return showToast('Enter a store name', 'error');
    }

    // If a store was already created this session (user hit Back to change
    // something and is now resubmitting), update it in place — otherwise
    // this would silently create a second, orphaned store with a different
    // access code every time someone goes back and forward again.
    if (loadedStore) {
      const updated: StoreData = {
        ...loadedStore,
        storeName: storeName.trim(),
        category: businessCategory(businessType),
        retailType: businessType,
        storeType: businessStoreType(businessType),
        profile: { ...(loadedStore.profile || {}), logoStyle: selectedLogoStyle },
      };
      saveStore(updated);
      setLoadedStore(updated);
      setNewCode(updated.accessCode); // restore step 2's code display (Back may have cleared it)
      setAccessMood('celebrating');
      say("There it is! Your store's ready. 🎉");
      return;
    }

    const store = createStore(
      storeName.trim(),
      businessCategory(businessType),
      businessType,
      selectedLogoStyle,
      businessStoreType(businessType)
    );
    const templatedStore = applyBusinessTemplate(store, businessType);
    setNewCode(templatedStore.accessCode);
    setLoadedStore(templatedStore);
    
    // Generate recovery key
    const randPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randPart3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `SF-${randPart1}-${randPart2}-${randPart3}`;
    setGeneratedRecoveryKey(key);

    setAccessMood('celebrating');
    say("Boom! Your store is live. Save that code somewhere safe!");
  };
  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loadingAuth) return;
    // The owner password is also the online account's, which needs six.
    if (!ownerPassword.trim() || ownerPassword.length < OWNER_ACCOUNT_MIN_PASSWORD) {
      return showToast(`Password must be at least ${OWNER_ACCOUNT_MIN_PASSWORD} characters`, 'error');
    }
    if (ownerPassword !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }
    if (!recoveryEmail.trim() || !recoveryPhone.trim() || !recoveryAnswer.trim()) {
      return showToast('Please fill all recovery details', 'error');
    }
    if (!loadedStore) return;

    // The same email and password open the shop's online account, so it is
    // backed up and findable by workers' phones from the first save - nobody
    // has to come back to Settings and type them in again.
    setLoadingAuth(true);
    setAccessMood('thinking');
    const account = await connectOwnerAccount(recoveryEmail, ownerPassword.trim(), ownerName.trim() || loadedStore.storeName);
    setLoadingAuth(false);
    const online = account === 'created' || account === 'signed_in';

    // Update settings
    const updatedStore: StoreData = {
      ...loadedStore,
      profile: {
        ...(loadedStore.profile || {}),
        email: recoveryEmail.trim(),
        phone: recoveryPhone.trim(),
        // Kept alongside the email and phone that already came from here, so
        // the profile screen opens with what the shop has already told us
        // rather than three empty boxes.
        ownerName: ownerName.trim() || loadedStore.profile?.ownerName,
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
        // Saving below uploads the shop now that an account is signed in.
        multiDeviceSync: online || loadedStore.managerSettings?.multiDeviceSync || false,
      }
    };

    saveStore(updatedStore);
    setLoadedStore(updatedStore);

    // Fire-and-forget — never blocks store creation. Sends recovery & storefront details to
    // the configured recovery email via Resend in our Supabase Edge Function.
    const storeIdForUrl = updatedStore.storeId || updatedStore.accessCode;
    supabase.functions.invoke('send-account-recovery-email', {
      body: {
        to: recoveryEmail.trim(),
        storeName: updatedStore.storeName,
        accessCode: updatedStore.accessCode,
        storeId: storeIdForUrl,
        storeUrl: generateStoreUrl(storeIdForUrl),
        emergencyRecoveryKey: generatedRecoveryKey,
        recoveryQuestion,
        type: 'security_backup',
      },
    }).catch(err => console.warn('Failed to send account recovery email via Resend:', err));

    const told = ownerAccountMessage(account);
    showToast(told.text, told.tone, told.tone === 'success' ? undefined : 7000);

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
  /*
   * PromiseLike, not Promise.
   *
   * Supabase's query builder is a thenable - it has `then` but no `catch` or
   * `finally` - so it never satisfied `Promise`, and TypeScript quietly gave
   * up on T. Everything the retry returned came back as `unknown`, which is
   * why reading `.length` off a list of stores was an error a few lines
   * later. Describing what is actually passed makes the results typed again.
   */
  const runWithRetry = async <T,>(fn: () => PromiseLike<{ data: T | null; error: any }>, retries = 3, delay = 1000): Promise<{ data: T | null; error: any }> => {
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
  /**
   * The shop a typed code belongs to, if this device already has it.
   *
   * It reads this device's own index and nothing else, which is what makes
   * showing the name safe: a code has to have been opened on this phone before
   * it can be named. Someone guessing six characters at a stranger's shop gets
   * nothing back, because a shop they have never opened is not in the index to
   * be found.
   *
   * Read rather than loaded: loadStore mutates and persists, which typing six
   * characters has no business doing.
   */
  const codePreview = useMemo(() => {
    const code = accessCode.trim().toUpperCase();
    if (code.length < 6) return null;
    const entry = getStoreIndex().find(item => String(item.code || '').toUpperCase() === code);
    if (!entry) return null;
    const template = getBusinessTemplate({ storeType: entry.businessType } as any);
    return { name: entry.name, kind: template.name, icon: template.icon || '🏪' };
  }, [accessCode]);
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
          // It came from the cloud, so the cloud's copy is worth keeping as a base.
          markStoreInCloud(selectedRow.data.accessCode);
          const remoteStore = getPendingStoreSync(selectedRow.data.accessCode)?.next || selectedRow.data as StoreData;
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
          saveStore(remoteStore, { skipCloudSync: true });
          setAccessMood('happy' as any);
          showToast('Cloud backup loaded successfully!', 'success');
          proceedWithStore(loadStore(remoteStore.accessCode) || remoteStore);
          return;
        }
      }
      
      setAccessMood('angry');
      sayRandom(FLOW_WRONG_LINES);
      showToast('Store not found locally or in cloud backup', 'error');
    } catch (err: any) {
      console.error("handleAccess failed to load store:", err);
      setAccessMood('angry');
      sayRandom(FLOW_WRONG_LINES);
      showToast('Failed to connect to cloud storage. Please check connection.', 'error');
    }
  };
  const handleSelectLoginProfile = (user: { id: string; name: string; role: string; isOwner: boolean }) => {
    setSelectedUser(user);
    setIsPasswordWrong(false);
    setWrongPasswordCount(0);
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
        sayRandom(FLOW_WELCOME_BACK_LINES);
        setWrongPasswordCount(0);
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
        const nextCount = wrongPasswordCount + 1;
        setWrongPasswordCount(nextCount);
        if (nextCount >= 4) {
          say("Okay wait... who ARE you?? 🤨");
        } else {
          sayRandom(FLOW_WRONG_LINES);
        }
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
        sayRandom(FLOW_WELCOME_BACK_LINES);
        setWrongPasswordCount(0);
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
        const nextCount = wrongPasswordCount + 1;
        setWrongPasswordCount(nextCount);
        if (nextCount >= 4) {
          say("Okay wait... who ARE you?? 🤨");
        } else {
          sayRandom(FLOW_WRONG_LINES);
        }
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
    if (method === 'email' && target) {
      showToast(`Sending Verification Code to ${target}...`, 'info', 5000);
      supabase.functions.invoke('send-account-recovery-email', {
        body: {
          to: target,
          storeName: loadedStore.storeName,
          type: 'verification_code',
          code,
        },
      }).then(({ error }) => {
        if (error) {
          console.warn('Resend verification code delivery failed, falling back to simulated display:', error);
          showToast(`[FALLBACK] Verification Code sent to ${target}: ${code}`, 'info', 8000);
        } else {
          showToast(`Verification Code emailed successfully to ${target}! Check your inbox.`, 'success', 6000);
        }
      }).catch(() => {
        showToast(`[SIMULATION] Verification Code sent to ${target}: ${code}`, 'info', 8000);
      });
    } else {
      showToast(`[SIMULATION] Verification Code sent to ${target}: ${code}`, 'info', 8000);
    }
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
      const { data: existingProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();
      let profile = existingProfile;

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
      const store = createStore(
        storeName.trim(),
        businessCategory(businessType),
        businessType,
        selectedLogoStyle,
        businessStoreType(businessType)
      );
      const templatedStore = applyBusinessTemplate(store, businessType);
      
      if (templatedStore.managerSettings) {
        templatedStore.managerSettings.multiDeviceSync = true;
        templatedStore.managerSettings.ownerPassword = ownerPassword.trim() || store.managerSettings.ownerPassword || 'owner';
      }

      const storeId = templatedStore.storeId || templatedStore.accessCode;
      const storeUrl = generateStoreUrl(storeId);

      const { data: dbStore, error: storeError } = await supabase
        .from('stores')
        .insert({
          owner_id: activeProfile.id,
          business_name: storeName.trim(),
          business_type: businessType,
          logo: selectedLogoStyle,
          access_code: templatedStore.accessCode,
          owner_password: templatedStore.managerSettings?.ownerPassword || 'owner',
          store_id: storeId,
          qr_code: storeUrl,
          barcode: storeId,
          data: templatedStore as any
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

      localStorage.setItem('storeflow_store_' + templatedStore.accessCode, JSON.stringify(templatedStore));

      const ownerUser = {
        name: activeProfile.full_name || 'Owner',
        role: 'owner',
        permissions: { sales: true, inventory: true, reports: true, settings: true }
      };
      localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));

      if (activeProfile.email) {
        supabase.functions.invoke('send-account-recovery-email', {
          body: {
            to: activeProfile.email,
            storeName: templatedStore.storeName,
            accessCode: templatedStore.accessCode,
            storeId: storeId,
            storeUrl: storeUrl,
            type: 'new_account',
          },
        }).catch(err => console.warn('Failed to send cloud onboarding email via Resend:', err));
      }

      setAccessMood('celebrating');
      showToast('Cloud Store created & details emailed successfully!', 'success');
      onStoreLoaded(templatedStore);
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
      markStoreInCloud(storeRow.data.accessCode);
      const storeData = getPendingStoreSync(storeRow.data.accessCode)?.next || storeRow.data as StoreData;
      if (storeData.managerSettings) {
        storeData.managerSettings.multiDeviceSync = true;
      }

      saveStore(storeData, { skipCloudSync: true });

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
  const profiles: { id: string; name: string; role: string; isOwner: boolean }[] = loadedStore
    ? [
        { id: 'owner', name: loadedStore.storeName + ' Owner', role: 'owner', isOwner: true },
        ...(loadedStore.staffMembers || []).map(s => ({ id: s.id, name: s.name, role: s.role, isOwner: false })),
      ]
    : [];

  return {
    onStoreLoaded,
    invitedRef,
    setInvitedRef,
    askSwitch,
    setAskSwitch,
    mode,
    setMode,
    dropInvite,
    flowMessage,
    setFlowMessage,
    flowMsgKey,
    setFlowMsgKey,
    say,
    sayRandom,
    FLOW_WRONG_LINES,
    FLOW_WELCOME_BACK_LINES,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authFullName,
    setAuthFullName,
    authConfirmPassword,
    setAuthConfirmPassword,
    showAuthPassword,
    setShowAuthPassword,
    loadingAuth,
    setLoadingAuth,
    userStores,
    setUserStores,
    activeProfile,
    setActiveProfile,
    storeName,
    setStoreName,
    category,
    setCategory,
    retailType,
    setRetailType,
    businessType,
    setBusinessType,
    selectedLogoStyle,
    setSelectedLogoStyle,
    accessCode,
    setAccessCode,
    newCode,
    setNewCode,
    accessMood,
    setAccessMood,
    loadedStore,
    setLoadedStore,
    ownerPassword,
    setOwnerPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    recoveryEmail,
    setRecoveryEmail,
    recoveryPhone,
    setRecoveryPhone,
    ownerName,
    setOwnerName,
    recoveryQuestion,
    setRecoveryQuestion,
    recoveryAnswer,
    setRecoveryAnswer,
    generatedRecoveryKey,
    setGeneratedRecoveryKey,
    selectedUser,
    setSelectedUser,
    inputPassword,
    setInputPassword,
    pinBuffer,
    setPinBuffer,
    isPasswordWrong,
    setIsPasswordWrong,
    wrongPasswordCount,
    setWrongPasswordCount,
    createStep,
    setCreateStep,
    pickedType,
    setPickedType,
    pickedLogo,
    setPickedLogo,
    recoveryMode,
    setRecoveryMode,
    answeredQuestion,
    setAnsweredQuestion,
    enteredKey,
    setEnteredKey,
    simulatedCode,
    setSimulatedCode,
    inputCode,
    setInputCode,
    newPassVal,
    setNewPassVal,
    confirmNewPassVal,
    setConfirmNewPassVal,
    recoveryMethodSelected,
    setRecoveryMethodSelected,
    showQRScanner,
    setShowQRScanner,
    retailTypeToStoreType,
    BUSINESS_CHOICES,
    businessCategory,
    businessStoreType,
    handleCreate,
    handleSaveSecurity,
    handleSkipSecurity,
    proceedWithStore,
    runWithRetry,
    loadCloudStoreData,
    codePreview,
    handleAccess,
    handleSelectLoginProfile,
    handleVerifyPassword,
    handlePinKeyPress,
    handleTriggerSimulatedCode,
    handleVerifyAnswer,
    handleVerifyRecoveryKey,
    handleVerifyCode,
    handleResetPassword,
    handleAuthSignUp,
    handleAuthSignIn,
    handleCreateCloudStore,
    handleLoadCloudStore,
    profiles,
  };
}

export type StoreAccessState = ReturnType<typeof useStoreAccess>;
