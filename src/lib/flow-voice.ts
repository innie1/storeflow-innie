/**
 * One voice for Flow, chosen well.
 *
 * Four places spoke, and none of them chose the same way. Two — the advice
 * report and the chat — asked for no voice at all, so the browser handed them
 * its default, which on Windows and Android is almost always the oldest and
 * flattest one installed. The one place that did choose looked for names like
 * "david", "zira" and "hazel": those are precisely the legacy formant voices
 * that sound robotic. It then raised the pitch to 1.35 to make one of them
 * sound younger, which is what makes a synthetic voice sound strained.
 *
 * Modern browsers ship far better voices alongside the old ones — Microsoft's
 * Natural set, Google's network voices, Apple's Siri and Samantha. They are
 * simply never the default. This picks the best available and speaks a little
 * under normal speed, which is most of what makes a voice sound calm.
 */

export type FlowVoiceGender = 'male' | 'female' | 'young-male' | 'any';

/**
 * Voice families in descending order of how natural they sound.
 * Matched against the voice name, lowercased.
 */
const QUALITY_TIERS: string[][] = [
  // Neural, by any of the names the vendors use for them.
  ['natural', 'neural', 'premium', 'enhanced', 'siri'],
  // Google's are network-backed and clearly ahead of the legacy local set.
  ['google'],
  // Apple's better local voices.
  ['samantha', 'daniel', 'karen', 'moira', 'tessa'],
];

/** Legacy formant voices — the robotic ones. Chosen only if nothing else exists. */
const LAST_RESORT = ['david', 'zira', 'mark', 'hazel', 'george', 'susan', 'espeak'];

const FEMALE_HINTS = ['female', 'zira', 'samantha', 'hazel', 'susan', 'karen', 'moira', 'tessa', 'aria', 'jenny', 'sonia', 'libby'];
const MALE_HINTS = ['male', 'david', 'mark', 'george', 'daniel', 'guy', 'ryan', 'brian', 'christopher'];

function score(voice: SpeechSynthesisVoice, gender: FlowVoiceGender): number {
  const name = voice.name.toLowerCase();
  let points = 0;

  QUALITY_TIERS.forEach((tier, index) => {
    if (tier.some(term => name.includes(term))) {
      points += (QUALITY_TIERS.length - index) * 100;
    }
  });
  if (LAST_RESORT.some(term => name.includes(term))) points -= 60;

  // Prefer the user's own locale, then any English.
  const lang = voice.lang.toLowerCase();
  if (typeof navigator !== 'undefined' && lang === navigator.language?.toLowerCase()) points += 30;
  else if (lang.startsWith('en')) points += 20;

  // A local voice never stalls waiting on the network.
  if (voice.localService) points += 5;

  return points;
}

function matchesGender(voice: SpeechSynthesisVoice, gender: FlowVoiceGender): boolean {
  const name = voice.name.toLowerCase();
  if (gender === 'female') return FEMALE_HINTS.some(term => name.includes(term));
  if (gender === 'male' || gender === 'young-male') return MALE_HINTS.some(term => name.includes(term));
  return true;
}

/** The best-sounding installed voice, or null before the list has loaded. */
export function pickFlowVoice(gender: FlowVoiceGender = 'any'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const english = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const pool = english.length ? english : voices;

  // The merchant's choice decides which voices are eligible; quality decides
  // between them. Scoring gender as a bonus instead let a high-quality voice
  // of the wrong gender outrank every voice of the right one, which quietly
  // ignored the setting. If nothing matches, quality alone decides.
  const eligible = pool.filter(v => matchesGender(v, gender));
  const candidates = eligible.length ? eligible : pool;

  return candidates.reduce((best, v) => (score(v, gender) > score(best, gender) ? v : best), candidates[0]);
}

/**
 * getVoices() is empty until the browser has loaded the list, and fires
 * `voiceschanged` when it has. Speaking before then silently gets the default.
 */
function whenVoicesReady(then: () => void): void {
  if (!window.speechSynthesis) return;
  if (window.speechSynthesis.getVoices().length) { then(); return; }
  const onChange = () => {
    window.speechSynthesis.removeEventListener('voiceschanged', onChange);
    then();
  };
  window.speechSynthesis.addEventListener('voiceschanged', onChange);
  // Some browsers never fire it; do not leave the caller silent.
  setTimeout(() => {
    window.speechSynthesis.removeEventListener('voiceschanged', onChange);
    then();
  }, 1200);
}

export interface SpeakOptions {
  gender?: FlowVoiceGender;
  /** Slightly under 1 reads as unhurried; much under reads as sluggish. */
  rate?: number;
  onEnd?: () => void;
  onError?: () => void;
}

/** Reads text aloud in Flow's voice. Cancels anything already speaking. */
export function speakAsFlow(text: string, options: SpeakOptions = {}): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const clean = text.replace(/[*#_`>[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return;

  whenVoicesReady(() => {
    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickFlowVoice(options.gender ?? 'any');
    if (voice) utterance.voice = voice;

    // Unhurried and level. The old code pushed pitch to 1.35 to make a voice
    // sound younger, which is what makes synthesis sound strained.
    utterance.rate = options.rate ?? 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (options.onEnd) utterance.onend = options.onEnd;
    if (options.onError) utterance.onerror = options.onError;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

/** Stops anything Flow is currently saying. */
export function stopFlowVoice(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
}
