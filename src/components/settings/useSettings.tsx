import { useState, useEffect, useRef, useMemo } from 'react';
import {
  StoreData,
  StoreProfile,
  ManagerSettings,
  DEFAULT_MANAGER_SETTINGS,
  Product,
  SavingsGoal,
  PaymentInfo,
  RentInfo,
} from '@/types/store';
import { supabase } from '@/integrations/supabase/client';
import { drawQRCode, drawBarcode, generateStoreUrl } from '@/lib/qr-code';
import { saveStore, getTrash, getStoreIndex, STORE_PREFIX } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { THEMES, ThemeId, getTheme, applyTheme } from '@/lib/theme';
import {
  compileBackupPayload,
  restoreBackupPayload,
  BackupPayload,
  decryptBackup,
} from '@/lib/backup-system';
import { LocalBackup, getLocalBackups, saveLocalBackup, deleteLocalBackup } from '@/lib/backup-db';
import { getLowStockThreshold } from '@/lib/settings';
import { generateInsights } from '@/lib/manager-intel';
import { downscaleImageToDataUrl } from '@/lib/downscale-image';
import { hasBusinessModule } from '@/lib/business-runtime';
import { fingerprintEnrolled, hasPin } from '@/lib/app-lock';
import { saveLockTimer, getLockTimer, saveSession, clearSession, type LockTimer } from '@/lib/store-session';
import { rentFrequency } from '@/lib/rent';
import { shopStorage } from '@/lib/shop-storage';

export type View =
  | 'home' | 'profile' | 'flow' | 'pricing' | 'inventory' | 'savings'
  | 'appearance' | 'notifications' | 'security' | 'data' | 'support'
  | 'help' | 'faq' | 'about' | 'contact' | 'privacy' | 'terms' | 'backups' | 'discount' | 'activity-log'
  | 'wishlist' | 'barcode' | 'marketplace-settings' | 'printer-settings';

export interface SettingsProps {
  /** Told whenever this screen moves in or out of a sub-view, so the page's
   *  single Back button knows whether to step up a level or leave Settings. */
  onSubViewChange?: (inSubView: boolean) => void;
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onLock: () => void;
  currentUser?: any;
  isActive?: boolean; // true only while the Settings tab is the visible one — the component itself is kept mounted (CSS-hidden) when other tabs are active, so this is how it knows to reset itself
}

// Service-first businesses do not manage stock as their primary operation.
// Keep inventory tools for product businesses, but hide inventory-only settings from service workflows.
const SERVICE_BUSINESS_TYPES = new Set([
  'laundry','barber','salon','tailoring','repair','printing','cyber_cafe','car_wash','photography','cleaning','spa','games','gaming','games_entertainment'
]);
export function isServiceBusiness(store: StoreData): boolean {
  const type = String(store.storeType || '').toLowerCase();
  const category = String(store.category || '').toLowerCase();
  return SERVICE_BUSINESS_TYPES.has(type) || SERVICE_BUSINESS_TYPES.has(category);
}

/**
 * Everything the Settings screen knows and can do: its state, what it
 * works out from the store, and its handlers. Each view in ./views reads
 * what it needs from the one object this returns.
 */
export function useSettings(props: SettingsProps) {
  const { store, onUpdate, onLock, currentUser, isActive = true, onSubViewChange } = props;
  const [view, setViewState] = useState<View>('home');
  const serviceBusiness = isServiceBusiness(store);
  /*
   * Whether this shop keeps stock, which is the only question the stock
   * settings were ever really asking.
   *
   * They asked a list of trade names kept in this file - the third copy of a
   * judgement the business templates already make, and one that has to be
   * remembered every time a trade is added. The module is the thing itself: a
   * shop either has stock to configure or it does not, and the template
   * already says which.
   */
  const keepsStock = hasBusinessModule(store, 'inventory');
  const barcodeQrCanvasRef = useRef<HTMLCanvasElement>(null);
  const storeBarcodeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showAllProductsQR, setShowAllProductsQR] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [storeExistsInCloud, setStoreExistsInCloud] = useState<boolean | null>(null);
  const [checkingCloudStatus, setCheckingCloudStatus] = useState(false);
  const [cloudStatusError, setCloudStatusError] = useState<string | null>(null);
  const [cachedQR, setCachedQR] = useState<{ qrDataUrl: string; qrVersion: number; storeUrl: string; storeId: string } | null>(() => {
    try {
      const cached = localStorage.getItem(`storeflow_qr_cache_${store.accessCode}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  // Back-navigation history for the settings sub-views. Its value is only ever
  // read through the updater's `prev`, which is what made it look unused — but
  // setView is how every row on this page navigates, so without it the first
  // tap anywhere threw and nothing moved at all.
  const [viewStack, setViewStack] = useState<View[]>(['home']);
  const setView = (newView: View) => {
    setViewStack(prev => {
      const idx = prev.indexOf(newView);
      if (idx !== -1) {
        const stepsBack = prev.length - 1 - idx;
        if (stepsBack > 0) {
          window.history.go(-stepsBack);
        }
        return prev;
      } else {
        // tab:'settings' has to be here too — Index.tsx's own popstate
        // listener reads e.state.tab independently of this component, and
        // defaults to 'dashboard' when it's missing. Without it, going back
        // from any sub-view (Discount, Savings, etc.) jumped straight past
        // the Settings menu to the Dashboard tab instead of landing here.
        window.history.pushState({ tab: 'settings', settingsView: newView }, '', '');
        setViewState(newView);
        return [...prev, newView];
      }
    });
  };
  useEffect(() => {
    const handlePop = (e: PopStateEvent) => {
      const targetView = (e.state && e.state.settingsView) || 'home';
      setViewState(targetView);
      setViewStack(prev => {
        const idx = prev.indexOf(targetView);
        if (idx !== -1) {
          return prev.slice(0, idx + 1);
        } else {
          return [...prev, targetView];
        }
      });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);
  // Settings is kept mounted (just CSS-hidden) when another tab is active,
  // so its `view` state doesn't naturally reset on its own the way a real
  // unmount would. Without this, switching to another tab and then back to
  // Settings via the bottom nav resumed at whatever sub-view was open
  // before, instead of showing the Settings menu.
  useEffect(() => {
    if (!isActive && view !== 'home') {
      setViewState('home');
      setViewStack(['home']);
    }
  }, [isActive]);
  useEffect(() => {
    onSubViewChange?.(view !== 'home');
  }, [view, onSubViewChange]);
  useEffect(() => {
    if (!keepsStock && view === 'inventory') {
      setViewState('home');
      setViewStack(['home']);
    }
  }, [keepsStock, view]);
  const [searchQuery, setSearchQuery] = useState('');
  const [timer, setTimer] = useState<LockTimer>(getLockTimer());
  const [pinSet, setPinSet] = useState(() => hasPin());
  const [fingerprintOn, setFingerprintOn] = useState(() => fingerprintEnrolled());
  /** null when closed; 'set' while choosing; 'confirm' while repeating it. */
  const [pinStage, setPinStage] = useState<'set' | 'confirm' | null>(null);
  const [pinDraft, setPinDraft] = useState('');
  const [pinFirst, setPinFirst] = useState('');
  const [theme, setTheme] = useState<ThemeId>(getTheme());
  const [showTrash, setShowTrash] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [deleteConfirmGoalId, setDeleteConfirmGoalId] = useState<string | null>(null);
  const [lowStock, setLowStock] = useState<string>(String(getLowStockThreshold()));
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [newAccessCode, setNewAccessCode] = useState(store.accessCode);
  const [revealCode, setRevealCode] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [currentPasswordConfirm, setCurrentPasswordConfirm] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Backorder-selling toggle — requires owner password to flip either way
  const [backorderPwOpen, setBackorderPwOpen] = useState(false);
  const [backorderPwInput, setBackorderPwInput] = useState('');
  const [backorderPwPendingValue, setBackorderPwPendingValue] = useState(false);
  // Sales Target — Auto by default; owner can pin a manual amount + period
  const [targetMode, setTargetMode] = useState<'auto' | 'manual'>(store.salesTarget?.mode || 'auto');
  const [targetPeriod, setTargetPeriod] = useState<'daily' | 'weekly'>(store.salesTarget?.period || 'daily');
  const [targetAmountInput, setTargetAmountInput] = useState(store.salesTarget?.amount ? String(store.salesTarget.amount) : '');
  const saveTarget = (patch: Partial<{ mode: 'auto' | 'manual'; period: 'daily' | 'weekly'; amount: string }>) => {
    const nextMode = patch.mode ?? targetMode;
    const nextPeriod = patch.period ?? targetPeriod;
    const nextAmountInput = patch.amount ?? targetAmountInput;
    setTargetMode(nextMode);
    setTargetPeriod(nextPeriod);
    setTargetAmountInput(nextAmountInput);
    if (nextMode === 'auto') {
      persist({ salesTarget: { mode: 'auto' } });
    } else {
      const amt = Number(nextAmountInput);
      persist({ salesTarget: { mode: 'manual', period: nextPeriod, amount: amt > 0 ? amt : undefined } });
    }
  };
  const requestBackorderToggle = (nextValue: boolean) => {
    setBackorderPwPendingValue(nextValue);
    setBackorderPwInput('');
    setBackorderPwOpen(true);
  };
  const confirmBackorderToggle = () => {
    const ownerPw = store.managerSettings?.ownerPassword || 'owner';
    if (backorderPwInput !== ownerPw) {
      showToast('Incorrect password', 'error');
      return;
    }
    updateMgr({ backorderSellingEnabled: backorderPwPendingValue });
    setBackorderPwOpen(false);
    setBackorderPwInput('');
    showToast(backorderPwPendingValue ? 'Backorder selling turned on' : 'Backorder selling turned off');
  };
  // Store Type change — requires typing the store's access code to confirm,
  // so it can't be flipped by an accidental tap. Not locked permanently —
  // just gated, since the owner may genuinely need to change it later.
  const [pendingStoreType, setPendingStoreType] = useState<string | null>(null);
  const [storeTypeCodeInput, setStoreTypeCodeInput] = useState('');
  const confirmStoreTypeChange = () => {
    if (storeTypeCodeInput.trim().toUpperCase() !== store.accessCode.toUpperCase()) {
      showToast('That store code is incorrect', 'error');
      return;
    }
    persist({ storeType: pendingStoreType as any });
    showToast('Store type updated');
    setPendingStoreType(null);
    setStoreTypeCodeInput('');
  };
  const [showCloudAuthModal, setShowCloudAuthModal] = useState(false);
  const handleCloudAuthSuccess = async (profile: any) => {
    setShowCloudAuthModal(false);

    if (!profile || !profile.id) {
      showToast("Please sign in again.", "error");
      return;
    }

    if (!store || !store.accessCode) {
      showToast("Store record does not exist. Please load or create a store first.", "error");
      return;
    }

    try {
      // 1. Wait until authentication is fully loaded
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        console.error("Cloud sync: auth session not loaded/missing", sessionError);
        showToast("Please sign in again.", "error");
        return;
      }

      // Check profile matches active session
      if (profile.auth_user_id !== session.user.id) {
        console.error("Cloud sync: profile auth_user_id mismatch with session user id", { profileUid: profile.auth_user_id, sessionUid: session.user.id });
        showToast("Please sign in again.", "error");
        return;
      }

      const { data: existingStore, error: fetchError } = await supabase
        .from('stores')
        .select('id')
        .eq('access_code', store.accessCode)
        .maybeSingle();

      if (fetchError) {
        console.warn("Cloud sync: error querying existing store:", fetchError);
      }

      const storeId = store.storeId || store.accessCode;
      const storeUrl = generateStoreUrl(storeId);

      const payload: any = {
        owner_id: profile.id,
        business_name: store.storeName,
        business_type: store.category || 'retail',
        logo: store.profile?.logoStyle || 'minimalist',
        access_code: store.accessCode,
        owner_password: store.managerSettings?.ownerPassword || 'owner',
        data: store as any,
        store_id: storeId,
        qr_code: storeUrl,
        barcode: storeId,
        updated_at: new Date().toISOString()
      };

      if (existingStore && existingStore.id) {
        payload.id = existingStore.id;
      }

      const { data: dbStore, error: storeError } = await supabase
        .from('stores')
        .upsert(payload, { onConflict: 'access_code' })
        .select('id')
        .maybeSingle();

      if (storeError) {
        console.error("Cloud sync: database upsert failed:", storeError);
        return showToast(storeError.message || 'Database policy restricted the sync operation.', 'error');
      }

      if (!dbStore || !dbStore.id) {
        console.error("Cloud sync: upsert returned no store details or missing ID");
        return showToast('Database policy restricted the sync operation.', 'error');
      }

      const { error: memberError } = await supabase.from('store_members').upsert({
        store_id: dbStore.id,
        profile_id: profile.id,
        role: 'owner'
      }, { onConflict: 'store_id,profile_id' });

      if (memberError) {
        console.error("Cloud sync: member link failed:", memberError);
        return showToast(memberError.message || 'Failed to link account to the store.', 'error');
      }

      updateMgr({ multiDeviceSync: true });
      const updatedStore = {
        ...store,
        managerSettings: {
          ...store.managerSettings,
          multiDeviceSync: true
        }
      };
      saveStore(updatedStore);
      setStoreExistsInCloud(true);
      showToast('Cloud Sync Enabled! Backup created successfully.', 'success');
    } catch (err: any) {
      console.error("Cloud sync failed to start:", err);
      showToast(err.message || 'Failed to initialize cloud backup', 'error');
    }
  };
  // Backup system state
  const [localBackups, setLocalBackups] = useState<LocalBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<LocalBackup | null>(null);
  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const list = await getLocalBackups();
      setLocalBackups(list);
    } catch (err) {
      showToast('Failed to load local backups', 'error');
    } finally {
      setLoadingBackups(false);
    }
  };
  useEffect(() => {
    if (view === 'backups') {
      loadBackups();
    }
  }, [view]);
  const handleCreateManualBackup = async () => {
    try {
      const payload = compileBackupPayload();
      const dbData: Record<string, string> = {
        index: payload.index,
        deviceMemory: JSON.stringify(payload.deviceMemory),
        lowStock: payload.lowStock || '',
        lockTimer: payload.lockTimer || '',
        theme: payload.theme || '',
      };
      for (const [k, v] of Object.entries(payload.stores)) {
        dbData[k] = v;
      }
      await saveLocalBackup('manual', dbData);
      showToast('✓ Local backup snapshot created');
      loadBackups();
    } catch (err) {
      showToast('Failed to save backup snapshot', 'error');
    }
  };
  const handleDeleteBackup = async (id: string) => {
    try {
      await deleteLocalBackup(id);
      showToast('Snapshot deleted');
      loadBackups();
    } catch (err) {
      showToast('Failed to delete snapshot', 'error');
    }
  };
  const handleRestoreBackup = async () => {
    if (!restoreConfirm) return;
    try {
      const dbData = restoreConfirm.data;
      const stores: Record<string, string> = {};
      for (const [k, v] of Object.entries(dbData)) {
        if (k.startsWith('storeflow_') && k !== 'storeflow_index' && k !== 'storeflow_flow_memory') {
          stores[k] = v;
        }
      }

      const payload: BackupPayload = {
        version: '1.0',
        timestamp: restoreConfirm.timestamp,
        deviceMemory: dbData.deviceMemory ? JSON.parse(dbData.deviceMemory) : null,
        index: dbData.index || '[]',
        stores,
        lowStock: dbData.lowStock || undefined,
        lockTimer: dbData.lockTimer || undefined,
        theme: dbData.theme || undefined,
      };

      const result = restoreBackupPayload(payload);
      showToast(`✓ Restored: ${result.storesRestoredCount} stores merged successfully`);
      setRestoreConfirm(null);

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      showToast('Failed to restore snapshot', 'error');
    }
  };
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let payload = JSON.parse(event.target?.result as string);
        // Both the old XOR files and the sealed ones.
        if (String(payload.version || '').endsWith('-encrypted')) {
          const key = prompt("Enter Owner Password or Emergency Recovery Key to decrypt backup:");
          if (!key) {
            showToast('Decryption cancelled', 'error');
            return;
          }
          try {
            payload = await decryptBackup(payload, key);
          } catch (decErr: any) {
            showToast(decErr.message || 'Incorrect decryption key', 'error');
            return;
          }
        }

        if (!payload.version || !payload.index) {
          showToast('Invalid StoreFlow backup file schema', 'error');
          return;
        }

        const result = restoreBackupPayload(payload);
        showToast(`✓ Imported: ${result.storesRestoredCount} stores successfully merged`);

        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err) {
        showToast('Failed to parse backup JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };
  const [showExport, setShowExport] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Draw the store QR code and Barcode when barcode view is active
  // 1. Permanent QR Cache & Background Validation
  useEffect(() => {
    if (view !== 'barcode') return;

    const storeId = store.storeId || store.accessCode;
    const storeUrl = generateStoreUrl(storeId);

    // Initial check: if no cache exists, set cloud validation state to show spinner
    if (!cachedQR) {
      setCheckingCloudStatus(true);
      setCloudStatusError(null);
      setStoreExistsInCloud(null);
    } else {
      // Immediate display: cache exists
      setStoreExistsInCloud(true);
      setCheckingCloudStatus(false);
    }

    const validateQR = async () => {
      try {
        // Query stores table to see if it exists in the cloud database
        const { data: cloudStore, error } = await supabase
          .from('stores')
          .select('id, store_id, qr_code, data')
          .eq('access_code', store.accessCode)
          .maybeSingle();

        if (error) {
          console.error("Cloud status check failed query:", error);
          if (!cachedQR) {
            setCloudStatusError('Could not check the cloud connection. Sign in to your StoreFlow account, then try again.');
            setStoreExistsInCloud(false);
          }
          setCheckingCloudStatus(false);
          return;
        }

        if (cloudStore && cloudStore.id) {
          setStoreExistsInCloud(true);
          setCheckingCloudStatus(false);

          const cloudUrl = cloudStore.qr_code || generateStoreUrl(cloudStore.store_id || storeId);
          const cloudVersion = (cloudStore.data as { qrDesignVersion?: number } | null)?.qrDesignVersion || 1;
          const cloudStoreId = cloudStore.store_id || storeId;

          const needsUpdate =
            !cachedQR ||
            cachedQR.qrVersion !== cloudVersion ||
            cachedQR.storeUrl !== cloudUrl ||
            cachedQR.storeId !== cloudStoreId;

          if (needsUpdate) {
            console.log("QR Cache: Mismatch or no cache. Drawing QR in background...");
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 400;
            tempCanvas.height = 400;

            await drawQRCode({ text: cloudUrl, canvas: tempCanvas, standard: true });
            const dataUrl = tempCanvas.toDataURL('image/png');
            const cacheData = {
              qrDataUrl: dataUrl,
              qrVersion: cloudVersion,
              storeUrl: cloudUrl,
              storeId: cloudStoreId
            };
            localStorage.setItem(`storeflow_qr_cache_${store.accessCode}`, JSON.stringify(cacheData));
            setCachedQR(cacheData);
            console.log("QR Cache: Successfully cached new QR.");
          } else {
            console.log("QR Cache: Cache matches server version.");
          }
        } else {
          setCheckingCloudStatus(false);
          if (!cachedQR) {
            setStoreExistsInCloud(false);
            setCloudStatusError("Store has not been uploaded to the cloud yet. Please enable Multi-device Cloud Sync under Security Settings to back up and publish your store first.");
          }
        }
      } catch (err: any) {
        console.error("Cloud check execution error:", err);
        setCheckingCloudStatus(false);
        if (!cachedQR) {
          setStoreExistsInCloud(false);
          setCloudStatusError("Network error occurred while connecting to the cloud.");
        }
      }
    };

    validateQR();
  }, [view, store.accessCode, store.storeId, cachedQR]);
  // 2. Draw Barcode (Separate Hook)
  useEffect(() => {
    if (view !== 'barcode') return;
    const storeId = store.storeId || store.accessCode;

    if (storeBarcodeCanvasRef.current) {
      drawBarcode(storeId, storeBarcodeCanvasRef.current, {
        barColor: '#000000',
        bgColor: '#FFFFFF',
        barWidth: 2,
        height: 70,
        showText: true
      });
    }
  }, [view, store.storeId, store.accessCode]);
  // 3. Silent Store Data Sync & Product Statistics Sync Hook
  useEffect(() => {
    if (view !== 'barcode') return;

    const performSilentSync = async () => {
      try {
        console.log("Silent Sync: Checking for store updates in background...");
        const { data: cloudStore, error } = await supabase
          .from('stores')
          .select('*')
          .eq('access_code', store.accessCode)
          .maybeSingle();

        if (error || !cloudStore) {
          console.warn("Silent Sync: Failed to retrieve updates.", error);
          return;
        }

        const serverData = cloudStore.data as unknown as StoreData | null;
        if (!serverData) return;

        // Perform diff and update only changed values
        let hasChanges = false;
        const mergedStore = { ...store };

        if (serverData.storeName && serverData.storeName !== store.storeName) {
          mergedStore.storeName = serverData.storeName;
          hasChanges = true;
        }

        if (serverData.profile && JSON.stringify(serverData.profile) !== JSON.stringify(store.profile)) {
          mergedStore.profile = serverData.profile;
          hasChanges = true;
        }

        if (serverData.marketplaceSettings && JSON.stringify(serverData.marketplaceSettings) !== JSON.stringify(store.marketplaceSettings)) {
          mergedStore.marketplaceSettings = serverData.marketplaceSettings;
          hasChanges = true;
        }

        if (serverData.products && JSON.stringify(serverData.products) !== JSON.stringify(store.products)) {
          mergedStore.products = serverData.products;
          hasChanges = true;
        }

        if (serverData.storeId && serverData.storeId !== store.storeId) {
          mergedStore.storeId = serverData.storeId;
          hasChanges = true;
        }

        if (hasChanges) {
          console.log("Silent Sync: Found updates, updating local state.");
          onUpdate(mergedStore);
        } else {
          console.log("Silent Sync: No updates found, store is up to date.");
        }
      } catch (syncErr) {
        console.warn("Silent Sync: Execution error:", syncErr);
      }
    };

    if (!navigator.onLine) {
      console.log("Silent Sync: Offline. Listening for online event...");
      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        performSilentSync();
      };
      window.addEventListener('online', handleOnline);
      return;
    }

    performSilentSync();
  }, [view, store.accessCode]);
  // 4. Manual QR Refresh Handler
  const handleManualQRRefresh = () => {
    const storeId = store.storeId || store.accessCode;
    const storeUrl = generateStoreUrl(storeId);
    showToast("Refreshing QR Code...", "info");

    Promise.resolve(supabase
      .from('stores')
      .select('id, store_id, qr_code, data')
      .eq('access_code', store.accessCode)
      .maybeSingle())
      .then(({ data: cloudStore, error }) => {
        if (error) {
          showToast("Failed to check server: " + error.message, "error");
          return;
        }

        const cloudUrl = cloudStore?.qr_code || storeUrl;
        const cloudVersion = ((cloudStore?.data as { qrDesignVersion?: number } | null)?.qrDesignVersion || 1) + 1; // force increment version
        const cloudStoreId = cloudStore?.store_id || storeId;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 400;
        tempCanvas.height = 400;

        drawQRCode({ text: cloudUrl, canvas: tempCanvas, standard: true }).then(() => {
          const dataUrl = tempCanvas.toDataURL('image/png');
          const cacheData = {
            qrDataUrl: dataUrl,
            qrVersion: cloudVersion,
            storeUrl: cloudUrl,
            storeId: cloudStoreId
          };
          localStorage.setItem(`storeflow_qr_cache_${store.accessCode}`, JSON.stringify(cacheData));
          setCachedQR(cacheData);
          showToast("Store QR Code successfully refreshed!", "success");
        });
      })
      .catch(err => {
        showToast("Network error: failed to refresh QR.", "error");
      });
  };
  const handlePrintQR = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }

    const storeId = store.storeId || store.accessCode;
    const storeUrl = generateStoreUrl(storeId);

    // Generate a fresh QR onto a temp canvas, export as PNG
    const tmpCanvas = document.createElement('canvas');

    drawQRCode({ text: storeUrl, canvas: tmpCanvas, standard: true }).then(() => {
      const imgData = tmpCanvas.toDataURL('image/png');
      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code - ${store.storeName}</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center;
                padding: 40px;
                color: #0f172a;
              }
              .card {
                border: 3px solid #FFC72C;
                border-radius: 24px;
                padding: 40px;
                max-width: 420px;
                margin: 0 auto;
                background: #111111;
                color: #ffffff;
                box-shadow: 0 0 24px rgba(255,199,44,0.15);
              }
              h1 { font-size: 26px; margin-bottom: 6px; font-weight: 800; color: #fff; }
              p { font-size: 13px; color: #aaa; margin-bottom: 20px; }
              .qr-container {
                margin: 0 auto 20px;
                background: #fff;
                border-radius: 16px;
                display: inline-block;
                padding: 12px;
              }
              img { width: 260px; height: 260px; display: block; }
              .code-box {
                background: #1a1a1a;
                border: 1px solid #FFC72C44;
                padding: 10px 20px;
                border-radius: 12px;
                font-family: monospace;
                font-size: 18px;
                font-weight: bold;
                letter-spacing: 3px;
                color: #FFC72C;
                display: inline-block;
                margin-top: 10px;
              }
              .footer { margin-top: 28px; font-size: 11px; color: #555; }
              @media print { body { padding: 0; } .card { border: none; max-width: 100%; } }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${store.storeName}</h1>
              <p>Scan this QR code or enter the Store ID manually to view store details and products.</p>
              <div class="qr-container">
                <img src="${imgData}" alt="StoreFlow QR Code" />
              </div>
              <div><div class="code-box">${storeId}</div></div>
              <div class="footer">Powered by StoreFlow &bull; Secure &bull; Compatibility Redesigned</div>
            </div>
            <script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    });
  };
  const [delStoreNameInput, setDelStoreNameInput] = useState('');
  const [delCodeInput, setDelCodeInput] = useState('');
  const [delConfirmTextInput, setDelConfirmTextInput] = useState('');
  const [delError, setDelError] = useState('');
  const [profile, setProfile] = useState<StoreProfile>(
    store.profile || { storeType: '', location: '', phone: '', email: '' }
  );
  const [profilePassword, setProfilePassword] = useState(store.managerSettings?.ownerPassword || '');
  const [revealProfilePass, setRevealProfilePass] = useState(false);
  const [payment, setPayment] = useState<PaymentInfo>(store.profile?.payment || {});
  const [rent, setRent] = useState<RentInfo>(store.profile?.rent || { isRented: false });
  // Each rent change saves as it is made; this says so, briefly.
  const [rentSaved, setRentSaved] = useState(false);
  const rentSavedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(rentSavedTimer.current), []);
  const [mgr, setMgr] = useState<ManagerSettings>({ ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) });
  const [loyalty, setLoyalty] = useState(store.loyaltySettings || {
    enabled: false, earnPerHundred: 1, redeemThreshold: 100, redeemValueNaira: 500,
  });
  useEffect(() => {
    if (store.loyaltySettings) setLoyalty(store.loyaltySettings);
  }, [store.loyaltySettings]);
  const updateLoyalty = (patch: Partial<typeof loyalty>) => {
    const next = { ...loyalty, ...patch };
    setLoyalty(next);
    persist({ loyaltySettings: next });
  };
  const [savings, setSavings] = useState<SavingsGoal>(store.savingsGoal || {
    amount: 500000, label: 'Emergency Fund', source: 'profit', percentage: 10, saved: 0,
    bankName: '', frequency: 'weekly',
  });
  // Same class of bug as savings above — mgr only reflected store.managerSettings
  // at mount. Safe to sync live here too: every edit to mgr goes through
  // updateMgr, which always persists in the same action, so there's never an
  // uncommitted local-only edit this could clobber.
  useEffect(() => {
    setMgr({ ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) });
  }, [store.managerSettings]);
  // `savings` above only captures store.savingsGoal at mount time — React's
  // useState initial value is ignored on re-renders. Without this, the saved
  // amount here goes stale the moment it's updated anywhere else (most
  // commonly the scheduled auto-save deduction running in the background),
  // and this screen just shows whatever number it happened to load with.
  useEffect(() => {
    if (store.savingsGoal) setSavings(store.savingsGoal);
  }, [store.savingsGoal]);
  const trashCount = getTrash(store).length;
  const insights = useMemo(() => generateInsights(store, '7d'), [store]);
  const latestInsight = insights[0];
  // ----- profile completion -----
  const profileCompletion = useMemo(() => {
    const fields = [
      store.profile?.photo, profile.storeType, profile.location, profile.phone, profile.email,
      profile.website, profile.openingTime, profile.closingTime, profile.ownerName,
      payment.bankName, payment.accountNumber,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [store.profile, profile, payment]);
  const lowStockCount = store.products.filter(p => p.quantity <= getLowStockThreshold()).length;
  const activeNotifTypes = [
    mgr.notifyInsights, mgr.notifyRecommendations, mgr.notifyAlerts,
    mgr.notifyWeeklyRecap, mgr.notifySavingsReminders, mgr.notifyLowStock,
  ].filter(Boolean).length;
  const savingsPct = savings.amount > 0 ? Math.min(100, (savings.saved / savings.amount) * 100) : 0;
  // ----- persistence -----
  const persist = (patch: Partial<StoreData>) => {
    const updated = { ...store, ...patch };
    saveStore(updated); onUpdate(updated);
  };
  /**
   * Both pricing switches, kept in step with the one thing customers read.
   *
   * These wrote only managerSettings, which the storefront payload does not
   * carry — the customer app is served marketplaceSettings.pricingMode. So a
   * merchant could turn wholesale off here and customers would carry on seeing
   * wholesale prices. Marketplace Settings sets the mode and mirrors the
   * booleans; this now does the same, from the other direction.
   *
   * Turning both off would leave a storefront with no prices at all, so the
   * last one on stays on.
   */
  const setPricingModes = (retail: boolean, wholesale: boolean) => {
    const bothOff = !retail && !wholesale;
    const nextRetail = bothOff ? true : retail;
    const nextWholesale = bothOff ? false : wholesale;
    if (bothOff) showToast('A storefront needs at least one price, so retail stays on', 'info');

    const nextMgr = { ...mgr, retailPricingEnabled: nextRetail, wholesalePricingEnabled: nextWholesale };
    setMgr(nextMgr);
    persist({
      managerSettings: nextMgr,
      marketplaceSettings: {
        ...(store.marketplaceSettings || {}),
        pricingMode: nextRetail && nextWholesale ? 'both' : nextWholesale ? 'wholesale' : 'retail',
      } as any,
    });
  };
  const updateMgr = (patch: Partial<ManagerSettings>) => {
    const next = { ...mgr, ...patch };
    setMgr(next); persist({ managerSettings: next });
  };
  const handleWishlistUpdate = (updatedStore: StoreData) => {
    saveStore(updatedStore);
    onUpdate(updatedStore);
  };
  // Auto discount input local string states to allow empty inputs
  const [discValStr, setDiscValStr] = useState('');
  const [discMinStr, setDiscMinStr] = useState('');
  const [discMaxStr, setDiscMaxStr] = useState('');
  // Local state string variables for restock settings
  const [defaultPurchaseQtyStr, setDefaultPurchaseQtyStr] = useState('');
  const [defaultRestockQtyStr, setDefaultRestockQtyStr] = useState('');
  const [minStockThresholdStr, setMinStockThresholdStr] = useState('');
  const handleDiscValChange = (val: string) => {
    setDiscValStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountValue: isNaN(n) ? 0 : n });
  };
  const handleDiscMinChange = (val: string) => {
    setDiscMinStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountMinSubtotal: isNaN(n) ? 0 : n });
  };
  const handleDiscMaxChange = (val: string) => {
    setDiscMaxStr(val);
    const n = Number(val);
    updateMgr({ autoDiscountMaxSubtotal: isNaN(n) ? 0 : n });
  };
  const handleSaveRestockSettings = () => {
    const defaultPurchaseQty = Math.max(1, Number(defaultPurchaseQtyStr) || 1);
    const defaultRestockQty = Math.max(1, Number(defaultRestockQtyStr) || 1);
    const minStockThreshold = Math.max(0, Number(minStockThresholdStr) || 0);

    updateMgr({
      defaultPurchaseQty,
      defaultRestockQty,
      minStockThreshold
    });

    setDefaultPurchaseQtyStr(String(defaultPurchaseQty));
    setDefaultRestockQtyStr(String(defaultRestockQty));
    setMinStockThresholdStr(String(minStockThreshold));

    showToast('✓ Restock settings saved successfully!', 'success');
  };
  useEffect(() => {
    if (view === 'discount') {
      setDiscValStr(mgr.autoDiscountValue ? String(mgr.autoDiscountValue) : '');
      setDiscMinStr(mgr.autoDiscountMinSubtotal ? String(mgr.autoDiscountMinSubtotal) : '');
      setDiscMaxStr(mgr.autoDiscountMaxSubtotal ? String(mgr.autoDiscountMaxSubtotal) : '');
    }
  }, [view, mgr.autoDiscountValue, mgr.autoDiscountMinSubtotal, mgr.autoDiscountMaxSubtotal]);
  useEffect(() => {
    if (view === 'inventory') {
      setDefaultPurchaseQtyStr(mgr.defaultPurchaseQty !== undefined ? String(mgr.defaultPurchaseQty) : '10');
      setDefaultRestockQtyStr(mgr.defaultRestockQty !== undefined ? String(mgr.defaultRestockQty) : '50');
      setMinStockThresholdStr(mgr.minStockThreshold !== undefined ? String(mgr.minStockThreshold) : '5');
    }
  }, [view, mgr.defaultPurchaseQty, mgr.defaultRestockQty, mgr.minStockThreshold]);
  const updateSavings = (patch: Partial<SavingsGoal>) => {
    const next = { ...savings, ...patch };
    setSavings(next); persist({ savingsGoal: next });
  };
  const persistProfile = (nextProfile: StoreProfile, nextPayment = payment, nextRent = rent) => {
    const merged: StoreProfile = { ...nextProfile, payment: nextPayment, rent: nextRent };
    persist({ profile: merged });
  };
  const updatePayment = (patch: Partial<PaymentInfo>) => {
    const next = { ...payment, ...patch };
    setPayment(next);
    persistProfile(profile, next, rent);
  };
  const updateRent = (patch: Partial<RentInfo>) => {
    // Saved with the frequency the box is showing, so it never has to be guessed.
    const next = { ...rent, ...patch, frequency: rentFrequency({ ...rent, ...patch }) };
    setRent(next);
    persistProfile(profile, payment, next);
    setRentSaved(true);
    clearTimeout(rentSavedTimer.current);
    rentSavedTimer.current = setTimeout(() => setRentSaved(false), 2500);
  };
  const handleThemeChange = (t: ThemeId) => {
    setTheme(t); applyTheme(t);
    const meta = THEMES.find(x => x.id === t);
    if (meta) showToast(meta.quote);
  };
  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return showToast('Image must be under 8 MB', 'error');
    // The picked file used to be stored as-is: a 2 MB photo became 2.7 MB of
    // base64 inside the store record, which is sent to every customer who
    // opens the marketplace. It is shown at 96px here and 48px on receipts, so
    // it is shrunk to fit before it is saved.
    try {
      const photo = await downscaleImageToDataUrl(file);
      const next: StoreProfile = { ...profile, photo };
      setProfile(next);
      persistProfile(next);
      showToast('Store photo updated');
    } catch {
      showToast('That image could not be read', 'error');
    }
  };
  const removePhoto = () => {
    const next: StoreProfile = { ...profile, photo: undefined };
    setProfile(next);
    persistProfile(next);
    showToast('Photo removed');
  };
  useEffect(() => { saveLockTimer(timer); saveSession(store.accessCode); }, [timer, store.accessCode]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  useEffect(() => {
    setProfile(store.profile || { storeType: '', location: '', phone: '', email: '' });
    setPayment(store.profile?.payment || {});
    setRent(store.profile?.rent || { isRented: false });
    setMgr({ ...DEFAULT_MANAGER_SETTINGS, ...(store.managerSettings || {}) });
    setProfilePassword(store.managerSettings?.ownerPassword || '');
  }, [store]);
  const handleLock = () => { clearSession(); onLock(); showToast('Store locked'); };
  const handleUpdateAccessCode = () => {
    if (!newAccessCode || newAccessCode.trim().length < 4) {
      return showToast('Access code must be at least 4 characters', 'error');
    }
    const cleanCode = newAccessCode.trim().toUpperCase();
    const index = getStoreIndex();
    const duplicate = index.find(s => s.code === cleanCode && s.code !== store.accessCode);
    if (duplicate) {
      return showToast('Access code already in use by another store', 'error');
    }

    shopStorage.removeItem(STORE_PREFIX + store.accessCode);
    const updated = { ...store, accessCode: cleanCode };
    shopStorage.setItem(STORE_PREFIX + cleanCode, JSON.stringify(updated));
    localStorage.setItem('storeflow_active_session', cleanCode);

    const updatedIndex = index.map(s => s.code === store.accessCode ? { ...s, code: cleanCode } : s);
    localStorage.setItem('storeflow_store_index', JSON.stringify(updatedIndex));

    onUpdate(updated);
    showToast('✓ Access code changed successfully');
  };
  const handleUpdatePassword = () => {
    const currentOwnerPassword = store.managerSettings?.ownerPassword || 'owner';
    if (!currentPasswordConfirm.trim() || currentPasswordConfirm !== currentOwnerPassword) {
      return showToast('Current password is incorrect', 'error');
    }
    if (!newPassword || newPassword.length < 4) {
      return showToast('Password must be at least 4 characters', 'error');
    }
    if (newPassword !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }
    updateMgr({ ownerPassword: newPassword.trim() });
    setCurrentPasswordConfirm('');
    setNewPassword('');
    setConfirmPassword('');
    showToast('✓ Password reset successfully');
  };
  const toggleSavings = (next: boolean) => {
    updateMgr({ savingsPlanner: next });
    if (next && !store.savingsGoal) setShowSavingsModal(true);
  };

  return {
    store,
    onUpdate,
    onLock,
    currentUser,
    isActive,
    onSubViewChange,
    view,
    setViewState,
    serviceBusiness,
    keepsStock,
    barcodeQrCanvasRef,
    storeBarcodeCanvasRef,
    showAllProductsQR,
    setShowAllProductsQR,
    productSearchQuery,
    setProductSearchQuery,
    showUrl,
    setShowUrl,
    scannedProduct,
    setScannedProduct,
    scannerOpen,
    setScannerOpen,
    storeExistsInCloud,
    setStoreExistsInCloud,
    checkingCloudStatus,
    setCheckingCloudStatus,
    cloudStatusError,
    setCloudStatusError,
    cachedQR,
    setCachedQR,
    viewStack,
    setViewStack,
    setView,
    searchQuery,
    setSearchQuery,
    timer,
    setTimer,
    pinSet,
    setPinSet,
    fingerprintOn,
    setFingerprintOn,
    pinStage,
    setPinStage,
    pinDraft,
    setPinDraft,
    pinFirst,
    setPinFirst,
    theme,
    setTheme,
    showTrash,
    setShowTrash,
    showSwitcher,
    setShowSwitcher,
    showSavingsModal,
    setShowSavingsModal,
    editingGoalId,
    setEditingGoalId,
    deleteConfirmGoalId,
    setDeleteConfirmGoalId,
    lowStock,
    setLowStock,
    helpOpen,
    setHelpOpen,
    customQuestion,
    setCustomQuestion,
    newAccessCode,
    setNewAccessCode,
    revealCode,
    setRevealCode,
    showPass,
    setShowPass,
    showConfirmPass,
    setShowConfirmPass,
    showCurrentPass,
    setShowCurrentPass,
    currentPasswordConfirm,
    setCurrentPasswordConfirm,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    backorderPwOpen,
    setBackorderPwOpen,
    backorderPwInput,
    setBackorderPwInput,
    backorderPwPendingValue,
    setBackorderPwPendingValue,
    targetMode,
    setTargetMode,
    targetPeriod,
    setTargetPeriod,
    targetAmountInput,
    setTargetAmountInput,
    saveTarget,
    requestBackorderToggle,
    confirmBackorderToggle,
    pendingStoreType,
    setPendingStoreType,
    storeTypeCodeInput,
    setStoreTypeCodeInput,
    confirmStoreTypeChange,
    showCloudAuthModal,
    setShowCloudAuthModal,
    handleCloudAuthSuccess,
    localBackups,
    setLocalBackups,
    loadingBackups,
    setLoadingBackups,
    restoreConfirm,
    setRestoreConfirm,
    loadBackups,
    handleCreateManualBackup,
    handleDeleteBackup,
    handleRestoreBackup,
    handleImportFile,
    showExport,
    setShowExport,
    showContactPopup,
    setShowContactPopup,
    photoInputRef,
    showDeleteModal,
    setShowDeleteModal,
    handleManualQRRefresh,
    handlePrintQR,
    delStoreNameInput,
    setDelStoreNameInput,
    delCodeInput,
    setDelCodeInput,
    delConfirmTextInput,
    setDelConfirmTextInput,
    delError,
    setDelError,
    profile,
    setProfile,
    profilePassword,
    setProfilePassword,
    revealProfilePass,
    setRevealProfilePass,
    payment,
    setPayment,
    rent,
    setRent,
    rentSaved,
    setRentSaved,
    rentSavedTimer,
    mgr,
    setMgr,
    loyalty,
    setLoyalty,
    updateLoyalty,
    savings,
    setSavings,
    trashCount,
    insights,
    latestInsight,
    profileCompletion,
    lowStockCount,
    activeNotifTypes,
    savingsPct,
    persist,
    setPricingModes,
    updateMgr,
    handleWishlistUpdate,
    discValStr,
    setDiscValStr,
    discMinStr,
    setDiscMinStr,
    discMaxStr,
    setDiscMaxStr,
    defaultPurchaseQtyStr,
    setDefaultPurchaseQtyStr,
    defaultRestockQtyStr,
    setDefaultRestockQtyStr,
    minStockThresholdStr,
    setMinStockThresholdStr,
    handleDiscValChange,
    handleDiscMinChange,
    handleDiscMaxChange,
    handleSaveRestockSettings,
    updateSavings,
    persistProfile,
    updatePayment,
    updateRent,
    handleThemeChange,
    handlePhotoPick,
    removePhoto,
    handleLock,
    handleUpdateAccessCode,
    handleUpdatePassword,
    toggleSavings,
  };
}

export type SettingsState = ReturnType<typeof useSettings>;
