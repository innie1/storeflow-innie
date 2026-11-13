import { useState, useEffect, useRef } from 'react';
import { addFlowReward } from '@/lib/flow-memory';
import { readStoreSignal, signalFromStore, invalidateStoreSignal } from '@/lib/mascot-store-signal';
import {
  LOW_STOCK_PEEK_COOLDOWN_MS,
  LOW_STOCK_PEEK_KEY,
  MascotMood,
  MascotProps,
  obstructedTop,
  getActivityDuration,
} from './model';

/**
 * Flow's behaviour: which mood shows and why (shop hours, low stock, late
 * nights), what Flow is saying, and the taps, presses, dodges and walks.
 *
 * Mascot puts Flow on the screen; the drawing and the speech bubble are
 * parts in this folder, reading what they need from the object this returns.
 */
export function useMascot(props: MascotProps) {
  const { size = 64, mood = 'idle', className = '', animate = true, store, role, externalMessage, externalMessageKey, externalMessageMood, externalMessageDuration } = props;
  const [activeTheme, setActiveTheme] = useState<'graphite' | 'blue' | 'forest'>('graphite');
  const [overrideMood, setOverrideMood] = useState<MascotMood | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dodgeClass, setDodgeClass] = useState<string>('');
  
  // Interaction states
  const [tapCount, setTapCount] = useState(0);
  const [patRequired, setPatRequired] = useState(false);
  const [floatingReward, setFloatingReward] = useState<string | null>(null);
  const [isSleeping, setIsSleeping] = useState(false);
  const [sunglassesEasterEgg, setSunglassesEasterEgg] = useState(false);
  const [confetti, setConfetti] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const [posture, setPosture] = useState<'normal' | 'look-left' | 'look-right' | 'tilt-left' | 'tilt-right'>('normal');
  const [storeClosingTime, setStoreClosingTime] = useState<string | null>(null);
  const [storeOpeningTime, setStoreOpeningTime] = useState<string | null>(null);
  // New States for edge-aware & speech-aware logic
  const [isManagerEnabled, setIsManagerEnabled] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [bubbleShiftX, setBubbleShiftX] = useState<number>(0);
  const [bubblePosition, setBubblePosition] = useState<'above' | 'below' | 'left' | 'right'>('above');
  // Nudges the bubble vertically when it is standing beside Flow and would
  // otherwise run off the top or bottom of the screen.
  const [bubbleShiftY, setBubbleShiftY] = useState<number>(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  /**
   * Flow is mid-gesture until this moment.
   *
   * Set synchronously, unlike the state the ambient loops check, so two timers
   * firing in the same flush cannot both conclude he is free.
   */
  const busyUntilRef = useRef(0);
  const [isMouthTalking, setIsMouthTalking] = useState(false);
  const lastSalesCountRef = useRef<number | null>(null);
  // New animations states
  const [isSwelling, setIsSwelling] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showPrintedPhoto, setShowPrintedPhoto] = useState(false);
  const [isWearingGlasses, setIsWearingGlasses] = useState(false);
  const [isBreathingAir, setIsBreathingAir] = useState(false);
  // Occasional activity state
  const [activity, setActivity] = useState<
    | 'soccer-ball'
    | 'drinking-water'
    | 'shaking-clock'
    | 'staring-phone'
    | 'reading-book'
    | 'listening-music'
    | 'walking-off-left'
    | 'walking-off-right'
    | 'counting-cash'
    | 'sync-fistpump'
    | 'order-doorbell-ears'
    | 'goal-trophy-lift'
    | 'refund-wince'
    | 'staff-wave'
    | null
  >(null);
  // Easter Egg & Wake Override logic
  const [wakeOverride, setWakeOverride] = useState(false);
  const [boxStage, setBoxStage] = useState(0);
 
  const wakeOverrideTimeout = useRef<NodeJS.Timeout | null>(null);
  // Long press & mouth refs
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isLongPressed, setIsLongPressed] = useState(false);
  const messageTimeout = useRef<NodeJS.Timeout | null>(null);
  const mouthTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastTapTime = useRef<number>(0);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastNotifCountRef = useRef<number | null>(null);
  const isInitialSalesLoadRef = useRef<boolean>(true);
  // Determine current active mood (check active store hours or fallback to late night auto-sleep)
  const nowTime = new Date();
  const currentHours = nowTime.getHours();
  const currentMinutes = nowTime.getMinutes();
  const currentMinutesTotal = currentHours * 60 + currentMinutes;
  let isClosingTime = false;
  if (storeClosingTime) {
    const [closeH, closeM] = storeClosingTime.split(':').map(Number);
    let openH = 6;
    let openM = 0;
    if (storeOpeningTime) {
      const [oH, oM] = storeOpeningTime.split(':').map(Number);
      if (!isNaN(oH) && !isNaN(oM)) {
        openH = oH;
        openM = oM;
      }
    }
    if (!isNaN(closeH) && !isNaN(closeM)) {
      const closeTotal = closeH * 60 + closeM;
      const openTotal = openH * 60 + openM;

      if (closeTotal > openTotal) {
        isClosingTime = currentMinutesTotal >= closeTotal || currentMinutesTotal < openTotal;
      } else {
        isClosingTime = currentMinutesTotal >= closeTotal && currentMinutesTotal < openTotal;
      }
    } else {
      isClosingTime = currentHours >= 21 || currentHours < 6;
    }
  } else {
    isClosingTime = currentHours >= 21 || currentHours < 6;
  }
  // Monitor theme changes
  useEffect(() => {
    const checkTheme = () => {
      const isBlue = document.documentElement.classList.contains('theme-blue');
      const isForest = document.documentElement.classList.contains('theme-forest');
      if (isBlue) setActiveTheme('blue');
      else if (isForest) setActiveTheme('forest');
      else setActiveTheme('graphite');
    };
    checkTheme();

    const observer = new MutationObserver(() => {
      checkTheme();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  // Track active user role
  useEffect(() => {
    if (role) {
      setCurrentUserRole(role);
      return;
    }
    const checkRole = () => {
      try {
        const raw = localStorage.getItem('storeflow_active_user');
        if (raw) {
          const user = JSON.parse(raw);
          setCurrentUserRole(user.role || null);
        } else {
          setCurrentUserRole(null);
        }
      } catch (e) {
        // ignore
      }
    };
    checkRole();

    // Was a 2-second poll. Who is signed in changes when somebody signs in,
    // which is not worth asking about thirty times a minute — and never worth
    // asking about while the app is off screen. The slow check covers same-tab
    // writes, which do not raise a storage event.
    const onStorage = (e: StorageEvent) => { if (e.key === 'storeflow_active_user') checkRole(); };
    const onVisible = () => { if (!document.hidden) checkRole(); };
    const interval = setInterval(() => { if (!document.hidden) checkRole(); }, 15000);

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [role]);
  // Keep isManagerEnabled in sync with store prop updates
  useEffect(() => {
    if (store && store.managerSettings) {
      setIsManagerEnabled(store.managerSettings.enabled !== false);
    }
  }, [store?.managerSettings?.enabled, store]);
  // Session-load welcome greeting (only once per session)
  useEffect(() => {
    if (!isManagerEnabled || isClosingTime) return;
    if (typeof window !== 'undefined' && !sessionStorage.getItem('storeflow_session_greeted')) {
      sessionStorage.setItem('storeflow_session_greeted', 'true');
      const timer = setTimeout(() => {
        let welcomeMsg = "Welcome to the shop! Let's make some sales! 🛒✨";
        if (currentUserRole === 'owner') {
          welcomeMsg = "Welcome back, Boss! Ready to look at our profit insights today? 📊👑";
        } else if (currentUserRole === 'manager') {
          welcomeMsg = "Welcome, Manager! Let's keep operations smooth and track inventory! 📋🚀";
        } else if (currentUserRole === 'cashier') {
          welcomeMsg = "Welcome! Let's check out some sales and serve our customers! 🛒💵";
        } else if (currentUserRole === 'inventory') {
          welcomeMsg = "Hi there! Let's inspect stock levels and get restocked today! 📦🔍";
        } else if (currentUserRole === 'accountant') {
          welcomeMsg = "Hello! Let's balance the records and manage our expenses! 💸📉";
        } else if (currentUserRole === 'supervisor') {
          welcomeMsg = "Welcome, Supervisor! Let's check store performance and staff tracking! 🌟📋";
        }
        triggerSpeech(welcomeMsg, 'happy', 5000);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isManagerEnabled, isClosingTime, currentUserRole]);
  // Sleep inactivity timer (3 minutes of no user mascot interaction)
  const resetInactivity = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    
    if (isSleeping) {
      setIsSleeping(false); // Wake up silently
    }
    
    inactivityTimer.current = setTimeout(() => {
      setOverrideMood('yawn-stretch');
      setTimeout(() => {
        setIsSleeping(true);
        setOverrideMood(null);
      }, 2000);
    }, 180000); // 3 minutes timeout
  };
  useEffect(() => {
    resetInactivity();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (wakeOverrideTimeout.current) clearTimeout(wakeOverrideTimeout.current);
    };
  }, [isSleeping]);
  // Fetch active store hours dynamically
  // Opening hours and whether the manager is on.
  //
  // This used to call loadStore() every five seconds in every mounted mascot,
  // even when the live store had been passed in as a prop. loadStore is not a
  // read — it re-parses the whole record, runs scheduled savings deductions,
  // re-syncs product performance and writes the store index back. On a
  // multi-megabyte store that stalls the main thread twelve times a minute,
  // per mascot, and that is the same thread the animation runs on. A
  // decorative component was the heaviest thing on the screen.
  //
  // When a store is passed it is live React state, always fresher than disk,
  // so it is simply used. Only a mascot rendered without one falls back to
  // storage, through a shared cache that parses at most once a minute however
  // many mascots ask, and writes nothing.
  useEffect(() => {
    if (store) {
      const signal = signalFromStore(store);
      setStoreClosingTime(signal.closingTime);
      setStoreOpeningTime(signal.openingTime);
      setIsManagerEnabled(signal.managerEnabled);
      return;
    }

    const apply = () => {
      const signal = readStoreSignal();
      setStoreClosingTime(signal.closingTime);
      setStoreOpeningTime(signal.openingTime);
      setIsManagerEnabled(signal.managerEnabled);
    };

    apply();
    const interval = setInterval(() => { if (!document.hidden) apply(); }, 30000);
    const onVisible = () => {
      if (document.hidden) return;
      // Hours may have been edited while the app was away.
      invalidateStoreSignal();
      apply();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store, store?.profile?.openingTime, store?.profile?.closingTime, store?.managerSettings?.enabled]);
  // Real-time sale awareness when store is passed as prop
  useEffect(() => {
    if (isManagerEnabled && store && store.sales) {
      const newSalesCount = store.sales.length;
      if (isInitialSalesLoadRef.current) {
        lastSalesCountRef.current = newSalesCount;
        isInitialSalesLoadRef.current = false;
        return;
      }
      if (lastSalesCountRef.current !== null && newSalesCount > lastSalesCountRef.current) {
        const saleDiff = newSalesCount - lastSalesCountRef.current;
        const latestSales = store.sales.slice(-saleDiff);
        const totalAmount = latestSales.reduce((sum, s) => sum + s.total, 0);
        
        if (totalAmount > 0) {
          const celebrationPhrases = [
            `Awesome! We just sold items for ₦${totalAmount.toLocaleString()}! 💵🎉`,
            `Ka-ching! A new sale of ₦${totalAmount.toLocaleString()} recorded! 🚀💰`,
            `Nice job! ₦${totalAmount.toLocaleString()} added to revenue! Keep it up! 🛒✨`,
            `Another customer served! ₦${totalAmount.toLocaleString()} sale completed! 🥳📦`
          ];
          triggerSpeech(celebrationPhrases[Math.floor(Math.random() * celebrationPhrases.length)], 'celebrating', 5000);
          triggerConfetti();
          setActivity('counting-cash');
          setTimeout(() => setActivity(null), 1800);
        }
      }
      lastSalesCountRef.current = newSalesCount;
    }
  }, [store?.sales?.length, store, isManagerEnabled]);
  // Real-time notification awareness
  useEffect(() => {
    if (isManagerEnabled && store && store.flowNotifications) {
      const currentNotifCount = store.flowNotifications.length;
      if (lastNotifCountRef.current === null) {
        lastNotifCountRef.current = currentNotifCount;
        return;
      }
      if (currentNotifCount > lastNotifCountRef.current) {
        const latestNotif = store.flowNotifications[0];
        if (latestNotif && !latestNotif.read) {
          const toneMood: MascotMood = latestNotif.tone === 'danger' ? 'concerned' : latestNotif.tone === 'warning' ? 'warning' : 'excited';
          triggerSpeech(`🔔 ${latestNotif.title || 'Notification'}: ${latestNotif.text}`, toneMood, 5000);
        }
      }
      lastNotifCountRef.current = currentNotifCount;
    }
  }, [store?.flowNotifications?.length, store?.flowNotifications, isManagerEnabled]);
  // Offline & sync event hooks
  useEffect(() => {
    const handleOffline = () => {
      setOverrideMood('offline-umbrella');
      triggerSpeech("Offline mode active — changes saved locally! 🌧️☔", 'offline-umbrella', 5000);
    };
    const handleOnline = () => {
      setOverrideMood(null);
      setActivity('sync-fistpump');
      setTimeout(() => setActivity(null), 550);
      triggerSpeech("Back online! Queued data synced! ⚡🚀", 'happy', 4000);
    };

    if (!navigator.onLine) {
      setOverrideMood('offline-umbrella');
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    const onSale = () => { setActivity('counting-cash'); setTimeout(() => setActivity(null), 1800); };
    const onSync = () => { setActivity('sync-fistpump'); setTimeout(() => setActivity(null), 550); };
    const onOrder = () => { setActivity('order-doorbell-ears'); setTimeout(() => setActivity(null), 1800); };
    const onGoal = () => { setActivity('goal-trophy-lift'); setTimeout(() => setActivity(null), 1800); };
    const onRefund = () => { setActivity('refund-wince'); setTimeout(() => setActivity(null), 380); };
    const onStaff = () => { setActivity('staff-wave'); setTimeout(() => setActivity(null), 1800); };

    window.addEventListener('storeflow-sale-complete', onSale);
    window.addEventListener('storeflow-sync-complete', onSync);
    window.addEventListener('storeflow-new-order', onOrder);
    window.addEventListener('storeflow-goal-reached', onGoal);
    window.addEventListener('storeflow-refund-action', onRefund);
    window.addEventListener('storeflow-staff-login', onStaff);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('storeflow-sale-complete', onSale);
      window.removeEventListener('storeflow-sync-complete', onSync);
      window.removeEventListener('storeflow-new-order', onOrder);
      window.removeEventListener('storeflow-goal-reached', onGoal);
      window.removeEventListener('storeflow-refund-action', onRefund);
      window.removeEventListener('storeflow-staff-login', onStaff);
    };
  }, []);
  // Speech-aware mouth animation timing
  useEffect(() => {
    if (mouthTimeout.current) clearTimeout(mouthTimeout.current);
    
    if (message) {
      setIsMouthTalking(true);
      // Calculate speaking duration based on text length: ~65ms per character, minimum 600ms, maximum 4500ms
      const talkDuration = Math.max(600, Math.min(4500, message.length * 65));
      mouthTimeout.current = setTimeout(() => {
        setIsMouthTalking(false);
      }, talkDuration);
    } else {
      setIsMouthTalking(false);
    }
    
    return () => {
      if (mouthTimeout.current) clearTimeout(mouthTimeout.current);
    };
  }, [message]);
  // Edge-aware speech bubble positioning (above/below and horizontal shifting)
  useEffect(() => {
    let frame = 0;

    const handleLayout = () => {
      if (!message || !containerRef.current) {
        setBubbleShiftX(0);
        setBubbleShiftY(0);
        setBubblePosition('above');
        return;
      }

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const padding = 16; // Edge safety offset

      // Measure the bubble rather than guessing at it. The old constants were
      // the midpoint of the min/max widths and a flat 76px tall, so a
      // one-word line and a three-line one were placed identically.
      const bubbleEl = bubbleRef.current;
      const bubbleWidth = bubbleEl?.offsetWidth || 170;
      const bubbleHeight = (bubbleEl?.offsetHeight || 64) + 12; // + connector gap

      // 1. Horizontal shift, so the bubble stays on screen.
      const centerX = rect.left + rect.width / 2;
      let shiftX = 0;
      const absoluteLeft = centerX - bubbleWidth / 2;
      const absoluteRight = centerX + bubbleWidth / 2;
      if (absoluteLeft < padding) {
        shiftX = padding - absoluteLeft;
      } else if (absoluteRight > window.innerWidth - padding) {
        shiftX = (window.innerWidth - padding) - absoluteRight;
      }
      setBubbleShiftX(shiftX);

      // 2. Above or below, decided against what is really there.
      const spaceAbove = rect.top - obstructedTop(centerX, container);

      // Below, what the bubble lands on is the next sibling: the StoreFlow
      // wordmark during setup, the store name on the dashboard.
      let spaceBelow = window.innerHeight - rect.bottom;
      const nextEl = container.nextElementSibling;
      if (nextEl) {
        const nextTop = nextEl.getBoundingClientRect().top;
        spaceBelow = Math.min(spaceBelow, nextTop - rect.bottom);
      }

      if (spaceAbove >= bubbleHeight) {
        setBubblePosition('above');
        setBubbleShiftY(0);
        return;
      }
      if (spaceBelow >= bubbleHeight) {
        setBubblePosition('below');
        setBubbleShiftY(0);
        return;
      }

      // Neither above nor below. This used to slide the bubble down over Flow
      // himself — covering his face while he was talking, and sitting on top
      // of whatever he was doing: heading a ball, listening, waving. He is the
      // reason anyone looks at that corner, so he is the last thing to cover.
      //
      // Stand it beside him instead, on whichever side has room.
      const roomRight = window.innerWidth - rect.right - padding;
      const roomLeft = rect.left - padding;
      if (roomRight >= bubbleWidth || roomLeft >= bubbleWidth) {
        setBubblePosition(roomRight >= roomLeft ? 'right' : 'left');
        // Centred on him, then pushed back on screen if that overflows.
        const centred = rect.top + rect.height / 2 - bubbleHeight / 2;
        const clamped = Math.min(
          Math.max(centred, padding),
          Math.max(padding, window.innerHeight - bubbleHeight - padding),
        );
        setBubbleShiftY(Math.round(clamped - centred));
        return;
      }

      // Nowhere has room. Above, clipped, is still better than over his face.
      setBubblePosition('above');
      setBubbleShiftY(0);
    };

    // Scroll fires far faster than the layout can meaningfully change.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(handleLayout);
    };

    handleLayout();

    if (message) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [message]);
  const isTalking = !!message;
  /** Standing beside Flow rather than over or under him. */
  const isBeside = bubblePosition === 'left' || bubblePosition === 'right';
  const isSleepingState = !isManagerEnabled || ((isSleeping || isClosingTime) && !wakeOverride);
  const isMorningBathing = !isClosingTime && currentMinutesTotal >= 360 && currentMinutesTotal <= 510 && (mood === 'idle' || mood === 'neutral');
  const currentMood: MascotMood = isSleepingState
    ? 'sleeping' 
    : overrideMood 
    ? overrideMood 
    : sunglassesEasterEgg 
    ? 'confident' 
    : isMorningBathing
    ? 'bathing'
    : mood;
  // Occasional Air Breathing effect
  useEffect(() => {
    if (isSleepingState || !animate) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (Math.random() < 0.3) {
        setIsBreathingAir(true);
        setTimeout(() => setIsBreathingAir(false), 3000);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isSleepingState, animate]);
  // Occasional Eyeglasses effect
  useEffect(() => {
    if (isSleepingState || !animate) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (Math.random() < 0.25 && !isWearingGlasses) {
        setIsWearingGlasses(true);
        setTimeout(() => setIsWearingGlasses(false), 8000);
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [isSleepingState, animate, isWearingGlasses]);
  // Handle posturing shifts (look around/tilt) when not sleeping/resting/bathing
  useEffect(() => {
    if (currentMood === 'sleeping' || currentMood === 'resting' || currentMood === 'bathing' || activity) {
      setPosture('normal');
      return;
    }
    const interval = setInterval(() => {
      if (document.hidden) return;
      const postures: ('normal' | 'look-left' | 'look-right' | 'tilt-left' | 'tilt-right')[] = [
        'normal', 'normal', 'look-left', 'look-right', 'tilt-left', 'tilt-right'
      ];
      const next = postures[Math.floor(Math.random() * postures.length)];
      setPosture(next);
    }, 5000);
    return () => clearInterval(interval);
  }, [currentMood, activity]);
  // Occasional random animations loop
  useEffect(() => {
    if (!animate || isSleepingState || isMorningBathing || boxStage > 0) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      // busyUntilRef, not just state: the ambient loops share a tick, and
      // within one timer flush both read the same pre-render values and both
      // conclude Flow is free. That let a random animation land on top of the
      // low-stock peek, leaving its speech bubble over an unrelated pose.
      if (overrideMood || message || tapCount > 0) return;
      if (Date.now() < busyUntilRef.current) return;

      // 45% chance to trigger a random activity
      if (Math.random() < 0.45) {
        const isAngryOrPanic = currentMood === 'angry' || currentMood === 'worried' || currentMood === 'concerned';

        if (isAngryOrPanic) {
          const angryActivities: ('staring-phone' | 'walking-off' | 'drinking-water')[] = [
            'staring-phone',
            'walking-off',
            'drinking-water'
          ];
          const chosen = angryActivities[Math.floor(Math.random() * angryActivities.length)];

          if (chosen === 'walking-off') {
            const direction = Math.random() < 0.5 ? 'left' : 'right';
            setActivity(direction === 'left' ? 'walking-off-left' : 'walking-off-right');
            const duration = getActivityDuration(direction === 'left' ? 'walking-off-left' : 'walking-off-right');
            const speechOptions = [
              "Going to search for customers outside... 🚶‍♂️💢",
              "Need a quick walk to clear my head... 😤💨",
              "Checking if the competitor is stealing our customers! 🔍😡"
            ];
            triggerSpeech(speechOptions[Math.floor(Math.random() * speechOptions.length)], 'angry', duration);
            setTimeout(() => setActivity(null), duration);
          } else {
            setActivity(chosen);
            const duration = getActivityDuration(chosen);
            if (chosen === 'staring-phone') {
              const speech = [
                "Why is the revenue graph so flat? 📉📱❌",
                "Checking competitor prices... they are lower! 😠📱",
                "Reading negative reviews... we must improve! 📱🤦‍♂️"
              ];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'angry', duration);
              setOverrideMood('angry');
            } else if (chosen === 'drinking-water') {
              const speech = [
                "Drinking water to calm my anger... 💧😤",
                "Gotta cool down... 🥛🥵",
                "Drinking coffee to survive this day... ☕️😫"
              ];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'concerned', duration);
              setOverrideMood('concerned');
            }
            setTimeout(() => {
              setActivity(null);
              setOverrideMood(null);
            }, duration);
          }
        } else {
          // Standard stable activities
          const activities: ('soccer-ball' | 'drinking-water' | 'shaking-clock' | 'staring-phone' | 'reading-book' | 'listening-music' | 'walking-off')[] = [
            'soccer-ball',
            'drinking-water',
            'shaking-clock',
            'staring-phone',
            'reading-book',
            'listening-music',
            'walking-off'
          ];
          const chosen = activities[Math.floor(Math.random() * activities.length)];

          if (chosen === 'walking-off') {
            const direction = Math.random() < 0.5 ? 'left' : 'right';
            setActivity(direction === 'left' ? 'walking-off-left' : 'walking-off-right');
            const duration = getActivityDuration(direction === 'left' ? 'walking-off-left' : 'walking-off-right');
            const speechOptions = [
              "Be right back! Checking the warehouse! 🏃‍♂️",
              "Taking a quick stretch break off-screen! 🚪💨",
              "Checking on the suppliers real quick... 📦",
              "BRB! Checking if the door is locked... 🔒💨"
            ];
            triggerSpeech(speechOptions[Math.floor(Math.random() * speechOptions.length)], 'happy', duration);
            setTimeout(() => setActivity(null), duration);
          } else {
            setActivity(chosen);
            const duration = getActivityDuration(chosen);
            if (chosen === 'soccer-ball') {
              const speech = ["Watch my heading skills! ⚽🕺", "Heading time! Goaaal! 🥅⚽", "Pogo bounce! ⚽💥"];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'happy', duration);
              setOverrideMood('happy');
            } else if (chosen === 'drinking-water') {
              const speech = ["Stay hydrated! 🥤💦", "Gotta drink water... 🥛", "Refresh break! 💧😎"];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'happy', duration);
              setOverrideMood('happy');
            } else if (chosen === 'shaking-clock') {
              const speech = ["Time is money! Let's make sales! ⏰💵", "Shake it up! Store hours are active! ⏳⏰", "Ring ring! High sales time! 🔔"];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'excited', duration);
              setOverrideMood('excited');
            } else if (chosen === 'staring-phone') {
              const speech = ["Checking incoming WhatsApp requests... 📲👀", "Staring at my phone... any new orders? 📱", "Browsing inventory sheets... 📊📱"];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'thinking', duration);
              setOverrideMood('thinking');
            } else if (chosen === 'reading-book') {
              const speech = ["Reading 'How to scale a retail store'! 📖🧠", "Learning some new marketing tricks... 📚🤓", "Studying our sales analytics! 📈📖"];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'thinking', duration);
              setOverrideMood('thinking');
            } else if (chosen === 'listening-music') {
              const speech = ["Vibing to some retail jams! 🎧🎶", "Music makes restocking faster! 🎵🔥", "Listening to my favorite beats! 🎧🕺"];
              triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'happy', duration);
              setOverrideMood('happy');
            }

            setTimeout(() => {
              setActivity(null);
              setOverrideMood(null);
            }, duration);
          }
        }
      }
    }, 28000);

    return () => clearInterval(interval);
  }, [animate, isSleepingState, isMorningBathing, boxStage, overrideMood, message, tapCount, currentMood]);
  // Helper to show speech bubble and override mood
  const triggerSpeech = (text: string, tempMood: MascotMood | null = null, duration = 3000) => {
    if (messageTimeout.current) clearTimeout(messageTimeout.current);
    setMessage(text);
    if (tempMood) setOverrideMood(tempMood);

    messageTimeout.current = setTimeout(() => {
      setMessage(null);
      setOverrideMood(null);
    }, duration);
  };
  /**
   * Flow looks over at the shelf when stock is genuinely running low.
   *
   * The animation, its shelf-peek keyframes and its pulsing warning badge were
   * all finished and then wired to nothing -- no code path could produce the
   * mood, so `currentMood === 'low-stock-peek'` never once evaluated true and
   * no merchant has seen it.
   *
   * It stays cheap on purpose. It only speaks when something is actually low,
   * never over a sleeping, talking or already-busy Flow, never while the tab
   * is hidden, and at most once every four hours -- a glance at the shelf, not
   * an alarm.
   */
  useEffect(() => {
    if (!animate || isSleepingState || isMorningBathing || boxStage > 0) return;
    if (!isManagerEnabled || !store) return;

    const peek = () => {
      if (document.hidden) return;
      // busyUntilRef, not just state: the ambient loops share a tick, and
      // within one timer flush both read the same pre-render values and both
      // conclude Flow is free. That let a random animation land on top of the
      // low-stock peek, leaving its speech bubble over an unrelated pose.
      if (overrideMood || message || tapCount > 0) return;
      if (Date.now() < busyUntilRef.current) return;

      const threshold = store.managerSettings?.minStockThreshold
        ?? store.managerSettings?.criticalStockThreshold
        ?? 5;
      // Zero is out of stock, which is a different (louder) problem; this is
      // for the ones still on the shelf but nearly gone.
      const low = (store.products || []).filter(
        product => !product.discontinued && product.quantity > 0 && product.quantity <= threshold,
      );
      if (!low.length) return;

      let last = 0;
      try { last = Number(localStorage.getItem(LOW_STOCK_PEEK_KEY)) || 0; } catch { /* private mode */ }
      if (Date.now() - last < LOW_STOCK_PEEK_COOLDOWN_MS) return;
      try { localStorage.setItem(LOW_STOCK_PEEK_KEY, String(Date.now())); } catch { /* private mode */ }

      busyUntilRef.current = Date.now() + 4500;
      const fewest = low.reduce((a, b) => (a.quantity <= b.quantity ? a : b));
      const others = low.length - 1;
      triggerSpeech(
        others > 0
          ? `${fewest.name} is down to ${fewest.quantity}, and ${others} other${others > 1 ? 's' : ''} are low.`
          : `${fewest.name} is down to ${fewest.quantity}.`,
        'low-stock-peek',
        4500,
      );
    };

    const interval = setInterval(peek, 60000);
    return () => clearInterval(interval);
    // triggerSpeech is recreated each render and is deliberately not a dependency,
    // matching the other ambient behaviours in this file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, isSleepingState, isMorningBathing, boxStage, isManagerEnabled, store, overrideMood, message, tapCount]);
  useEffect(() => {
    if (externalMessage) {
      triggerSpeech(externalMessage, externalMessageMood ?? null, externalMessageDuration ?? 3200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessage, externalMessageKey]);
  // Confetti trigger
  const triggerConfetti = () => {
    const colors = ['#FBBF24', '#F43F5E', '#10B981', '#3B82F6', '#8B5CF6'];
    const newConfetti = Array.from({ length: 15 }).map((_, i) => ({
      id: Math.random(),
      x: (Math.random() - 0.5) * 80,
      y: -20 - Math.random() * 40,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    setConfetti(newConfetti);
    setTimeout(() => setConfetti([]), 1500);
  };
  const sayRandomSleepLine = () => {
    const lines = isClosingTime
      ? [
          "Shh, the store's closed right now. I'm resting too. 😴",
          "It's outside opening hours — catching some sleep. See you when we're open!",
          "Store's closed, so I'm off the clock too. 💤",
        ]
      : [
          "Just resting for now — I'll be back shortly. 😴",
          "Taking a quick nap. Nudge me again in a bit!",
        ];
    triggerSpeech(lines[Math.floor(Math.random() * lines.length)], 'sleeping', 4000);
  };
  // Normal tap action
  const handleTap = () => {
    resetInactivity();

    // Disabled in Settings — "wake me up" makes sense here, since the owner
    // can genuinely turn Flow back on.
    if (!isManagerEnabled) {
      triggerSpeech("Please wake me up so we can work together! 🥺", 'sleeping', 4000);
      return;
    }
    // Actually asleep because the store is closed (or it's late) — a
    // different situation, so it gets a different line. Tapping harder
    // doesn't open the shop.
    if (currentMood === 'sleeping') {
      sayRandomSleepLine();
      return;
    }

    // Easter Egg stage progression
    if (boxStage === 3) {
      return;
    }
    if (boxStage === 1) {
      setBoxStage(2);
      triggerSpeech("Crack! 🥚 The egg is splitting! Tap it again!", 'concerned', 2500);
      return;
    }
    if (boxStage === 2) {
      setBoxStage(3);
      
      const prizes = [
        { text: "+2 FLOW 🪙", type: 'game', amount: 2, desc: "Found 2 FLOW in Easter Egg!" },
        { text: "+5 FLOW 🪙", type: 'game', amount: 5, desc: "Found 5 FLOW in Golden Easter Egg!" },
        { text: "Secret Key 🔑", type: 'key' },
        { text: "Shiny Gem 💎", type: 'gem' },
        { text: "Lucky Wrench 🔧", type: 'wrench' },
        { text: "Golden Star ⭐", type: 'star' }
      ];
      const prize = prizes[Math.floor(Math.random() * prizes.length)];
      
      if (prize.type === 'game' && prize.amount) {
        try {
          addFlowReward(prize.amount, 'game', prize.desc || 'Mascot Easter Egg Reward');
        } catch (e) {
          // ignore anti-cheat rate-limiting
        }
      }
      
      setFloatingReward(prize.text);
      triggerSpeech(`Awesome! You broke the egg and found a ${prize.text}! 🎁✨`, 'celebrating', 4000);
      triggerConfetti();
      
      setTimeout(() => {
        setBoxStage(0);
        setFloatingReward(null);
        setTapCount(0);
      }, 3500);
      return;
    }

    const now = Date.now();
    const isRapid = now - lastTapTime.current < 1500;
    lastTapTime.current = now;

    // 2. Pat required mode
    if (patRequired) {
      setPatRequired(false);
      triggerConfetti();
      setFloatingReward("+0.1 FLOW");
      setTimeout(() => setFloatingReward(null), 1500);
      const responses = ["Thank you!", "I knew it!", "Who's smart? 🧠"];
      triggerSpeech(responses[Math.floor(Math.random() * responses.length)], 'happy', 2500);
      setTapCount(0);
      return;
    }

    // 3. Rapid tap poking mode
    if (isRapid) {
      const nextCount = tapCount + 1;
      setTapCount(nextCount);

      if (nextCount === 5) {
        setIsSwelling(true);
        triggerSpeech("You want to know what I can do?", 'angry', 2000);
        setTimeout(() => {
          setIsSwelling(false);
          setShowFlash(true);
          setTimeout(() => setShowFlash(false), 200);
          triggerSpeech("Say cheese! 📸", 'excited', 3000);
          setShowPrintedPhoto(true);
          setTimeout(() => {
            setOverrideMood('happy');
            triggerSpeech("A picture of you! Haha! Beautiful! 😊", 'happy', 3000);
          }, 2000);
          setTimeout(() => {
            setShowPrintedPhoto(false);
            setOverrideMood(null);
          }, 7500);
        }, 1500);
      }

      if (nextCount === 12) {
        setBoxStage(1);
        triggerSpeech("Whoa! You tapped me so much my storage vault popped open! 😲 Look, an egg!", 'happy', 4000);
        return;
      }

      // Edge-aware dodging animations
      if (nextCount >= 3 && nextCount < 20) {
        const options = ['dodge-spin'];
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const margin = 60; // Pixels from viewport edges
          if (rect.left > margin) {
            options.push('dodge-left');
          }
          if (rect.right < window.innerWidth - margin) {
            options.push('dodge-right');
          }
        } else {
          options.push('dodge-left', 'dodge-right');
        }
        const chosen = options[Math.floor(Math.random() * options.length)];
        setDodgeClass(chosen);
        setTimeout(() => setDodgeClass(''), 300);
      }

      if (nextCount >= 3 && nextCount <= 5) {
        triggerSpeech("Stop poking me!", 'angry', 2000);
      } else if (nextCount >= 6 && nextCount <= 9) {
        triggerSpeech("Hey! I'm trying to think!", 'angry', 2000);
      } else if (nextCount >= 10 && nextCount <= 14) {
        triggerSpeech("You're enjoying this, aren't you?", 'worried', 2000);
      } else if (nextCount >= 15 && nextCount <= 19) {
        setDodgeClass('dodge-hide');
        setTimeout(() => setDodgeClass(''), 600);
        triggerSpeech("Catch me if you can! 💨", 'happy', 2000);
      } else if (nextCount === 20) {
        triggerSpeech("Okay okay, you found the secret. 🤫", 'confident', 3000);
      } else if (nextCount === 50) {
        setSunglassesEasterEgg(true);
        triggerSpeech("Cool factor +100! 😎", 'confident', 4000);
        setTimeout(() => setSunglassesEasterEgg(false), 8000);
      } else if (nextCount === 100) {
        triggerSpeech("Achievement unlocked: Professional Flow Annoyer! 🏆", 'celebrating', 4000);
        setFloatingReward("+1 FLOW");
        triggerConfetti();
        setTimeout(() => setFloatingReward(null), 2000);
        setTapCount(0);
      }
      return;
    }

    // Reset tap count if slow tap
    setTapCount(1);

    // 4. Morning/bath routine check (10% chance to show shower)
    if (Math.random() < 0.10) {
      triggerSpeech("Just taking a quick shower to get ready for work! 🧼🚿", 'bathing', 4500);
      return;
    }

    // Pat prompt randomly (8% chance)
    if (Math.random() < 0.08) {
      setPatRequired(true);
      triggerSpeech("I was right. Give me a pat! 👋", 'happy', 4000);
      return;
    }

    // Standard tap response
    let singleTaps = [
      { text: "Hey! 👋", mood: 'happy' as MascotMood },
      { text: "That tickles! 😄", mood: 'happy' as MascotMood },
      { text: "I'm working! 📊", mood: 'thinking' as MascotMood },
      { text: "Need something?", mood: 'idle' as MascotMood },
      { text: "Flow is online & offline! 🔌", mood: 'confident' as MascotMood }
    ];

    if (currentUserRole === 'owner') {
      singleTaps = [
        { text: "Yes, Boss? Ready to scale this business? 👑", mood: 'confident' as MascotMood },
        { text: "Profits are looking good! Keep up the great work! 💰📈", mood: 'happy' as MascotMood },
        { text: "Your store health is currently doing well. Let's aim higher! 🌟", mood: 'happy' as MascotMood },
        { text: "Need to check sensitive backup files or settings? 🔒", mood: 'thinking' as MascotMood },
        { text: "I'm analyzing our margins right now, Boss! 📊", mood: 'thinking' as MascotMood }
      ];
    } else if (currentUserRole === 'manager') {
      singleTaps = [
        { text: "How can I help you manage the store today? 📋", mood: 'idle' as MascotMood },
        { text: "Let's check for any low stock warnings! ⚠️📦", mood: 'concerned' as MascotMood },
        { text: "Ensure staff shifts are running smoothly! 🚀", mood: 'confident' as MascotMood },
        { text: "Restock orders are ready to be verified! 📝", mood: 'thinking' as MascotMood }
      ];
    } else if (currentUserRole === 'cashier') {
      singleTaps = [
        { text: "Ready to checkout the next order? 🛒💵", mood: 'happy' as MascotMood },
        { text: "Remember to verify payments carefully! 💳", mood: 'concerned' as MascotMood },
        { text: "Let's record high sales today! 💸✨", mood: 'confident' as MascotMood },
        { text: "Need to check the drawer balance? 🏦", mood: 'thinking' as MascotMood }
      ];
    } else if (currentUserRole === 'inventory') {
      singleTaps = [
        { text: "Let's count some stock! 📦", mood: 'happy' as MascotMood },
        { text: "Low stock items need our attention! ⚠️", mood: 'concerned' as MascotMood },
        { text: "Are all supplier invoices recorded? 📝", mood: 'thinking' as MascotMood },
        { text: "Keep the shelves full! 🛒", mood: 'confident' as MascotMood }
      ];
    } else if (currentUserRole === 'accountant') {
      singleTaps = [
        { text: "Ready to balance the expenses? 💸📉", mood: 'thinking' as MascotMood },
        { text: "Let's review the profit margins! 📊", mood: 'confident' as MascotMood },
        { text: "Let's check outstanding balances! 💳", mood: 'concerned' as MascotMood }
      ];
    } else if (currentUserRole === 'supervisor') {
      singleTaps = [
        { text: "Monitoring staff activities closely! 🔎", mood: 'thinking' as MascotMood },
        { text: "Let's review overall store health metrics! 📊", mood: 'confident' as MascotMood },
        { text: "Cashier shifts look active today! 🌟", mood: 'happy' as MascotMood }
      ];
    }

    // Notification Awareness — if store has unread notifications, prioritize alerting user
    const unreadNotifs = (store?.flowNotifications || []).filter(n => !n.read);
    if (unreadNotifs.length > 0) {
      const topNotif = unreadNotifs[0];
      const notifMood: MascotMood = topNotif.tone === 'danger' ? 'concerned' : topNotif.tone === 'warning' ? 'warning' : 'excited';
      singleTaps.unshift(
        { text: `You have ${unreadNotifs.length} unread store notification${unreadNotifs.length > 1 ? 's' : ''}! 🔔 Tap the bell icon to check.`, mood: 'excited' as MascotMood },
        { text: `Alert: ${topNotif.title || topNotif.text}`, mood: notifMood }
      );
    }

    const picked = singleTaps[Math.floor(Math.random() * singleTaps.length)];
    triggerSpeech(picked.text, picked.mood, 2500);
  };
  // Long press triggers
  const handlePressStart = () => {
    resetInactivity();
    setIsLongPressed(false);
    longPressTimeout.current = setTimeout(() => {
      setIsLongPressed(true);
      const responses = ["Personal space... 🫣", "What are you doing? 🤨", "This is awkward."];
      triggerSpeech(responses[Math.floor(Math.random() * responses.length)], 'concerned', 3000);
    }, 800);
  };
  const handlePressEnd = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    if (!isLongPressed) {
      handleTap();
    }
  };
  // Eye positioning offset based on look direction or activity
  const eyeOffsetClass = 
    activity === 'staring-phone' ? 'translate-x-[1.2px] translate-y-[0.8px]' :
    activity === 'reading-book' ? 'translate-y-[1.2px]' :
    posture === 'look-left' ? 'translate-x-[-1.5px]' : 
    posture === 'look-right' ? 'translate-x-[1.5px]' : '';
  // SVG components based on mood
  const eyeShape = currentMood === 'angry' ? (
    <g className={eyeOffsetClass} style={{ transformOrigin: 'center 33px' }}>
      <line x1="16" y1="27" x2="25" y2="31" stroke="#0b0b12" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="48" y1="27" x2="39" y2="31" stroke="#0b0b12" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="23" cy="33" r="3.2" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.2" fill="#0b0b12" />
    </g>
  ) : isTalking ? (
    <g className={eyeOffsetClass} style={{ transformOrigin: 'center 33px' }}>
      <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
      <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
    </g>
  ) : currentMood === 'sleeping' ? (
    <>
      <path d="M20 35 q3 -3 6 0" stroke="#0b0b12" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <path d="M38 35 q3 -3 6 0" stroke="#0b0b12" strokeWidth="2.8" fill="none" strokeLinecap="round" />
    </>
  ) : currentMood === 'confident' ? (
    <>
      {/* Sunglasses */}
      <path d="M16 30 h12 v5 c0 3.5 -2.5 6.5 -6 6.5 h-1 c-3.5 0 -6 -3 -6 -6.5 z" fill="#0b0b12" />
      <path d="M36 30 h12 v5 c0 3.5 -2.5 6.5 -6 6.5 h-1 c-3.5 0 -6 -3 -6 -6.5 z" fill="#0b0b12" />
      <line x1="28" y1="32" x2="36" y2="32" stroke="#0b0b12" strokeWidth="2.5" />
      <line x1="18" y1="32" x2="22" y2="36" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="38" y1="32" x2="42" y2="36" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </>
  ) : currentMood === 'concerned' || currentMood === 'warning' || currentMood === 'worried' ? (
    <g className={`${animate ? "animate-[eye-blink_4.5s_infinite]" : ""} ${eyeOffsetClass}`} style={{ transformOrigin: 'center 33px' }}>
      <line x1="17" y1="26" x2="25" y2="29" stroke="#0b0b12" strokeWidth="2" strokeLinecap="round" />
      <line x1="47" y1="26" x2="39" y2="29" stroke="#0b0b12" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
      <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
    </g>
  ) : currentMood === 'happy' || currentMood === 'celebrating' ? (
    <g className={`${animate ? "animate-[eye-blink_4.5s_infinite]" : ""} ${eyeOffsetClass}`} style={{ transformOrigin: 'center 33px' }}>
      <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
      <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
    </g>
  ) : currentMood === 'resting' ? (
    <g className={`${animate ? "animate-[eye-blink_4.5s_infinite]" : ""} ${eyeOffsetClass}`} style={{ transformOrigin: 'center 33px' }}>
      {/* Calm, open eyes for resting */}
      <circle cx="23" cy="34" r="3.2" fill="#0b0b12" />
      <circle cx="41" cy="34" r="3.2" fill="#0b0b12" />
      <circle cx="22" cy="32.8" r="0.8" fill="#ffffff" />
      <circle cx="40" cy="32.8" r="0.8" fill="#ffffff" />
      {/* Relaxed eyelids */}
      <path d="M18 30.5 q5 -1.5 10 0" stroke="#0b0b12" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M36 30.5 q5 -1.5 10 0" stroke="#0b0b12" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
    </g>
  ) : currentMood === 'bathing' ? (
    <>
      {/* Closed eyes, happy squint arches under shower */}
      <path d="M18 35 q5 3 10 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M36 35 q5 3 10 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ) : currentMood === 'yawn-stretch' ? (
    <g style={{ transformOrigin: 'center 33px' }}>
      <path d="M18 33 q5 -3 10 0" stroke="#0b0b12" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M36 33 q5 -3 10 0" stroke="#0b0b12" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  ) : currentMood === 'offline-umbrella' ? (
    <g className={`${animate ? "animate-[eye-blink_4.5s_infinite]" : ""} ${eyeOffsetClass}`} style={{ transformOrigin: 'center 33px' }}>
      <circle cx="23" cy="34" r="3.2" fill="#0b0b12" />
      <circle cx="41" cy="34" r="3.2" fill="#0b0b12" />
      <circle cx="22" cy="32.8" r="0.8" fill="#ffffff" />
      <circle cx="40" cy="32.8" r="0.8" fill="#ffffff" />
    </g>
  ) : (
    <g className={`${animate ? "animate-[eye-blink_4.5s_infinite]" : ""} ${eyeOffsetClass}`} style={{ transformOrigin: 'center 33px' }}>
      <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
      <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
    </g>
  );
  const mouth = currentMood === 'angry' ? (
    <path d="M24 44 q8 -4 16 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  ) : isMouthTalking ? (
    <path 
      d="M22 41 q10 8 20 0" 
      stroke="#0b0b12" 
      strokeWidth="3.2" 
      fill="none" 
      strokeLinecap="round" 
      className="animate-[mouth-talk_0.15s_infinite_alternate]"
      style={{ transformOrigin: '32px 41px' }}
    />
  ) : currentMood === 'warning' || currentMood === 'concerned' || currentMood === 'worried' ? (
    <path d="M26 43 q6 -3 12 0" stroke="#0b0b12" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  ) : currentMood === 'bathing' ? (
    /* Cute bubble-blowing round mouth */
    <circle cx="32" cy="42" r="2.8" stroke="#0b0b12" strokeWidth="2" fill="#ffffff" />
  ) : currentMood === 'yawn-stretch' ? (
    <ellipse cx="32" cy="43" rx="5" ry="6" fill="#0b0b12" />
  ) : currentMood === 'offline-umbrella' ? (
    <path d="M26 41 q6 3 12 0" stroke="#0b0b12" strokeWidth="2" fill="none" strokeLinecap="round" />
  ) : (
    // Default and other stable states use a small calm smile
    <path d="M25 41 q7 4 14 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  );
  const cheeks = (
    <>
      <circle cx="16" cy="37" r="2.2" fill="#f43f5e" opacity="0.6" />
      <circle cx="48" cy="37" r="2.2" fill="#f43f5e" opacity="0.6" />
    </>
  );
  const sweatDrop = null;
  const angryStress = currentMood === 'angry' ? (
    <g stroke="#ef4444" strokeWidth="1.2" fill="none" opacity="0.8">
      <path d="M8 12 l4 4 M12 12 l-4 4" />
      <path d="M56 12 l4 4 M60 12 l-4 4" />
      <text x="32" y="8" fontSize="8" fill="#ef4444" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">#?#</text>
    </g>
  ) : null;
  const renderMascotBody = () => {
    // Determine posture rotation angle / scale
    let bodyTransform = '';
    if (posture === 'tilt-left') bodyTransform = 'rotate(-2.5) translate(-1, 0)';
    else if (posture === 'tilt-right') bodyTransform = 'rotate(2.5) translate(1, 0)';

    const lidTransform = boxStage >= 1 
      ? "translate(-14, -12) rotate(-35deg)" 
      : "";

    const renderEgg = () => {
      if (boxStage === 1) {
        return (
          <g className="animate-bounce" style={{ transformOrigin: '32px 22px' }}>
            <ellipse cx="32" cy="22" rx="9" ry="12" fill="url(#goldEggGrad)" stroke="#d97706" strokeWidth="1.2" />
            <path d="M26 22 q6 -3 12 0" stroke="#ffffff" strokeWidth="0.8" fill="none" opacity="0.6" />
            <circle cx="30" cy="17" r="1.5" fill="#ffffff" opacity="0.8" />
          </g>
        );
      }
      if (boxStage === 2) {
        return (
          <g style={{ transformOrigin: '32px 22px' }}>
            <ellipse cx="32" cy="22" rx="9" ry="12" fill="url(#goldEggGrad)" stroke="#d97706" strokeWidth="1.2" />
            <path d="M32 10 l-2 5 l4 3 l-3 4 l2 2" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="30" cy="17" r="1.5" fill="#ffffff" opacity="0.8" />
          </g>
        );
      }
      if (boxStage === 3) {
        return (
          <g opacity="0.8">
            <path d="M32 10 l-2 5 l4 3 l-3 4 l2 2 h-11 v-14 z" fill="url(#goldEggGrad)" stroke="#d97706" strokeWidth="1" className="animate-[shatter-left_0.5s_forwards]" style={{ transformOrigin: '28px 22px' }} />
            <path d="M32 10 l-2 5 l4 3 l-3 4 l2 2 h11 v-14 z" fill="url(#goldEggGrad)" stroke="#d97706" strokeWidth="1" className="animate-[shatter-right_0.5s_forwards]" style={{ transformOrigin: '36px 22px' }} />
          </g>
        );
      }
      return null;
    };

    const bodyContent = activeTheme === 'blue' ? (
      <g transform={bodyTransform} style={{ transformOrigin: '32px 37px' }}>
        <ellipse cx="32" cy="52" rx="20" ry="4" fill="black" opacity="0.2" />
        <rect x="12" y="24" width="40" height="26" rx="6" fill="#1e40af" stroke="#172554" strokeWidth="1.5" />
        <g opacity="0.8" transform="translate(14, 38) scale(0.6)">
          <path d="M2 2 h8 v2.5 l-3 3 v4.5 h2 v1.5 h-6 v-1.5 h2 v-4.5 l-3 -3 z" fill="#ffffff" />
        </g>
        
        {renderEgg()}
        
        <g transform={lidTransform} style={{ transformOrigin: '10px 26px', transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <rect x="10" y="14" width="44" height="12" rx="4" fill="#2563eb" stroke="#172554" strokeWidth="1.5" />
          <rect x="26" y="14" width="12" height="12" fill="#ffffff" />
          <text x="32" y="24" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="11" fontWeight="900" textAnchor="middle" fill="#eab308">F</text>
          <rect x="29" y="23" width="6" height="4" rx="1" fill="#eab308" stroke="#172554" strokeWidth="0.8" />
        </g>
      </g>
    ) : activeTheme === 'forest' ? (
      <g transform={bodyTransform} style={{ transformOrigin: '32px 37px' }}>
        <ellipse cx="32" cy="52" rx="20" ry="4" fill="black" opacity="0.2" />
        <rect x="12" y="24" width="40" height="26" rx="6" fill="#15803d" stroke="#14532d" strokeWidth="1.5" />
        <g opacity="0.8" transform="translate(15, 36) scale(0.7)">
          <rect x="1" y="8" width="2" height="4" fill="#4ade80" />
          <rect x="4" y="6" width="2" height="6" fill="#4ade80" />
          <rect x="7" y="3" width="2" height="9" fill="#4ade80" />
        </g>
        
        {renderEgg()}
        
        <g transform={lidTransform} style={{ transformOrigin: '10px 26px', transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <rect x="10" y="14" width="44" height="12" rx="4" fill="#16a34a" stroke="#14532d" strokeWidth="1.5" />
          <rect x="26" y="14" width="12" height="12" fill="#22c55e" />
          <text x="32" y="24" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="11" fontWeight="900" textAnchor="middle" fill="#ffffff">F</text>
          <rect x="29" y="23" width="6" height="4" rx="1" fill="#eab308" stroke="#14532d" strokeWidth="0.8" />
        </g>
      </g>
    ) : (
      <g transform={bodyTransform} style={{ transformOrigin: '32px 37px' }}>
        <ellipse cx="32" cy="52" rx="20" ry="4" fill="black" opacity="0.2" />
        <rect x="12" y="24" width="40" height="26" rx="6" fill="#a27b5c" stroke="#3f2305" strokeWidth="1.5" />
        <g opacity="0.8" transform="translate(15, 36) scale(0.7)">
          <rect x="1" y="2" width="8" height="8" stroke="#ffffff" strokeWidth="1" fill="none" rx="1" />
          <line x1="1" y1="6" x2="9" y2="6" stroke="#ffffff" strokeWidth="0.8" />
        </g>
        
        {renderEgg()}
        
        <g transform={lidTransform} style={{ transformOrigin: '10px 26px', transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <rect x="10" y="14" width="44" height="12" rx="4" fill="#bd9a7a" stroke="#3f2305" strokeWidth="1.5" />
          <rect x="26" y="14" width="12" height="12" fill="#ffffff" />
          <text x="32" y="24" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="11" fontWeight="900" textAnchor="middle" fill="#f97316">F</text>
          <rect x="29" y="23" width="6" height="4" rx="1" fill="#f97316" stroke="#3f2305" strokeWidth="0.8" />
        </g>
      </g>
    );

    // If angry, render crossed arms overlay path
    return (
      <g>
        {bodyContent}
        {currentMood === 'angry' && (
          <path d="M18 43 h28 M20 45.5 h24" stroke="#0b0b12" strokeWidth="2.8" strokeLinecap="round" />
        )}
      </g>
    );
  };
  const getGlowFilter = () => {
    switch (currentMood) {
      case 'excited': return 'glow-excited';
      case 'happy': case 'celebrating': return 'glow-gold';
      case 'offline-umbrella': return 'glow-sleep opacity-90';
      case 'yawn-stretch': return 'glow-sleep';
      case 'concerned': case 'worried': return 'glow-worried';
      case 'angry': return 'glow-angry';
      case 'sleeping': return 'glow-sleep';
      case 'resting': return 'glow-sleep';
      case 'bathing': return 'glow-sleep opacity-80';
      default: return 'glow-gold opacity-80';
    }
  };
  const animClass = !animate ? '' :
    activity === 'soccer-ball' ? 'animate-[mascot-soccer-kick_7s_forwards_ease-in-out]' :
    currentMood === 'sleeping' ? '' :
    currentMood === 'bathing' ? 'mascot-bath-anim' :
    currentMood === 'thinking' ? 'mascot-think-anim' :
    currentMood === 'yawn-stretch' ? 'mascot-yawn-anim' :
    currentMood === 'offline-umbrella' ? 'mascot-float-anim' :
    currentMood === 'worried' || currentMood === 'concerned' ? 'mascot-worried-anim' :
    currentMood === 'angry' ? 'mascot-angry-anim' :
    '';
  const walkClass = 
    activity === 'walking-off-left' ? 'animate-walk-left' :
    activity === 'walking-off-right' ? 'animate-walk-right' : '';
  const swellStyle = isSwelling 
    ? { transform: 'scale(1.5)', zIndex: 100, transition: 'transform 1.5s ease-out' } 
    : { transition: 'transform 2.5s ease-in-out' };
  const isWalkingOff = activity === 'walking-off-left' || activity === 'walking-off-right';
  // Over the top on his way out, not underneath it. zIndex 0 here was half of
  // why leaving looked like sinking into the background.
  const walkZIndexStyle = isWalkingOff ? { zIndex: 60 } : {};

  return {
    size,
    mood,
    className,
    animate,
    store,
    role,
    externalMessage,
    externalMessageKey,
    externalMessageMood,
    externalMessageDuration,
    activeTheme,
    setActiveTheme,
    overrideMood,
    setOverrideMood,
    message,
    setMessage,
    dodgeClass,
    setDodgeClass,
    tapCount,
    setTapCount,
    patRequired,
    setPatRequired,
    floatingReward,
    setFloatingReward,
    isSleeping,
    setIsSleeping,
    sunglassesEasterEgg,
    setSunglassesEasterEgg,
    confetti,
    setConfetti,
    posture,
    setPosture,
    storeClosingTime,
    setStoreClosingTime,
    storeOpeningTime,
    setStoreOpeningTime,
    isManagerEnabled,
    setIsManagerEnabled,
    currentUserRole,
    setCurrentUserRole,
    bubbleShiftX,
    setBubbleShiftX,
    bubblePosition,
    setBubblePosition,
    bubbleShiftY,
    setBubbleShiftY,
    bubbleRef,
    busyUntilRef,
    isMouthTalking,
    setIsMouthTalking,
    lastSalesCountRef,
    isSwelling,
    setIsSwelling,
    showFlash,
    setShowFlash,
    showPrintedPhoto,
    setShowPrintedPhoto,
    isWearingGlasses,
    setIsWearingGlasses,
    isBreathingAir,
    setIsBreathingAir,
    activity,
    setActivity,
    wakeOverride,
    setWakeOverride,
    boxStage,
    setBoxStage,
    wakeOverrideTimeout,
    longPressTimeout,
    isLongPressed,
    setIsLongPressed,
    messageTimeout,
    mouthTimeout,
    lastTapTime,
    inactivityTimer,
    containerRef,
    lastNotifCountRef,
    isInitialSalesLoadRef,
    nowTime,
    currentHours,
    currentMinutes,
    currentMinutesTotal,
    isClosingTime,
    resetInactivity,
    isTalking,
    isBeside,
    isSleepingState,
    isMorningBathing,
    currentMood,
    triggerSpeech,
    triggerConfetti,
    sayRandomSleepLine,
    handleTap,
    handlePressStart,
    handlePressEnd,
    eyeOffsetClass,
    eyeShape,
    mouth,
    cheeks,
    sweatDrop,
    angryStress,
    renderMascotBody,
    getGlowFilter,
    animClass,
    walkClass,
    swellStyle,
    isWalkingOff,
    walkZIndexStyle,
  };
}

export type MascotState = ReturnType<typeof useMascot>;
