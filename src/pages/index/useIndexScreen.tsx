import { commitCashCheckout } from '@/lib/committed-checkout';
import {
  cloudSnapshot,
  getPendingStoreSync,
  requireStoreSynced,
  STORE_SYNC_EVENT,
} from '@/lib/store-cloud-sync';
import { prepareInventoryOrder, withStatusStep } from '@/lib/inventory-orders';
import { same } from '@/lib/store-sync-guard';
import { useState, useCallback, useEffect, useMemo, useRef, startTransition } from 'react';
import { loadStoreOrders, mergeOrders, readOrdersCache } from '@/lib/orders-cache';
import { setShopCloudOrders, shopLaundryRecords } from '@/lib/shop-laundry';
import { noticePriceCuts } from '@/lib/price-cuts';
import { BUNDLE_REPLACED_EVENT, noticeServiceChanges } from '@/lib/laundry-service-change';
import { endPractice } from '@/lib/guide-activity';
import { celebrationShown, guideProgress, nextStep, PRACTISED_SIGNAL } from '@/lib/setup-guide';
import { StoreData, TabId, Product, FlowNotification } from '@/types/store';
import {
  getBusinessTemplate,
  isBusinessTabAllowed,
  isServiceFirstBusiness,
  resolveBusinessType,
  shouldRunRetailRestockEngine,
} from '@/lib/business-runtime';
import {
  readLinkedTab,
  readNotificationAct,
  readOrderDeepLink,
  stripOrderDeepLink,
} from '@/lib/order-deep-link';
import { acknowledgeStockLoss, getStockLossNotice, markStockLossRaised } from '@/lib/stock-loss-notice';
import {
  dropBackgroundNotice,
  enableBackgroundNotices,
  queueBackgroundNotice,
  showLocalNotification,
} from '@/lib/push-notifications';
import type { NotificationAct } from '@/lib/order-deep-link';
import { allowedNotifications, visibleNotifications, wantsNotification } from '@/lib/notification-gate';
import { recordDays } from '@/lib/day-records';
import { setFlowMemoryShop } from '@/lib/flow-memory';
import { setNotificationPreferencesShop } from '@/lib/notification-preferences';
import { identityForStore, readActiveUser, writeActiveUser } from '@/lib/store-session';
import { applyDisplayPreferences } from '@/lib/display-preferences';
import { setFlowVoiceEnabled } from '@/lib/flow-voice';
import { setCurrentActor } from '@/lib/current-actor';
import {
  fetchWorkerBundles,
  mergeBundles,
  refreshWorkerCopy,
  sendWorkerRecords,
  WORKER_BUNDLES_MS,
  WORKER_PASS_EXPIRED_EVENT,
  WORKER_PASS_RENEWED_EVENT,
} from '@/lib/staff-session';
import { collectStaffRecords } from '@/lib/staff-records';
import { resumeWorkerLaundry } from '@/lib/laundry-offline';
import { DEVICE_WATCH_MS, noticeNewDeviceRequests, storeRefOf } from '@/lib/device-request-watch';
import { clearInvite, listDevices, normaliseStoreRef, pendingInvite } from '@/lib/staff-join';
import { cloudRecentlyUnreachable, hasCloudSession } from '@/lib/cloud-reach';
import {
  loadStore,
  addProduct,
  saveStore,
  runScheduledSavingsDeduction,
  logScanEvent,
} from '@/lib/store-data';
import { runStreakCheck, getStreakLine, getFreezeUsedLine } from '@/lib/streaks';
import {
  checkDebtExpenseReminders,
  checkLaundryFlowNote,
  checkWeeklyRestockDraft,
} from '@/lib/manager-intel';
import { appLockActive } from '@/lib/app-lock';
import { screensForTab, preloadScreens, workspaceKeyFor, mayPreload } from '../screens';
import { subscribeWorkInProgress, workInProgress } from '@/lib/work-in-progress';
import { useCelebrationShowing } from '@/lib/celebrations';
import { showToast } from '@/components/Toast';
import { supabase } from '@/integrations/supabase/client';
import { autoSubscribeIfGranted, clearAllStoreFlowNotifications } from '@/lib/push-notifications';
import { forceUnlockBodyScroll } from '@/hooks/use-body-scroll-lock';
import { saveSession, clearSession, getActiveSession } from '@/lib/store-session';
import { Settings as SettingsIcon } from 'lucide-react';
import type { ProductFocus } from '@/lib/product-focus';
import {
  RETAIL_MAIN_TABS,
  RETAIL_MORE_ITEMS,
  MORE_CATEGORIES,
  FLAT_CATEGORY_TABS,
  GAMES_MAIN_TABS,
  GAMES_MORE_ITEMS,
  isTabAllowed,
} from './navigation';

/**
 * Everything the app shell knows and does: the open shop, who is using it,
 * the current tab, the sheets and dialogs that are open, and the background
 * work (sync, alerts, push, locking) that runs while a shop is open.
 *
 * Index decides what to show; the parts beside it in this folder draw it,
 * each reading what it needs from the object this returns.
 */
export function useIndexScreen() {
  const [store, setStore] = useState<StoreData | null>(null);
  /*
   * Locked on arrival whenever a PIN exists, and again whenever the app has
   * been away long enough. Away rather than closed: a PWA is backgrounded far
   * more often than it is shut, and a lock that only applies on a cold start
   * is a lock that almost never applies.
   */
  const [locked, setLocked] = useState(() => appLockActive());
  /** Whether Settings is showing a sub-view, so Back steps up rather than out. */
  const [settingsSubView, setSettingsSubView] = useState(false);
  const hiddenSince = useRef<number | null>(null);
  useEffect(() => {
    const RELOCK_AFTER_MS = 2 * 60 * 1000;
    const onVisibility = () => {
      if (document.hidden) { hiddenSince.current = Date.now(); return; }
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      hiddenSince.current = null;
      if (appLockActive() && away > RELOCK_AFTER_MS) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  /*
   * Reduce Motion and Compact Mode, applied to the whole app.
   *
   * Both switches sat on the Appearance screen doing nothing. They live on the
   * document root like the theme does, so one switch reaches every screen
   * without a single component having to ask - and they are re-applied when
   * the settings change rather than only at startup, so the switch takes
   * effect while somebody is looking at it.
   */
  useEffect(() => {
    applyDisplayPreferences(store);
  }, [store?.managerSettings?.reduceMotion, store?.managerSettings?.compactMode]);
  // Voice Features, likewise: one gate inside speakAsFlow, told from here.
  useEffect(() => {
    setFlowVoiceEnabled(store?.managerSettings?.voiceFeatures !== false);
  }, [store?.managerSettings?.voiceFeatures]);
  const [autoOpenRestock, setAutoOpenRestock] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  // The books ask who is acting, so every expense says who entered it.
  useEffect(() => { setCurrentActor(currentUser); }, [currentUser]);
  // A worker's phone asking to join lives in the cloud, so the owner's phone
  // asks now and then - on opening, on coming back, every two minutes while
  // in front - and turns each new request into one notification.
  const watchAccessCode = store?.accessCode;
  const watchStoreRef = store ? storeRefOf(store) : '';
  const latestStore = useRef(store);
  latestStore.current = store;
  useEffect(() => {
    if (currentUser?.role !== 'owner' || !watchAccessCode || !watchStoreRef) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (cloudRecentlyUnreachable() || !(await hasCloudSession())) return;
      const result = await listDevices(watchStoreRef);
      if (stopped || !('devices' in result)) return;
      const current = latestStore.current;
      if (!current || current.accessCode !== watchAccessCode) return;
      const next = noticeNewDeviceRequests(current, result.devices);
      if (next) {
        saveStore(next);
        setStore(next);
        showToast('A worker’s phone is asking to join', 'info');
      }
      // With a worker's phone let in, bring over what they recorded on it:
      // new customers, expenses, piece work. Only what is new, so normally
      // a reply of a few bytes.
      if (!result.devices.some(device => device.status === 'authorized')) return;
      const withRecords = await collectStaffRecords(latestStore.current || current);
      if (stopped || !withRecords || latestStore.current?.accessCode !== watchAccessCode) return;
      saveStore(withRecords);
      setStore(withRecords);
    };
    void check();
    const timer = window.setInterval(() => void check(), DEVICE_WATCH_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [currentUser?.role, watchAccessCode, watchStoreRef]);
  const [tab, setTabStateNow] = useState<TabId>('dashboard');
  /*
   * Changing screens is a transition.
   *
   * A screen whose code had not arrived yet replaced the whole page with a
   * spinner until it did - every first visit to a screen, and a flash even
   * when the wait was a few milliseconds. As a transition, React keeps the
   * screen you were on in place until the next one is ready, then swaps
   * them, the way a native app does.
   */
  const setTabState = useCallback((next: TabId) => {
    startTransition(() => setTabStateNow(next));
  }, []);
  const [orders, setOrders] = useState<any[]>([]);
  // Every figure that counts laundry reads the shop's bundles, not only the
  // ones taken in on this phone (src/lib/shop-laundry.ts). Handed over here,
  // before anything below is drawn, each time the orders change.
  useMemo(() => {
    if (store?.accessCode) setShopCloudOrders(store.accessCode, orders);
  }, [store?.accessCode, orders]);
  // A bundle charged under the price list, or moved to another service, told
  // to the owner once - and what the customer owes kept in step - read from
  // the bundles just handed over, so the cloud is asked nothing more.
  useEffect(() => {
    const current = latestStore.current;
    if (currentUser?.role !== 'owner' || !current?.accessCode) return;
    const records = shopLaundryRecords(current.accessCode);
    const cut = noticePriceCuts(current, records);
    const next = noticeServiceChanges(cut || current, records) || cut;
    if (!next) return;
    saveStore(next);
    setStore(next);
  }, [orders, currentUser?.role]);
  // Set when a push notification deep-links to one order; Orders consumes it.
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  // What the merchant pressed on a push notification, carried into the screen
  // that opens so it can act rather than just land there.
  const [notificationAct, setNotificationAct] = useState<NotificationAct | null>(null);
  const [focusProduct, setFocusProduct] = useState<ProductFocus | null>(null);
  // Resolve the real Supabase row id for this store. StoreData (local/cached)
  // has no "id" field — only storeId (short code) and accessCode — but every
  // orders/notifications query and realtime subscription in this file filters
  // by store.id. Without this, those queries silently never run.
  useEffect(() => {
    // A worker's copy is not a cloud shop of its own; and with nobody signed
    // in to the cloud this lookup can only be refused, on every opening.
    if (!store?.accessCode || (store as any).id || store.staffDevice) return;
    let active = true;
    void hasCloudSession().then(signedIn => {
      if (!active || !signedIn) return;
      supabase
        .from('stores')
        .select('id')
        .eq('access_code', store.accessCode)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!active || error || !data?.id) return;
          setStore(prev => (prev ? { ...prev, id: data.id } as any : prev));
        });
    });
    return () => { active = false; };
  }, [store?.accessCode]);
  // Synchronize browser back/forward with the active tab.
  //
  // Previous design pushed a NEW history entry for every tab switch and,
  // when returning to Dashboard from several taps deep, called
  // history.go(-N) to jump back multiple entries at once. That's
  // asynchronous — the browser unwinds it one entry at a time, firing a
  // popstate (and a real re-render showing that intermediate tab) for each
  // step before landing on the final one, which is exactly what looked like
  // "flashing through random pages." It also meant swiping back followed
  // your entire literal tap history one step at a time rather than a
  // sensible hierarchy, so a long session of bouncing between tabs made
  // back-swipe land somewhere that felt random.
  //
  // Bottom-nav tabs are peers, not a stack, so they now share a single
  // history level: Dashboard is the "home" entry (index 0), and switching
  // to any other tab pushes at most ONE entry on top of it (index 1).
  // Switching between two non-dashboard tabs replaces that single entry
  // instead of pushing another — so no matter how many tabs you've bounced
  // through, one back-swipe always lands you cleanly on Dashboard, in a
  // single synchronous step, never a multi-entry unwind.
  useEffect(() => {
    const validTabs = new Set<TabId>([
      ...RETAIL_MAIN_TABS.map(item => item.id),
      ...RETAIL_MORE_ITEMS.map(item => item.id),
      ...GAMES_MAIN_TABS.map(item => item.id),
      ...GAMES_MORE_ITEMS.map(item => item.id),
    ]);
    const saved = sessionStorage.getItem('storeflow-active-tab') as TabId | null;
    const candidate = saved && validTabs.has(saved) ? saved : 'dashboard';
    setTabState(candidate);
    window.history.replaceState({ tab: candidate, index: candidate === 'dashboard' ? 0 : 1 }, '', '#' + candidate);

    const handlePopState = (e: PopStateEvent) => {
      const next = e.state?.tab as TabId | undefined;
      setTabState(next && validTabs.has(next) ? next : 'dashboard');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    const validTabs = new Set<TabId>([
      ...RETAIL_MAIN_TABS.map(item => item.id),
      ...RETAIL_MORE_ITEMS.map(item => item.id),
      ...GAMES_MAIN_TABS.map(item => item.id),
      ...GAMES_MORE_ITEMS.map(item => item.id),
    ]);
    if (validTabs.has(tab)) sessionStorage.setItem('storeflow-active-tab', tab);
  }, [tab]);
  // Ensure body scroll is never left locked on initial app load, store load, or when switching tabs
  useEffect(() => {
    forceUnlockBodyScroll();
    const t1 = setTimeout(() => forceUnlockBodyScroll(), 50);
    const t2 = setTimeout(() => forceUnlockBodyScroll(), 250);

    const handleInitialTouch = () => {
      forceUnlockBodyScroll();
    };
    window.addEventListener('touchstart', handleInitialTouch, { passive: true, once: true });
    window.addEventListener('pointerdown', handleInitialTouch, { passive: true, once: true });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('touchstart', handleInitialTouch);
      window.removeEventListener('pointerdown', handleInitialTouch);
    };
  }, [tab, store?.accessCode]);
  // Helper to normalize order status casing and old values
  const getNormalizedStatus = useCallback((status?: string): string => {
    if (!status) return 'Pending';
    const s = status.trim().toLowerCase();
    if (s === 'pending' || s === 'pending approval') return 'Pending';
    if (s === 'accepted') return 'Accepted';
    if (s === 'preparing') return 'Preparing';
    if (s === 'ready' || s === 'ready for pickup' || s === 'ready for delivery') return 'Ready';
    if (s === 'completed') return 'Completed';
    if (s === 'rejected') return 'Rejected';
    if (s === 'cancelled') return 'Cancelled';
    return status;
  }, []);
  // Synthesize a premium audio alert chime using native web audio context
  const playOrderAlertSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (time: number, freq: number, duration: number, type: OscillatorType = 'sine') => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        osc.start(time);
        osc.stop(time + duration);
      };

      const soundType = store?.marketplaceSettings?.notificationSoundType || 'chime';
      const now = audioCtx.currentTime;

      if (soundType === 'beep') {
        playTone(now, 1000, 0.15, 'sine');
      } else if (soundType === 'bell') {
        playTone(now, 659.25, 0.12, 'sine'); // E5
        playTone(now + 0.1, 783.99, 0.12, 'sine'); // G5
        playTone(now + 0.2, 1046.50, 0.25, 'sine'); // C6
      } else if (soundType === 'success') {
        playTone(now, 523.25, 0.1, 'sine'); // C5
        playTone(now + 0.08, 659.25, 0.1, 'sine'); // E5
        playTone(now + 0.16, 783.99, 0.1, 'sine'); // G5
        playTone(now + 0.24, 1046.50, 0.25, 'sine'); // C6
      } else { // default 'chime'
        playTone(now, 587.33, 0.15, 'sine'); // D5
        playTone(now + 0.12, 880, 0.25, 'sine'); // A5
      }
    } catch (e) {
      console.warn("Failed to play synthesized alert sound:", e);
    }
  }, [store?.marketplaceSettings?.notificationSoundType]);
  // Fetch store orders and notifications on mount and store change
  useEffect(() => {
    if (!store?.id) return;
    let active = true;
    const fetchOrdersAndNotifications = async () => {
      try {
        /*
         * The saved copy first, then only what changed (src/lib/orders-cache.ts).
         * Downloading every order the shop ever had on every open would have
         * outgrown the free plan's outgoing-data allowance within a year.
         */
        const normalize = (rows: any[]) => rows.map(o => ({ ...o, status: getNormalizedStatus(o.status) }));
        const saved = await readOrdersCache(String(store.id));
        // Replaces whatever was showing, which may be another shop's.
        if (active) setOrders(normalize(saved?.orders || []));
        const select = () => supabase.from('orders').select('*, order_items(*)').eq('store_id', store.id);
        const loaded = await loadStoreOrders(String(store.id), {
          all: async () => {
            const { data, error } = await select().order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
          },
          since: async watermark => {
            const { data, error } = await select().gte('updated_at', watermark);
            if (error) throw error;
            return data || [];
          },
        });
        if (active) {
          const next = normalize(loaded.orders);
          const ids = new Set(next.map(order => String(order.id)));
          // Changes merge into what is shown. A full download replaces it,
          // keeping only an order that arrived live in the last two minutes
          // and so may simply have missed the download.
          const fresh = (order: any) => Date.now() - Date.parse(String(order.created_at || '')) < 120_000;
          setOrders(prev => (loaded.full
            ? mergeOrders(next, prev.filter(order => !ids.has(String(order.id)) && fresh(order)))
            : mergeOrders(prev, next)));
          console.log('[StoreFlow Orders] Orders:', next.length, loaded.full ? '(full download)' : `(${loaded.downloaded} changed)`);
        }

        // Fetch notifications from db
        const { data: dbNotifs, error: notifsError } = await supabase
          .from('notifications')
          .select('*')
          .eq('store_id', store.id)
          .eq('is_read', false)
          .order('created_at', { ascending: false });

        if (!notifsError && dbNotifs && dbNotifs.length > 0 && active) {
          /*
           * `text`, not `message`.
           *
           * Both notification drawers render `{n.description || n.text}`, and
           * this wrote neither - so an order landed in the tray with its title
           * and a blank line where the details belong. The tone has to be one
           * of the four the styling knows, too; anything else falls through to
           * plain grey, which is how cancellations came to look like news.
           */
          const newItems: FlowNotification[] = allowedNotifications(store, dbNotifs.map(n => ({
            id: n.id,
            title: n.title || 'Flow Alert',
            text: n.message || '',
            date: n.created_at || new Date().toISOString(),
            read: n.is_read || false,
            tone: n.type === 'new_order' ? 'info' : 'info',
            actionTab: n.type === 'new_order' ? 'orders' : undefined,
            actionLabel: n.type === 'new_order' ? 'View Orders' : undefined,
            icon: n.type === 'new_order' ? '🛒' : '🔔',
            category: n.type === 'new_order' ? 'customerRequest' : 'alert',
          })));

          setStore(prev => {
            if (!prev) return prev;
            const currentList = prev.flowNotifications || [];
            const merged = [...currentList];
            for (const item of newItems) {
              if (!merged.some(m => m.id === item.id)) {
                merged.unshift(item);
              }
            }
            const updated = { ...prev, flowNotifications: merged };
            saveStore(updated);
            return updated;
          });
        }
      } catch (err) {
        console.error('[StoreFlow Orders/Notifs] Error fetching on startup:', err);
      }
    };
    fetchOrdersAndNotifications();
    return () => {
      active = false;
    };
  }, [store?.id, getNormalizedStatus]);
  // Refresh a just-created merchant walk-in order after its child rows are saved.
  // This avoids the realtime INSERT event racing ahead of order_items creation.
  useEffect(() => {
    const handleCreatedOrder = async (event: Event) => {
      const orderId = (event as CustomEvent).detail?.orderId;
      if (!orderId) return;
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();
      if (error || !data) return;
      const normalized = { ...data, status: getNormalizedStatus(data.status) };
      setOrders(prev => [normalized, ...prev.filter(order => order.id !== orderId)]);
    };
    window.addEventListener('storeflow:order-created', handleCreatedOrder);
    return () => window.removeEventListener('storeflow:order-created', handleCreatedOrder);
  }, [getNormalizedStatus]);
  // A bundle changed on this phone, as the cloud now has it - shown at once,
  // on a worker's phone too, which cannot read the orders table itself.
  useEffect(() => {
    const replace = (event: Event) => {
      const order = (event as CustomEvent).detail?.order;
      if (!order?.id) return;
      setOrders(prev => prev.map(existing => existing.id === order.id
        ? { ...existing, ...order, status: getNormalizedStatus(order.status) }
        : existing));
    };
    window.addEventListener(BUNDLE_REPLACED_EVENT, replace);
    return () => window.removeEventListener(BUNDLE_REPLACED_EVENT, replace);
  }, [getNormalizedStatus]);
  // Auto-heal / maintain background push notification subscription when store is loaded
  // so streak reminders & order alerts arrive reliably even when the app is closed
  useEffect(() => {
    if (store?.id) {
      autoSubscribeIfGranted(store.id);
    }

    // Clear stale notifications when merchant returns to the app (WhatsApp-like)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearAllStoreFlowNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for foreground push messages from SW (shown as in-app toast instead of system notification)
    const handleSWMessage = (event: MessageEvent) => {
      // "I understand" pressed on the notification itself. The service worker
      // deliberately does not open a window for it; this only records that the
      // subject is closed so it stops being raised.
      if (event.data?.type === 'STOREFLOW_NOTIFICATION_ACK') {
        if (event.data.category === 'stock_loss') {
          const signature = acknowledgeStockLoss();
          // Otherwise a copy already handed to the worker would still surface
          // after the merchant said they had understood it.
          if (event.data.tag) void dropBackgroundNotice(String(event.data.tag).replace('stock-loss-', ''));
          // The push sender runs on the server and cannot read this device's
          // storage, so the acknowledgement has to travel with the store.
          if (signature) {
            setStore(prev => prev ? { ...prev, stockLossAcknowledgedSignature: signature } as StoreData : prev);
          }
        }
        return;
      }
      if (event.data?.type === 'STOREFLOW_PUSH_RECEIVED') {
        const { title, body } = event.data;
        showToast(`${title}: ${body}`, 'info');

        // Play alert sound for foreground pushes if enabled
        // Two switches, one behaviour. Marketplace Settings writes
        // alertSound and mirrors it into managerSettings; the Settings screen
        // writes only managerSettings.orderAlertSoundsEnabled, which nothing
        // read — so turning the chime off there did nothing at all and the
        // sound kept playing. Either being off means off.
        const isSoundEnabled =
          store?.marketplaceSettings?.alertSound !== false &&
          store?.managerSettings?.orderAlertSoundsEnabled !== false &&
          store?.marketplaceSettings?.notifNewOrders !== false;
        if (isSoundEnabled) {
          playOrderAlertSound();
        }
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, [store?.id, store?.marketplaceSettings?.alertSound, store?.marketplaceSettings?.notifNewOrders, playOrderAlertSound]);
  // Set up Supabase Realtime channel listener on orders table
  useEffect(() => {
    if (!store?.id) return;
    const channelInstance = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(`store-orders-${store.id}-${channelInstance}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${store.id}`
        },
        async (payload) => {
          console.log('[StoreFlow Realtime] Order payload received:', payload);
          if (payload.eventType === 'INSERT') {
            const { data, error } = await supabase
              .from('orders')
              .select('*, order_items(*)')
              .eq('id', payload.new.id)
              .single();
            if (!error && data) {
              const normalizedItem = {
                ...data,
                status: getNormalizedStatus(data.status)
              };
              setOrders(prev => [normalizedItem, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            setOrders(prev =>
              prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new, status: getNormalizedStatus(payload.new.status) } : o)
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [store?.id, getNormalizedStatus]);
  // Set up Supabase Realtime channel listener on notifications table
  useEffect(() => {
    if (!store?.id) return;
    const channelInstance = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(`store-notifications-${store.id}-${channelInstance}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `store_id=eq.${store.id}`
        },
        async (payload) => {
          console.log('[StoreFlow Realtime] Notification payload received:', payload);
          const newNotif = payload.new;

          // Sound alert if enabled in settings (default to enabled)
          const isSoundEnabled = store.marketplaceSettings?.alertSound !== false && store.marketplaceSettings?.notifNewOrders !== false;
          if (isSoundEnabled) {
            playOrderAlertSound();
          }

          const isOrderRel = newNotif.type === 'new_order' || newNotif.type?.startsWith('order_');
          let notifIcon = '🔔';
          if (newNotif.type === 'new_order') notifIcon = '🛒';
          else if (newNotif.type === 'order_cancelled' || newNotif.type === 'order_rejected') notifIcon = '🚫';
          else if (newNotif.type === 'order_update') notifIcon = '📝';

          const newNotification: FlowNotification = {
            id: newNotif.id || 'notif-' + Date.now(),
            title: newNotif.title || 'Flow Alert',
            text: newNotif.message || '',
            date: newNotif.created_at || new Date().toISOString(),
            read: newNotif.is_read || false,
            // 'danger' is the tone the drawer styles red. 'destructive' was
            // not one of the four, so a cancelled order was painted the same
            // grey as a routine update.
            tone: newNotif.type === 'order_cancelled' ? 'danger' : 'info',
            actionTab: isOrderRel ? 'orders' : undefined,
            actionLabel: isOrderRel ? 'View Orders' : undefined,
            icon: notifIcon,
            category: isOrderRel ? 'customerRequest' : 'alert',
          };
          // The switch on the Notifications screen, honoured at the door.
          if (!wantsNotification(store, newNotification.category)) return;

          setStore(prev => {
            if (!prev) return prev;
            const list = prev.flowNotifications || [];
            if (list.some(n => n.id === newNotification.id)) return prev;
            const updated = {
              ...prev,
              flowNotifications: [newNotification, ...list]
            };
            saveStore(updated);
            return updated;
          });

          // Only for somebody who would be shown it in the tray. The session is
          // read fresh, because this subscription captured the state it opened
          // with and somebody else may have signed in since.
          if (visibleNotifications([newNotification], readActiveUser()).length) {
            showToast(`${newNotif.title}: ${newNotif.message}`, 'info');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [store?.id, store?.marketplaceSettings?.alertSound, store?.marketplaceSettings?.notifNewOrders, playOrderAlertSound]);
  useEffect(() => {
    const receive = (event: Event) => {
      const { code, store: accepted } = (event as CustomEvent).detail || {};
      if (accepted && code === store?.accessCode) setStore(accepted);
    };
    window.addEventListener(STORE_SYNC_EVENT, receive);
    return () => window.removeEventListener(STORE_SYNC_EVENT, receive);
  }, [store?.accessCode]);
  const orderCommitBusy = useRef(false);
  // Store and order changes share a server transaction. No local side effects
  // are published until the server accepts the complete proposal.
  const handleUpdateOrderStatus = useCallback(async (orderId: string, newStatus: string, metadata?: any) => {
    if (!store || orderCommitBusy.current) return;
    orderCommitBusy.current = true;
    try {
      // Service controls have already committed their own server workflow RPC.
      if (metadata?.serviceSession) {
        /*
         * Who moved it, for a service as for an order of goods: the step is
         * noted beside the others in the order's notes, and the order card
         * names the person. Only when the status changes - pausing and
         * resuming a running service is not a new step - so one small call.
         */
        const before = orders.find(o => o.id === orderId);
        if (before && getNormalizedStatus(before.status) !== getNormalizedStatus(newStatus)) {
          await (supabase as any).rpc('service_order_note_step', {
            p_order_id: orderId, p_status: newStatus, p_by_name: currentUser?.name || null, p_by_role: currentUser?.role || null,
          }).then(() => undefined, () => undefined);
        }
        const { data, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
        if (error) throw error;
        setOrders(prev => prev.map(o => o.id === orderId ? { ...data, status: getNormalizedStatus(data.status) } : o));
        return;
      }
      await requireStoreSynced(store.accessCode);
      const local = loadStore(store.accessCode) || store;
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) throw new Error('Order not found.');
      const prepared = prepareInventoryOrder(local, targetOrder, newStatus, metadata);
      // Who did it, carried in the same commit as the change itself.
      const proposal = { ...prepared, notes: withStatusStep(prepared.notes, newStatus, currentUser) };
      const { data, error } = await (supabase as any).rpc('commit_store_snapshot', {
        p_store_id: store.id,
        p_base: cloudSnapshot(local), p_next: cloudSnapshot(proposal.store),
        p_order: { id: orderId, expected_updated_at: targetOrder.updated_at, status: newStatus, notes: JSON.stringify(proposal.notes) },
        // Laid over our copy below, so only the differences need to come back.
        p_reply: 'changes',
      });
      if (error) throw error;
      // Counter activity may have continued while the request was in flight.
      // Keep that copy queued for review rather than replacing it.
      const latest = loadStore(store.accessCode);
      if (!getPendingStoreSync(store.accessCode) && (!latest || same(latest, local))) {
        const accepted = { ...proposal.store, ...data.data, managerSettings: { ...proposal.store.managerSettings, ...data.data.managerSettings } };
        localStorage.setItem('storeflow_' + store.accessCode, JSON.stringify(accepted));
        setStore(accepted);
      } else {
        showToast('Order saved. Newer counter records are kept on this device for sync review.', 'info');
      }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...data.order, status: getNormalizedStatus(data.order.status) } : o));
      showToast(`Order status updated to ${newStatus}`);
      // The existing database trigger sends customer status notifications.
    } catch (err: any) {
      showToast('Order was not confirmed: ' + err.message, 'error');
    } finally { orderCommitBusy.current = false; }
  }, [store, orders, getNormalizedStatus, currentUser]);
  const setTab = useCallback((targetTab: TabId) => {
    setTabState(targetTab);

    if (targetTab === 'dashboard') {
      // Collapse straight back to the single home entry — one
      // synchronous replace, never an async multi-step unwind.
      window.history.replaceState({ tab: 'dashboard', index: 0 }, '', '#dashboard');
      return;
    }

    const currentState = window.history.state;
    if (!currentState || currentState.tab === 'dashboard' || currentState.index === 0) {
      // Coming from Dashboard: push the one peer-level entry, so a single
      // back-swipe from here returns straight to Dashboard.
      window.history.pushState({ tab: targetTab, index: 1 }, '', '#' + targetTab);
    } else {
      // Already one level deep on some other tab: swap in place rather
      // than stacking another entry, so back-swipe still only ever needs
      // one step to reach Dashboard no matter how many tabs were visited.
      window.history.replaceState({ tab: targetTab, index: 1 }, '', '#' + targetTab);
    }
  }, []);
  /**
   * A different shop opens on its own home screen.
   *
   * The active tab is remembered in sessionStorage so a refresh keeps you
   * where you were, which is right within one shop. Across a switch it is
   * wrong: creating a store, or moving from the laundry to the barber shop,
   * dropped the merchant wherever they had last been in the other shop -
   * landing a brand-new laundry on a Customer Book with nobody in it. Each
   * shop is its own context and starts at its own front door.
   */
  const lastStoreCode = useRef<string | null>(null);
  useEffect(() => {
    const code = String(store?.accessCode || '');
    if (!code) return;
    if (lastStoreCode.current !== null && lastStoreCode.current !== code) {
      setTab('dashboard');
    }
    lastStoreCode.current = code;
  }, [store?.accessCode, setTab]);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showStreakPanel, setShowStreakPanel] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [scanCart, setScanCart] = useState<{ product: Product; qty: number }[]>([]);
  const [newProductPrompt, setNewProductPrompt] = useState<{ barcode: string; name: string; costPrice: string; sellingPrice: string; quantity: string } | null>(null);
  // Switch User modal states
  const [showSwitchUser, setShowSwitchUser] = useState(false);
  const [switchTargetUser, setSwitchTargetUser] = useState<any>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchPinBuffer, setSwitchPinBuffer] = useState('');
  const [showSwitchPassField, setShowSwitchPassField] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showVerifySuccess, setShowVerifySuccess] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };
  const businessTemplate = getBusinessTemplate(store);
  const businessType = resolveBusinessType(store);
  /*
   * Flow's suppliers, coins and streak belong to the shop that is open.
   *
   * They used to sit under one key shared by every shop on the phone, so
   * switching shops carried them across and could upload one shop's rewards
   * into another shop's cloud record. This is the one place that says which
   * shop they belong to, and it runs before any screen reads them.
   */
  useEffect(() => {
    setFlowMemoryShop(store);
    /*
     * The notification switches belong to the shop too. One phone running two
     * shops had one master switch and one set of quiet hours between them, so
     * muting the quiet shop muted the busy one. Bound here, with the shop,
     * rather than asked for by each screen that raises a notification.
     */
    setNotificationPreferencesShop(store);
  }, [store?.id, (store as any)?.storeId, store?.accessCode]);
  /*
   * Switching shops lands on the home screen of the shop you switched to.
   *
   * The screen you were last on is remembered so a reload puts you back where
   * you were - but remembering it across a switch opens one shop's screen in
   * another, which for a trade-only screen is the wrong trade entirely. The
   * first shop of a session is left alone; only a change of shop forgets it.
   */
  const lastShopKey = useRef<string | null>(null);
  useEffect(() => {
    const key = store ? String(store.id || (store as any).storeId || store.accessCode || '') : null;
    if (!key) return;
    const previous = lastShopKey.current;
    lastShopKey.current = key;
    if (!previous || previous === key) return;
    try { sessionStorage.removeItem('storeflow-active-tab'); } catch { /* private mode */ }
    setTab('dashboard');
  }, [store?.id, (store as any)?.storeId, store?.accessCode, setTab]);
  /*
   * The laundry's day, recorded by its date whenever the shop's data changes -
   * for whoever is signed in, on whichever screen. Nothing is shown here; the
   * days are read back in Analysis.
   */
  useEffect(() => {
    if (store && businessType === 'laundry') recordDays(store);
  }, [store, businessType]);
  const isGames = businessType === 'games';
  const isServiceFirst = isServiceFirstBusiness(store);
  /*
   * The shop and the trade the mounted screen belongs to.
   *
   * Only the screen being looked at is mounted, and this key is what says
   * whose screen it is. Switching shops changes the key, so React throws the
   * previous shop's screen away with everything it was holding instead of
   * handing it to the shop being opened - a cart, a filter, a half-typed
   * search belong to the shop they were made in. The trade is part of the key
   * as well, because the same shop can be changed from a provision store to a
   * laundry, and those are not the same screens.
   */
  const workspaceKey = workspaceKeyFor(store);
  /*
   * The one screen allowed to stay mounted while something else is on screen.
   *
   * This is the only exception to mounting just the active screen, and it
   * exists for one case: a form somebody is halfway through. An intake with
   * twelve shirts counted into it has to survive the counter tapping Orders to
   * check a customer's name. Screens holding unsaved work already say so - the
   * updater uses the same signal to avoid reloading over a live form - so the
   * screen that was open when that work began is held until the work is
   * finished. At most one screen, only while a form is actually open, and it
   * is let go once the work is done and they have moved on; releasing it any
   * earlier would remount the screen under the person who just finished.
   */
  const [unsavedWorkOpen, setUnsavedWorkOpen] = useState(false);
  const [heldTab, setHeldTab] = useState<TabId | null>(null);
  useEffect(() => subscribeWorkInProgress(() => setUnsavedWorkOpen(workInProgress())), []);
  useEffect(() => {
    if (unsavedWorkOpen) {
      setHeldTab(previous => previous ?? tab);
      return;
    }
    setHeldTab(previous => (previous && previous !== tab ? null : previous));
  }, [unsavedWorkOpen, tab]);
  /**
   * Keep the signed-in session in step with the staff record.
   *
   * storeflow_active_user is a snapshot taken at sign-in, so changing
   * somebody's role in Staff Accounts did nothing to the device they were
   * already using: a promotion never arrived, and — worse — a demotion never
   * took effect. The role is re-read from the staff list here, so an owner can
   * change a role instead of deleting the account and making a new one.
   *
   * A staff member whose record has gone is signed out rather than left
   * holding whatever access their stale snapshot claims.
   */
  useEffect(() => {
    if (!store || !currentUser?.id) return;
    const record = (store.staffMembers || []).find(member => member.id === currentUser.id);

    if (!record) {
      localStorage.removeItem('storeflow_active_user');
      clearSession();
      setCurrentUser(null);
      setStore(null);
      return;
    }

    const samePermissions = JSON.stringify(record.permissions || {}) === JSON.stringify(currentUser.permissions || {});
    if (record.role === currentUser.role && record.name === currentUser.name && samePermissions) return;

    const refreshed = {
      id: record.id,
      name: record.name,
      role: record.role,
      permissions: record.permissions,
    };
    localStorage.setItem('storeflow_active_user', JSON.stringify(refreshed));
    setCurrentUser(refreshed);
  }, [store, currentUser?.id, currentUser?.role, currentUser?.name]);
  /**
   * Never sit on a screen this role cannot open.
   *
   * Nothing checked. A tab reached any other way — a stale hash, a shortcut, a
   * role changed underneath someone — rendered its screen anyway, which is how
   * an attendant could see the price list flash up before anything moved it.
   */
  useEffect(() => {
    if (!store || !currentUser) return;
    if (tab === 'dashboard') return;
    // What this worker may open, and what this trade has at all. A screen
    // reached by a link, or left over from another shop, is checked the same
    // way the navigation is.
    if (!isTabAllowed(tab, currentUser) || !isBusinessTabAllowed(store, tab)) setTab('dashboard');
  }, [tab, currentUser, store]);
  /**
   * The shop crossing from "set up" to "open".
   *
   * Watched rather than triggered from the last step's button, so it fires
   * however the merchant got there — through the guide, or on their own.
   */
  const [showReady, setShowReady] = useState(false);
  // A practice run lasts only while its screen is open and until it is done,
  // so the next bundle taken in is always real.
  useEffect(() => { if (tab !== 'laundry-records') endPractice(); }, [tab]);
  useEffect(() => {
    window.addEventListener(PRACTISED_SIGNAL, endPractice);
    return () => window.removeEventListener(PRACTISED_SIGNAL, endPractice);
  }, []);
  // A first-sale card up at the same moment goes first; this waits its turn.
  const milestoneShowing = useCelebrationShowing();
  useEffect(() => {
    const check = () => {
      if (!store || celebrationShown(store.accessCode)) return;
      if (nextStep(store) === null && guideProgress(store).total > 0) setShowReady(true);
    };
    check();
    // The last step is a rehearsal that writes nothing, so `store` does not
    // change when it finishes and this would never look again.
    window.addEventListener(PRACTISED_SIGNAL, check);
    return () => window.removeEventListener(PRACTISED_SIGNAL, check);
  }, [store]);
  // The same list the tray shows, or a worker would see a dot for
  // notifications they are never shown.
  const unreadCount = store ? visibleNotifications(store.flowNotifications || [], currentUser).filter(n => !n.read).length : 0;
  const mainTabs = isGames
    ? GAMES_MAIN_TABS
    : RETAIL_MAIN_TABS
        .filter(t => isBusinessTabAllowed(store, t.id))
        .flatMap(t => {
          const mapped = t.id === 'inventory' && isServiceFirst
            ? { ...t, label: businessType === 'laundry' ? 'Price List' : 'Services', icon: businessTemplate.icon }
            : t;
          // Laundry needs BOTH surfaces: Orders is the online customer-app inbox,
          // while Laundry Records is the physical counter/intake workspace.
          if (businessType === 'laundry' && t.id === 'orders') {
            return [mapped, { id: 'laundry-records' as const, label: 'Intake', icon: '🧾' }];
          }
          return [mapped];
        });
  const moreItems = (isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS)
    .filter(t => isBusinessTabAllowed(store, t.id));
  const allowedMainTabs = useMemo(() => {
    return mainTabs.filter(t => isTabAllowed(t.id, currentUser));
  }, [mainTabs, currentUser]);
  const allowedMoreItems = useMemo(() => {
    return moreItems.filter(t => isTabAllowed(t.id, currentUser));
  }, [moreItems, currentUser]);
  /*
   * Fetch the screens that are one tap away, once the phone is idle.
   *
   * A screen is fetched when it is opened, which is what makes the app start
   * quickly, and would otherwise make the first tap on each screen wait. So
   * the screens in this shop's own bottom bar - the ones this trade and this
   * person are actually allowed - are fetched quietly after the app has
   * settled, and the tap finds them already there.
   *
   * The screens behind More come after them. They were never fetched ahead,
   * so Expenses, Customers, Settings and the rest showed a spinner on every
   * first visit.
   *
   * Not on a metered or a slow connection unless the installed app already
   * holds the screens - see mayPreload. Somebody paying by the megabyte on 2G
   * should spend it on the screen they asked for.
   */
  useEffect(() => {
    if (!store) return;
    if (!mayPreload()) return;

    const shape = {
      simpleMode: store.uiMode === 'simple',
      serviceFirst: isServiceFirst,
      laundry: businessType === 'laundry',
      games: isGames,
    };
    const wanted = [...new Set([...allowedMainTabs, ...allowedMoreItems].flatMap(item => screensForTab(item.id, shape)))];
    if (wanted.length === 0) return;

    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const handle = idle(() => preloadScreens(wanted), { timeout: 4000 });
      const cancel = (window as unknown as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
      return () => { if (cancel) cancel(handle); };
    }
    const timer = window.setTimeout(() => preloadScreens(wanted), 2500);
    return () => window.clearTimeout(timer);
  }, [store, allowedMainTabs, allowedMoreItems, isServiceFirst, isGames, businessType]);
  const allowedCategories = useMemo(() => {
    if (isGames) {
      const allowedSubs = GAMES_MORE_ITEMS.filter(sub => isTabAllowed(sub.id, currentUser)).map(sub => ({
        label: sub.label,
        tabId: sub.id,
      }));
      return [{
        id: 'settings_section',
        label: 'Settings',
        Icon: SettingsIcon,
        subItems: allowedSubs
      }].filter(cat => cat.subItems.length > 0);
    }

    return MORE_CATEGORIES
      .map(cat => ({
        ...cat,
        subItems: cat.subItems.filter(sub => isTabAllowed(sub.tabId, currentUser) && isBusinessTabAllowed(store, sub.tabId)),
      }))
      .filter(cat => {
        // These open a tab directly instead of expanding, so they are gated on
        // that tab rather than on having any children. The checks used to sit
        // after the map's return statement, where they never ran — every role
        // saw every category. Role only, as originally intended: business type
        // already decides which tabs exist, and gating here too would drop
        // Marketplace for service businesses that can still reach it.
        const directTab = FLAT_CATEGORY_TABS[cat.id];
        if (directTab) return isTabAllowed(directTab, currentUser);
        return cat.subItems.length > 0;
      });
  }, [currentUser, isGames, store]);
  useEffect(() => {
    const parentCat = MORE_CATEGORIES.find(cat => cat.subItems.some(sub => sub.tabId === tab));
    if (parentCat) {
      setExpandedCategories(prev => ({
        ...prev,
        [parentCat.id]: true
      }));
    }
  }, [tab]);
  // When switching to a games store, ensure the active tab is valid for it
  useEffect(() => {
    if (!store) return;
    const allowedAll = [...allowedMainTabs, ...allowedMoreItems].map(t => t.id);
    if (!allowedAll.includes(tab)) {
      setTab(allowedMainTabs[0]?.id || 'dashboard');
    }
  }, [store?.accessCode, store?.category, currentUser, allowedMainTabs, allowedMoreItems, tab]);
  // The scheduled savings deduction (see runScheduledSavingsDeduction) used
  // to only ever run at the exact moment of a cold app load. If a merchant
  // just keeps the PWA open/pinned across the scheduled day — very normal
  // usage — nothing ever rechecked the schedule, so a due deduction could
  // sit unapplied indefinitely even though the day/time had passed. This
  // rechecks whenever the tab regains focus/visibility (covers reopening
  // the app, switching back to it, or waking the phone) and on a periodic
  // timer while it stays open and visible, so a due deduction is caught
  // without requiring a full app restart.
  useEffect(() => {
    if (!store) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      setStore(prev => {
        if (!prev) return prev;
        let next = prev;

        // 1. Savings deduction
        if (prev.savingsGoal?.autoSaveEnabled) {
          const before = prev.savingsGoal.lastDeductionTime;
          const clone: StoreData = { ...prev, savingsGoal: { ...prev.savingsGoal } };
          const updated = runScheduledSavingsDeduction(clone);
          if (updated.savingsGoal?.lastDeductionTime !== before) {
            next = updated;
          }
        }

        // 2. Debt & Recurring Bill Reminders
        const withReminders = checkDebtExpenseReminders(next);
        if (withReminders) {
          next = withReminders;
        }

        // A laundry's week: clothes in and money in.
        const withFlowNote = checkLaundryFlowNote(next);
        if (withFlowNote) {
          next = withFlowNote;
        }

        // 3. Weekly Auto Restock Draft
        if (shouldRunRetailRestockEngine(next)) {
          const withDraft = checkWeeklyRestockDraft(next);
          if (withDraft) {
            next = withDraft;
          }
        }

        // 4. Daily streak check — counts this as today's open, and rolls a
        // reward if it lands on a milestone day.
        const withStreak = runStreakCheck(next);
        if (withStreak !== next) {
          next = withStreak;
          if (next.streak?.freezeConsumedToday) {
            // A freeze covered a missed day — tell them, then clear the transient flag.
            showToast(getFreezeUsedLine(next.streak.count), 'info');
            next = { ...next, streak: { ...next.streak, freezeConsumedToday: false } };
          } else if (next.streak && !next.streak.pendingReveal && next.streak.count > 1) {
            // Ordinary day (no reward this time) — a quick line from Flow, not a modal.
            showToast(getStreakLine(next.streak.count), 'info');
          }
        }

        if (next === prev) return prev; // nothing changed, avoid a pointless re-render/save
        saveStore(next);
        return next;
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const interval = setInterval(check, 5 * 60 * 1000); // also recheck every 5 min while open
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      clearInterval(interval);
    };
  }, [store?.accessCode]);
  useEffect(() => {
    const code = getActiveSession();
    if (code) {
      const restored = loadStore(code);
      const activeUser = readActiveUser();
      if (restored && activeUser) {
        setStore(restored);
        setCurrentUser(activeUser);
      } else {
        clearSession();
        localStorage.removeItem('storeflow_active_user');
        setStore(null);
        setCurrentUser(null);
      }
    }
  }, []);
  // A worker's phone: bring the slim copy up to date when it opens and when
  // the internet comes back, and sign the worker out at once if the owner
  // has revoked the phone or removed them from the staff list.
  const workerCopyCode = store?.staffDevice ? store.accessCode : '';
  useEffect(() => {
    if (!workerCopyCode) return;
    let stopped = false;
    const refresh = async () => {
      const result = await refreshWorkerCopy({
        loadCopy: code => loadStore(code),
        saveCopy: copy => saveStore(copy, { skipCloudSync: true }),
      });
      if (stopped) return;
      if (result.state === 'shut_out') {
        clearSession();
        localStorage.removeItem('storeflow_active_user');
        setStore(null);
        setCurrentUser(null);
        showToast('This phone has been signed out of the shop.', 'info');
      } else if (result.state === 'fresh') {
        setStore(prev => (prev && prev.accessCode === result.store.accessCode ? result.store : prev));
        setCurrentUser((prev: any) => prev ? { ...prev, ...result.worker } : prev);
        // The pass is good: bundles waiting on this phone can go now - and
        // then the money taken on them, which the cloud takes only once the
        // bundle is there.
        void resumeWorkerLaundry(workerCopyCode)
          .then(() => { if (latestStore.current?.staffDevice) return sendWorkerRecords(latestStore.current); })
          .catch(() => {});
      }
    };
    void refresh();
    window.addEventListener('online', refresh);
    /*
     * And when the worker comes back to the app, so an owner's change - a new
     * role, a pay rate, what they may open - reaches a phone left open all
     * day, not only one that is restarted. Once a minute at most: one small
     * call, nothing on a timer while the app sits in a pocket.
     */
    let lastAsked = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastAsked < 60_000) return;
      lastAsked = Date.now();
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [workerCopyCode]);
  // The pass ran out with the app open: ask for the PIN over whatever is on
  // screen, and take the prompt away if this stops being a worker's phone.
  const [passRanOut, setPassRanOut] = useState(false);
  useEffect(() => {
    setPassRanOut(false);
    if (!workerCopyCode) return;
    const onExpired = () => setPassRanOut(true);
    window.addEventListener(WORKER_PASS_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(WORKER_PASS_EXPIRED_EVENT, onExpired);
  }, [workerCopyCode]);
  // A worker's phone sends what it recorded a moment after it is recorded -
  // an expense, a new customer, a piece-work claim - not on every keystroke.
  useEffect(() => {
    if (!store?.staffDevice) return;
    const timer = window.setTimeout(() => {
      if (latestStore.current?.staffDevice) void sendWorkerRecords(latestStore.current).catch(() => {});
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [store]);
  // A worker's phone sees the shop's bundles through its own door, since it
  // has no owner account to read them with: everything open once, then only
  // what changed, every few minutes while the app is in front.
  useEffect(() => {
    if (!workerCopyCode) return;
    let stopped = false;
    let since: string | null = null;
    const pull = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const result = await fetchWorkerBundles(since);
      if (stopped) return;
      if (result.state === 'shut_out') {
        clearSession();
        localStorage.removeItem('storeflow_active_user');
        setStore(null);
        setCurrentUser(null);
        setOrders([]);
        showToast('This phone has been signed out of the shop.', 'info');
        return;
      }
      if (result.state !== 'ok') return;
      since = result.asOf;
      // What this phone recorded and the cloud has not got yet goes with it.
      if (latestStore.current?.staffDevice) void sendWorkerRecords(latestStore.current).catch(() => {});
      const incoming = result.orders.map(order => ({ ...order, status: getNormalizedStatus(order.status) }));
      setOrders(prev => mergeBundles(prev, incoming));
    };
    setOrders([]);
    void pull();
    const timer = window.setInterval(() => void pull(), WORKER_BUNDLES_MS);
    const onVisible = () => void pull();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener(WORKER_PASS_RENEWED_EVENT, onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener(WORKER_PASS_RENEWED_EVENT, onVisible);
    };
  }, [workerCopyCode, getNormalizedStatus]);
  useEffect(() => {
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);

    // Check if redirect is from email verification signup
    const isSignupVerify = hash.includes('type=signup') ||
                           hash.includes('type=invite') ||
                           searchParams.get('type') === 'signup' ||
                           searchParams.get('type') === 'invite';

    if (isSignupVerify) {
      setShowVerifySuccess(true);
      // Clean up the URL hash so it looks nice
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  // Tapping an order push notification opens /?tab=orders&order_id=... (see
  // src/sw.ts). Land on that exact order instead of the default tab.
  useEffect(() => {
    const search = window.location.search;
    const deepLink = readOrderDeepLink(search);
    const linkedTab = readLinkedTab(search);
    const act = readNotificationAct(search);

    // "I understand" is an acknowledgement, not a request to go anywhere. The
    // service worker does not open a window for it, but a already-open app
    // still receives the navigation, so it must not yank the merchant away
    // from whatever they were doing.
    if (act?.action === 'acknowledge') {
      window.history.replaceState(null, '', window.location.pathname + stripOrderDeepLink(search) + window.location.hash);
      return;
    }
    if (!deepLink && !linkedTab) return;

    // Drop the parameters before setTab runs, since setTab owns the history
    // entry from here on and a refresh must not re-focus a stale order.
    window.history.replaceState(null, '', window.location.pathname + stripOrderDeepLink(search) + window.location.hash);
    if (deepLink) setFocusOrderId(deepLink.orderId);
    if (act) setNotificationAct(act);
    setTab(deepLink ? 'orders' : (linkedTab as TabId));
  }, [setTab]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  // Chrome only grants this to an installed app, and refuses quietly
  // otherwise, so it is asked for once and its answer is not acted on.
  useEffect(() => {
    if (!store?.id) return;
    void enableBackgroundNotices();
  }, [store?.id]);
  // Shrinkage is worth mentioning on its own rather than only as a line inside
  // the leak detector. getStockLossNotice decides whether there is anything
  // worth an interruption and how recently one was made, so this can run on
  // every store change without becoming noise.
  useEffect(() => {
    if (!store) return;
    const notice = getStockLossNotice(store);
    if (!notice) return;

    // Three routes, in order of how far they reach:
    //   the tray, which needs nothing;
    //   a system notification, which needs only that the app is running;
    //   the queue, which the browser may show after the app is closed.
    // The pushed version comes from send-flow-reminders and needs a backend.
    void showLocalNotification({
      title: notice.title,
      body: notice.body,
      tag: `stock-loss-${notice.id}`,
      category: 'stock_loss',
      url: '/?tab=inventory',
    });
    void queueBackgroundNotice({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      tag: `stock-loss-${notice.id}`,
      category: 'stock_loss',
      url: '/?tab=inventory',
    });

    setStore(prev => {
      if (!prev) return prev;
      const existing = prev.flowNotifications || [];
      if (existing.some(n => n.id === notice.id)) return prev;
      // A shop that switched low-stock alerts off does not get this one.
      if (!wantsNotification(prev, 'lowStock')) return prev;
      markStockLossRaised(prev);
      return {
        ...prev,
        flowNotifications: [{
          id: notice.id,
          text: notice.body,
          icon: '\u26a0\ufe0f',
          tone: 'warning',
          date: new Date().toISOString(),
          read: false,
          title: notice.title,
          description: notice.body,
          category: 'lowStock',
          actionLabel: 'Open stock count',
          actionTab: 'inventory',
        } as any, ...existing],
      };
    });
  }, [store?.stockCountAudits?.length]);
  const handleStoreLoaded = useCallback((s: StoreData) => {
    /*
     * The shop and the person are set together, not one and then the other.
     *
     * This read the signed-in person and used them as they were, so a switch
     * could draw the new shop's screens with the old shop's role until an
     * effect caught up. Their role now comes from the shop being opened.
     */
    const identity = identityForStore(s, readActiveUser());
    if (!identity.ok) {
      showToast(`You are not on the team at ${s.storeName}.`, 'error');
      return;
    }
    if (identity.user) {
      writeActiveUser(identity.user);
      setCurrentUser(identity.user);
    }
    setStore(s);
    saveSession(s.accessCode);
  }, []);
  const handleNavigate = useCallback((targetTab: TabId, lowStockOrFocus?: boolean | ProductFocus | string) => {
    setTab(targetTab);
    if (lowStockOrFocus === true) {
      setFilterLowStock(true);
      return;
    }
    // Notifications carry a plain signal rather than a product — the drawer
    // hands through whatever actionParam the notification was created with.
    // Manager renders its own copy of the drawer and passed this handler,
    // whose parameter was typed for a ProductFocus only, so a string fell
    // through every branch and the signal was silently dropped: tapping a
    // restock notification from there landed on Inventory without opening
    // Smart Restock.
    if (typeof lowStockOrFocus === 'string') {
      if (lowStockOrFocus === 'openRestock') setAutoOpenRestock(true);
      return;
    }
    // Advice that named a single product sends it along, so the destination
    // can open that product instead of a list to search through.
    if (lowStockOrFocus && typeof lowStockOrFocus === 'object') {
      setFocusProduct(lowStockOrFocus);
    }
  }, []);
  const handleLock = () => {
    clearSession();
    localStorage.removeItem('storeflow_active_user');
    setStore(null);
    setCurrentUser(null);
  };
  /*
   * A staff invite opened while a shop is open on this phone.
   *
   * It used to be swallowed: the open shop replaced the opening screen that
   * had read the link. Now the phone asks. Its own shop's invite, or the
   * shop this phone already works at, needs no answer and says so.
   */
  const [inviteAsk, setInviteAsk] = useState<string | null>(null);
  useEffect(() => {
    if (!store) return;
    const ref = pendingInvite();
    if (!ref) return;
    if (store.staffDevice && normaliseStoreRef(store.staffDevice.storeRef) === ref) {
      clearInvite();
      showToast('This phone already works at this shop.', 'info');
      return;
    }
    if (!store.staffDevice && normaliseStoreRef(String(store.storeId || '')) === ref) {
      clearInvite();
      showToast("That is this shop's own invite. A worker scans it on their phone.", 'info');
      return;
    }
    setInviteAsk(ref);
  }, [store?.accessCode]);
  const handleBarcodeDetected = useCallback((code: string) => {
    if (!store) return;
    let targetId = code;
    if (code.includes('/product/')) {
      const parts = code.split('/product/');
      targetId = parts[parts.length - 1];
    }
    const existing = store.products.find(p => p.barcode === targetId || p.id === targetId);
    const workingStore = logScanEvent(store, {
      kind: 'barcode',
      purpose: 'quick-scan',
      productId: existing?.id,
      productName: existing?.name,
      matched: !!existing,
    });
    setStore(workingStore);
    if (existing) {
      // Sell mode: add to scan cart
      if (existing.quantity <= 0) {
        showToast(`${existing.name} is out of stock`, 'error');
        return;
      }
      setScanCart(prev => {
        const idx = prev.findIndex(c => c.product.id === existing.id);
        if (idx >= 0) {
          const used = prev[idx].qty;
          if (used + 1 > existing.quantity) {
            showToast('No more stock available', 'error');
            return prev;
          }
          const next = [...prev];
          next[idx] = { ...next[idx], qty: used + 1 };
          showToast(`${existing.name} × ${next[idx].qty}`);
          return next;
        }
        showToast(`✓ ${existing.name} added to cart`);
        return [...prev, { product: existing, qty: 1 }];
      });
    } else {
      // Save mode
      setShowBarcodeScanner(false);
      setNewProductPrompt({ barcode: targetId, name: '', costPrice: '', sellingPrice: '', quantity: '1' });
    }
  }, [store]);
  const handleCheckoutScanCart = async () => {
    if (!store || scanCart.length === 0) return;
    const result = await commitCashCheckout(store, scanCart.map(item => ({ productId: item.product.id, quantity: item.qty })), currentUser?.name, currentUser?.role);
    if (result.error) return showToast(result.error, 'error');
    setStore(result.store);
    const total = result.total;
    showToast(`Sold ${scanCart.length} item${scanCart.length === 1 ? '' : 's'} — ₦${total.toLocaleString()}`);
    setScanCart([]);
    setShowBarcodeScanner(false);
  };
  const handleSaveNewProduct = () => {
    if (!store || !newProductPrompt) return;
    const { barcode, name, costPrice, sellingPrice, quantity } = newProductPrompt;
    if (!name.trim() || !sellingPrice || !quantity) {
      showToast('Fill name, selling price and quantity', 'error');
      return;
    }
    const updated = addProduct(store, {
      name: name.trim(),
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice),
      quantity: Number(quantity),
      category: 'Scanned',
      barcode,
    });
    setStore(updated);
    showToast(`✓ Saved ${name}`);
    setNewProductPrompt(null);
  };

  return {
    store,
    setStore,
    locked,
    setLocked,
    settingsSubView,
    setSettingsSubView,
    hiddenSince,
    autoOpenRestock,
    setAutoOpenRestock,
    currentUser,
    setCurrentUser,
    watchAccessCode,
    watchStoreRef,
    latestStore,
    tab,
    setTabStateNow,
    setTabState,
    orders,
    setOrders,
    focusOrderId,
    setFocusOrderId,
    notificationAct,
    setNotificationAct,
    focusProduct,
    setFocusProduct,
    getNormalizedStatus,
    playOrderAlertSound,
    orderCommitBusy,
    handleUpdateOrderStatus,
    setTab,
    lastStoreCode,
    filterLowStock,
    setFilterLowStock,
    showScanner,
    setShowScanner,
    showBarcodeScanner,
    setShowBarcodeScanner,
    showMoreMenu,
    setShowMoreMenu,
    showProfileMenu,
    setShowProfileMenu,
    showStreakPanel,
    setShowStreakPanel,
    showLockConfirm,
    setShowLockConfirm,
    showSwitcher,
    setShowSwitcher,
    scanCart,
    setScanCart,
    newProductPrompt,
    setNewProductPrompt,
    showSwitchUser,
    setShowSwitchUser,
    switchTargetUser,
    setSwitchTargetUser,
    switchPassword,
    setSwitchPassword,
    switchPinBuffer,
    setSwitchPinBuffer,
    showSwitchPassField,
    setShowSwitchPassField,
    showNotifications,
    setShowNotifications,
    showVerifySuccess,
    setShowVerifySuccess,
    expandedCategories,
    setExpandedCategories,
    toggleCategory,
    businessTemplate,
    businessType,
    lastShopKey,
    isGames,
    isServiceFirst,
    workspaceKey,
    unsavedWorkOpen,
    setUnsavedWorkOpen,
    heldTab,
    setHeldTab,
    showReady,
    setShowReady,
    milestoneShowing,
    unreadCount,
    mainTabs,
    moreItems,
    allowedMainTabs,
    allowedMoreItems,
    allowedCategories,
    workerCopyCode,
    passRanOut,
    setPassRanOut,
    handleStoreLoaded,
    handleNavigate,
    handleLock,
    inviteAsk,
    setInviteAsk,
    handleBarcodeDetected,
    handleCheckoutScanCart,
    handleSaveNewProduct,
  };
}

export type IndexScreenState = ReturnType<typeof useIndexScreen>;
/** The state once a shop is open: what every part of the page below works with. */
export type IndexScreenReady = IndexScreenState & { store: StoreData };
