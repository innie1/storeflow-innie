import { useEffect, useRef, useState, useCallback } from 'react';
import { Product } from '@/types/store';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParsedItem { productId: string; productName: string; quantity: number; }

interface VoiceSellProps {
  products: Product[];
  autoStart?: boolean;
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
/**
 * Parse a transcript like "5 milo 2 bonvita one tomato" into structured items.
 * Strategy:
 *   1. Build all product name n-grams (1–3 words) from the token stream.
 *   2. Greedily match: when we hit a number, look ahead for a product name;
 *      when we hit a product name without a preceding number, default qty = 1.
 */
function parseTranscript(raw: string, products: Product[]): ParsedItem[] {
  const tokens = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const results: ParsedItem[] = [];
  const used = new Set<number>();

  // Build candidate spans: for each position, check 1..3 token windows
  function findProduct(start: number): { product: Product; end: number } | null {
    let best: { product: Product; end: number; score: number } | null = null;
    for (let len = 3; len >= 1; len--) {
      if (start + len > tokens.length) continue;
      const span = tokens.slice(start, start + len).join(' ');
      const spanN = norm(span);
      for (const p of products) {
        const pn = norm(p.name);
        // Exact
        if (pn === spanN) {
          const s = 0;
          if (!best || s < best.score) best = { product: p, end: start + len, score: s };
          continue;
        }
        // Contains
        if (pn.includes(spanN) && spanN.length >= 3) {
          const s = 1;
          if (!best || s < best.score) best = { product: p, end: start + len, score: s };
          continue;
        }
        // Fuzzy: allow 1 edit per 4 chars but max 2
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
      // Look ahead for a product name
      const match = findProduct(i + 1);
      if (match) {
        // Mark all used
        for (let k = i; k < match.end; k++) used.add(k);
        const existing = results.find(r => r.productId === match.product.id);
        if (existing) existing.quantity += num;
        else results.push({ productId: match.product.id, productName: match.product.name, quantity: num });
        i = match.end;
        continue;
      }
      // Lone number — skip
      i++;
    } else {
      // Try matching a product starting here
      const match = findProduct(i);
      if (match) {
        for (let k = i; k < match.end; k++) used.add(k);
        // Check if immediately following is a number (e.g. "Milo 5")
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// ─── Component ───────────────────────────────────────────────────────────────
export default function VoiceSell({ products, autoStart, onAddItems, onCheckout }: VoiceSellProps) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'done' | 'error'>('idle');
  const [supported] = useState(() => !!SR);
  const recogRef = useRef<InstanceType<typeof SR> | null>(null);
  const autoStarted = useRef(false);

  // Build & start recognition
  const startListening = useCallback(() => {
    if (!SR) return;
    if (recogRef.current) {
      try { recogRef.current.abort(); } catch { /* ok */ }
    }

    const r = new SR() as SpeechRecognition;
    r.continuous = false;         // single utterance = lower latency
    r.interimResults = true;      // show words as they come
    r.lang = 'en-US';
    r.maxAlternatives = 3;

    r.onstart = () => { setListening(true); setStatus('listening'); setTranscript(''); setParsed([]); };

    let finalText = '';
    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += ' ' + t;
        else interim = t;
      }
      setTranscript((finalText + ' ' + interim).trim());
    };

    r.onspeechend = () => {
      try { r.stop(); } catch { /* ok */ }
    };

    r.onend = () => {
      setListening(false);
      setStatus('processing');
      const text = finalText.trim();
      if (!text) { setStatus('idle'); return; }
      const items = parseTranscript(text, products);
      setParsed(items);
      setStatus(items.length > 0 ? 'done' : 'error');
    };

    r.onerror = () => { setListening(false); setStatus('error'); };

    recogRef.current = r;
    r.start();
  }, [products]);

  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch { /* ok */ }
  }, []);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (autoStart && supported && !autoStarted.current) {
      autoStarted.current = true;
      setOpen(true);
      // Small delay so the sheet animates in first
      setTimeout(startListening, 400);
    }
  }, [autoStart, supported, startListening]);

  // Cleanup on unmount
  useEffect(() => () => { try { recogRef.current?.abort(); } catch { /* ok */ } }, []);

  const handleConfirm = () => {
    onAddItems(parsed);
    setOpen(false);
    setStatus('idle');
    setTranscript('');
    setParsed([]);
    if (parsed.length > 0) onCheckout();
  };

  const handleRetry = () => {
    setStatus('idle');
    setTranscript('');
    setParsed([]);
    startListening();
  };

  const handleOpen = () => {
    setOpen(true);
    setStatus('idle');
    setTranscript('');
    setParsed([]);
  };

  const handleClose = () => {
    stopListening();
    setOpen(false);
    setStatus('idle');
  };

  if (!supported) return null;

  return (
    <>
      {/* ── Floating mic button ── */}
      {!open && (
        <button
          onClick={handleOpen}
          aria-label="Voice sell"
          className="fixed bottom-28 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
          style={{ boxShadow: '0 4px 24px hsl(var(--primary)/0.45)' }}
        >
          🎙
        </button>
      )}

      {/* ── Bottom sheet ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={handleClose}>
          <div
            className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up overflow-hidden"
            style={{ maxWidth: '448px', margin: '0 auto', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>

            <div className="px-5 pb-2 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg">Voice Sell</h3>
                <p className="text-xs text-muted-foreground">Say products &amp; quantities to add them</p>
              </div>
              <button onClick={handleClose} className="text-2xl text-muted-foreground leading-none">×</button>
            </div>

            {/* ── Mic visualiser ── */}
            <div className="flex flex-col items-center py-6 gap-4">
              <div className="relative flex items-center justify-center">
                {/* Ripple rings when listening */}
                {listening && (
                  <>
                    <div className="absolute w-20 h-20 rounded-full bg-primary/20 animate-voice-ring" />
                    <div className="absolute w-20 h-20 rounded-full bg-primary/15 animate-voice-ring" style={{ animationDelay: '0.5s' }} />
                  </>
                )}
                {/* Mic button */}
                <button
                  onClick={listening ? stopListening : startListening}
                  aria-label={listening ? 'Stop listening' : 'Start listening'}
                  className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center text-4xl transition-colors shadow-lg ${
                    listening
                      ? 'bg-destructive text-white animate-mic-pop'
                      : status === 'done'
                      ? 'bg-success text-white'
                      : 'bg-primary text-white'
                  }`}
                >
                  {listening ? '🎙' : status === 'done' ? '✓' : status === 'error' ? '🎙' : '🎙'}
                </button>
              </div>

              {/* Status label */}
              <p className="text-sm font-display font-semibold text-center">
                {listening && <span className="text-primary">Listening… speak clearly</span>}
                {status === 'idle' && !listening && <span className="text-muted-foreground">Tap mic to start</span>}
                {status === 'processing' && <span className="text-warning">Processing…</span>}
                {status === 'done' && <span className="text-success">Got {parsed.length} product{parsed.length !== 1 ? 's' : ''}!</span>}
                {status === 'error' && <span className="text-destructive">Didn't catch that — try again</span>}
              </p>
            </div>

            {/* ── Live transcript ── */}
            {transcript.length > 0 && (
              <div className="mx-5 mb-4 px-4 py-3 rounded-2xl bg-surface-2 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Heard</p>
                <p className="text-sm text-foreground leading-relaxed italic">"{transcript}"</p>
              </div>
            )}

            {/* ── Parsed items preview ── */}
            {parsed.length > 0 && (
              <div className="mx-5 mb-3 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest px-1">Added to cart</p>
                <div className="bg-surface-2 border border-border rounded-2xl divide-y divide-border overflow-hidden">
                  {parsed.map(item => (
                    <div key={item.productId} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm font-display font-semibold text-foreground">{item.productName}</span>
                      <span className="text-sm text-primary font-bold">× {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Action buttons ── */}
            <div className="px-5 pb-6 space-y-2">
              {status === 'done' && parsed.length > 0 && (
                <button
                  onClick={handleConfirm}
                  className="w-full py-3.5 rounded-2xl bg-success text-white font-display font-bold text-sm"
                >
                  🛒 Add to cart &amp; Checkout
                </button>
              )}
              {(status === 'done' || status === 'error') && (
                <button
                  onClick={handleRetry}
                  className="w-full py-3 rounded-2xl bg-surface-2 border border-border text-foreground font-display font-semibold text-sm"
                >
                  🎙 Try again
                </button>
              )}
              {status === 'idle' && !listening && (
                <button
                  onClick={startListening}
                  className="w-full py-3.5 rounded-2xl bg-primary text-white font-display font-bold text-sm"
                >
                  🎙 Start Listening
                </button>
              )}
              {listening && (
                <button
                  onClick={stopListening}
                  className="w-full py-3.5 rounded-2xl bg-destructive text-white font-display font-bold text-sm"
                >
                  ⏹ Stop &amp; Process
                </button>
              )}
              <button onClick={handleClose} className="w-full py-3 rounded-2xl border border-border text-muted-foreground font-display font-semibold text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
