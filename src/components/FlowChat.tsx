import { useEffect, useMemo, useRef, useState } from 'react';
import { StoreData, Product, TabId } from '@/types/store';
import { addProduct, recordSale, receiveStock, updateProduct } from '@/lib/store-data';
import { applyTheme, setThemeMode, ThemeMode, THEMES, ThemeId } from '@/lib/theme';
import { showToast } from '@/components/Toast';
import { understand, resolveProduct, snapshot, priorities, storeBrief, productBrief, FlowPlan } from '@/lib/flow-brain';
import { X, Send, History, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface FlowChatProps {
  store: StoreData;
  orders?: any[];
  onClose: () => void;
  onNavigate?: (tab: TabId) => void;
  onUpdate: (s: StoreData) => void;
}

interface ChatAction { label: string; onClick: () => void; }
interface ChatMessage { id: string; from: 'flow' | 'you'; text: string; actions?: ChatAction[]; }
interface ChatSession { id: string; title: string; updatedAt: string; messages: ChatMessage[]; }

type Pending =
  | { kind: 'sell'; product: Product; qty: number }
  | { kind: 'restock'; product: Product; qty: number }
  | { kind: 'discount'; product: Product; pct: number }
  | { kind: 'remove'; product: Product };

type AddDraft = {
  name?: string;
  costPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  category?: string;
};

const SESSION_PREFIX = 'storeflow_flow_sessions_';
const QUICK = [
  "How's my store?",
  'What should I restock?',
  "What's not selling?",
  'Give me ideas to improve my store',
  'Show me my best sellers',
];

function loadSessions(key: string): ChatSession[] {
  try { const v = JSON.parse(localStorage.getItem(SESSION_PREFIX + key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveSessions(key: string, sessions: ChatSession[]) {
  try { localStorage.setItem(SESSION_PREFIX + key, JSON.stringify(sessions.slice(0, 30))); } catch {}
}
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function money(n: number) { return `₦${Math.round(n || 0).toLocaleString()}`; }
function clean(text: string) { return text.trim().replace(/\s+/g, ' '); }
function num(value: string | undefined) { if (!value) return undefined; const n = Number(value.replace(/[₦,]/g, '')); return Number.isFinite(n) ? n : undefined; }

function parseBatch(raw: string): AddDraft[] {
  const body = raw.replace(/^add\s+(?:products?|items?)\s*:?\s*/i, '').trim();
  if (!body) return [];
  const chunks = body.split(/\s*;\s*|\s*\n\s*/).map(clean).filter(Boolean);
  const drafts: AddDraft[] = [];
  for (const chunk of chunks) {
    const nameMatch = chunk.match(/^(.*?)(?:\s+cost\s*[:=]?\s*₦?[\d,]+)?(?:\s+sell(?:ing)?\s*[:=]?\s*₦?[\d,]+)?(?:\s+(?:qty|quantity|stock)\s*[:=]?\s*\d+)?(?:\s+category\s*[:=]?\s*.+)?$/i);
    const name = nameMatch?.[1]?.trim() || chunk.split(/\s+(?:cost|sell|qty|quantity|stock|category)\b/i)[0];
    const cost = num(chunk.match(/\bcost(?:\s+price)?\s*[:=]?\s*₦?([\d,]+(?:\.\d+)?)/i)?.[1]);
    const selling = num(chunk.match(/\bsell(?:ing)?(?:\s+price)?\s*[:=]?\s*₦?([\d,]+(?:\.\d+)?)/i)?.[1]);
    const quantity = num(chunk.match(/\b(?:qty|quantity|stock)\s*[:=]?\s*(\d+)/i)?.[1]);
    const category = chunk.match(/\bcategory\s*[:=]?\s*(.+)$/i)?.[1]?.trim();
    if (name) drafts.push({ name, costPrice: cost, sellingPrice: selling, quantity, category });
  }
  return drafts;
}

function title(messages: ChatMessage[]) {
  const m = messages.find(x => x.from === 'you');
  if (!m) return 'New chat';
  return m.text.length > 42 ? m.text.slice(0, 42) + '…' : m.text;
}

function timeAgo(value: string) {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function productFromPlan(plan: FlowPlan) { return plan.product?.product; }

export default function FlowChat({ store, onClose, onNavigate, onUpdate }: FlowChatProps) {
  const storeKey = store.id || store.storeId || store.accessCode || 'default';
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: id('greet'), from: 'flow', text: `I'm Flow. I know your store data locally. Ask me about the store, sell something, add products, change stock, or tell me to improve the business.` }]);
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(storeKey));
  const [sessionId, setSessionId] = useState(() => id('session'));
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('storeflow_flow_voice') === '1');
  const [pending, setPending] = useState<Pending | null>(null);
  const [addDrafts, setAddDrafts] = useState<AddDraft[] | null>(null);
  const [addIndex, setAddIndex] = useState(0);
  const [addStep, setAddStep] = useState<'cost' | 'sell' | 'qty' | 'category' | 'confirm'>('cost');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => { localStorage.setItem('storeflow_flow_voice', voiceOn ? '1' : '0'); }, [voiceOn]);
  useEffect(() => {
    if (messages.length <= 1) return;
    setSessions(prev => {
      const next = [...prev];
      const item = { id: sessionId, title: title(messages), updatedAt: new Date().toISOString(), messages };
      const index = next.findIndex(s => s.id === sessionId);
      if (index >= 0) next[index] = item; else next.unshift(item);
      saveSessions(storeKey, next);
      return next;
    });
    // storeKey/sessionId are intentionally stable for this chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId]);

  const snap = useMemo(() => snapshot(store), [store]);
  const top = useMemo(() => priorities(store), [store]);

  const speak = (text: string) => {
    if (!voiceOn || !window.speechSynthesis) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').replace(/\n/g, '. ')); u.rate = 1.05; window.speechSynthesis.speak(u); } catch {}
  };
  const flow = (text: string, actions?: ChatAction[]) => { setMessages(prev => [...prev, { id: id('flow'), from: 'flow', text, actions }]); speak(text); };
  const you = (text: string) => setMessages(prev => [...prev, { id: id('you'), from: 'you', text }]);

  const newChat = () => {
    setSessionId(id('session'));
    setMessages([{ id: id('greet'), from: 'flow', text: `Fresh chat. I still have the same live store data. What do you want to do?` }]);
    setPending(null); setAddDrafts(null); setShowHistory(false);
  };
  const openSession = (s: ChatSession) => { setSessionId(s.id); setMessages(s.messages); setPending(null); setAddDrafts(null); setShowHistory(false); };
  const deleteSession = (sid: string) => { setSessions(prev => { const n = prev.filter(s => s.id !== sid); saveSessions(storeKey, n); return n; }); if (sid === sessionId) newChat(); };

  const executePending = (action: Pending) => {
    if (action.kind === 'sell') {
      if (action.qty <= 0) return;
      if (action.product.quantity < action.qty && !(store.managerSettings?.backorderSellingEnabled)) {
        flow(`I stopped that sale because **${action.product.name}** only has ${action.product.quantity} in stock. I won't silently create negative stock.`);
        setPending(null); return;
      }
      onUpdate(recordSale(store, action.product.id, action.qty, 'Flow', 'FlowChat'));
      flow(`Done. Sold ${action.qty} × **${action.product.name}** for ${money(action.qty * action.product.sellingPrice)}.`);
      showToast(`${action.product.name} sale recorded`, 'success');
    } else if (action.kind === 'restock') {
      onUpdate(receiveStock(store, [{ productId: action.product.id, quantity: action.qty, costPrice: action.product.costPrice }], 'balance', 'FlowChat'));
      flow(`Done. Added ${action.qty} × **${action.product.name}** to stock.`);
      showToast(`${action.product.name} restocked`, 'success');
    } else if (action.kind === 'discount') {
      const newPrice = Math.max(1, Math.round(action.product.sellingPrice * (1 - action.pct / 100)));
      onUpdate(updateProduct(store, action.product.id, { promoPrice: newPrice, promoUntil: new Date(Date.now() + 7 * 86400000).toISOString(), promoReason: 'Set via Flow' }));
      flow(`Done. **${action.product.name}** is now ${money(newPrice)} for 7 days (${action.pct}% off).`);
      showToast(`${action.product.name} discounted`, 'success');
    } else {
      onUpdate(updateProduct(store, action.product.id, { discontinued: true }));
      flow(`Done. **${action.product.name}** is discontinued. Its history stays intact.`);
      showToast(`${action.product.name} discontinued`, 'success');
    }
    setPending(null);
  };

  const beginAdd = (drafts: AddDraft[]) => {
    const valid = drafts.filter(d => d.name).map(d => ({ ...d }));
    if (!valid.length) { flow('Tell me the products and I can add them. Example: **add products: Rice cost 500 sell 650 qty 20 category Food; Milk cost 700 sell 900 qty 10 category Drinks**.'); return; }
    setAddDrafts(valid); setAddIndex(0); setAddStep(valid[0].costPrice == null ? 'cost' : valid[0].sellingPrice == null ? 'sell' : valid[0].quantity == null ? 'qty' : valid[0].category == null ? 'category' : 'confirm');
    const d = valid[0];
    flow(`Let's add **${d.name}**${valid.length > 1 ? ` (1 of ${valid.length})` : ''}. ${d.costPrice == null ? 'What is your cost per unit?' : d.sellingPrice == null ? 'What is the selling price?' : d.quantity == null ? 'How many units?' : d.category == null ? 'What category?' : `I have all the details. Add it?`}`);
  };

  const finishAddCurrent = (draft: AddDraft) => {
    if (!draft.name || draft.costPrice == null || draft.sellingPrice == null || draft.quantity == null || !draft.category) { flow('I still need the product name, cost, selling price, quantity and category.'); return; }
    const next = addProduct(store, { name: draft.name, costPrice: draft.costPrice, sellingPrice: draft.sellingPrice, quantity: draft.quantity, category: draft.category });
    onUpdate(next);
    const more = (addDrafts || []).length - addIndex - 1;
    if (more > 0) {
      const ni = addIndex + 1; const d = (addDrafts as AddDraft[])[ni];
      setAddIndex(ni); setAddStep(d.costPrice == null ? 'cost' : d.sellingPrice == null ? 'sell' : d.quantity == null ? 'qty' : d.category == null ? 'category' : 'confirm');
      flow(`Added **${draft.name}**. Now **${d.name}** (${ni + 1} of ${(addDrafts as AddDraft[]).length}). ${d.costPrice == null ? 'Cost per unit?' : d.sellingPrice == null ? 'Selling price?' : d.quantity == null ? 'Quantity?' : d.category == null ? 'Category?' : 'Confirm add?'}`);
    } else {
      flow(`Added **${draft.name}**. All requested products are now in Inventory.`);
      showToast('Products added to inventory', 'success');
      setAddDrafts(null); setAddIndex(0);
    }
  };

  const handleAddInput = (raw: string) => {
    if (!addDrafts) return;
    const draft = { ...addDrafts[addIndex] };
    if (addStep === 'cost') { const v = num(raw); if (v == null || v < 0) { flow('Please give me a valid cost in naira.'); return; } draft.costPrice = v; setAddStep('sell'); flow('Selling price per unit?'); }
    else if (addStep === 'sell') { const v = num(raw); if (v == null || v <= 0) { flow('Please give me a valid selling price.'); return; } draft.sellingPrice = v; setAddStep('qty'); flow('How many units do you have?'); }
    else if (addStep === 'qty') { const v = num(raw); if (v == null || v < 0) { flow('Please give me a valid quantity.'); return; } draft.quantity = Math.round(v); setAddStep('category'); flow('What category is it?'); }
    else if (addStep === 'category') { draft.category = clean(raw); setAddStep('confirm'); flow(`Add **${draft.name}** — cost ${money(draft.costPrice || 0)}, sells ${money(draft.sellingPrice || 0)}, ${draft.quantity} units, category **${draft.category}**?`, [{ label: '✅ Add', onClick: () => finishAddCurrent(draft) }, { label: 'Cancel', onClick: () => { setAddDrafts(null); flow('Cancelled.'); } }]); }
    else if (addStep === 'confirm') { if (/^(yes|y|add|confirm|ok|okay)$/i.test(raw.trim())) finishAddCurrent(draft); else { setAddDrafts(null); flow('Cancelled.'); } }
    setAddDrafts(prev => { if (!prev) return prev; const next = [...prev]; next[addIndex] = draft; return next; });
  };

  const answer = (raw: string, plan: FlowPlan) => {
    const product = productFromPlan(plan);
    switch (plan.intent) {
      case 'store_overview': return storeBrief(store);
      case 'product_lookup': return product ? productBrief(product, store) : 'I need a product name I can match to your catalog. If you mean the whole store, ask **How is my store?**';
      case 'inventory': {
        const urgent = top.filter(x => x.level !== 'opportunity').slice(0, 5);
        return urgent.length ? `Here are the things I would handle first:\n${urgent.map(x => `• **${x.title}** — ${x.detail}`).join('\n')}` : 'Your inventory does not have an obvious urgent issue right now.';
      }
      case 'slow_products': {
        const dead = snap.deadStock.slice(0, 8);
        return dead.length ? `These products have stock but no sale in the last 30 days:\n${dead.map(p => `• **${p.name}** — ${p.quantity} left`).join('\n')}\n\nI would test a bundle or small promotion before buying more.` : 'Nothing is sitting completely idle right now.';
      }
      case 'pricing': {
        const list = snap.underpriced.slice(0, 6);
        if (product) { const margin = product.sellingPrice ? ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100 : 0; return `${productBrief(product, store)}\n\nCurrent gross margin is about ${margin.toFixed(0)}%. I would review that price against your target margin before changing it.`; }
        return list.length ? `Products with thin margins:\n${list.map(p => `• **${p.name}** — ${money(p.sellingPrice)} selling / ${money(p.costPrice)} cost`).join('\n')}` : 'I do not see an obvious thin-margin pricing problem from the current catalog.';
      }
      case 'sales': return `Last 7 days: ${money(snap.revenue7)} revenue and ${money(snap.profit7)} profit.\nLast 30 days: ${snap.unitsSold30} units sold for ${money(snap.revenue30)}.\n\nBest sellers: ${snap.topSellers.length ? snap.topSellers.map(x => `${x.product.name} (${x.units})`).join(', ') : 'not enough sales recorded yet'}.`;
      case 'customers': return `You have ${store.customers?.length || 0} saved customers. Outstanding customer balances are ${money(snap.pendingDebt)}.`;
      case 'expenses': return `Expenses in the last 30 days: ${money(snap.expenses30)}. ${snap.expenses30 > snap.revenue30 * 0.3 ? 'That is high relative to recent revenue, so I would review the largest expense categories.' : 'They are not unusually large compared with recent revenue.'}`;
      case 'cash': return `Local balance snapshot: cash ${money(store.cashBalance || 0)}, bank ${money(store.bankBalance || 0)}, wallet ${money(store.walletBalance || 0)}.`;
      case 'improvement': return `Here is what I would work on next:\n${top.slice(0, 5).map((x, i) => `${i + 1}. **${x.title}** — ${x.detail}`).join('\n')}`;
      case 'help': return `I can work with your real local store data. Try:\n• **How is my store?**\n• **Sell 3 Rice**\n• **Restock Rice 10**\n• **Add product Rice**\n• **Mark Rice out of stock**\n• **20% off Rice**\n• **What's not selling?**\n• **Give me ideas to grow**`;
      default: return 'I understand the store, but that request is not an action I can safely execute yet. Ask me about sales, inventory, pricing, products, customers, expenses, or improvements.';
    }
  };

  const ask = (raw: string) => {
    const text = clean(raw);
    if (!text) return;
    you(text);

    // Explicit confirmations are handled before parsing a new command.
    if (pending) {
      if (/^(yes|y|confirm|do it|okay|ok|go ahead|add it|sell it|restock it|apply)$/i.test(text)) { executePending(pending); return; }
      if (/^(no|n|cancel|stop|don't|do not)$/i.test(text)) { setPending(null); flow('Cancelled — nothing changed.'); return; }
    }
    if (addDrafts) { handleAddInput(text); return; }

    const plan = understand(store, text);

    if (plan.intent === 'navigation' && plan.tab) { onNavigate?.(plan.tab); flow(`Opening **${plan.tab.replace(/-/g, ' ')}**.`); return; }
    if (plan.intent === 'settings') {
      const mode = text.match(/\b(dark|light|system)\b/i)?.[1]?.toLowerCase() as ThemeMode | undefined;
      if (mode) { setThemeMode(mode); flow(`Done. ${mode[0].toUpperCase() + mode.slice(1)} mode is on.`); return; }
      if (/turn on voice/i.test(text)) { setVoiceOn(true); flow('Voice replies are on.'); return; }
      if (/turn off voice/i.test(text)) { setVoiceOn(false); flow('Voice replies are off.'); return; }
      const theme = THEMES.find(t => text.toLowerCase().includes(t.id as string)) as { id: ThemeId; label: string } | undefined;
      if (theme) { applyTheme(theme.id); flow(`Done. I switched to the ${theme.label} theme.`); return; }
    }

    if (plan.intent === 'add_product') {
      const batch = /\badd\s+(?:products?|items?)\b/i.test(text) ? parseBatch(text) : [{ name: plan.fields?.name || text.replace(/^add\s+/i, '').trim(), ...plan.fields }];
      beginAdd(batch); return;
    }
    if (plan.intent === 'sell') {
      const p = productFromPlan(plan);
      if (!p) { flow(`I couldn't safely match **${plan.productName || 'that product'}** to your catalog. Tell me the exact product name, or say **add product ...** if it is genuinely new.`); return; }
      const qty = plan.quantity || 1;
      setPending({ kind: 'sell', product: p, qty });
      flow(`I found **${p.name}**. Sell ${qty} × ${money(p.sellingPrice)} = **${money(qty * p.sellingPrice)}**?`, [{ label: '✅ Confirm sale', onClick: () => executePending({ kind: 'sell', product: p, qty }) }, { label: 'Cancel', onClick: () => { setPending(null); flow('Cancelled.'); } }]);
      return;
    }
    if (plan.intent === 'restock') {
      const p = productFromPlan(plan);
      if (!p) { flow(`I couldn't safely match **${plan.productName || 'that product'}**. I won't invent a product. Try the exact catalog name or add it first.`); return; }
      const qty = plan.quantity || 1;
      setPending({ kind: 'restock', product: p, qty });
      flow(`Restock ${qty} × **${p.name}** at ${money(p.costPrice)} each — about ${money(qty * p.costPrice)}?`, [{ label: '✅ Confirm restock', onClick: () => executePending({ kind: 'restock', product: p, qty }) }, { label: 'Cancel', onClick: () => { setPending(null); flow('Cancelled.'); } }]);
      return;
    }
    if (plan.intent === 'discount') {
      const p = productFromPlan(plan); const pct = plan.percentage;
      if (!p || pct == null) { flow(`Tell me the product and discount, for example **20% off Rice**.`); return; }
      if (pct <= 0 || pct >= 100) { flow('Use a discount between 1% and 99%.'); return; }
      setPending({ kind: 'discount', product: p, pct });
      const newPrice = Math.max(1, Math.round(p.sellingPrice * (1 - pct / 100)));
      flow(`Set **${p.name}** from ${money(p.sellingPrice)} to **${money(newPrice)}** for 7 days?`, [{ label: '✅ Apply', onClick: () => executePending({ kind: 'discount', product: p, pct }) }, { label: 'Cancel', onClick: () => { setPending(null); flow('Cancelled.'); } }]);
      return;
    }
    if (plan.intent === 'mark_out_of_stock') {
      const p = productFromPlan(plan);
      if (!p) { flow(`I couldn't safely match **${plan.productName || 'that product'}** to your catalog.`); return; }
      onUpdate(updateProduct(store, p.id, { quantity: 0 }));
      flow(`Done. **${p.name}** is marked out of stock.`);
      return;
    }
    if (plan.intent === 'remove_product') {
      const p = productFromPlan(plan);
      if (!p) { flow(`I couldn't safely match **${plan.productName || 'that product'}**. Nothing was removed.`); return; }
      setPending({ kind: 'remove', product: p });
      flow(`Remove **${p.name}** from active products? Its historical data will remain available.`, [{ label: '✅ Discontinue', onClick: () => executePending({ kind: 'remove', product: p }) }, { label: 'Cancel', onClick: () => { setPending(null); flow('Cancelled.'); } }]);
      return;
    }

    // Product questions are resolved against the real catalog before generic Q&A.
    const direct = resolveProduct(store, text);
    if (direct && direct.score >= 0.78 && text.split(/\s+/).length <= 5) {
      flow(productBrief(direct.product, store));
      return;
    }

    flow(answer(text, plan));
  };

  const remaining = QUICK;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2"><Mascot size={28} /><h3 className="text-base font-display font-bold">Chat with Flow</h3></div>
        <div className="flex items-center gap-1">
          <button onClick={newChat} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" title="New chat"><Plus className="w-5 h-5 text-muted-foreground" /></button>
          <button onClick={() => setShowHistory(true)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" title="History"><History className="w-5 h-5 text-muted-foreground" /></button>
          <button onClick={() => setVoiceOn(v => !v)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" title="Voice">{voiceOn ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}</button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" title="Close"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {showHistory && <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowHistory(false)}>
        <div className="w-full sm:max-w-sm max-h-[75vh] bg-background border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border"><h4 className="font-display font-bold text-sm">Chat history</h4><button onClick={() => setShowHistory(false)}><X className="w-4 h-4" /></button></div>
          <div className="overflow-y-auto">{sessions.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">No past chats yet.</p> : sessions.map(s => <div key={s.id} className="flex items-center gap-2 px-4 py-3 border-b border-border/60 cursor-pointer hover:bg-surface-2/40" onClick={() => openSession(s)}><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{s.title}</p><p className="text-[11px] text-muted-foreground">{timeAgo(s.updatedAt)}</p></div><button onClick={e => { e.stopPropagation(); deleteSession(s.id); }}><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button></div>)}</div>
        </div>
      </div>}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map(m => <div key={m.id} className="flex flex-col gap-1.5" style={{ alignItems: m.from === 'you' ? 'flex-end' : 'flex-start' }}>
          <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${m.from === 'flow' ? 'bg-surface-2/60 text-foreground rounded-bl-sm' : 'bg-primary text-primary-foreground rounded-br-sm'}`}>{m.text}</div>
          {m.actions && <div className="flex gap-2 flex-wrap">{m.actions.map(a => <button key={a.label} onClick={a.onClick} className="px-3 py-2 rounded-full text-xs font-display font-semibold border border-primary/30 bg-primary/10 text-primary">{a.label}</button>)}</div>}
        </div>)}
        {!addDrafts && remaining.map(q => <button key={q} onClick={() => ask(q)} className="self-start px-3 py-2 rounded-full text-xs font-display font-semibold border border-border bg-surface-2/30">{q}</button>)}
      </div>

      <form className="flex items-center gap-2 px-4 py-3 border-t border-border" onSubmit={e => { e.preventDefault(); const t = input.trim(); if (!t) return; setInput(''); ask(t); }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={addDrafts ? 'Answer Flow…' : 'Ask Flow anything about your store…'} className="flex-1 rounded-full border border-border bg-surface-2/40 px-4 py-3 text-sm" />
        <button type="submit" disabled={!input.trim()} className="w-11 h-11 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
