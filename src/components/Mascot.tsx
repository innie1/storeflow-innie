import { useState, useEffect, useRef } from 'react';
import { loadStore } from '@/lib/store-data';
import { addFlowReward } from '@/lib/flow-memory';
import { 
  CircleDollarSign, 
  TrendingUp, 
  Package, 
  ShoppingCart,
  Lock
} from 'lucide-react';

// Flow — StoreFlow's interactive mascot.
// Pure SVG + CSS animations, offline-friendly, highly responsive.

export type MascotMood =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'warning'
  | 'celebrating'
  | 'sleeping'
  | 'confident'
  | 'neutral'
  | 'concerned'
  | 'worried'
  | 'angry'
  | 'panic'
  | 'resting'
  | 'bathing';

interface MascotProps {
  size?: number;
  mood?: MascotMood;
  className?: string;
  animate?: boolean;
}

export default function Mascot({ size = 64, mood = 'idle', className = '', animate = true }: MascotProps) {
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
  const [bubbleShiftX, setBubbleShiftX] = useState<number>(0);
  const [isMouthTalking, setIsMouthTalking] = useState(false);

  // Occasional activity state
  const [activity, setActivity] = useState<'soccer-ball' | 'drinking-water' | 'shaking-clock' | 'staring-phone' | 'reading-book' | 'listening-music' | 'walking-off-left' | 'walking-off-right' | null>(null);

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

  // Sleep inactivity timer (45 seconds of no user mascot interaction)
  const resetInactivity = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    
    if (isSleeping) {
      setIsSleeping(false);
      triggerSpeech("Welcome back! I missed the store.", 'happy');
    }
    
    inactivityTimer.current = setTimeout(() => {
      setIsSleeping(true);
    }, 45000);
  };

  useEffect(() => {
    resetInactivity();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (wakeOverrideTimeout.current) clearTimeout(wakeOverrideTimeout.current);
    };
  }, [isSleeping]);


  // Fetch active store hours dynamically
  useEffect(() => {
    const fetchHours = () => {
      try {
        const raw = localStorage.getItem('storeflow_session');
        if (raw) {
          const session = JSON.parse(raw);
          const code = session.accessCode;
          if (code) {
            const activeStore = loadStore(code);
            if (activeStore) {
              setStoreClosingTime(activeStore.profile?.closingTime || null);
              setStoreOpeningTime(activeStore.profile?.openingTime || null);
              setIsManagerEnabled(activeStore.managerSettings?.enabled !== false);
              return;
            }
          }
        }
      } catch (e) {
        // ignore
      }
      setStoreClosingTime(null);
      setStoreOpeningTime(null);
      setIsManagerEnabled(true);
    };
    
    fetchHours();
    const interval = setInterval(fetchHours, 5000);
    return () => clearInterval(interval);
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

  // Edge-aware speech bubble shift calculation
  useEffect(() => {
    if (message && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const bubbleWidth = 170; // Midpoint of min-w (130px) and max-w (210px)
      const padding = 16; // Edge safety offset
      
      let shiftX = 0;
      
      const absoluteLeft = rect.left + rect.width / 2 - bubbleWidth / 2;
      const absoluteRight = rect.left + rect.width / 2 + bubbleWidth / 2;
      
      if (absoluteLeft < padding) {
        shiftX = padding - absoluteLeft;
      } else if (absoluteRight > window.innerWidth - padding) {
        shiftX = (window.innerWidth - padding) - absoluteRight;
      }
      
      setBubbleShiftX(shiftX);
    } else {
      setBubbleShiftX(0);
    }
  }, [message]);

  const isTalking = !!message;

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

  const isSleepingState = (isSleeping || isClosingTime) && !isTalking && !wakeOverride;
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

  // Handle posturing shifts (look around/tilt) when not sleeping/resting/bathing
  useEffect(() => {
    if (currentMood === 'sleeping' || currentMood === 'resting' || currentMood === 'bathing' || activity) {
      setPosture('normal');
      return;
    }
    const interval = setInterval(() => {
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
      if (overrideMood || message || tapCount > 0) return;

      // 45% chance to trigger a random activity
      if (Math.random() < 0.45) {
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
          
          const speechOptions = [
            "Be right back! Checking the warehouse! 🏃‍♂️",
            "Taking a quick stretch break off-screen! 🚪💨",
            "Checking on the suppliers real quick... 📦",
            "BRB! Checking if the door is locked... 🔒💨"
          ];
          triggerSpeech(speechOptions[Math.floor(Math.random() * speechOptions.length)], 'happy', 4500);

          setTimeout(() => {
            setActivity(null);
          }, 5000);
        } else {
          setActivity(chosen);
          
          if (chosen === 'soccer-ball') {
            const speech = ["Watch my heading skills! ⚽🕺", "Heading time! Goaaal! 🥅⚽", "Pogo bounce! ⚽💥"];
            triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'happy', 3500);
            setOverrideMood('happy');
          } else if (chosen === 'drinking-water') {
            const speech = ["Stay hydrated! 🥤💦", "Gotta drink water... 🥛", "Refresh break! 💧😎"];
            triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'happy', 3500);
            setOverrideMood('happy');
          } else if (chosen === 'shaking-clock') {
            const speech = ["Time is money! Let's make sales! ⏰💵", "Shake it up! Store hours are active! ⏳⏰", "Ring ring! High sales time! 🔔"];
            triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'excited', 3500);
            setOverrideMood('excited');
          } else if (chosen === 'staring-phone') {
            const speech = ["Checking incoming WhatsApp requests... 📲👀", "Staring at my phone... any new orders? 📱", "Browsing inventory sheets... 📊📱"];
            triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'thinking', 3500);
            setOverrideMood('thinking');
          } else if (chosen === 'reading-book') {
            const speech = ["Reading 'How to scale a retail store'! 📖🧠", "Learning some new marketing tricks... 📚🤓", "Studying our sales analytics! 📈📖"];
            triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'thinking', 3500);
            setOverrideMood('thinking');
          } else if (chosen === 'listening-music') {
            const speech = ["Vibing to some retail jams! 🎧🎶", "Music makes restocking faster! 🎵🔥", "Listening to my favorite beats! 🎧🕺"];
            triggerSpeech(speech[Math.floor(Math.random() * speech.length)], 'happy', 3500);
            setOverrideMood('happy');
          }

          setTimeout(() => {
            setActivity(null);
            setOverrideMood(null);
          }, 4000);
        }
      }
    }, 28000);

    return () => clearInterval(interval);
  }, [animate, isSleepingState, isMorningBathing, boxStage, overrideMood, message, tapCount]);


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

  // Normal tap action
  const handleTap = () => {
    resetInactivity();

    // 1. Manager disabled prompt
    if (!isManagerEnabled) {
      triggerSpeech("Hey! Can you turn me on so we can work together? 🥺", 'sleeping', 4000);
      return;
    }

    // Waking up from sleep check
    if (currentMood === 'sleeping') {
      setWakeOverride(true);
      if (wakeOverrideTimeout.current) clearTimeout(wakeOverrideTimeout.current);
      wakeOverrideTimeout.current = setTimeout(() => {
        setWakeOverride(false);
      }, 40000); // 40 seconds awake period
      triggerSpeech("Yawn... Okay, okay, I'm awake! Let's do some work. 🥱☕", 'happy', 4000);
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
    const singleTaps = [
      { text: "Hey! 👋", mood: 'happy' as MascotMood },
      { text: "That tickles! 😄", mood: 'happy' as MascotMood },
      { text: "I'm working! 📊", mood: 'thinking' as MascotMood },
      { text: "Need something?", mood: 'idle' as MascotMood },
      { text: "Yes boss? 🫡", mood: 'confident' as MascotMood },
      { text: "Flow is online & offline! 🔌", mood: 'confident' as MascotMood },
      { text: "Careful with the inventory!", mood: 'concerned' as MascotMood }
    ];
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
  const eyeShape = isTalking ? (
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
  ) : currentMood === 'angry' ? (
    <g className={eyeOffsetClass} style={{ transformOrigin: 'center 33px' }}>
      <line x1="16" y1="27" x2="25" y2="31" stroke="#0b0b12" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="48" y1="27" x2="39" y2="31" stroke="#0b0b12" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="23" cy="33" r="3.2" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.2" fill="#0b0b12" />
    </g>
  ) : currentMood === 'panic' ? (
    <g style={{ transformOrigin: 'center 33px' }}>
      <circle cx="23" cy="32" r="5" fill="none" stroke="#0b0b12" strokeWidth="2" />
      <circle cx="23" cy="32" r="1.8" fill="#0b0b12" />
      <circle cx="41" cy="32" r="5" fill="none" stroke="#0b0b12" strokeWidth="2" />
      <circle cx="41" cy="32" r="1.8" fill="#0b0b12" />
    </g>
  ) : currentMood === 'happy' || currentMood === 'celebrating' ? (
    <g style={{ transformOrigin: 'center 33px' }}>
      <path d="M18 35 q5 -5 10 0" stroke="#0b0b12" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M36 35 q5 -5 10 0" stroke="#0b0b12" strokeWidth="3" fill="none" strokeLinecap="round" />
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
  ) : (
    <g className={`${animate ? "animate-[eye-blink_4.5s_infinite]" : ""} ${eyeOffsetClass}`} style={{ transformOrigin: 'center 33px' }}>
      <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
      <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
      <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
    </g>
  );

  const mouth = isMouthTalking ? (
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
  ) : currentMood === 'sleeping' ? (
    <path d="M28 43 h8" stroke="#0b0b12" strokeWidth="2.2" strokeLinecap="round" />
  ) : currentMood === 'celebrating' || currentMood === 'happy' || currentMood === 'confident' ? (
    <path d="M22 41 q10 8 20 0" stroke="#0b0b12" strokeWidth="3" fill="none" strokeLinecap="round" />
  ) : currentMood === 'angry' ? (
    <path d="M24 44 q8 -4 16 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  ) : currentMood === 'panic' ? (
    <ellipse cx="32" cy="43" rx="4" ry="5" fill="#0b0b12" />
  ) : currentMood === 'resting' ? (
    <path d="M26 43 h12" stroke="#0b0b12" strokeWidth="2.2" strokeLinecap="round" />
  ) : currentMood === 'bathing' ? (
    /* Cute bubble-blowing round mouth */
    <circle cx="32" cy="42" r="2.8" stroke="#0b0b12" strokeWidth="2" fill="#ffffff" />
  ) : (
    <path d="M25 41 q7 4 14 0" stroke="#0b0b12" strokeWidth="2" fill="none" strokeLinecap="round" />
  );

  const cheeks = (
    <>
      <circle cx="16" cy="37" r="2.2" fill="#f43f5e" opacity="0.6" />
      <circle cx="48" cy="37" r="2.2" fill="#f43f5e" opacity="0.6" />
    </>
  );

  const sweatDrop = currentMood === 'panic' ? (
    <path d="M50 22 q-2.5 3 0 5.5 q2.5 -2.5 0 -5.5" fill="#38bdf8" className="animate-bounce" />
  ) : null;

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
    if (posture === 'tilt-left') bodyTransform = 'rotate(-2.5) translate(-1px, 0)';
    else if (posture === 'tilt-right') bodyTransform = 'rotate(2.5) translate(1px, 0)';

    const lidTransform = boxStage >= 1 
      ? "translate(-14px, -12px) rotate(-35deg)" 
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
      case 'thinking': return 'glow-gold opacity-90';
      case 'concerned': case 'worried': return 'glow-worried';
      case 'angry': return 'glow-angry';
      case 'panic': return 'glow-panic';
      case 'sleeping': return 'glow-sleep';
      case 'resting': return 'glow-sleep';
      case 'bathing': return 'glow-sleep opacity-80';
      default: return 'glow-gold opacity-80';
    }
  };

  const animClass = !animate ? '' :
    activity === 'soccer-ball' ? 'animate-[mascot-heading_0.8s_infinite_ease-in-out]' :
    currentMood === 'sleeping' ? 'mascot-float-anim' :
    currentMood === 'resting' ? 'mascot-rest-anim' :
    currentMood === 'bathing' ? 'mascot-bath-anim' :
    currentMood === 'celebrating' || currentMood === 'excited' ? 'mascot-excited-anim' :
    currentMood === 'thinking' ? 'mascot-think-anim' :
    currentMood === 'happy' ? 'mascot-happy-anim' :
    currentMood === 'worried' || currentMood === 'concerned' ? 'mascot-worried-anim' :
    currentMood === 'angry' ? 'mascot-angry-anim' :
    currentMood === 'panic' ? 'mascot-panic-anim' :
    'mascot-float-anim';

  const walkClass = 
    activity === 'walking-off-left' ? 'animate-walk-left' :
    activity === 'walking-off-right' ? 'animate-walk-right' : '';

  return (
    <div 
      ref={containerRef}
      className={`relative inline-block select-none cursor-pointer duration-300 transition-all ${dodgeClass} ${walkClass} ${className}`}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      style={{ width: size, height: size }}
    >
      <style>{`
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes mascot-rest {
          0%, 25%, 50%, 75%, 100% { transform: translateY(0) scale(1) rotate(0deg); }
          12.5% { transform: translateY(1.5px) scaleY(0.98); }
          37.5% { transform: translateX(-3px) translateY(-1px) rotate(-1.5deg); }
          62.5% { transform: translateY(1px) scaleX(0.99); }
          87.5% { transform: translateY(-2.5px) scaleY(1.02) rotate(2deg); }
        }
        @keyframes mascot-bath {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(1.5px) rotate(1deg) scale(1.02, 0.98); }
        }
        @keyframes mascot-happy {
          0%, 100% { transform: translateY(0) scale(1); }
          40% { transform: translateY(-6px) scale(0.95, 1.05); }
          50% { transform: translateY(-7px) scale(0.92, 1.08); }
          60% { transform: translateY(-5px) scale(1.05, 0.95); }
        }
        @keyframes mascot-excited {
          0% { transform: translateY(0) scale(1) rotate(0deg); }
          20% { transform: translateY(-12px) scale(0.95, 1.05) rotate(0deg); }
          45% { transform: translateY(0) scale(1.1, 0.9) rotate(180deg); }
          70% { transform: translateY(-6px) scale(0.98, 1.02) rotate(360deg); }
          100% { transform: translateY(0) scale(1) rotate(360deg); }
        }
        @keyframes mascot-think {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-3deg) translateY(-1px); }
          75% { transform: rotate(3deg) translateY(-2px); }
        }
        @keyframes mascot-worried {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(-1.5deg); }
        }
        @keyframes mascot-angry {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          15%, 55%, 95% { transform: translate(-2px, 0.5px) rotate(-2deg); }
          35%, 75% { transform: translate(2px, -0.5px) rotate(2deg); }
        }
        @keyframes mascot-panic {
          0%, 100% { transform: translate(0, 0) scale(1); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-3px, 1px) scale(1.03); }
          20%, 40%, 60%, 80% { transform: translate(3px, -1px) scale(0.97); }
        }
        @keyframes eye-blink {
          0%, 95%, 100% { transform: scaleY(1); }
          97.5% { transform: scaleY(0.1); }
        }
        @keyframes float-symbol {
          0%, 100% { transform: translateY(0) scale(0.9); opacity: 0.3; }
          50% { transform: translateY(-8px) scale(1.15); opacity: 0.95; }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes confetti-particle {
          0% { transform: scale(1) translateY(0) rotate(0); opacity: 1; }
          100% { transform: scale(0.4) translateY(45px) rotate(240deg); opacity: 0; }
        }
        @keyframes float-reward {
          0% { transform: translate(-50%, 0); opacity: 0; }
          20% { transform: translate(-50%, -12px); opacity: 1; }
          100% { transform: translate(-50%, -40px); opacity: 0; }
        }
        @keyframes mouth-talk {
          0% { transform: scaleY(0.2); }
          100% { transform: scaleY(1.4); }
        }
        @keyframes float-zzz {
          0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
          20% { opacity: 0.8; }
          100% { transform: translate(-12px, -24px) scale(1.1); opacity: 0; }
        }
        @keyframes shatter-left {
          100% { transform: translate(-8px, 6px) rotate(-35deg); opacity: 0; }
        }
        @keyframes shatter-right {
          100% { transform: translate(8px, 6px) rotate(35deg); opacity: 0; }
        }
        @keyframes shower-stream {
          0% { stroke-dasharray: 2 15; stroke-dashoffset: 0; }
          100% { stroke-dasharray: 6 12; stroke-dashoffset: -30; }
        }
        @keyframes soap-bubble {
          0%, 100% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.15) translate(1px, -1px); }
        }
        @keyframes bubble-float-up {
          0% { transform: translateY(30px) scale(0.5); opacity: 0; }
          30% { opacity: 0.8; }
          100% { transform: translateY(-20px) scale(1.2); opacity: 0; }
        }
        @keyframes walk-off-left {
          0% { transform: translateX(0) scaleX(1); }
          20% { transform: translateX(-200px) scaleX(1); }
          21% { transform: translateX(-200px) scaleX(-1); }
          80% { transform: translateX(-200px) scaleX(-1); }
          100% { transform: translateX(0) scaleX(-1); }
        }
        @keyframes walk-off-right {
          0% { transform: translateX(0) scaleX(-1); }
          20% { transform: translateX(200px) scaleX(-1); }
          21% { transform: translateX(200px) scaleX(1); }
          80% { transform: translateX(200px) scaleX(1); }
          100% { transform: translateX(0) scaleX(1); }
        }
        @keyframes soccer-ball-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-16px); }
        }
        @keyframes drinking-tilt {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-15deg) translateY(-1px); }
        }
        @keyframes clock-vibrate {
          0%, 100% { transform: rotate(0deg) translate(0, 0); }
          25% { transform: rotate(-8deg) translate(-0.5px, -0.5px); }
          75% { transform: rotate(8deg) translate(0.5px, 0.5px); }
        }
        @keyframes book-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-1.5px) rotate(1.5deg); }
        }
        @keyframes float-note {
          0% { transform: translateY(0) scale(0.7); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(-12px) scale(1.1); opacity: 0; }
        }
        @keyframes mascot-heading {
          0%, 100% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-2.5px) scaleY(1.04); }
        }
        .animate-walk-left { animation: walk-off-left 5s ease-in-out forwards; }
        .animate-walk-right { animation: walk-off-right 5s ease-in-out forwards; }
        .animate-zzz-1 { animation: float-zzz 3s ease-in-out infinite; animation-delay: 0s; }
        .animate-zzz-2 { animation: float-zzz 3s ease-in-out infinite; animation-delay: 1s; }
        .animate-zzz-3 { animation: float-zzz 3s ease-in-out infinite; animation-delay: 2s; }
        
        .mascot-float-anim { animation: mascot-float 3s ease-in-out infinite; }
        .mascot-rest-anim { animation: mascot-rest 10s ease-in-out infinite; }
        .mascot-bath-anim { animation: mascot-bath 1.5s ease-in-out infinite alternate; }
        .mascot-happy-anim { animation: mascot-happy 1.2s ease-in-out infinite; }
        .mascot-excited-anim { animation: mascot-excited 1.4s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
        .mascot-think-anim { animation: mascot-think 2s ease-in-out infinite; }
        .mascot-worried-anim { animation: mascot-worried 3.5s ease-in-out infinite; }
        .mascot-angry-anim { animation: mascot-angry 1.5s ease-in-out infinite; }
        .mascot-panic-anim { animation: mascot-panic 0.8s ease-in-out infinite; }
        
        .animate-bounce-subtle { animation: bounce-subtle 2.5s ease-in-out infinite; }
        .animate-confetti-particle { animation: confetti-particle 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards; }
        .animate-float-reward { animation: float-reward 1.5s ease-out forwards; }
        .animate-shower-stream { animation: shower-stream 0.3s linear infinite; }
        .animate-soap-bubble { transform-origin: center; animation: soap-bubble 1s ease-in-out infinite alternate; }
        .animate-bubble-float-1 { transform-origin: 12px 18px; animation: bubble-float-up 2.2s ease-in infinite; }
        .animate-bubble-float-2 { transform-origin: 52px 20px; animation: bubble-float-up 1.8s ease-in infinite; animation-delay: 0.5s; }
        .animate-bubble-float-3 { transform-origin: 32px 16px; animation: bubble-float-up 2s ease-in infinite; animation-delay: 1.1s; }
        
        .glow-gold { filter: drop-shadow(0 0 6px rgba(234, 179, 8, 0.45)); }
        .glow-excited { filter: drop-shadow(0 0 12px rgba(234, 179, 8, 0.8)); }
        .glow-worried { filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.5)); }
        .glow-angry { filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.6)); }
        .glow-panic { filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.85)); }
        .glow-sleep { filter: drop-shadow(0 0 5px rgba(99, 102, 241, 0.25)); }
        
        .dodge-left { transform: translateX(-35px) rotate(-15deg) scale(0.95) !important; transition: transform 0.15s ease-out; }
        .dodge-right { transform: translateX(35px) rotate(15deg) scale(0.95) !important; transition: transform 0.15s ease-out; }
        .dodge-spin { transform: rotate(360deg) scale(1.1) !important; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .dodge-hide { transform: translateY(45px) scale(0) !important; opacity: 0 !important; transition: all 0.3s ease-out; }
      `}</style>

      {/* Floating Confetti */}
      {confetti.map(c => (
        <div
          key={c.id}
          className="absolute pointer-events-none rounded-full animate-confetti-particle"
          style={{
            left: `calc(50% + ${c.x}px)`,
            top: `calc(50% + ${c.y}px)`,
            width: '6px',
            height: '6px',
            backgroundColor: c.color,
            zIndex: 60,
          }}
        />
      ))}

      {/* Floating Reward Text */}
      {floatingReward && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 font-display font-black text-sm text-yellow-400 animate-float-reward z-50 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] whitespace-nowrap">
          {floatingReward}
        </div>
      )}

      {/* Speech Bubble - Screen Boundary Aware */}
      {message && (
        <div 
          className="absolute bottom-full left-1/2 mb-3 z-50 pointer-events-none"
          style={{
            transform: `translateX(calc(-50% + ${bubbleShiftX}px))`,
          }}
        >
          <div className="bg-slate-900 border border-border px-3 py-1.5 rounded-xl text-xs text-foreground font-display font-bold shadow-lg animate-bounce-subtle select-none whitespace-normal text-center min-w-[130px] max-w-[210px]">
            <p className="leading-snug">{message}</p>
            <div 
              className="absolute top-full -mt-1 w-2.5 h-2.5 bg-slate-900 border-r border-b border-border rotate-45" 
              style={{
                left: `calc(50% - ${bubbleShiftX}px)`,
                transform: 'translateX(-50%) rotate(45deg)'
              }}
            />
          </div>
        </div>
      )}

      {/* Floating ZZZs */}
      {currentMood === 'sleeping' && (
        <div className="absolute -top-3 left-[30%] pointer-events-none font-display font-black text-indigo-400 select-none">
          <span className="absolute text-[12px] animate-zzz-1">Z</span>
          <span className="absolute text-[9px] animate-zzz-2" style={{ left: '6px', top: '-4px' }}>Z</span>
          <span className="absolute text-[7px] animate-zzz-3" style={{ left: '12px', top: '-8px' }}>Z</span>
        </div>
      )}

      {/* Thinking Floating Symbols */}
      {currentMood === 'thinking' && (
        <div className="absolute inset-x-0 -top-6 flex justify-center gap-2 pointer-events-none select-none">
          <CircleDollarSign className="w-3.5 h-3.5 text-yellow-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '0s' }} />
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '0.4s' }} />
          <Package className="w-3.5 h-3.5 text-orange-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '0.8s' }} />
          <ShoppingCart className="w-3.5 h-3.5 text-purple-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '1.2s' }} />
        </div>
      )}

      {/* Actual SVG Mascot Graphic */}
      <svg
        width="100%" height="100%" viewBox="0 0 64 64"
        className={`${animClass} ${getGlowFilter()} transition-all duration-300`}
        aria-label={`Flow mascot — ${currentMood}`}
      >
        <defs>
          <linearGradient id="goldEggGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        {sweatDrop}
        {angryStress}

        {/* Occasional Activity Elements */}
        {activity === 'soccer-ball' && (
          <g className="animate-[soccer-ball-bounce_0.8s_infinite_ease-in-out]" style={{ transformOrigin: '32px 10px' }}>
            <circle cx="32" cy="10" r="4.5" fill="#ffffff" stroke="#0b0b12" strokeWidth="0.8" />
            <path d="M32 7.5 l1 1 l-0.5 1.5 l-1 0 l-0.5 -1.5 z" fill="#0b0b12" />
            <path d="M29 9 l-1.2 0.4 l-0.2 1.3 l0.8 0.6 l1.1 -0.5 z" fill="#0b0b12" />
            <path d="M35 9 l1.2 0.4 l0.2 1.3 l-0.8 0.6 l-1.1 -0.5 z" fill="#0b0b12" />
            <path d="M30 13 l0.8 -1.2 h1.4 l0.8 1.2 l-1.5 0.5 z" fill="#0b0b12" />
          </g>
        )}

        {activity === 'drinking-water' && (
          <g className="animate-[drinking-tilt_1.2s_infinite_ease-in-out]" style={{ transformOrigin: '32px 42px' }}>
            <path d="M42 46 l2 -8 h5 l2 8 z" fill="#38bdf8" opacity="0.8" stroke="#0ea5e9" strokeWidth="0.8" />
            <path d="M43 43 h6" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
            <line x1="45" y1="38" x2="35" y2="42" stroke="#f43f5e" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        )}

        {activity === 'shaking-clock' && (
          <g className="animate-[clock-vibrate_0.15s_infinite]" style={{ transformOrigin: '48px 46px' }}>
            <circle cx="48" cy="46" r="4.5" fill="#f43f5e" stroke="#0b0b12" strokeWidth="0.8" />
            <circle cx="44.5" cy="41.5" r="1.5" fill="#94a3b8" />
            <circle cx="51.5" cy="41.5" r="1.5" fill="#94a3b8" />
            <line x1="44.5" y1="41.5" x2="46" y2="43" stroke="#0b0b12" strokeWidth="0.8" />
            <line x1="51.5" y1="41.5" x2="50" y2="43" stroke="#0b0b12" strokeWidth="0.8" />
            <line x1="45" y1="50.5" x2="44" y2="52" stroke="#0b0b12" strokeWidth="1" />
            <line x1="51" y1="50.5" x2="52" y2="52" stroke="#0b0b12" strokeWidth="1" />
            <line x1="48" y1="46" x2="48" y2="43" stroke="#0b0b12" strokeWidth="0.6" />
            <line x1="48" y1="46" x2="50" y2="46" stroke="#0b0b12" strokeWidth="0.6" />
          </g>
        )}

        {activity === 'staring-phone' && (
          <g className="animate-pulse" style={{ transformOrigin: '46px 45px' }}>
            <rect x="42" y="38" width="8" height="13" rx="1.5" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
            <rect x="43" y="39" width="6" height="10" rx="0.5" fill="#22d3ee" opacity="0.85" />
            <circle cx="46" cy="50" r="0.4" fill="#ffffff" />
          </g>
        )}

        {activity === 'reading-book' && (
          <g className="animate-[book-float_1.5s_infinite_ease-in-out]" style={{ transformOrigin: '32px 50px' }}>
            <path d="M22 50 q10 -3 20 0 l1 4 q-10 -3 -20 0 z" fill="#b45309" />
            <path d="M23 49.5 q9 -2.5 18 0 l-0.5 3.5 q-9 -2.5 -18 0 z" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.3" />
            <path d="M23 49.5 v3.5" stroke="#cbd5e1" strokeWidth="0.5" />
            <path d="M41 49.5 v3.5" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="25" y1="51" x2="30" y2="51" stroke="#64748b" strokeWidth="0.4" />
            <line x1="25" y1="52" x2="29" y2="52" stroke="#64748b" strokeWidth="0.4" />
            <line x1="33" y1="51" x2="38" y2="51" stroke="#64748b" strokeWidth="0.4" />
            <line x1="33" y1="52" x2="37" y2="52" stroke="#64748b" strokeWidth="0.4" />
          </g>
        )}

        {activity === 'listening-music' && (
          <g>
            <path d="M14 26 A18 18 0 0 1 50 26" fill="none" stroke="#6366f1" strokeWidth="2.5" />
            <rect x="10" y="24" width="5" height="9" rx="2" fill="#4338ca" stroke="#312e81" strokeWidth="0.8" />
            <rect x="49" y="24" width="5" height="9" rx="2" fill="#4338ca" stroke="#312e81" strokeWidth="0.8" />
            <g opacity="0.9">
              <path d="M12 14 v-4 h3 v1.5 h-3" fill="none" stroke="#6366f1" strokeWidth="0.8" className="animate-[float-note_1.8s_infinite]" style={{ animationDelay: '0s' }} />
              <circle cx="11" cy="14" r="1.2" fill="#6366f1" />
              <path d="M50 12 v-4 h3 v1.5 h-3" fill="none" stroke="#8b5cf6" strokeWidth="0.8" className="animate-[float-note_1.8s_infinite]" style={{ animationDelay: '0.9s' }} />
              <circle cx="49" cy="12" r="1.2" fill="#8b5cf6" />
            </g>
          </g>
        )}

        {currentMood === 'bathing' && (
          <>
            {/* Shower Streams */}
            <g opacity="0.85">
              <line x1="20" y1="2" x2="20" y2="34" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0s' }} />
              <line x1="32" y1="2" x2="32" y2="38" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.2s' }} />
              <line x1="44" y1="2" x2="44" y2="34" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.1s' }} />
              <line x1="26" y1="2" x2="26" y2="36" stroke="#7dd3fc" strokeWidth="1.8" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.3s' }} />
              <line x1="38" y1="2" x2="38" y2="36" stroke="#7dd3fc" strokeWidth="1.8" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.15s' }} />
            </g>
            {/* Floating Bubbles */}
            <g fill="none" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.8">
              <circle cx="12" cy="18" r="3.5" className="animate-bubble-float-1" />
              <circle cx="52" cy="20" r="2.8" className="animate-bubble-float-2" />
              <circle cx="32" cy="16" r="4.2" className="animate-bubble-float-3" />
            </g>
          </>
        )}
        
        <g style={{ transformOrigin: '32px 52px' }}>
          {renderMascotBody()}
          {cheeks}
          {eyeShape}
          {mouth}

          {/* Soap bubbles on head when bathing */}
          {currentMood === 'bathing' && (
            <g fill="#ffffff" stroke="#94a3b8" strokeWidth="0.8" opacity="0.95">
              <circle cx="28" cy="16" r="3.5" className="animate-soap-bubble" style={{ animationDelay: '0s' }} />
              <circle cx="34" cy="15" r="4.2" className="animate-soap-bubble" style={{ animationDelay: '0.3s' }} />
              <circle cx="22" cy="18" r="2.8" className="animate-soap-bubble" style={{ animationDelay: '0.6s' }} />
              <circle cx="42" cy="17" r="3" className="animate-soap-bubble" style={{ animationDelay: '0.4s' }} />
              
              <circle cx="15" cy="35" r="2.5" className="animate-soap-bubble" style={{ animationDelay: '0.1s' }} />
              <circle cx="49" cy="35" r="2.5" className="animate-soap-bubble" style={{ animationDelay: '0.5s' }} />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

export function MascotBadge({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-wide ${
      on ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-success' : 'bg-muted-foreground'}`} />
      Flow • {on ? 'Active' : 'Disabled'}
    </span>
  );
}
