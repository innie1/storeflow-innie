import { useCallback, useRef, useState } from 'react';
import { Product } from '@/types/store';
import { Mic, Check, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────
type Stage = 'idle' | 'listening' | 'processing' | 'confirm' | 'no-match' | 'saved';

interface Match {
  product: Product;
  quantity: number;
}

interface SimpleVoiceSellProps {
  products: Product[];
  onConfirmSale: (productId: string, quantity: number) => void;
}

// ─── Word-number map (kept small on purpose — Simple Mode is for quick, common counts) ──
const WORD_NUMS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

function leadingQuantity(tokens: string[]): { qty: number; rest: string[] } {
  if (tokens.length === 0) return { qty: 1, rest: tokens };
  const first = tokens[0];
  const asDigit = Number(first);
  if (!isNaN(asDigit) && asDigit > 0) return { qty: asDigit, rest: tokens.slice(1) };
  const asWord = WORD_NUMS[first];
  if (asWord) return { qty: asWord, rest: tokens.slice(1) };
  return { qty: 1, rest: tokens };
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Levenshtein distance — same general algorithm used elsewhere in the app for fuzzy product matching
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

// Finds the best-matching product for whatever's left of the transcript after quantity is stripped.
// Returns the top match plus up to 2 runner-ups, so the UI can offer alternatives on low confidence.
function findBestMatches(nameTokens: string[], products: Product[]): { product: Product; score: number }[] {
  const spanN = norm(nameTokens.join(' '));
  if (!spanN) return [];
  const scored = products.map(p => {
    const pn = norm(p.name);
    if (pn === spanN) return { product: p, score: 0 };
    if (pn.includes(spanN) && spanN.length >= 3) return { product: p, score: 1 };
    const maxDist = Math.min(3, Math.floor(Math.max(spanN.length, pn.length) / 3));
    const d = lev(pn, spanN);
    return { product: p, score: d <= maxDist ? d + 0.5 : 99 };
  });
  return scored.filter(s => s.score < 99).sort((a, b) => a.score - b.score).slice(0, 3);
}

const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Processing screen steps (spec section 5, screen 6) — purely cosmetic pacing
// so the parse doesn't feel instantaneous/jarring on real devices.
const PROCESSING_STEPS = ['Recognizing…', 'Finding your product…', 'Extracting quantity…', 'Almost done…'];

export default function SimpleVoiceSell({ products, onConfirmSale }: SimpleVoiceSellProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [heardText, setHeardText] = useState('');
  const [candidates, setCandidates] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const recogRef = useRef<any>(null);
  const stepTimerRef = useRef<any>(null);
  const supported = !!SR;

  const runParse = useCallback((transcript: string) => {
    setStage('processing');
    setProcessingStep(0);
    const tokens = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    // Drop common filler words that don't carry product/quantity meaning
    const filtered = tokens.filter(t => !['sold', 'for', 'naira', 'just', 'i', 'a', 'an', 'the', 'of'].includes(t));
    const { qty, rest } = leadingQuantity(filtered);
    const matches = findBestMatches(rest, products);

    // Step through recognizing -> finding -> extracting -> almost done (spec screen 6),
    // then land on the result. Total pacing kept short so it never feels sluggish.
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => {
      setProcessingStep(s => Math.min(s + 1, PROCESSING_STEPS.length - 1));
    }, 220);

    setTimeout(() => {
      clearInterval(stepTimerRef.current);
      if (matches.length === 0) {
        setStage('no-match');
        return;
      }
      const top = { product: matches[0].product, quantity: qty };
      setSelected(top);
      setCandidates(matches.map(m => ({ product: m.product, quantity: qty })));
      setStage('confirm');
    }, 900);
  }, [products]);

  const startListening = useCallback(() => {
    if (!supported) {
      setStage('no-match');
      setHeardText('Voice input is not supported on this device/browser.');
      return;
    }
    setHeardText('');
    setSelected(null);
    setCandidates([]);
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 1;

    r.onstart = () => setStage('listening');
    r.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setHeardText(text.trim());
      if (e.results[e.results.length - 1].isFinal) {
        r.stop();
        runParse(text.trim());
      }
    };
    r.onerror = () => setStage('idle');
    r.onend = () => {
      // If we ended without a final result being processed, drop back to idle
      setStage(prev => (prev === 'listening' ? 'idle' : prev));
    };

    recogRef.current = r;
    r.start();
  }, [supported, runParse]);

  const cancelListening = useCallback(() => {
    try { recogRef.current?.abort(); } catch { /* ok */ }
    setStage('idle');
  }, []);

  const confirmSale = useCallback(() => {
    if (!selected) return;
    onConfirmSale(selected.product.id, selected.quantity);
    setStage('saved');
    setTimeout(() => {
      setStage('idle');
      setSelected(null);
      setCandidates([]);
      setHeardText('');
    }, 1200);
  }, [selected, onConfirmSale]);

  const reset = useCallback(() => {
    setStage('idle');
    setSelected(null);
    setCandidates([]);
    setHeardText('');
  }, []);

  // ── Saved confirmation ──
  if (stage === 'saved' && selected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
          <Check className="w-9 h-9 text-success" />
        </div>
        <p className="font-display font-bold text-foreground text-base">Sale Saved</p>
        <p className="text-sm text-muted-foreground">{selected.product.name} × {selected.quantity}</p>
      </div>
    );
  }

  // ── Confirm screen ──
  if (stage === 'confirm' && selected) {
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4 animate-fade-in">
        <p className="text-center text-xs text-muted-foreground">Did you mean?</p>
        <div className="space-y-2">
          {candidates.map((c, idx) => (
            <button
              key={c.product.id}
              onClick={() => setSelected(c)}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors ${
                selected.product.id === c.product.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-surface-2/40'
              }`}
            >
              <div>
                <p className="font-display font-semibold text-sm text-foreground">{c.product.name}</p>
                <p className="text-xs text-muted-foreground">₦{c.product.sellingPrice.toLocaleString()} each</p>
              </div>
              {idx === 0 && <span className="text-[10px] font-bold text-primary">BEST MATCH</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setSelected(s => s ? { ...s, quantity: Math.max(1, s.quantity - 1) } : s)}
            className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-lg"
          >−</button>
          <span className="font-display font-black text-xl w-10 text-center">{selected.quantity}</span>
          <button
            onClick={() => setSelected(s => s ? { ...s, quantity: s.quantity + 1 } : s)}
            className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-lg"
          >+</button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Total: <span className="font-display font-bold text-foreground">₦{(selected.product.sellingPrice * selected.quantity).toLocaleString()}</span>
        </p>

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 py-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={confirmSale}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Confirm Sale
          </button>
        </div>
      </div>
    );
  }

  // ── No match ──
  if (stage === 'no-match') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 animate-fade-in">
        <p className="text-sm text-muted-foreground text-center">
          {heardText || "Didn't catch a product for that. Try again?"}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Listening / processing / idle: the big mic button ──
  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={stage === 'listening' ? cancelListening : startListening}
        disabled={stage === 'processing'}
        className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-all ${
          stage === 'listening'
            ? 'bg-primary scale-110 animate-pulse'
            : stage === 'processing'
            ? 'bg-surface-2 border border-border'
            : 'bg-primary'
        }`}
      >
        <Mic className={`w-12 h-12 ${stage === 'processing' ? 'text-muted-foreground' : 'text-primary-foreground'}`} />
      </button>
      <p className="text-sm text-muted-foreground text-center min-h-[1.25rem]">
        {stage === 'listening' && (heardText || 'Listening…')}
        {stage === 'processing' && PROCESSING_STEPS[processingStep]}
        {stage === 'idle' && 'Tap and say what you sold'}
      </p>
      {stage === 'processing' && (
        <div className="flex items-center gap-1.5">
          {PROCESSING_STEPS.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i <= processingStep ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
