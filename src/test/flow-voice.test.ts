import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { pickFlowVoice, speakAsFlow } from '@/lib/flow-voice';
import { readSource } from './helpers/source';

/**
 * Flow sounded robotic because of what it asked for.
 *
 * Two of the four places that spoke — the advice report and the chat — set no
 * voice at all, so the browser used its default, which on Windows and Android
 * is the oldest voice installed. The one place that did choose searched for
 * "david", "zira", "mark" and "hazel": those *are* the legacy formant voices.
 * It then set pitch to 1.35 to make one sound younger, which is what makes
 * synthesis sound strained rather than calm.
 *
 * Modern systems ship far better voices next to the old ones. They are just
 * never the default.
 */

const voice = (name: string, lang = 'en-US', localService = true) =>
  ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

const INSTALLED = [
  voice('Microsoft David - English (United States)'),
  voice('Microsoft Zira - English (United States)'),
  voice('Google UK English Male', 'en-GB', false),
  voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  voice('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false),
  voice('Samantha'),
];

let spoken: SpeechSynthesisUtterance[] = [];

beforeEach(() => {
  spoken = [];
  // jsdom implements neither the constructor nor the synth.
  class FakeUtterance {
    text: string;
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    pitch = 1;
    volume = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
  const synth = {
    getVoices: () => INSTALLED,
    speak: (u: SpeechSynthesisUtterance) => spoken.push(u),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

describe('choosing a voice', () => {
  it('takes a natural voice over the legacy default', () => {
    // Microsoft David is what the browser hands you if you do not choose.
    expect(pickFlowVoice('any').name).toMatch(/Natural/);
    expect(pickFlowVoice('any').name).not.toMatch(/David|Zira/);
  });

  it('honours the merchant\'s choice of voice, and picks the best that fits', () => {
    // Gender used to be a scoring bonus, so one high-quality voice of the
    // wrong gender outranked every voice of the right one and the setting was
    // quietly ignored.
    expect(pickFlowVoice('male').name).toContain('Guy');
    expect(pickFlowVoice('female').name).toContain('Aria');
    expect(pickFlowVoice('young-male').name).toContain('Guy');
  });

  it('still returns something when only the old voices exist', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { ...window.speechSynthesis, getVoices: () => [voice('Microsoft David - English (United States)')] },
      configurable: true,
    });
    expect(pickFlowVoice('female')).not.toBeNull();
  });

  it('returns null rather than throwing before the voice list has loaded', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { ...window.speechSynthesis, getVoices: () => [] },
      configurable: true,
    });
    expect(pickFlowVoice('any')).toBeNull();
  });
});

describe('how it speaks', () => {
  it('speaks a little under normal speed, at level pitch', () => {
    speakAsFlow('Your store is doing well.');
    const u = spoken[0];
    expect(u.rate).toBeLessThan(1);
    expect(u.rate).toBeGreaterThan(0.85);
    // 1.35 was used to make a voice sound younger. It made it sound strained.
    expect(u.pitch).toBe(1);
  });

  it('strips markdown so it is not read out loud', () => {
    speakAsFlow('**Rice 50kg** is ### low');
    expect(spoken[0].text).not.toMatch(/[*#]/);
  });

  it('says nothing when there is nothing to say', () => {
    speakAsFlow('   ');
    expect(spoken).toHaveLength(0);
  });
});

describe('every place that speaks goes through it', () => {
  it('constructs an utterance in exactly one place', () => {
    for (const file of [
      'src/components/Manager.tsx',
      'src/components/FlowChat.tsx',
      'src/components/FlowAdviceReport.tsx',
      'src/components/Settings.tsx',
    ]) {
      const code = readSource(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${file} still builds its own utterance`).not.toContain('new SpeechSynthesisUtterance');
      expect(code, `${file} does not use the shared voice`).toContain('speakAsFlow');
    }
  });

  it('no longer hunts for the robotic voices by name', () => {
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).not.toContain("'david'");
    expect(manager).not.toContain('pitch = 1.35');
  });
});
