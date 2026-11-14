import { useState, useEffect } from 'react';
import { speakAsFlow, stopFlowVoice, type FlowVoiceGender } from '@/lib/flow-voice';
import { shopStorage } from '@/lib/shop-storage';

// ─── Notification Drawer removed inline ──────────────────────────────────────


// Typewriter component for Flow greetings and text outputs
export function Typewriter({ text, speed = 50, speak = false }: { text: string; speed?: number; speak?: boolean }) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setDisplayedText('');
    setIndex(0);
  }, [text]);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text.charAt(index));
        setIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    }
  }, [index, text, speed]);

  // Natural human-sounding speech synthesis read-out
  useEffect(() => {
    if (!speak || !text) return;

    // Voice choice lives in lib/flow-voice. This used to hunt for names like
    // "david", "zira" and "hazel" — the legacy formant voices, which are the
    // robotic ones — and then push pitch to 1.35 to make one sound younger,
    // which is what makes synthesis sound strained.
    let gender: FlowVoiceGender = 'young-male';
    try {
      const sessionRaw = localStorage.getItem('storeflow_session');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        const activeStoreRaw = shopStorage.getItem(`storeflow_${session.accessCode}`);
        if (activeStoreRaw) {
          const saved = JSON.parse(activeStoreRaw)?.managerSettings?.voiceGender;
          if (saved) gender = saved as FlowVoiceGender;
        }
      }
    } catch { /* fall back to the default voice */ }

    speakAsFlow(text, { gender });
    return () => stopFlowVoice();
  }, [text, speak]);

  const isDone = index >= text.length;

  return (
    <span>
      {displayedText}
      <span className={`inline-block w-[1.5px] h-3.5 ml-0.5 bg-primary/80 ${isDone ? 'animate-[cursor-blink_1s_step-end_infinite]' : 'bg-primary'}`} />
    </span>
  );
}
