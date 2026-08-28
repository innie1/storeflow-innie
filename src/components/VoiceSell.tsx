import { useEffect, useRef, useState, useCallback } from 'react';
import { Product } from '@/types/store';
import { showToast } from '@/components/Toast';
import { Mic } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParsedItem { productId: string; productName: string; quantity: number; }

interface VoiceSellProps {
  products: Product[];
  autoStart?: boolean;
  ambientActive: boolean;
  setAmbientActive: (active: boolean) => void;
  onListeningChange?: (listening: boolean) => void;
  onAddItems: (items: ParsedItem[]) => void;
  onCheckout: () => void;
}

// ─── Word-number map ──────────────────────────────────────────────────────────
const WORD_NUMS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  twenty: 20, fifty: 50, hundred: 100,
};

function toNumber(token: string): number | null {
  const n = Number(token);
  if (!isNaN(n) && n > 0) return n;
  return WORD_NUMS[token.toLowerCase()] ?? null;
}

// ─── Normalize strings for fuzzy comparison ──────────────────────────────────
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Levenshtein distance (fast for short words)
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}

// ─── Parser ───────────────────────────────────────────────────────────────────
function parseTranscript(raw: string, products: Product[]): ParsedItem[] {
  const corrected = raw.replace(/\bgary\b/gi, 'garri');
  const tokens = corrected.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const results: ParsedItem[] = [];
  const used = new Set<number>();

  function findProduct(start: number): { product: Product; end: number } | null {
    let best: { product: Product; end: number; score: number } | null = null;
    for (let len = 3; len >= 1; len--) {
      if (start + len > tokens.length) continue;
      const span = tokens.slice(start, start + len).join(' ');
      const spanN = norm(span);
      for (const p of products) {
        const pn = norm(p.name);
        if (pn === spanN) {
          const s = 0;
          if (!best || s < best.score) best = { product: p, end: start + len, score: s };
          continue;
        }
        if (pn.includes(spanN) && spanN.length >= 3) {
          const s = 1;
          if (!best || s < best.score) best = { product: p, end: start + len, score: s };
          continue;
        }
        const maxDist = Math.min(2, Math.floor(Math.max(spanN.length, pn.length) / 4));
        const d = lev(pn, spanN);
        if (d <= maxDist && d < (best?.score ?? Infinity)) {
          best = { product: p, end: start + len, score: d + 0.5 };
        }
      }
    }
    return best ? { product: best.product, end: best.end } : null;
  }

  let i = 0;
  while (i < tokens.length) {
    if (used.has(i)) { i++; continue; }

    const num = toNumber(tokens[i]);

    if (num !== null) {
      const match = findProduct(i + 1);
      if (match) {
        for (let k = i; k < match.end; k++) used.add(k);
        const existing = results.find(r => r.productId === match.product.id);
        if (existing) existing.quantity += num;
        else results.push({ productId: match.product.id, productName: match.product.name, quantity: num });
        i = match.end;
        continue;
      }
      i++;
    } else {
      const match = findProduct(i);
      if (match) {
        for (let k = i; k < match.end; k++) used.add(k);
        let qty = 1;
        if (match.end < tokens.length) {
          const followNum = toNumber(tokens[match.end]);
          if (followNum !== null) {
            qty = followNum;
            used.add(match.end);
            i = match.end + 1;
          } else {
            i = match.end;
          }
        } else {
          i = match.end;
        }
        const existing = results.find(r => r.productId === match.product.id);
        if (existing) existing.quantity += qty;
        else results.push({ productId: match.product.id, productName: match.product.name, quantity: qty });
      } else {
        i++;
      }
    }
  }
  return results;
}

// ─── Speech recognition setup ────────────────────────────────────────────────
const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// ─── Component ───────────────────────────────────────────────────────────────
export default function VoiceSell({
  products,
  autoStart,
  ambientActive,
  setAmbientActive,
  onListeningChange,
  onAddItems,
  onCheckout,
}: VoiceSellProps) {
  const [ambientListening, setAmbientListening] = useState(false);
  const [lastHeard, setLastHeard] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const ambientRecogRef = useRef<InstanceType<typeof SR> | null>(null);
  const ambientWantActive = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [supported] = useState(() => !!SR);
  const processedIndicesRef = useRef<Set<number>>(new Set());

  // Notify parent on actual listening status changes
  useEffect(() => {
    onListeningChange?.(ambientListening);
  }, [ambientListening, onListeningChange]);

  const stopAmbient = useCallback(() => {
    ambientWantActive.current = false;
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    try { ambientRecogRef.current?.abort(); } catch { /* ok */ }
    ambientRecogRef.current = null;
    setAmbientListening(false);
    processedIndicesRef.current.clear();
  }, []);

  const startAmbientSession = useCallback(() => {
    if (!SR || !ambientWantActive.current) return;

    try { ambientRecogRef.current?.abort(); } catch { /* ok */ }

    processedIndicesRef.current.clear();

    const r = new SR() as SpeechRecognition;
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 2;

    r.onstart = () => {
      setAmbientListening(true);
    };

    r.onresult = (e: SpeechRecognitionEvent) => {
      let newFinalText = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const t = result[0].transcript;
        if (result.isFinal) {
          if (!processedIndicesRef.current.has(i)) {
            processedIndicesRef.current.add(i);
            newFinalText += ' ' + t;
          }
        } else {
          interim = t;
        }
      }

      if (interim) setLastHeard(interim);

      if (newFinalText.trim()) {
        const text = newFinalText.trim();
        setLastHeard(text.split(' ').slice(-6).join(' '));

        const items = parseTranscript(text, products);
        if (items.length > 0) {
          onAddItems(items);
          setAddedCount(prev => prev + items.reduce((s, it) => s + it.quantity, 0));
          const names = items.map(it => `${it.productName} ×${it.quantity}`).join(', ');
          showToast(`🎙 Added: ${names}`);
        }
      }
    };

    r.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      setAmbientListening(false);
    };

    r.onend = () => {
      setAmbientListening(false);
      if (ambientWantActive.current) {
        restartTimerRef.current = setTimeout(() => {
          if (ambientWantActive.current) startAmbientSession();
        }, 300);
      }
    };

    ambientRecogRef.current = r;
    try {
      r.start();
    } catch {
      // ignore
    }
  }, [products, onAddItems]);

  const startAmbient = useCallback(() => {
    if (!SR) return;
    ambientWantActive.current = true;
    setAddedCount(0);
    setLastHeard('');
    processedIndicesRef.current.clear();
    startAmbientSession();
  }, [startAmbientSession]);

  // Synchronize internal listening session with ambientActive prop
  useEffect(() => {
    if (ambientActive) {
      if (!ambientWantActive.current) {
        startAmbient();
      }
    } else {
      if (ambientWantActive.current) {
        stopAmbient();
      }
    }
  }, [ambientActive, startAmbient, stopAmbient]);

  const toggleAmbient = useCallback(() => {
    setAmbientActive(!ambientActive);
  }, [ambientActive, setAmbientActive]);

  // Auto-start ambient mode when autoStart prop is true
  useEffect(() => {
    if (autoStart && supported && !ambientActive) {
      setAmbientActive(true);
    }
  }, [autoStart, supported, ambientActive, setAmbientActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ambientWantActive.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try { ambientRecogRef.current?.abort(); } catch { /* ok */ }
    };
  }, []);

  if (!supported) return null;

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
           AMBIENT VOICE BAR — high-fidelity redesign
         ═══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-2xl transition-all duration-300 border bg-gradient-to-r from-[#1d1844] to-[#120e2b]"
        style={ambientActive ? {
          borderColor: '#E8C34E',
          boxShadow: '0 0 14px rgba(232, 195, 78, 0.2)',
        } : {
          borderColor: '#27224f',
        }}
      >
        <div className="flex items-center gap-3 p-3">
          {/* Mic Button container */}
          <button
            onClick={toggleAmbient}
            className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              ambientActive
                ? 'bg-[#E8C34E] text-slate-950 shadow-md active:scale-95'
                : 'bg-white/5 border border-[#3c356d] text-slate-300 hover:border-[#E8C34E]/40 active:scale-95'
            }`}
            style={ambientListening ? { animation: 'mic-pop 1.5s ease-in-out infinite' } : {}}
            aria-label={ambientActive ? 'Stop voice listening' : 'Start voice listening'}
          >
            <Mic className="w-5 h-5 shrink-0 fill-current" strokeWidth={ambientActive ? 2.5 : 2} />
          </button>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            {ambientActive ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      ambientListening ? 'bg-[#E8C34E] animate-ping' : 'bg-[#E8C34E]/40'
                    }`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      ambientListening ? 'bg-[#E8C34E]' : 'bg-[#E8C34E]/40'
                    }`} />
                  </span>
                  <span className="text-xs font-display font-bold text-[#E8C34E]">
                    Voice Active — speak to add items
                  </span>
                </div>
                {lastHeard && (
                  <p className="text-[10px] text-slate-400 truncate mt-0.5 pl-3.5 italic">
                    Heard: "{lastHeard}"
                  </p>
                )}
              </>
            ) : (
              <div>
                <p className="text-xs font-display font-bold text-white">
                  Voice Selling
                </p>
                <p className="text-[10px] text-slate-400 font-display mt-0.5">
                  Tap to enable voice selling
                </p>
              </div>
            )}
          </div>

          {/* Right side sound visualizer or actions */}
          <div className="shrink-0 flex items-center gap-3">
            {/* Added count indicator */}
            {ambientActive && addedCount > 0 && (
              <span className="text-[10px] font-display font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                +{addedCount}
              </span>
            )}

            {/* Sound waves visualizer */}
            <div className="flex items-center gap-0.5 h-5 shrink-0">
              {[
                { h: 'h-1.5', d: '0s' },
                { h: 'h-3.5', d: '0.15s' },
                { h: 'h-2.5', d: '0.3s' },
                { h: 'h-4.5', d: '0.45s' },
                { h: 'h-3.5', d: '0.6s' },
                { h: 'h-2.5', d: '0.75s' },
                { h: 'h-1.5', d: '0.9s' }
              ].map((bar, i) => (
                <div
                  key={i}
                  className="w-[2px] bg-[#818cf8] rounded-full origin-center"
                  style={{
                    height: bar.h === 'h-1.5' ? '6px' : bar.h === 'h-2.5' ? '10px' : bar.h === 'h-3.5' ? '14px' : '18px',
                    animation: ambientListening 
                      ? 'wave-pulse 0.4s infinite alternate ease-in-out' 
                      : 'wave-pulse 1.6s infinite alternate ease-in-out',
                    animationDelay: bar.d,
                  }}
                />
              ))}
            </div>

            {/* Stop action button */}
            {ambientActive && (
              <button
                onClick={stopAmbient}
                className="text-xs font-display font-bold text-[#f43f5e] hover:text-rose-400 pl-1 shrink-0 transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes wave-pulse {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1.4); }
        }
        @keyframes mic-pop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </>
  );
}
