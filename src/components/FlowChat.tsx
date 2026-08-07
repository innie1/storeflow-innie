import { useState, useRef, useEffect } from 'react';
import { StoreData } from '@/types/store';
import {
  healthScore, generateAdvice, inventoryIntelligence, analyzeSales,
  expenseAnalysis, flowGreeting, pricingAlerts,
  getProductIntelligence, findProductByName,
} from '@/lib/manager-intel';
import { addProduct } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { X, Send, Volume2, VolumeX } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface FlowChatProps {
  store: StoreData;
  orders?: any[];
  onClose: () => void;
  onNavigate?: (tab: string) => void;
  onUpdate: (s: StoreData) => void;
}

interface ChatAction {
  label: string;
  onClick: () => void;
}

interface ChatMessage {
  id: string;
  from: 'flow' | 'you';
  text: string;
  actions?: ChatAction[];
}

type WizardStep = 'name' | 'costPrice' | 'sellingPrice' | 'quantity' | 'category' | 'confirm';
interface WizardState {
  step: WizardStep;
  name?: string;
  costPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  category?: string;
}

const QUICK_QUESTIONS = [
  "How's my store doing?",
  'What should I restock?',
  'Any pricing issues?',
  "What's not selling?",
  'Any savings ideas?',
];

const WIZARD_PROMPT: Record<WizardStep, string> = {
  name: "What's the product called?",
  costPrice: 'What does it cost you per unit (₦)?',
  sellingPrice: 'What do you sell it for per unit (₦)?',
  quantity: 'How many units do you have right now?',
  category: 'What category is it? (e.g. Drinks, Snacks, Household)',
  confirm: '',
};

function formatProductIntelligence(store: StoreData, productName: string): string {
  const product = findProductByName(store, productName);
  if (!product) return '';
  const intel = getProductIntelligence(store, product.id);
  if (!intel) return '';

  const trendLine = intel.trendDirection === 'up' ? `📈 trending up${intel.trendPct !== null ? ` ${intel.trendPct.toFixed(0)}%` : ''}`
    : intel.trendDirection === 'down' ? `📉 trending down${intel.trendPct !== null ? ` ${Math.abs(intel.trendPct).toFixed(0)}%` : ''}`
    : intel.trendDirection === 'flat' ? '➡️ holding steady'
    : 'not enough history yet to see a trend';

  const lines = [
    `**${product.name}** — ${trendLine}`,
    `Stock: ${intel.currentStock} · Sold (30d): ${intel.qtySoldLast30} · All-time: ${intel.qtySoldAllTime}`,
    `Revenue (30d): ₦${intel.revenueLast30.toLocaleString()} · Profit (all-time): ₦${intel.profitAllTime.toLocaleString()}`,
    intel.recommendations[0],
  ];
  if (intel.priceChangeEffects.length > 0) {
    lines.push(intel.priceChangeEffects[0]);
  }
  return lines.join('\n');
}

// Extracts a candidate product name from a small set of deliberate,
// unambiguous phrasings only — this is name-extraction, not open command
// parsing, so it stays narrow on purpose.
function extractProductQuery(raw: string): string | null {
  const text = raw.trim();
  let m = text.match(/^how is (.+?) (doing|performing)\??$/i);
  if (m) return m[1].trim();
  m = text.match(/^(.+?) performance\??$/i);
  if (m) return m[1].trim();
  m = text.match(/^how'?s (.+?) (doing|selling)\??$/i);
  if (m) return m[1].trim();
  return null;
}

function extractAddRequest(raw: string): string | null {
  const text = raw.trim();
  const m = text.match(/^add(?: a)?(?: new)? product[:\s]+(.+)$/i) || text.match(/^add (.+)$/i);
  return m ? m[1].trim() : null;
}

export default function FlowChat({ store, orders = [], onClose, onNavigate, onUpdate }: FlowChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'greet', from: 'flow', text: flowGreeting(store) },
  ]);
  const [input, setInput] = useState('');
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('storeflow_flow_voice') === '1');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('storeflow_flow_voice', voiceOn ? '1' : '0');
  }, [voiceOn]);

  const speak = (text: string) => {
    if (!voiceOn || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/\*\*/g, '').replace(/\n/g, '. ');
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    } catch {}
  };

  const pushFlow = (text: string, actions?: ChatAction[]) => {
    setMessages(prev => [...prev, { id: `flow-${Date.now()}-${Math.random()}`, from: 'flow', text, actions }]);
    speak(text);
  };

  const pushYou = (text: string) => {
    setMessages(prev => [...prev, { id: `you-${Date.now()}`, from: 'you', text }]);
  };

  const startWizard = (prefillName?: string) => {
    const w: WizardState = prefillName ? { step: 'costPrice', name: prefillName } : { step: 'name' };
    setWizard(w);
    pushFlow(prefillName
      ? `Let's add **${prefillName}**. ${WIZARD_PROMPT.costPrice}`
      : WIZARD_PROMPT.name
    );
  };

  const cancelWizard = () => {
    setWizard(null);
    pushFlow('No problem — let me know if you want to add it later.');
  };

  const finishWizard = (w: WizardState) => {
    if (!w.name || w.costPrice == null || w.sellingPrice == null || w.quantity == null || !w.category) return;
    const updated = addProduct(store, {
      name: w.name,
      costPrice: w.costPrice,
      sellingPrice: w.sellingPrice,
      quantity: w.quantity,
      category: w.category,
    });
    onUpdate(updated);
    setWizard(null);
    pushFlow(`Added **${w.name}** — ${w.quantity} units at ₦${w.sellingPrice.toLocaleString()} each. You can find it in Inventory.`);
    showToast(`${w.name} added to inventory`, 'success');
  };

  const handleWizardInput = (raw: string) => {
    if (!wizard) return;
    const text = raw.trim();

    if (wizard.step === 'name') {
      if (!text) { pushFlow("I need a name to continue — what's the product called?"); return; }
      const next = { ...wizard, name: text, step: 'costPrice' as WizardStep };
      setWizard(next);
      pushFlow(WIZARD_PROMPT.costPrice);
      return;
    }
    if (wizard.step === 'costPrice') {
      const val = Number(text.replace(/[₦,]/g, ''));
      if (!Number.isFinite(val) || val < 0) { pushFlow("That doesn't look like a number — what does it cost you per unit, in naira?"); return; }
      const next = { ...wizard, costPrice: val, step: 'sellingPrice' as WizardStep };
      setWizard(next);
      pushFlow(WIZARD_PROMPT.sellingPrice);
      return;
    }
    if (wizard.step === 'sellingPrice') {
      const val = Number(text.replace(/[₦,]/g, ''));
      if (!Number.isFinite(val) || val <= 0) { pushFlow("That doesn't look like a valid price — what do you sell it for per unit?"); return; }
      const next = { ...wizard, sellingPrice: val, step: 'quantity' as WizardStep };
      setWizard(next);
      pushFlow(WIZARD_PROMPT.quantity);
      return;
    }
    if (wizard.step === 'quantity') {
      const val = Number(text.replace(/,/g, ''));
      if (!Number.isFinite(val) || val < 0) { pushFlow("How many units, as a number?"); return; }
      const next = { ...wizard, quantity: Math.round(val), step: 'category' as WizardStep };
      setWizard(next);
      pushFlow(WIZARD_PROMPT.category);
      return;
    }
    if (wizard.step === 'category') {
      if (!text) { pushFlow('What category should it go under?'); return; }
      const next: WizardState = { ...wizard, category: text, step: 'confirm' };
      setWizard(next);
      pushFlow(
        `Add **${next.name}** — cost ₦${next.costPrice}, sells for ₦${next.sellingPrice}, ${next.quantity} units, category "${next.category}"?`,
        [
          { label: '✅ Yes, add it', onClick: () => finishWizard(next) },
          { label: 'Cancel', onClick: () => cancelWizard() },
        ]
      );
      return;
    }
  };

  const answerFor = (question: string): string => {
    const q = question.toLowerCase();

    if (/doing|health|how.*(store|business)/.test(q)) {
      const h = healthScore(store);
      return `Your store health score is ${h.overall}/100. ${h.overall >= 80 ? "That's strong — keep it up." : h.overall >= 50 ? 'Room to improve — check the Advice tab for the specifics.' : "There's real work to do here — the Advice tab has the priority list."}`;
    }
    if (/restock|stock|inventory|low/.test(q)) {
      const stock = inventoryIntelligence(store);
      if (stock.length === 0) return 'Nothing urgent right now — stock levels look fine.';
      const critical = stock.filter(f => f.urgency === 'critical');
      if (critical.length > 0) {
        return `${critical.length} product${critical.length === 1 ? '' : 's'} need restocking urgently: ${critical.slice(0, 3).map(f => f.product.name).join(', ')}${critical.length > 3 ? ' and more' : ''}. Order ${critical[0].restockQty} units of ${critical[0].product.name} to start.`;
      }
      return `${stock.length} product${stock.length === 1 ? '' : 's'} are running low but not urgent yet. Worth planning a restock this week.`;
    }
    if (/price|pricing|margin|underpriced/.test(q)) {
      const alerts = pricingAlerts(store).filter(a => a.type === 'underpriced');
      if (alerts.length === 0) return 'No pricing issues found — your margins look reasonable right now.';
      const a = alerts[0];
      return `${a.product.name} is underpriced — margin's only ${(a.currentMargin * 100).toFixed(0)}%. Try ₦${a.suggestedPrice.toLocaleString()}, that adds ₦${a.expectedLift.toLocaleString()} per unit sold.`;
    }
    if (/not selling|dead|dormant|never sold|slow/.test(q)) {
      const analysis = analyzeSales(store);
      if (analysis.neverSold.length === 0) return "Everything in your inventory has sold at least once — no dead stock right now.";
      return `${analysis.neverSold.length} product${analysis.neverSold.length === 1 ? '' : 's'} never sold: ${analysis.neverSold.slice(0, 3).map(p => p.name).join(', ')}${analysis.neverSold.length > 3 ? ' and more' : ''}. Worth a discount push or swapping for something faster-moving.`;
    }
    if (/saving|save|money|cash/.test(q)) {
      const ea = expenseAnalysis(store, ['Restock']);
      if (ea.trendPct > 20) return `${ea.largestCategory} spending is up ${ea.trendPct.toFixed(0)}% this month — that's the first place to look for savings.`;
      return "Expenses look steady. A simple rule: set aside 5% of weekly revenue as a safety buffer for rent and restocking.";
    }
    if (/why.*(sales|revenue).*(down|low|drop)/.test(q)) {
      const analysis = analyzeSales(store);
      const stock = inventoryIntelligence(store);
      const outOfStock = stock.filter(f => f.product.quantity === 0);
      if (outOfStock.length > 0) {
        return `Likely reason: ${outOfStock.length} product${outOfStock.length === 1 ? ' is' : 's are'} out of stock, including ${outOfStock[0].product.name} — you can't sell what you don't have.`;
      }
      if (analysis.neverSold.length > analysis.fastMovers.length) {
        return "A lot of your inventory isn't moving — check the 'not selling' list, it may be dragging your average down.";
      }
      return "Nothing obvious stands out — check the Advice tab for the full breakdown, or compare this week to last week in Forecasts.";
    }
    if (/expense|spending|cost/.test(q)) {
      const ea = expenseAnalysis(store, ['Restock']);
      return `Your biggest expense category is ${ea.largestCategory}, ₦${ea.totalLast30.toLocaleString()} in the last 30 days.`;
    }

    const advice = generateAdvice(store, orders);
    if (advice.length > 0) {
      return `I'm still learning to chat freely, so I can't answer that one directly — but here's my top priority for you right now: ${advice[0].title}. ${advice[0].detail}`;
    }
    return "I'm still learning to chat freely — try one of the quick questions above, or check the Advice tab for a full breakdown.";
  };

  const ask = (question: string) => {
    pushYou(question);

    // 1. Explicit "add X" request — skip straight to the wizard.
    const addReq = extractAddRequest(question);
    if (addReq) {
      startWizard(addReq);
      setAskedIds(prev => new Set(prev).add(question));
      setInput('');
      return;
    }

    // 2. "How is X performing/doing" — product lookup, with a graceful
    // "want to add it?" fallback if the name isn't found.
    const productQuery = extractProductQuery(question);
    if (productQuery) {
      const found = findProductByName(store, productQuery);
      if (found) {
        pushFlow(formatProductIntelligence(store, productQuery));
      } else {
        pushFlow(`I couldn't find "${productQuery}" in your inventory. Would you like to add it?`, [
          { label: 'Yes, add it', onClick: () => startWizard(productQuery) },
          { label: 'No thanks', onClick: () => pushFlow('No problem!') },
        ]);
      }
      setAskedIds(prev => new Set(prev).add(question));
      setInput('');
      return;
    }

    // 3. Bare product name typed directly (e.g. just "Indomie").
    const directMatch = findProductByName(store, question);
    if (directMatch && question.trim().split(/\s+/).length <= 4) {
      pushFlow(formatProductIntelligence(store, question));
      setAskedIds(prev => new Set(prev).add(question));
      setInput('');
      return;
    }

    // 4. Fall back to the rule-based Q&A.
    pushFlow(answerFor(question));
    setAskedIds(prev => new Set(prev).add(question));
    setInput('');
  };

  const remainingQuestions = QUICK_QUESTIONS.filter(q => !askedIds.has(q));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Mascot size={28} />
          <h3 className="text-base font-display font-bold">Chat with Flow</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVoiceOn(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"
            aria-label={voiceOn ? 'Turn off voice replies' : 'Reply with voice'}
            title={voiceOn ? 'Voice replies on' : 'Reply with voice'}
          >
            {voiceOn ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
          </button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" aria-label="Close chat">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map(m => (
          <div key={m.id} className="flex flex-col gap-1.5 items-start" style={{ alignItems: m.from === 'you' ? 'flex-end' : 'flex-start' }}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
              m.from === 'flow'
                ? 'bg-surface-2/60 text-foreground rounded-bl-sm'
                : 'bg-primary text-primary-foreground rounded-br-sm'
            }`}>
              {m.text}
            </div>
            {m.actions && (
              <div className="flex gap-2 flex-wrap">
                {m.actions.map(a => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className="px-3 py-2 rounded-full text-xs font-display font-semibold border border-primary/30 bg-primary/10 text-primary active:scale-[0.97] transition"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {!wizard && remainingQuestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {remainingQuestions.map(q => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="px-3 py-2 rounded-full text-xs font-display font-semibold border border-border bg-surface-2/30 active:scale-[0.97] transition"
              >
                {q}
              </button>
            ))}
            <button
              onClick={() => { pushYou('+ Add a product'); startWizard(); }}
              className="px-3 py-2 rounded-full text-xs font-display font-semibold border border-primary/30 bg-primary/10 text-primary active:scale-[0.97] transition"
            >
              + Add a product
            </button>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 px-4 py-3 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = input.trim();
          if (trimmed.length === 0) return;
          if (wizard) {
            pushYou(trimmed);
            handleWizardInput(trimmed);
            setInput('');
          } else {
            ask(trimmed);
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={wizard ? 'Type your answer…' : 'Ask Flow anything about your store…'}
          className="flex-1 rounded-full border border-border bg-surface-2/40 px-4 py-3 text-sm"
        />
        <button
          type="submit"
          disabled={input.trim().length === 0}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
