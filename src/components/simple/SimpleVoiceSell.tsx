import { useCallback, useRef, useState } from 'react';
import { Product } from '@/types/store';
import { Mic, Check, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────
type Stage = 'idle' | 'listening' | 'processing' | 'confirm' | 'add-product' | 'saved' | 'item-added';

interface Match {
  product: Product;
  quantity: number;
}

interface SimpleVoiceSellProps {
  products: Product[];
  onConfirmSale: (productId: string, quantity: number) => void;
  onCreateProduct: (name: string, sellingPrice: number, costPrice: number, quantity: number) => Product;
  onSaveAlias: (productId: string, alias: string) => void;
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

// Parses "Indomie 500 600" style speech into a name + cost/selling prices.
// Two numbers spoken -> the smaller is assumed to be cost price, the larger
// selling price (matches how people naturally say it, in either order).
// One number spoken -> treated as selling price only, cost left blank.
function parseVoiceAddItem(transcript: string): { name: string; costPrice: string; sellingPrice: string } {
  const cleaned = transcript.replace(/naira/gi, '').trim();
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  const skipWords = ['and', 'for', 'is', 'costs', 'cost', 'sells', 'sell', 'at', 'to', 'it', 'a', 'an', 'the'];
  const numbers: number[] = [];
  const nameWords: string[] = [];
  for (const w of rawWords) {
    if (/^\d+$/.test(w)) {
      numbers.push(Number(w));
    } else if (!skipWords.includes(w.toLowerCase())) {
      nameWords.push(w);
    }
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  return {
    name: nameWords.join(' ').trim(),
    costPrice: sorted.length > 1 ? String(sorted[0]) : '',
    sellingPrice: sorted.length > 1 ? String(sorted[1]) : sorted.length === 1 ? String(sorted[0]) : '',
  };
}

// ─── Word-number map (kept small on purpose — Simple Mode is for quick, common counts) ──
const WORD_NUMS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

const MULTIPLIER_WORDS: Record<string, number> = { hundred: 100, thousand: 1000 };

// Reads a spoken amount off the END of a token list — "five hundred", "1 thousand",
// plain "500" — so "sold indomie five hundred" resolves the trailing price correctly
// instead of it being swallowed into the product name search.
function parseTrailingAmount(tokens: string[]): { value: number; rest: string[] } | null {
  let i = tokens.length;
  let total = 0;
  let matchedAny = false;

  while (i > 0) {
    const word = tokens[i - 1];
    const mult = MULTIPLIER_WORDS[word];

    if (mult !== undefined) {
      const prevWord = i > 1 ? tokens[i - 2] : undefined;
      const prevNum = prevWord !== undefined
        ? (/^\d+$/.test(prevWord) ? Number(prevWord) : WORD_NUMS[prevWord])
        : undefined;
      if (prevNum !== undefined) {
        total += prevNum * mult;
        i -= 2;
      } else {
        total += mult;
        i -= 1;
      }
      matchedAny = true;
      continue;
    }

    if (/^\d+$/.test(word)) {
      total += Number(word);
      i -= 1;
      matchedAny = true;
      continue;
    }

    if (WORD_NUMS[word] !== undefined) {
      total += WORD_NUMS[word];
      i -= 1;
      matchedAny = true;
      continue;
    }

    break;
  }

  if (!matchedAny || total <= 0) return null;
  return { value: total, rest: tokens.slice(0, i) };
}

// Splits a spoken sale into quantity, price guess, and the leftover name tokens.
// "two Indomie five hundred"       -> qty 2, price 500, name "Indomie"
// "Indomie five hundred"           -> qty 1, price 500, name "Indomie"
// "five hundred Indomie for five hundred" -> same number as both a leading
//   amount-phrase and a trailing one -> genuinely ambiguous, don't guess.
function parseQtyAndPrice(tokens: string[]): {
  qty: number;
  priceGuess: number | null;
  nameTokens: string[];
  ambiguous: boolean;
} {
  let qty = 1;
  let rest = tokens;
  let leadingAmount: number | null = null;

  if (tokens.length > 0) {
    const first = tokens[0];
    const firstNum = /^\d+$/.test(first) ? Number(first) : WORD_NUMS[first];
    const second = tokens[1];
    const isLeadingAmountPhrase = firstNum !== undefined && second !== undefined && MULTIPLIER_WORDS[second] !== undefined;

    if (isLeadingAmountPhrase) {
      // "five hundred Indomie..." reads as a price mentioned up front, not a quantity.
      leadingAmount = firstNum * MULTIPLIER_WORDS[second];
      rest = tokens.slice(2);
    } else if (firstNum !== undefined) {
      qty = firstNum;
      rest = tokens.slice(1);
    }
  }

  const trailing = parseTrailingAmount(rest);
  const priceGuess = trailing ? trailing.value : leadingAmount;
  const nameTokens = trailing ? trailing.rest : rest;
  const ambiguous = leadingAmount !== null && trailing !== null && leadingAmount === trailing.value;

  return { qty: ambiguous ? 1 : qty, priceGuess, nameTokens, ambiguous };
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Loose phonetic-ish normalization — catches the most common speech-to-text
// mishearings (doubled consonants dropped/added, trailing silent e, y/i
// interchange) without needing a real phonetic library. "gary" and "garri"
// both normalize to "gari"; "maggie" and "maggi" both normalize to "magi".
function phoneticNorm(s: string) {
  let x = norm(s).replace(/y/g, 'i').replace(/(.)\1+/g, '$1');
  if (x.length > 3 && x.endsWith('e')) x = x.slice(0, -1);
  return x;
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

// A short spoken word being a prefix of a much longer product name isn't a real
// match — "indomi" is a prefix of "indomitabl" but they're different products.
// Only count a containment match when the two strings are reasonably close in
// length (the shorter is at least 65% of the longer).
function lengthRatioOk(a: string, b: string): boolean {
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return false;
  return shorter / longer >= 0.65;
}

// Finds the best-matching product for whatever's left of the transcript after quantity is stripped.
// Returns the top match plus up to 2 runner-ups, so the UI can offer alternatives on low confidence.
// Checks, in priority order: learned voice aliases -> exact name -> phonetic-exact ->
// substring -> phonetic-substring -> fuzzy (typo-tolerant) distance.
function findBestMatches(nameTokens: string[], products: Product[]): { product: Product; score: number }[] {
  const spanN = norm(nameTokens.join(' '));
  const spanP = phoneticNorm(nameTokens.join(' '));
  if (!spanN) return [];

  const scored = products.map(p => {
    const pn = norm(p.name);
    const pp = phoneticNorm(p.name);

    // Learned aliases beat everything — this is the product the owner
    // explicitly told us this word means, last time.
    const aliasHit = (p.voiceAliases || []).some(a => norm(a) === spanN || phoneticNorm(a) === spanP);
    if (aliasHit) return { product: p, score: -1 };

    if (pn === spanN) return { product: p, score: 0 };
    if (pp === spanP) return { product: p, score: 0.3 };
    if (pn.includes(spanN) && spanN.length >= 3 && lengthRatioOk(pn, spanN)) return { product: p, score: 1 };
    if (spanN.includes(pn) && pn.length >= 3 && lengthRatioOk(spanN, pn)) return { product: p, score: 1.1 };
    if (pp.includes(spanP) && spanP.length >= 3 && lengthRatioOk(pp, spanP)) return { product: p, score: 1.3 };
    if (spanP.includes(pp) && pp.length >= 3 && lengthRatioOk(spanP, pp)) return { product: p, score: 1.4 };

    // Fuzzy fallback — tolerance scales a bit more generously with word length
    // than a strict 1/3 ratio, since short local product names (garri, indomie,
    // maggi) get mangled by speech-to-text more than the letter count suggests.
    const maxDist = Math.max(1, Math.min(3, Math.ceil(Math.max(spanP.length, pp.length) / 2.5)));
    const d = lev(pp, spanP);
    return { product: p, score: d <= maxDist ? d + 1.5 : 99 };
  });
  return scored.filter(s => s.score < 99).sort((a, b) => a.score - b.score).slice(0, 3);
}

const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Processing screen steps (spec section 5, screen 6) — purely cosmetic pacing
// so the parse doesn't feel instantaneous/jarring on real devices.
const PROCESSING_STEPS = ['Recognizing…', 'Finding your product…', 'Extracting quantity…', 'Almost done…'];

export default function SimpleVoiceSell({ products, onConfirmSale, onCreateProduct, onSaveAlias }: SimpleVoiceSellProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [voiceMode, setVoiceMode] = useState<'sell' | 'add'>('sell');
  const [justAdded, setJustAdded] = useState<Product | null>(null);
  const [heardText, setHeardText] = useState('');
  const [candidates, setCandidates] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [spokenQuery, setSpokenQuery] = useState(''); // the product-name portion of what was heard, minus quantity
  const [spokenQty, setSpokenQty] = useState(1);
  const [ambiguousAmount, setAmbiguousAmount] = useState<number | null>(null); // set when the same number could be qty or price — lets the add-product screen offer a one-tap swap
  const [newName, setNewName] = useState('');
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newQty, setNewQty] = useState('');
  const recogRef = useRef<any>(null);
  const stepTimerRef = useRef<any>(null);
  const supported = !!SR;

  const runParse = useCallback((transcript: string) => {
    setStage('processing');
    setProcessingStep(0);
    const tokens = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    // Drop common filler words that don't carry product/quantity meaning
    const filtered = tokens.filter(t => !['sold', 'for', 'naira', 'just', 'i', 'a', 'an', 'the', 'of'].includes(t));
    const { qty, priceGuess, nameTokens, ambiguous } = parseQtyAndPrice(filtered);
    const matches = findBestMatches(nameTokens, products);
    const spokenSpan = nameTokens.join(' ');

    // Step through recognizing -> finding -> extracting -> almost done (spec screen 6),
    // then land on the result. Total pacing kept short so it never feels sluggish.
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => {
      setProcessingStep(s => Math.min(s + 1, PROCESSING_STEPS.length - 1));
    }, 220);

    setTimeout(() => {
      clearInterval(stepTimerRef.current);
      setSpokenQuery(spokenSpan);
      setSpokenQty(qty);
      setAmbiguousAmount(ambiguous ? priceGuess : null);
      if (matches.length === 0) {
        // New product — sits alongside the existing add-product form, just
        // pre-filled from what was already said so it's a one-tap save.
        setNewName(titleCase(spokenSpan));
        setNewSellingPrice(priceGuess ? String(priceGuess) : '');
        setNewCostPrice('');
        setNewQty(String(qty));
        setStage('add-product');
        return;
      }
      const top = { product: matches[0].product, quantity: qty };
      setSelected(top);
      setCandidates(matches.map(m => ({ product: m.product, quantity: qty })));
      setStage('confirm');
    }, 900);
  }, [products]);

  // Add Item mode — "Indomie 500 600" -> name + cost/selling prices, straight
  // to the same add-product form (no matching against existing products,
  // since the whole point here is creating a new one).
  const runAddItemParse = useCallback((transcript: string) => {
    setStage('processing');
    setProcessingStep(0);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => {
      setProcessingStep(s => Math.min(s + 1, PROCESSING_STEPS.length - 1));
    }, 220);

    setTimeout(() => {
      clearInterval(stepTimerRef.current);
      const { name, costPrice, sellingPrice } = parseVoiceAddItem(transcript);
      setSpokenQuery('');
      setNewName(titleCase(name));
      setNewCostPrice(costPrice);
      setNewSellingPrice(sellingPrice);
      setNewQty('');
      setStage('add-product');
    }, 900);
  }, []);

  const startListening = useCallback(() => {
    if (!supported) {
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
        if (voiceMode === 'add') {
          runAddItemParse(text.trim());
        } else {
          runParse(text.trim());
        }
      }
    };
    r.onerror = () => setStage('idle');
    r.onend = () => {
      // If we ended without a final result being processed, drop back to idle
      setStage(prev => (prev === 'listening' ? 'idle' : prev));
    };

    recogRef.current = r;
    r.start();
  }, [supported, runParse, runAddItemParse, voiceMode]);

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
    setSpokenQuery('');
    setNewName('');
    setNewSellingPrice('');
    setNewCostPrice('');
    setNewQty('');
  }, []);

  // Live suggestions while editing the name in the add-product popup — catches
  // cases where the owner's correction actually matches something that exists
  const nameSuggestions = newName.trim()
    ? findBestMatches(newName.trim().toLowerCase().split(/\s+/), products).filter(m => m.score < 3)
    : [];

  const useSuggestion = (product: Product) => {
    if (voiceMode === 'add') {
      // Already exists — nothing to add, just let them know and reset.
      reset();
      return;
    }
    if (spokenQuery) onSaveAlias(product.id, spokenQuery);
    const match = { product, quantity: spokenQty };
    setSelected(match);
    setCandidates([match]);
    setStage('confirm');
  };

  const addNewAndSell = () => {
    const name = newName.trim();
    const price = Number(newSellingPrice);
    const cost = Number(newCostPrice) || 0;
    if (!name || !(price > 0)) return;

    if (voiceMode === 'add') {
      const qty = Number(newQty) || 0;
      const created = onCreateProduct(name, price, cost, qty);
      setJustAdded(created);
      setStage('item-added');
      setTimeout(() => {
        setJustAdded(null);
        reset();
      }, 1600);
      return;
    }

    const qty = Number(newQty) || spokenQty;
    const created = onCreateProduct(name, price, cost, qty);
    if (spokenQuery) onSaveAlias(created.id, spokenQuery);
    const match = { product: created, quantity: spokenQty };
    setSelected(match);
    setCandidates([match]);
    setStage('confirm');
  };

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

  // ── Item added (Add Item voice mode) ──
  if (stage === 'item-added' && justAdded) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
          <Check className="w-9 h-9 text-success" />
        </div>
        <p className="font-display font-bold text-foreground text-base">Item Added</p>
        <p className="text-sm text-muted-foreground">
          {justAdded.name} — ₦{justAdded.sellingPrice.toLocaleString()}
          {justAdded.costPrice > 0 ? ` (cost ₦${justAdded.costPrice.toLocaleString()})` : ''}
        </p>
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
              onClick={() => {
                setSelected(c);
                // Owner picked something other than our top guess for this word —
                // learn it, so next time this word jumps straight to the top.
                if (spokenQuery && candidates[0]?.product.id !== c.product.id) {
                  onSaveAlias(c.product.id, spokenQuery);
                }
              }}
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

  // ── Didn't recognize it — auto-offer to add it as a new product, mic stays one tap away ──
  if (stage === 'add-product') {
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col gap-3 animate-fade-in">
        <p className="text-center text-sm text-foreground font-display font-semibold">
          {voiceMode === 'add'
            ? 'New Item'
            : heardText
            ? `Didn't find "${heardText}" — add it?`
            : "Didn't catch that — add a product?"}
        </p>

        <div className="space-y-1">
          <label className="block text-[11px] text-muted-foreground uppercase font-bold">Product Name</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Product name"
            autoFocus
            className="w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {nameSuggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Did you mean one of these instead?</p>
            {nameSuggestions.map(m => (
              <button
                key={m.product.id}
                onClick={() => useSuggestion(m.product)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-surface-2/40 text-left"
              >
                <p className="font-display font-semibold text-sm text-foreground">{m.product.name}</p>
                <p className="text-xs text-muted-foreground">₦{m.product.sellingPrice.toLocaleString()} each</p>
              </button>
            ))}
          </div>
        )}

        {ambiguousAmount !== null && (
          <button
            type="button"
            onClick={() => {
              // Swap: what we guessed as price becomes the quantity, and vice versa.
              setNewQty(newSellingPrice);
              setNewSellingPrice(newQty);
              setAmbiguousAmount(null);
            }}
            className="w-full text-left px-3 py-2 rounded-xl border border-primary/40 bg-primary/5 text-[11px] text-muted-foreground"
          >
            Heard "{ambiguousAmount}" twice — not sure if that's the quantity or the price. Filled in as price below — <span className="text-primary font-bold">tap here to swap</span> if it's actually the quantity.
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground uppercase font-bold">Selling Price</label>
            <input
              value={newSellingPrice}
              onChange={e => setNewSellingPrice(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="₦"
              inputMode="numeric"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground uppercase font-bold">Cost Price</label>
            <input
              value={newCostPrice}
              onChange={e => setNewCostPrice(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="₦ (optional)"
              inputMode="numeric"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] text-muted-foreground uppercase font-bold">Quantity In Stock</label>
          <input
            value={newQty}
            onChange={e => setNewQty(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="How many do you have?"
            inputMode="numeric"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <button
          onClick={addNewAndSell}
          disabled={!newName.trim() || !(Number(newSellingPrice) > 0)}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm disabled:opacity-40"
        >
          {voiceMode === 'add' ? 'Add Item' : 'Add Product & Record Sale'}
        </button>

        {/* Mic stays reachable — retrying re-opens listening immediately instead of dumping back to a bare idle screen */}
        <div className="flex gap-3">
          <button
            onClick={startListening}
            disabled={!supported}
            className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Mic className="w-4 h-4" /> Retry With Mic
          </button>
          <button
            onClick={reset}
            className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Listening / processing / idle: the big mic button ──
  return (
    <div className="flex flex-col items-center gap-4">
      {stage === 'idle' && (
        <div className="flex bg-surface-2 rounded-full p-1 border border-border">
          <button
            onClick={() => setVoiceMode('sell')}
            className={`px-4 py-1.5 rounded-full text-xs font-display font-bold transition ${
              voiceMode === 'sell' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Sell
          </button>
          <button
            onClick={() => setVoiceMode('add')}
            className={`px-4 py-1.5 rounded-full text-xs font-display font-bold transition ${
              voiceMode === 'add' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Add Item
          </button>
        </div>
      )}
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
        {stage === 'idle' && voiceMode === 'add' && 'Say the item and price — e.g. "Indomie 500 600"'}
        {stage === 'idle' && voiceMode === 'sell' && 'Tap and say what you sold'}
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
