import { useEffect, useMemo, useRef, useState } from 'react';
import { StoreData, TabId } from '@/types/store';
import { addProduct, recordSale, receiveStock } from '@/lib/store-data';
import { flowAddExpense, flowRecordPayment, flowAddInvestment, flowAddLoan, flowAddWithdrawal, flowReceiveStock } from '@/lib/flow-finance-actions';
import { applyTheme, setThemeMode, ThemeMode, THEMES, ThemeId } from '@/lib/theme';
import { showToast } from '@/components/Toast';
import { understand, resolveProduct, responseFor, storeAnalysis, FlowLineItem, OperatingIntent } from '@/lib/flow-operating-engine';
import { understandFlexible } from '@/lib/flow-understanding';
import { loadBrainMemory, learnBrainAlias, rememberBrainContext } from '@/lib/flow-brain-memory';
import { setFlowControl, getFlowControl } from '@/lib/flow-app-controls';
import { resolveFlowSettingCommand, flowSettingsHelp } from '@/lib/flow-settings-resolver';
import { getNextFlowCheckIn, notifyFlowCheckIn, requestFlowNotificationPermission, checkInsQuiet } from '@/lib/flow-checkins';
import { X, Send, History, Plus, Trash2, Volume2, VolumeX, RotateCcw, Bell } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface FlowChatProps { store: StoreData; orders?: any[]; onClose: () => void; onNavigate?: (tab: TabId) => void; onUpdate: (s: StoreData) => void; }
interface ChatAction { label: string; onClick: () => void; }
interface ChatMessage { id: string; from: 'flow' | 'you'; text: string; actions?: ChatAction[]; }
interface ChatSession { id: string; title: string; updatedAt: string; messages: ChatMessage[]; }
interface AddDraft { name: string; costPrice?: number; sellingPrice?: number; quantity?: number; category?: string; }

const SESSION_PREFIX = 'storeflow_flow_sessions_';
const QUICK = ["How's my store?", "What's low?", 'Show my best sellers', "What's not selling?", 'What should I fix?'];
function loadSessions(key: string): ChatSession[] { try { const v = JSON.parse(localStorage.getItem(SESSION_PREFIX + key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveSessions(key: string, sessions: ChatSession[]) { try { localStorage.setItem(SESSION_PREFIX + key, JSON.stringify(sessions.slice(0, 30))); } catch {} }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function clean(s: string) { return s.trim().replace(/\s+/g, ' '); }
function money(n: number) { return `₦${Math.round(n || 0).toLocaleString()}`; }
function num(s: string) { const n = Number(s.replace(/[₦,]/g, '')); return Number.isFinite(n) ? n : undefined; }

function renderFlowText(text: string) {
  const lines = text.split('\n');
  return lines.map((line, index) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={index} className="block min-h-[1.25rem]">
        {parts.map((part, partIndex) => part.startsWith('**') && part.endsWith('**')
          ? <strong key={partIndex} className="font-semibold">{part.slice(2, -2)}</strong>
          : <span key={partIndex}>{part}</span>)}
      </span>
    );
  });
}

function parseNewProduct(text: string): AddDraft | null {
  const body = text.replace(/^\s*(?:add|create|register)\s+(?:a\s+)?(?:new\s+)?(?:product|item)?\s*/i, '').trim();
  if (!body) return null;
  const cost = body.match(/\bcost(?:\s+price)?\s*[:=]?\s*₦?([\d,]+)/i)?.[1];
  const sell = body.match(/\bsell(?:ing)?(?:\s+price)?\s*[:=]?\s*₦?([\d,]+)/i)?.[1];
  const qty = body.match(/\b(?:qty|quantity|stock)\s*[:=]?\s*(\d+)/i)?.[1];
  const category = body.match(/\bcategory\s*[:=]?\s*(.+)$/i)?.[1]?.trim();
  const name = body.split(/\s+(?:cost|buy|sell|qty|quantity|stock|category)\b/i)[0].trim();
  return name ? { name, costPrice: cost ? num(cost) : undefined, sellingPrice: sell ? num(sell) : undefined, quantity: qty ? Number(qty) : undefined, category } : null;
}

export default function FlowChat({ store, onClose, onNavigate, onUpdate }: FlowChatProps) {
  const storeKey = store.id || store.storeId || store.accessCode || 'default';
  const savedBrain = loadBrainMemory(store);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: id('greet'), from: 'flow', text: "Hey 👋 I'm Flow. What would you like to do?" }]);
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(storeKey));
  const [sessionId, setSessionId] = useState(() => id('session'));
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('storeflow_flow_voice') === '1');
  const [lastProductId, setLastProductId] = useState<string | null>(savedBrain.lastProductId || null);
  const [lastIntent, setLastIntent] = useState<OperatingIntent | undefined>(savedBrain.lastIntent as OperatingIntent | undefined);
  const [lastUndo, setLastUndo] = useState<StoreData | null>(null);
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const [addStep, setAddStep] = useState<'cost'|'sell'|'qty'|'category'|'confirm'>('cost');
  const scrollRef = useRef<HTMLDivElement>(null);
  useMemo(() => storeAnalysis(store), [store]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => { localStorage.setItem('storeflow_flow_voice', voiceOn ? '1' : '0'); setFlowControl('voice', voiceOn); }, [voiceOn]);
  useEffect(() => {
    if (checkInsQuiet() || !getFlowControl('notifications', true)) return;
    const check = getNextFlowCheckIn(store);
    if (!check) return;
    const timer = window.setTimeout(() => notifyFlowCheckIn(check), 1400);
    return () => window.clearTimeout(timer);
  }, [store]);
  useEffect(() => {
    if (messages.length <= 1) return;
    setSessions(prev => {
      const next = [...prev];
      const item = { id: sessionId, title: (messages.find(m => m.from === 'you')?.text || 'New chat').slice(0, 42), updatedAt: new Date().toISOString(), messages };
      const i = next.findIndex(s => s.id === sessionId);
      if (i >= 0) next[i] = item; else next.unshift(item);
      saveSessions(storeKey, next); return next;
    });
  }, [messages, sessionId, storeKey]);

  const speak = (text: string) => { if (!voiceOn || !window.speechSynthesis) return; try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').replace(/\n/g, '. ')); u.rate = 1.04; window.speechSynthesis.speak(u); } catch {} };
  const flow = (text: string, actions?: ChatAction[]) => { setMessages(prev => [...prev, { id: id('flow'), from: 'flow', text, actions }]); speak(text); };
  const you = (text: string) => setMessages(prev => [...prev, { id: id('you'), from: 'you', text }]);
  const rememberUndo = () => setLastUndo(store);

  const enableDeviceCheckins = async () => {
    const permission = await requestFlowNotificationPermission();
    if (permission === 'granted') { setFlowControl('notifications', true); flow('Done. I can now send Flow check-ins to this device when I notice something worth your attention.'); const check = getNextFlowCheckIn(store); if (check) notifyFlowCheckIn(check); }
    else if (permission === 'denied') flow('Notifications are blocked by your device/browser. You can allow them in StoreFlow site/app settings.');
    else flow('This device does not support browser notifications here.');
  };

  const executeSales = (items: FlowLineItem[]) => {
    if (!items.length) { flow('I could not match those products to your catalog. Try the exact product name, or teach me an alias.'); return; }
    rememberUndo(); let next = store; let total = 0; let profit = 0; const done: string[] = [];
    for (const item of items) {
      const p = next.products.find(x => x.id === item.product.product.id); if (!p) continue;
      if (p.quantity < item.quantity && !next.managerSettings?.backorderSellingEnabled) { flow(`I stopped before changing anything. **${p.name}** only has ${p.quantity} in stock, but you asked for ${item.quantity}.`); setLastUndo(null); return; }
      next = recordSale(next, p.id, item.quantity, 'Flow', 'FlowChat'); total += item.quantity * p.sellingPrice; profit += item.quantity * (p.sellingPrice - p.costPrice); done.push(`${item.quantity} ${p.name}`);
    }
    onUpdate(next);
    if (items.length === 1) { const p = next.products.find(x => x.id === items[0].product.product.id)!; setLastProductId(p.id); rememberBrainContext(next, { lastIntent: 'sell', lastProductId: p.id, lastTopic: 'sales', lastAction: 'sell' }); flow(`Done — sold **${items[0].quantity} ${p.name}**.\nTotal: **${money(total)}**\nProfit: **${money(profit)}**\nStock: **${p.quantity} remaining**${p.quantity === 0 ? '\n⚠️ Now out of stock.' : ''}`); }
    else { rememberBrainContext(next, { lastIntent: 'sell', lastTopic: 'sales', lastAction: 'batch sell' }); flow(`Done — **${done.length} products sold**.\n${done.map(x => `• ${x}`).join('\n')}\n\nTotal: **${money(total)}**\nProfit: **${money(profit)}**`); }
    showToast('Sale recorded by Flow', 'success');
  };

  const executeRestock = (items: FlowLineItem[], funding: 'balance' | 'new_money' = 'balance') => {
    if (!items.length) { flow('I could not match the products. Tell me the exact catalog names, for example **Add 5 Milo, 3 Peak Milk and 10 Indomie**.'); return; }
    rememberUndo(); let next = store; const done: string[] = [];
    for (const item of items) { const p = next.products.find(x => x.id === item.product.product.id); if (!p) continue; next = flowReceiveStock(next, [{ productId: p.id, quantity: item.quantity, costPrice: p.costPrice }], funding, 'FlowChat'); done.push(`${item.quantity} ${p.name}`); }
    onUpdate(next); setLastProductId(items[0].product.product.id); rememberBrainContext(next, { lastIntent: 'restock', lastProductId: items[0].product.product.id, lastTopic: 'inventory', lastAction: `restock:${funding}` }); flow(`Done — added stock for **${done.length} products** using **${funding === 'new_money' ? 'new money' : 'business balance'}**.\n${done.map(x => `• ${x}`).join('\n')}${funding === 'new_money' ? '\n\nBusiness cash/bank/wallet balances were not reduced.' : ''}`); showToast('Stock updated by Flow', 'success');
  };

  const finishAdd = (draft: AddDraft) => {
    if (draft.costPrice == null || draft.sellingPrice == null || draft.quantity == null || !draft.category) { flow('I still need cost, selling price, quantity and category.'); return; }
    rememberUndo(); const next = addProduct(store, draft); onUpdate(next); setLastProductId(next.products[next.products.length - 1]?.id || null); setAddDraft(null); flow(`Added **${draft.name}** to Inventory.\nStock: ${draft.quantity}\nSelling: ${money(draft.sellingPrice)}\nCost: ${money(draft.costPrice)}.`); showToast('Product added', 'success');
  };

  const handleAddWizard = (text: string) => {
    if (!addDraft) return; const d = { ...addDraft };
    if (addStep === 'cost') { const v = num(text); if (v == null || v < 0) { flow('Give me a valid cost in naira.'); return; } d.costPrice = v; setAddStep('sell'); flow('Selling price?'); }
    else if (addStep === 'sell') { const v = num(text); if (v == null || v <= 0) { flow('Give me a valid selling price.'); return; } d.sellingPrice = v; setAddStep('qty'); flow('How many units do you have?'); }
    else if (addStep === 'qty') { const v = num(text); if (v == null || v < 0) { flow('Give me a valid quantity.'); return; } d.quantity = Math.round(v); setAddStep('category'); flow('What category?'); }
    else if (addStep === 'category') { d.category = text; setAddStep('confirm'); flow(`Add **${d.name}** — cost ${money(d.costPrice || 0)}, sells ${money(d.sellingPrice || 0)}, ${d.quantity} units, category ${d.category}?`, [{ label: 'Add', onClick: () => finishAdd(d) }, { label: 'Cancel', onClick: () => { setAddDraft(null); flow('Cancelled.'); } }]); }
    else if (/^(yes|y|add|confirm|ok|okay)$/i.test(text)) finishAdd(d); else { setAddDraft(null); flow('Cancelled.'); }
    setAddDraft(d);
  };

  const handleFinanceMutation = (raw: string): boolean => {
    const text = clean(raw);
    const q = text.toLowerCase();
    const amountMatch = q.match(/(?:₦\s*)?([\d,]+(?:\.\d+)?)/);
    const amount = amountMatch ? num(amountMatch[1]) : undefined;
    if (!amount || amount <= 0) return false;

    const confirm = (label: string, action: () => void) => {
      flow(`${label}\n\nThis changes your financial records. Continue?`, [
        { label: 'Confirm', onClick: action },
        { label: 'Cancel', onClick: () => flow('Cancelled.') },
      ]);
    };

    const expenseMatch = q.match(/^(?:add|record|log)\s+(?:an?\s+)?expense\s+(?:of\s+)?₦?[\d,]+(?:\.\d+)?(?:\s+(?:for|on)\s+(.+))?$/i);
    if (expenseMatch) {
      const note = expenseMatch[1]?.trim() || 'Recorded by Flow';
      const category = /transport/i.test(note) ? 'Transport' : /rent/i.test(note) ? 'Rent' : /salary|wage/i.test(note) ? 'Salaries' : /utility|electric|power|water/i.test(note) ? 'Utilities' : 'Other';
      confirm(`Record ${money(amount)} as ${category.toLowerCase()} expense${note !== 'Recorded by Flow' ? ` for ${note}` : ''}?`, () => { rememberUndo(); const next = flowAddExpense(store, amount, category, note); onUpdate(next); flow(`Done. Recorded **${money(amount)}** expense.`); showToast('Expense recorded by Flow', 'success'); });
      return true;
    }

    const paymentMatch = q.match(/^(?:record|add|log)\s+(?:a\s+)?payment\s+(?:of\s+)?₦?[\d,]+(?:\.\d+)?\s+(?:from|by)\s+(.+)$/i) || q.match(/^(.+?)\s+(?:paid|has paid)\s+₦?[\d,]+(?:\.\d+)?$/i);
    if (paymentMatch) {
      const customerName = paymentMatch[1].trim();
      const customer = (store.customers || []).find(c => c.name.toLowerCase() === customerName.toLowerCase() || c.name.toLowerCase().includes(customerName.toLowerCase()));
      const pending = customer ? (store.pendingPayments || []).find(p => p.customerName.toLowerCase() === customer.name.toLowerCase() && p.status === 'pending') : undefined;
      if (!pending) { flow(`I couldn't find a pending debt for **${customerName}**. I won't record a payment against the wrong customer.`); return true; }
      const effective = Math.min(amount, pending.balance);
      confirm(`Record ${money(effective)} payment from **${pending.customerName}**?`, () => { rememberUndo(); const next = flowRecordPayment(store, pending.id, effective, 'cash'); onUpdate(next); flow(`Done. **${pending.customerName}** now owes about **${money(Math.max(0, pending.balance - effective))}**.`); showToast('Payment recorded by Flow', 'success'); });
      return true;
    }

    const investmentMatch = q.match(/^(?:add|record)\s+(?:an?\s+)?investment\s+(?:of\s+)?₦?[\d,]+(?:\.\d+)?(?:\s+(?:from|using)\s+(.+))?$/i);
    if (investmentMatch) {
      const source = investmentMatch[1]?.trim() || 'Cash Drawer';
      confirm(`Record ${money(amount)} as a new business investment from ${source}?`, () => { rememberUndo(); const next = flowAddInvestment(store, amount, source, 'Investment recorded by Flow'); onUpdate(next); flow(`Done. Added **${money(amount)}** investment.`); showToast('Investment recorded by Flow', 'success'); });
      return true;
    }

    const loanMatch = q.match(/^(?:add|record|take)\s+(?:a\s+)?loan\s+(?:of\s+)?₦?[\d,]+(?:\.\d+)?(?:\s+from\s+(.+))?$/i);
    if (loanMatch) {
      const source = loanMatch[1]?.trim() || 'Cash Drawer';
      confirm(`Record a **${money(amount)}** loan from ${source}?`, () => { rememberUndo(); const next = flowAddLoan(store, amount, source); onUpdate(next); flow(`Done. Recorded the **${money(amount)}** loan.`); showToast('Loan recorded by Flow', 'success'); });
      return true;
    }

    const withdrawalMatch = q.match(/^(?:record|add|make)\s+(?:an?\s+)?withdrawal\s+(?:of\s+)?₦?[\d,]+(?:\.\d+)?(?:\s+(?:for|on)\s+(.+))?$/i);
    if (withdrawalMatch) {
      const note = withdrawalMatch[1]?.trim() || 'Withdrawal recorded by Flow';
      confirm(`Record a **${money(amount)}** owner withdrawal${note !== 'Withdrawal recorded by Flow' ? ` for ${note}` : ''}?`, () => { rememberUndo(); const next = flowAddWithdrawal(store, amount, note); onUpdate(next); flow(`Done. Recorded **${money(amount)}** withdrawal.`); showToast('Withdrawal recorded by Flow', 'success'); });
      return true;
    }
    return false;
  };

  const handleAppControl = (raw: string): boolean => {
    const text = clean(raw);
    const q = text.toLowerCase();

    if (/^(?:what\s+settings|which\s+settings|what\s+can\s+you\s+control|what\s+can\s+flow\s+control)$/i.test(q)) {
      flow(flowSettingsHelp());
      return true;
    }

    const themeRequest = /\b(change|switch|choose|pick|set)\s+(the\s+)?theme\b|\btheme\s*(settings|options)?\b/.test(q);
    if (themeRequest && !/\b(dark|light|system)\b/.test(q) && !/\btheme\s+(?:to|as)\s+/.test(q)) {
      const actions = THEMES.map(theme => ({ label: theme.label, onClick: () => { applyTheme(theme.id); flow(`${theme.label} mode is on.`); } }));
      flow('Sure. Which theme would you like?', actions);
      return true;
    }
    const explicitTheme = q.match(/\b(dark|light|system)\s*(?:theme|mode)?\b/)?.[1] as ThemeMode | undefined;
    if (explicitTheme) { setThemeMode(explicitTheme); flow(`${explicitTheme[0].toUpperCase() + explicitTheme.slice(1)} mode is on.`); return true; }
    const namedTheme = q.match(/\btheme\s+(?:to|as)\s+(.+)$/)?.[1]?.trim();
    if (namedTheme) {
      const theme = THEMES.find(t => t.id.toLowerCase() === namedTheme || t.label.toLowerCase() === namedTheme || t.label.toLowerCase().includes(namedTheme));
      if (theme) { applyTheme(theme.id); flow(`${theme.label} mode is on.`); return true; }
      flow(`I don't recognize that theme. Try one of: ${THEMES.map(t => t.label).join(', ')}.`);
      return true;
    }

    const universal = resolveFlowSettingCommand(store, text);
    if (universal.handled) {
      if (universal.needsConfirmation && universal.store) {
        flow(`${universal.label} is about to be turned on. This changes a security or automatic-control setting. Continue?`, [
          { label: 'Confirm', onClick: () => { onUpdate(universal.store!); flow(universal.message || `${universal.label} updated.`); showToast(`${universal.label} updated`, 'success'); } },
          { label: 'Cancel', onClick: () => flow('Cancelled.') }
        ]);
      } else if (universal.store) {
        onUpdate(universal.store);
        flow(universal.message || `${universal.label || 'Setting'} updated.`);
        showToast(`${universal.label || 'Setting'} updated`, 'success');
      } else {
        flow(universal.message || 'I could not change that setting.');
      }
      return true;
    }

    const match = q.match(/\b(turn|switch)\s+(on|off)\s+(.+)$|\b(enable|disable)\s+(.+)$|\btoggle\s+(.+)$/);
    if (!match) return false;
    const requested = (match[3] || match[5] || match[6] || '').trim();
    const action = match[2] || (match[4] === 'enable' ? 'on' : match[4] === 'disable' ? 'off' : undefined);
    const aliases: Array<[RegExp, string, string]> = [
      [/^(?:device\s+)?notifications?(?:\s+and\s+check.?ins)?$/, 'notifications', 'Notifications'],
      [/^(?:flow\s+)?voice$/, 'voice', 'Voice'],
      [/^sound$/, 'sound', 'Sound'],
      [/^(?:compact\s+mode|compact)$/, 'compact_mode', 'Compact mode'],
      [/^(?:reduced\s+motion|reduce\s+motion|motion)$/, 'reduced_motion', 'Reduced motion'],
      [/^(?:customer\s+ordering|customer\s+orders?|online\s+ordering)$/, 'customer_ordering', 'Customer ordering']
    ];
    const found = aliases.find(([pattern]) => pattern.test(requested));
    if (!found) return false;
    const name = found[1] as any;
    if (name === 'notifications' && action === 'on') { enableDeviceCheckins(); return true; }
    const enabled = action ? action === 'on' : !getFlowControl(name, true);
    if (name === 'voice') setVoiceOn(enabled);
    else setFlowControl(name, enabled);
    flow(`${found[2]} is ${enabled ? 'on' : 'off'}.`);
    return true;
  };

  const ask = (raw: string) => {
    const text = clean(raw); if (!text) return; you(text);
    if (handleAppControl(text)) return;
    if (handleFinanceMutation(text)) return;
    if (/^(undo|undo that|reverse that|take that back)$/i.test(text)) { if (!lastUndo) flow('There is nothing recent I can undo.'); else { const previous = lastUndo; setLastUndo(null); onUpdate(previous); rememberBrainContext(previous, { lastAction: 'undo' }); flow('Done — I reversed my last change.'); } return; }
    if (addDraft) { handleAddWizard(text); return; }

    // Flexible conversational layer: short topics, partial product names and
    // store-level questions are resolved before the command engine can guess.
    const flexible = understandFlexible(store, text);
    if (flexible.kind === 'store') {
      const overview = responseFor(store, { intent: 'store_overview', confidence: 1, items: [], reason: 'flexible store question' });
      flow(overview);
      rememberBrainContext(store, { lastIntent: 'store_overview', lastTopic: 'store', lastAction: 'store overview' });
      return;
    }
    if (flexible.kind === 'topic') {
      const topicActions: Record<string, ChatAction[]> = {
        theme: [
          { label: 'Change theme', onClick: () => handleAppControl('theme') },
          { label: 'Change color', onClick: () => flow('Which theme color would you like to change?') },
        ],
        settings: [
          { label: 'Settings help', onClick: () => flow(flowSettingsHelp()) },
          { label: 'Theme', onClick: () => handleAppControl('theme') },
        ],
        stock: [
          { label: 'What is low?', onClick: () => ask("What's low?") },
          { label: 'What is out?', onClick: () => ask('What is out of stock?') },
          { label: 'What should I restock?', onClick: () => ask('What should I restock?') },
        ],
        sales: [
          { label: 'Today', onClick: () => ask('How were sales today?') },
          { label: 'Best sellers', onClick: () => ask('Show my best sellers') },
          { label: 'Recent sales', onClick: () => ask('Show my recent sales') },
        ],
        customers: [
          { label: 'Customer count', onClick: () => ask('How many customers do I have?') },
          { label: 'Outstanding debt', onClick: () => ask('How much customer debt do I have?') },
        ],
        expenses: [
          { label: 'Last 30 days', onClick: () => ask('How much did I spend in the last 30 days?') },
          { label: 'Recent expenses', onClick: () => ask('Show my recent expenses') },
        ],
        price: [
          { label: 'Choose a product', onClick: () => flow('Tell me the product name and I’ll check its price.') },
        ],
        restock: [
          { label: 'Simple buy list', onClick: () => { onNavigate?.('inventory'); flow('Open Buy List in Simple mode and choose the products you want.'); } },
          { label: 'Smart Restock', onClick: () => { onNavigate?.('inventory'); flow('Open Smart Restock to automatically build recommendations and allocate the available budget.'); } },
        ],
      };
      flow(flexible.reply, topicActions[flexible.topic]);
      return;
    }
    if (flexible.kind === 'product_choices') {
      const actions = flexible.products.map(product => ({
        label: product.name,
        onClick: () => {
          setLastProductId(product.id);
          rememberBrainContext(store, { lastIntent: 'product_lookup', lastProductId: product.id, lastTopic: 'product', lastAction: 'product selection' });
          flow(responseFor(store, { intent: 'product_lookup', confidence: 1, items: [], product: { product, score: 1, matchedBy: 'exact' }, reason: 'selected product match' }));
        }
      }));
      flow(`I found ${flexible.products.length} products matching **${flexible.query}**. Which one do you mean?`, actions);
      return;
    }
    if (flexible.kind === 'product') {
      const p = flexible.product;
      setLastProductId(p.id);
      rememberBrainContext(store, { lastIntent: 'product_lookup', lastProductId: p.id, lastTopic: 'product', lastAction: 'flexible product lookup' });
      flow(responseFor(store, { intent: 'product_lookup', confidence: flexible.score, items: [], product: { product: p, score: flexible.score, matchedBy: 'fuzzy' }, reason: 'flexible product lookup' }));
      return;
    }

    const lastProduct = lastProductId ? store.products.find(p => p.id === lastProductId) || null : null;
    const plan = understand(store, text, lastProduct, lastIntent); setLastIntent(plan.intent);
    if (plan.product) { setLastProductId(plan.product.product.id); rememberBrainContext(store, { lastIntent: plan.intent, lastProductId: plan.product.product.id, lastTopic: plan.intent === 'product_lookup' ? 'product' : plan.intent, lastAction: plan.intent }); }
    else rememberBrainContext(store, { lastIntent: plan.intent, lastTopic: plan.intent });
    if (plan.intent === 'navigation' && plan.tab) { onNavigate?.(plan.tab); flow(`Opening **${plan.tab.replace(/-/g, ' ')}**.`); return; }
    if (plan.intent === 'settings') {
      if (handleAppControl(text)) return;
      flow('I can control your StoreFlow settings. Tell me what you want to turn on, turn off, or change.'); return;
    }
    if (plan.intent === 'undo') { if (!lastUndo) flow('There is nothing recent I can undo.'); else { const previous = lastUndo; setLastUndo(null); onUpdate(previous); rememberBrainContext(previous, { lastAction: 'undo' }); flow('Done — I reversed my last change.'); } return; }
    if (plan.intent === 'sell') {
      if (!plan.items.length) { flow('I could not match those products to your catalog.'); return; }
      flow(`You are about to sell:\n${plan.items.map(i => `• ${i.quantity} ${i.product.product.name}`).join('\n')}\n\nConfirm the sale?`, [
        { label: 'Confirm sale', onClick: () => executeSales(plan.items) },
        { label: 'Cancel', onClick: () => flow('Sale cancelled.') },
      ]);
      return;
    }
    if (plan.intent === 'restock') {
      if (plan.items.length) {
        const wantsNewMoney = /\b(new\s+money|personal\s+money|outside\s+money|my\s+money)\b/i.test(text);
        executeRestock(plan.items, wantsNewMoney ? 'new_money' : 'balance');
        return;
      }
      const draft = parseNewProduct(text);
      if (draft && !resolveProduct(store, draft.name)) { setAddDraft(draft); setAddStep(draft.costPrice == null ? 'cost' : draft.sellingPrice == null ? 'sell' : draft.quantity == null ? 'qty' : draft.category == null ? 'category' : 'confirm'); flow(`I don't have **${draft.name}** in your catalog. I can add it. ${draft.costPrice == null ? 'What is your cost?' : draft.sellingPrice == null ? 'Selling price?' : draft.quantity == null ? 'Quantity?' : draft.category == null ? 'Category?' : 'Confirm?'}`); return; }
      flow('I could not match that product to your catalog. I will not invent one.'); return;
    }
    if (plan.intent === 'product_lookup' && plan.product && plan.product.score < .9) {
      const p = plan.product.product;
      flow(`I think you mean **${p.name}**. Is that right?`, [{ label: 'Yes — use it', onClick: () => { learnBrainAlias(store, text, p); setLastProductId(p.id); rememberBrainContext(store, { lastProductId: p.id, lastTopic: 'product', lastAction: 'learned alias' }); flow(`Got it. I’ll remember **${text}** as **${p.name}** on this device.`); } }]); return;
    }
    flow(responseFor(store, plan));
  };

  const newChat = () => { const brain = loadBrainMemory(store); setSessionId(id('session')); setMessages([{ id: id('greet'), from: 'flow', text: 'Fresh chat. What should we do?' }]); setLastProductId(brain.lastProductId || null); setLastIntent(brain.lastIntent as OperatingIntent | undefined); setLastUndo(null); setShowHistory(false); };
  const openSession = (s: ChatSession) => { setSessionId(s.id); setMessages(s.messages); setShowHistory(false); };
  const deleteSession = (sid: string) => setSessions(prev => { const n = prev.filter(s => s.id !== sid); saveSessions(storeKey, n); return n; });

  return (<div className="fixed inset-0 z-50 flex flex-col bg-background">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border"><div className="flex items-center gap-2"><div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full"><Mascot size={28} /></div><h3 className="text-base font-display font-bold">Flow</h3></div><div className="flex items-center gap-1"><button onClick={newChat} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"><Plus className="w-5 h-5 text-muted-foreground" /></button><button onClick={() => setShowHistory(true)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"><History className="w-5 h-5 text-muted-foreground" /></button><button onClick={() => lastUndo && (onUpdate(lastUndo), setLastUndo(null), flow('Undone.'))} disabled={!lastUndo} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60 disabled:opacity-30"><RotateCcw className="w-4 h-4" /></button><button onClick={() => enableDeviceCheckins()} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" title="Enable Flow device check-ins"><Bell className="w-4 h-4 text-muted-foreground" /></button><button onClick={() => setVoiceOn(v => !v)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60">{voiceOn ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}</button><button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"><X className="w-5 h-5" /></button></div></div>
    {showHistory && <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowHistory(false)}><div className="w-full sm:max-w-sm max-h-[75vh] bg-background border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between px-4 py-3 border-b border-border"><h4 className="font-display font-bold text-sm">Chat history</h4><button onClick={() => setShowHistory(false)}><X className="w-4 h-4" /></button></div><div className="overflow-y-auto">{sessions.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">No past chats yet.</p> : sessions.map(s => <div key={s.id} className="flex items-center gap-2 px-4 py-3 border-b border-border/60 cursor-pointer hover:bg-surface-2/40" onClick={() => openSession(s)}><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{s.title}</p><p className="text-[11px] text-muted-foreground">{new Date(s.updatedAt).toLocaleString()}</p></div><button onClick={e => { e.stopPropagation(); deleteSession(s.id); }}><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button></div>)}</div></div></div>}
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">{messages.map(m => <div key={m.id} className="flex flex-col gap-1.5" style={{ alignItems: m.from === 'you' ? 'flex-end' : 'flex-start' }}><div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.from === 'flow' ? 'bg-surface-2/60 text-foreground rounded-bl-sm' : 'bg-primary text-primary-foreground rounded-br-sm'}`}>{m.from === 'flow' ? renderFlowText(m.text) : m.text}</div>{m.actions && <div className="flex gap-2 flex-wrap">{m.actions.map(a => <button key={a.label} onClick={a.onClick} className="px-3 py-2 rounded-full text-xs font-display font-semibold border border-primary/30 bg-primary/10 text-primary">{a.label}</button>)}</div>}</div>)}{!addDraft && QUICK.map(q => <button key={q} onClick={() => ask(q)} className="self-start px-3 py-2 rounded-full text-xs font-display font-semibold border border-border bg-surface-2/30">{q}</button>)}</div>
    <form className="flex items-center gap-2 px-4 py-3 border-t border-border" onSubmit={e => { e.preventDefault(); const t = input.trim(); if (!t) return; setInput(''); ask(t); }}><input value={input} onChange={e => setInput(e.target.value)} placeholder={addDraft ? 'Answer Flow…' : 'Tell Flow what to do…'} className="flex-1 rounded-full border border-border bg-surface-2/40 px-4 py-3 text-sm" /><button type="submit" disabled={!input.trim()} className="w-11 h-11 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="w-4 h-4" /></button></form>
  </div>);
}
