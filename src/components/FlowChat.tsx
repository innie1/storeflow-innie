import { useState, useRef, useEffect } from 'react';
import { StoreData } from '@/types/store';
import {
  healthScore, generateAdvice, inventoryIntelligence, analyzeSales,
  expenseAnalysis, flowGreeting, pricingAlerts,
} from '@/lib/manager-intel';
import { X, Send } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface FlowChatProps {
  store: StoreData;
  orders?: any[];
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

interface ChatMessage {
  id: string;
  from: 'flow' | 'you';
  text: string;
}

// Flow has no live model behind it today — every answer below is computed
// straight from the same functions that power the Advice tab, just phrased
// conversationally. Quick-reply buttons cover the common questions; free
// text does simple keyword matching over the same set, with an honest
// fallback for anything it doesn't recognize.
const QUICK_QUESTIONS = [
  "How's my store doing?",
  'What should I restock?',
  'Any pricing issues?',
  "What's not selling?",
  'Any savings ideas?',
];

function answerFor(question: string, store: StoreData, orders: any[]): string {
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

  if (/expense|spending|cost/.test(q)) {
    const ea = expenseAnalysis(store, ['Restock']);
    return `Your biggest expense category is ${ea.largestCategory}, ₦${ea.totalLast30.toLocaleString()} in the last 30 days.`;
  }

  const advice = generateAdvice(store, orders);
  if (advice.length > 0) {
    return `I'm still learning to chat freely, so I can't answer that one directly — but here's my top priority for you right now: ${advice[0].title}. ${advice[0].detail}`;
  }
  return "I'm still learning to chat freely — try one of the quick questions above, or check the Advice tab for a full breakdown.";
}

export default function FlowChat({ store, orders = [], onClose, onNavigate }: FlowChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'greet', from: 'flow', text: flowGreeting(store) },
  ]);
  const [input, setInput] = useState('');
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const ask = (question: string) => {
    const flowReply = answerFor(question, store, orders);
    setMessages(prev => [
      ...prev,
      { id: `you-${Date.now()}`, from: 'you', text: question },
      { id: `flow-${Date.now()}`, from: 'flow', text: flowReply },
    ]);
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
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" aria-label="Close chat">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map(m => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            m.from === 'flow'
              ? 'self-start bg-surface-2/60 text-foreground rounded-bl-sm'
              : 'self-end bg-primary text-primary-foreground rounded-br-sm'
          }`}>
            {m.text}
          </div>
        ))}

        {remainingQuestions.length > 0 && (
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
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 px-4 py-3 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = input.trim();
          if (trimmed.length === 0) return;
          ask(trimmed);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Flow anything about your store…"
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
