import { useState, useRef, useEffect } from 'react';
import { StoreData, TabId } from '@/types/store';
import {
  healthScore, generateAdvice, inventoryIntelligence, analyzeSales,
  expenseAnalysis, flowGreeting, pricingAlerts,
  getProductIntelligence, findProductByName,
} from '@/lib/manager-intel';
import { addProduct, updateProduct, receiveStock } from '@/lib/store-data';
import { THEMES, ThemeId, applyTheme, setThemeMode, ThemeMode } from '@/lib/theme';
import { showToast } from '@/components/Toast';
import { X, Send, Volume2, VolumeX, History, Plus, Trash2 } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface FlowChatProps {
  store: StoreData;
  orders?: any[];
  onClose: () => void;
  onNavigate?: (tab: TabId) => void;
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

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
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

// A parsed command awaiting explicit confirmation before it touches money
// or pricing — restocking spends the business balance, a discount changes
// what customers pay. Everything else (navigation, settings, marking out
// of stock) is reversible/non-financial and runs immediately.
type PendingAction =
  | { type: 'restock'; productId: string; productName: string; qty: number; costPrice: number }
  | { type: 'discount'; productId: string; productName: string; pct: number; newPrice: number };

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

// Free-text tab names → real TabId. Navigation was previously a dead prop —
// onNavigate was passed into this component but never called anywhere.
const NAV_KEYWORDS: { keywords: string[]; tab: TabId }[] = [
  { keywords: ['dashboard', 'home', 'overview'], tab: 'dashboard' },
  { keywords: ['inventory', 'stock', 'products'], tab: 'inventory' },
  { keywords: ['sales', 'pos', 'sell'], tab: 'sales' },
  { keywords: ['history', 'sales history'], tab: 'history' },
  { keywords: ['expenses', 'expense'], tab: 'expenses' },
  { keywords: ['settings'], tab: 'settings' },
  { keywords: ['roi', 'returns'], tab: 'roi' },
  { keywords: ['pending', 'debts', 'owed', 'money owed'], tab: 'pending' },
  { keywords: ['marketplace'], tab: 'marketplace' },
  { keywords: ['orders', 'order'], tab: 'orders' },
  { keywords: ['customers', 'customer'], tab: 'customers' },
  { keywords: ['suppliers', 'supplier'], tab: 'suppliers' },
  { keywords: ['goals', 'goal'], tab: 'goals' },
  { keywords: ['diary'], tab: 'diary' },
  { keywords: ['documents', 'docs'], tab: 'documents' },
  { keywords: ['wishlist', 'wish list'], tab: 'wishlist' },
  { keywords: ['staff', 'employees', 'team'], tab: 'staff' },
  { keywords: ['cash drawer', 'cash'], tab: 'cash-drawer' },
  { keywords: ['finance', 'finances'], tab: 'finance' },
  { keywords: ['reports', 'report'], tab: 'reports' },
  { keywords: ['profile'], tab: 'profile' },
];

const ACCENT_THEME_WORDS: ThemeId[] = THEMES.map(t => t.id);

const SESSIONS_KEY_PREFIX = 'storeflow_flow_sessions_';

function loadSessions(storeId: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY_PREFIX + storeId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(storeId: string, sessions: ChatSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY_PREFIX + storeId, JSON.stringify(sessions.slice(0, 30)));
  } catch {
    // Storage can be unavailable (private browsing, quota) — history just won't persist this session.
  }
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstYou = messages.find(m => m.from === 'you');
  if (!firstYou) return 'New chat';
  const t = firstYou.text.trim();
  return t.length > 42 ? t.slice(0, 42) + '…' : t;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

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

// "restock rice 10" / "restock rice by 10" / "add 10 rice to stock" / "receive 10 rice"
function extractRestockRequest(raw: string): { name: string; qty: number } | null {
  const text = raw.trim();
  let m = text.match(/^restock\s+(.+?)\s+(?:by\s+)?(\d+)$/i);
  if (m) return { name: m[1].trim(), qty: parseInt(m[2], 10) };
  m = text.match(/^(?:add|receive)\s+(\d+)\s+(.+?)(?:\s+to stock)?$/i);
  if (m) return { name: m[2].trim(), qty: parseInt(m[1], 10) };
  return null;
}

// "20% off rice" / "apply 20% discount to rice" / "set 15% discount on rice"
function extractDiscountRequest(raw: string): { name: string; pct: number } | null {
  const text = raw.trim();
  let m = text.match(/^(\d{1,2})%\s*(?:off|discount)\s+(?:on |to |for )?(.+)$/i);
  if (m) return { pct: parseInt(m[1], 10), name: m[2].trim() };
  m = text.match(/^(?:apply|set)\s+(?:a\s+)?(\d{1,2})%\s*discount\s+(?:on |to |for )?(.+)$/i);
  if (m) return { pct: parseInt(m[1], 10), name: m[2].trim() };
  return null;
}

function extractOutOfStockRequest(raw: string): string | null {
  const m = raw.trim().match(/^mark\s+(.+?)\s+(?:as\s+)?out of stock$/i);
  return m ? m[1].trim() : null;
}

function extractNavRequest(raw: string): TabId | null {
  const text = raw.trim().toLowerCase();
  const m = text.match(/^(?:open|go to|show|take me to|navigate to)\s+(.+)$/i);
  const target = m ? m[1].trim() : null;
  if (!target) return null;
  for (const entry of NAV_KEYWORDS) {
    if (entry.keywords.some(k => target === k || target.includes(k))) return entry.tab;
  }
  return null;
}

function extractThemeModeRequest(raw: string): ThemeMode | null {
  const m = raw.trim().match(/^(?:switch to|use|set|turn on)\s+(dark|light|system)(?: mode)?$/i);
  return m ? (m[1].toLowerCase() as ThemeMode) : null;
}

function extractAccentThemeRequest(raw: string): ThemeId | null {
  const m = raw.trim().match(/^(?:switch to|use|set)\s+(\w+)(?:\s+theme)?$/i);
  if (!m) return null;
  const word = m[1].toLowerCase() as ThemeId;
  return ACCENT_THEME_WORDS.includes(word) ? word : null;
}

function extractVoiceRequest(raw: string): boolean | null {
  const m = raw.trim().match(/^turn (on|off) voice$/i);
  return m ? m[1].toLowerCase() === 'on' : null;
}

export default function FlowChat({ store, orders = [], onClose, onNavigate, onUpdate }: FlowChatProps) {
  const storeKey = store.id || store.storeId || 'default';
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(storeKey));
  const [sessionId, setSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'greet', from: 'flow', text: flowGreeting(store) },
  ]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('storeflow_flow_voice') === '1');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('storeflow_flow_voice', voiceOn ? '1' : '0');
  }, [voiceOn]);

  // Autosave the current session whenever it actually has a real exchange
  // (more than just the opening greeting) — this is what makes chats
  // reopenable from the history list.
  useEffect(() => {
    if (messages.length <= 1) return;
    setSessions(prev => {
      const next = [...prev];
      const idx = next.findIndex(s => s.id === sessionId);
      const session: ChatSession = {
        id: sessionId,
        title: titleFromMessages(messages),
        updatedAt: new Date().toISOString(),
        messages,
      };
      if (idx >= 0) next[idx] = session;
      else next.unshift(session);
      next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      saveSessions(storeKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId]);

  const startNewChat = () => {
    setSessionId(`session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    setMessages([{ id: 'greet', from: 'flow', text: flowGreeting(store) }]);
    setAskedIds(new Set());
    setWizard(null);
    setPendingAction(null);
    setShowHistory(false);
  };

  const openSession = (s: ChatSession) => {
    setSessionId(s.id);
    setMessages(s.messages);
    setAskedIds(new Set());
    setWizard(null);
    setPendingAction(null);
    setShowHistory(false);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      saveSessions(storeKey, next);
      return next;
    });
    if (id === sessionId) startNewChat();
  };

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

  const executeConfirmedAction = (action: PendingAction) => {
    if (action.type === 'restock') {
      const updated = receiveStock(
        store,
        [{ productId: action.productId, quantity: action.qty, costPrice: action.costPrice }],
        'balance',
        'FlowChat'
      );
      onUpdate(updated);
      pushFlow(`Done — added ${action.qty} units of **${action.productName}** to stock.`);
      showToast(`${action.productName} restocked (+${action.qty})`, 'success');
    } else if (action.type === 'discount') {
      const updated = updateProduct(store, action.productId, {
        promoPrice: action.newPrice,
        promoUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        promoReason: 'Set via FlowChat',
      });
      onUpdate(updated);
      pushFlow(`Done — **${action.productName}** is now ₦${action.newPrice.toLocaleString()} (${action.pct}% off) for the next 7 days.`);
      showToast(`${action.productName} discounted ${action.pct}%`, 'success');
    }
    setPendingAction(null);
  };

  const cancelPendingAction = () => {
    setPendingAction(null);
    pushFlow('Okay, cancelled — nothing changed.');
  };

  const ask = (question: string) => {
    pushYou(question);
    const markAsked = () => { setAskedIds(prev => new Set(prev).add(question)); setInput(''); };

    // 1. Navigation — "open Inventory", "go to Sales", etc. Non-destructive,
    // runs immediately, no confirmation needed.
    const navTab = extractNavRequest(question);
    if (navTab) {
      onNavigate?.(navTab);
      pushFlow(`Opening ${navTab.replace('-', ' ')}…`);
      markAsked();
      return;
    }

    // 2. Settings — theme / display mode / voice. Reversible, immediate.
    const themeMode = extractThemeModeRequest(question);
    if (themeMode) {
      setThemeMode(themeMode);
      pushFlow(`Switched to ${themeMode} mode.`);
      markAsked();
      return;
    }
    const accentTheme = extractAccentThemeRequest(question);
    if (accentTheme) {
      applyTheme(accentTheme);
      pushFlow(`Switched the theme to ${THEMES.find(t => t.id === accentTheme)?.label || accentTheme}.`);
      markAsked();
      return;
    }
    const voiceReq = extractVoiceRequest(question);
    if (voiceReq !== null) {
      setVoiceOn(voiceReq);
      pushFlow(voiceReq ? "Voice replies are on." : "Voice replies are off.");
      markAsked();
      return;
    }

    // 3. Restock a product — spends money, so confirm first.
    const restockReq = extractRestockRequest(question);
    if (restockReq) {
      const product = findProductByName(store, restockReq.name);
      if (!product) {
        pushFlow(`I couldn't find "${restockReq.name}" in your inventory. Would you like to add it?`, [
          { label: 'Yes, add it', onClick: () => startWizard(restockReq.name) },
          { label: 'No thanks', onClick: () => pushFlow('No problem!') },
        ]);
        markAsked();
        return;
      }
      if (restockReq.qty <= 0) {
        pushFlow("How many units? Try something like \"restock rice 10\".");
        markAsked();
        return;
      }
      const cost = product.costPrice || 0;
      setPendingAction({ type: 'restock', productId: product.id, productName: product.name, qty: restockReq.qty, costPrice: cost });
      pushFlow(`Add ${restockReq.qty} units of **${product.name}** to stock — total cost ₦${(restockReq.qty * cost).toLocaleString()}?`, [
        { label: '✅ Confirm', onClick: () => executeConfirmedAction({ type: 'restock', productId: product.id, productName: product.name, qty: restockReq.qty, costPrice: cost }) },
        { label: 'Cancel', onClick: cancelPendingAction },
      ]);
      markAsked();
      return;
    }

    // 4. Discount a product — changes price, so confirm first.
    const discountReq = extractDiscountRequest(question);
    if (discountReq) {
      const product = findProductByName(store, discountReq.name);
      if (!product) {
        pushFlow(`I couldn't find "${discountReq.name}" in your inventory.`);
        markAsked();
        return;
      }
      if (discountReq.pct <= 0 || discountReq.pct >= 100) {
        pushFlow("That discount doesn't look right — try something like \"20% off rice\".");
        markAsked();
        return;
      }
      const newPrice = Math.round(product.sellingPrice * (1 - discountReq.pct / 100));
      setPendingAction({ type: 'discount', productId: product.id, productName: product.name, pct: discountReq.pct, newPrice });
      pushFlow(`Set **${product.name}** to ₦${newPrice.toLocaleString()} (${discountReq.pct}% off ₦${product.sellingPrice.toLocaleString()}) for 7 days?`, [
        { label: '✅ Confirm', onClick: () => executeConfirmedAction({ type: 'discount', productId: product.id, productName: product.name, pct: discountReq.pct, newPrice }) },
        { label: 'Cancel', onClick: cancelPendingAction },
      ]);
      markAsked();
      return;
    }

    // 5. Mark out of stock — non-financial, reversible by restocking, runs immediately.
    const oosReq = extractOutOfStockRequest(question);
    if (oosReq) {
      const product = findProductByName(store, oosReq);
      if (!product) {
        pushFlow(`I couldn't find "${oosReq}" in your inventory.`);
        markAsked();
        return;
      }
      const updated = updateProduct(store, product.id, { quantity: 0 });
      onUpdate(updated);
      pushFlow(`Marked **${product.name}** as out of stock.`);
      showToast(`${product.name} marked out of stock`, 'success');
      markAsked();
      return;
    }

    // 6. Explicit "add X" request — skip straight to the wizard.
    const addReq = extractAddRequest(question);
    if (addReq) {
      startWizard(addReq);
      markAsked();
      return;
    }

    // 7. "How is X performing/doing" — product lookup, with a graceful
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
      markAsked();
      return;
    }

    // 8. Bare product name typed directly (e.g. just "Indomie").
    const directMatch = findProductByName(store, question);
    if (directMatch && question.trim().split(/\s+/).length <= 4) {
      pushFlow(formatProductIntelligence(store, question));
      markAsked();
      return;
    }

    // 9. Fall back to the rule-based Q&A.
    pushFlow(answerFor(question));
    markAsked();
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
            onClick={startNewChat}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"
            aria-label="Start a new chat"
            title="New chat"
          >
            <Plus className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"
            aria-label="Chat history"
            title="Chat history"
          >
            <History className="w-5 h-5 text-muted-foreground" />
          </button>
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

      {showHistory && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowHistory(false)}>
          <div className="w-full sm:max-w-sm max-h-[75vh] bg-background border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h4 className="font-display font-bold text-sm">Chat history</h4>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2/60">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {sessions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8 px-4">No past chats yet — they'll show up here once you start one.</p>
              )}
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 px-4 py-3 border-b border-border/60 hover:bg-surface-2/40 cursor-pointer ${s.id === sessionId ? 'bg-primary/5' : ''}`}
                  onClick={() => openSession(s)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground">{relativeTime(s.updatedAt)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label={`Delete chat: ${s.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
