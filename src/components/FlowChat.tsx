import { useEffect, useMemo, useRef, useState } from 'react';
import { StoreData, Product, TabId } from '@/types/store';
import { addProduct, recordSale, receiveStock } from '@/lib/store-data';
import { applyTheme, setThemeMode, ThemeMode, THEMES, ThemeId } from '@/lib/theme';
import { showToast } from '@/components/Toast';
import { understand, resolveProduct, responseFor, storeAnalysis, FlowLineItem, OperatingIntent } from '@/lib/flow-operating-engine';
import { setFlowControl, getFlowControl } from '@/lib/flow-app-controls';
import { getNextFlowCheckIn, notifyFlowCheckIn, requestFlowNotificationPermission, markFlowCheckInSeen, checkInsQuiet } from '@/lib/flow-checkins';
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
function parseNewProduct(text: string): AddDraft | null {
  const body = text.replace(/^\s*(?:add|create|register)\s+(?:a\s+)?(?:new\s+)?(?:product|item)?\s*/i, '').trim(); if (!body) return null;
  const cost = body.match(/\bcost(?:\s+price)?\s*[:=]?\s*₦?([\d,]+)/i)?.[1]; const sell = body.match(/\bsell(?:ing)?(?:\s+price)?\s*[:=]?\s*₦?([\d,]+)/i)?.[1]; const qty = body.match(/\b(?:qty|quantity|stock)\s*[:=]?\s*(\d+)/i)?.[1]; const category = body.match(/\bcategory\s*[:=]?\s*(.+)$/i)?.[1]?.trim();
  const name = body.split(/\s+(?:cost|buy|sell|qty|quantity|stock|category)\b/i)[0].trim(); return name ? { name, costPrice: cost ? num(cost) : undefined, sellingPrice: sell ? num(sell) : undefined, quantity: qty ? Number(qty) : undefined, category } : null;
}

export default function FlowChat({ store, onClose, onNavigate, onUpdate }: FlowChatProps) {
  const storeKey = store.id || store.storeId || store.accessCode || 'default';
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: id('greet'), from: 'flow', text: "I'm Flow. I can operate your store and control StoreFlow locally — sales, stock, analysis, navigation and settings. Try 'Sell 2 Indomie' or 'Turn dark mode on'." }]);
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(storeKey)); const [sessionId, setSessionId] = useState(() => id('session')); const [input, setInput] = useState(''); const [showHistory, setShowHistory] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem('storeflow_flow_voice') === '1'); const [lastProductId, setLastProductId] = useState<string | null>(null); const [lastIntent, setLastIntent] = useState<OperatingIntent | undefined>(); const [lastUndo, setLastUndo] = useState<StoreData | null>(null);
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null); const [addStep, setAddStep] = useState<'cost'|'sell'|'qty'|'category'|'confirm'>('cost'); const scrollRef = useRef<HTMLDivElement>(null);
  useMemo(() => storeAnalysis(store), [store]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => { localStorage.setItem('storeflow_flow_voice', voiceOn ? '1' : '0'); setFlowControl('voice', voiceOn); }, [voiceOn]);
  useEffect(() => {
    if (checkInsQuiet() || !getFlowControl('notifications', true)) return;
    const check = getNextFlowCheckIn(store); if (!check) return;
    const timer = window.setTimeout(() => { notifyFlowCheckIn(check); }, 1400);
    return () => window.clearTimeout(timer);
  }, [store]);
  useEffect(() => { if (messages.length <= 1) return; setSessions(prev => { const next = [...prev]; const item = { id: sessionId, title: (messages.find(m => m.from === 'you')?.text || 'New chat').slice(0, 42), updatedAt: new Date().toISOString(), messages }; const i = next.findIndex(s => s.id === sessionId); if (i >= 0) next[i] = item; else next.unshift(item); saveSessions(storeKey, next); return next; }); }, [messages, sessionId, storeKey]);

  const speak = (text: string) => { if (!voiceOn || !window.speechSynthesis) return; try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').replace(/\n/g, '. ')); u.rate = 1.04; window.speechSynthesis.speak(u); } catch {} };
  const flow = (text: string, actions?: ChatAction[]) => { setMessages(prev => [...prev, { id: id('flow'), from: 'flow', text, actions }]); speak(text); }; const you = (text: string) => setMessages(prev => [...prev, { id: id('you'), from: 'you', text }]);
  const rememberUndo = () => setLastUndo(store);

  const enableDeviceCheckins = async () => { const permission = await requestFlowNotificationPermission(); if (permission === 'granted') { setFlowControl('notifications', true); flow('Done. I can now send Flow check-ins to this device when I notice something worth your attention.'); const check = getNextFlowCheckIn(store); if (check) notifyFlowCheckIn(check); } else if (permission === 'denied') flow('Notifications are blocked by your device/browser. You can allow them in StoreFlow site/app settings.'); else flow('This device does not support browser notifications here.'); };

  const executeSales = (items: FlowLineItem[]) => {
    if (!items.length) { flow('I could not match those products to your catalog. Try the exact product name, or teach me an alias.'); return; }
    rememberUndo(); let next = store; let total = 0; let profit = 0; const done: string[] = [];
    for (const item of items) { const p = next.products.find(x => x.id === item.product.product.id); if (!p) continue; if (p.quantity < item.quantity && !next.managerSettings?.backorderSellingEnabled) { flow(`I stopped before changing anything. **${p.name}** only has ${p.quantity} in stock, but you asked for ${item.quantity}.`); setLastUndo(null); return; } next = recordSale(next, p.id, item.quantity, 'Flow', 'FlowChat'); total += item.quantity * p.sellingPrice; profit += item.quantity * (p.sellingPrice - p.costPrice); done.push(`${item.quantity} ${p.name}`); }
    onUpdate(next); if (items.length === 1) { const p = next.products.find(x => x.id === items[0].product.product.id)!; setLastProductId(p.id); flow(`Done — sold **${items[0].quantity} ${p.name}**.\nTotal: **${money(total)}**\nProfit: **${money(profit)}**\nStock: **${p.quantity} remaining**${p.quantity === 0 ? '\n⚠️ Now out of stock.' : ''}`); } else flow(`Done — **${done.length} products sold**.\n${done.map(x => `• ${x}`).join('\n')}\n\nTotal: **${money(total)}**\nProfit: **${money(profit)}**`); showToast('Sale recorded by Flow', 'success');
  };
  const executeRestock = (items: FlowLineItem[]) => {
    if (!items.length) { flow('I could not match the products. Tell me the exact catalog names, for example **Add 5 Milo, 3 Peak Milk and 10 Indomie**.'); return; }
    rememberUndo(); let next = store; const done: string[] = []; for (const item of items) { const p = next.products.find(x => x.id === item.product.product.id); if (!p) continue; next = receiveStock(next, [{ productId: p.id, quantity: item.quantity, costPrice: p.costPrice }], 'balance', 'FlowChat'); done.push(`${item.quantity} ${p.name}`); }
    onUpdate(next); setLastProductId(items[0].product.product.id); flow(`Done — added stock for **${done.length} products**.\n${done.map(x => `• ${x}`).join('\n')}`); showToast('Stock updated by Flow', 'success');
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

  const ask = (raw: string) => {
    const text = clean(raw); if (!text) return; you(text);
    if (/^(undo|undo that|reverse that|take that back)$/i.test(text)) { if (!lastUndo) flow('There is nothing recent I can undo.'); else { const previous = lastUndo; setLastUndo(null); onUpdate(previous); flow('Done — I reversed my last change.'); } return; }
    if (addDraft) { handleAddWizard(text); return; }
    const lastProduct = lastProductId ? store.products.find(p => p.id === lastProductId) || null : null; const plan = understand(store, text, lastProduct, lastIntent); setLastIntent(plan.intent); if (plan.product) setLastProductId(plan.product.product.id);
    if (plan.intent === 'navigation' && plan.tab) { onNavigate?.(plan.tab); flow(`Opening **${plan.tab.replace(/-/g, ' ')}**.`); return; }
    if (plan.intent === 'settings') {
      const mode = text.match(/\b(dark|light|system)\b/i)?.[1]?.toLowerCase() as ThemeMode | undefined;
      if (mode) { setThemeMode(mode); flow(`${mode[0].toUpperCase() + mode.slice(1)} mode is on.`); return; }
      if (/turn (on|off) (voice|sound)/i.test(text)) { const on = /turn on/i.test(text); setVoiceOn(on); setFlowControl(/voice/i.test(text) ? 'voice' : 'sound', on); flow(`${/voice/i.test(text) ? 'Voice' : 'Sound'} is ${on ? 'on' : 'off'}.`); return; }
      if (/turn (on|off) notifications?/i.test(text)) { const on = /turn on/i.test(text); if (on) { enableDeviceCheckins(); } else { setFlowControl('notifications', false); flow('Notifications are off. I will stop Flow device check-ins.'); } return; }
      if (/turn (on|off) compact mode/i.test(text)) { const on = /turn on/i.test(text); setFlowControl('compact_mode', on); flow(`Compact mode is ${on ? 'on' : 'off'}.`); return; }
      if (/reduce motion|turn (on|off) reduced motion/i.test(text)) { const on = /reduce motion/i.test(text) || /turn on/i.test(text); setFlowControl('reduced_motion', on); flow(`Reduced motion is ${on ? 'on' : 'off'}.`); return; }
      if (/customer ordering.*(on|off)|turn (on|off).*customer ordering/i.test(text)) { const on = /turn on/i.test(text) || /customer ordering.*on/i.test(text); setFlowControl('customer_ordering', on); flow(`Customer ordering is ${on ? 'on' : 'off'}.`); return; }
      const theme = THEMES.find(t => text.toLowerCase().includes(t.id as string)) as { id: ThemeId; label: string } | undefined; if (theme) { applyTheme(theme.id); flow(`Switched to ${theme.label}.`); return; }
      if (/enable device check.?ins|allow flow notifications/i.test(text)) { enableDeviceCheckins(); return; }
      flow('I can control theme, voice, sound, notifications, compact mode, reduced motion and customer ordering.'); return;
    }
    if (plan.intent === 'undo') { if (!lastUndo) flow('There is nothing recent I can undo.'); else { const previous = lastUndo; setLastUndo(null); onUpdate(previous); flow('Done — I reversed my last change.'); } return; }
    if (plan.intent === 'sell') { executeSales(plan.items); return; }
    if (plan.intent === 'restock') { if (plan.items.length) { executeRestock(plan.items); return; } const draft = parseNewProduct(text); if (draft && !resolveProduct(store, draft.name)) { setAddDraft(draft); setAddStep(draft.costPrice == null ? 'cost' : draft.sellingPrice == null ? 'sell' : draft.quantity == null ? 'qty' : draft.category == null ? 'category' : 'confirm'); flow(`I don't have **${draft.name}** in your catalog. I can add it. ${draft.costPrice == null ? 'What is your cost?' : draft.sellingPrice == null ? 'Selling price?' : draft.quantity == null ? 'Quantity?' : draft.category == null ? 'Category?' : 'Confirm?'}`); return; } flow('I could not match that product to your catalog. I will not invent one.'); return; }
    if (plan.intent === 'product_lookup' && plan.product && plan.product.score < .9) { const p = plan.product.product; flow(`I think you mean **${p.name}**. Is that right?`, [{ label: 'Yes — use it', onClick: () => { setLastProductId(p.id); flow(`Got it. I'll remember **${p.name}** for this chat.`); } }]); return; }
    flow(responseFor(store, plan));
  };

  const newChat = () => { setSessionId(id('session')); setMessages([{ id: id('greet'), from: 'flow', text: 'Fresh chat. I still have your live store data and can control the app too. What should we do?' }]); setLastProductId(null); setLastIntent(undefined); setLastUndo(null); setShowHistory(false); };
  const openSession = (s: ChatSession) => { setSessionId(s.id); setMessages(s.messages); setShowHistory(false); };
  const deleteSession = (sid: string) => setSessions(prev => { const n = prev.filter(s => s.id !== sid); saveSessions(storeKey, n); return n; });

  return (<div className="fixed inset-0 z-50 flex flex-col bg-background">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border"><div className="flex items-center gap-2"><Mascot size={28} /><h3 className="text-base font-display font-bold">Flow</h3><span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Local Brain</span></div><div className="flex items-center gap-1"><button onClick={newChat} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"><Plus className="w-5 h-5 text-muted-foreground" /></button><button onClick={() => setShowHistory(true)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"><History className="w-5 h-5 text-muted-foreground" /></button><button onClick={() => lastUndo && (onUpdate(lastUndo), setLastUndo(null), flow('Undone.'))} disabled={!lastUndo} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60 disabled:opacity-30"><RotateCcw className="w-4 h-4" /></button><button onClick={() => enableDeviceCheckins()} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" title="Enable Flow device check-ins"><Bell className="w-4 h-4 text-muted-foreground" /></button><button onClick={() => setVoiceOn(v => !v)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60">{voiceOn ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}</button><button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60"><X className="w-5 h-5" /></button></div></div>
    {showHistory && <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowHistory(false)}><div className="w-full sm:max-w-sm max-h-[75vh] bg-background border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between px-4 py-3 border-b border-border"><h4 className="font-display font-bold text-sm">Chat history</h4><button onClick={() => setShowHistory(false)}><X className="w-4 h-4" /></button></div><div className="overflow-y-auto">{sessions.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">No past chats yet.</p> : sessions.map(s => <div key={s.id} className="flex items-center gap-2 px-4 py-3 border-b border-border/60 cursor-pointer hover:bg-surface-2/40" onClick={() => openSession(s)}><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{s.title}</p><p className="text-[11px] text-muted-foreground">{new Date(s.updatedAt).toLocaleString()}</p></div><button onClick={e => { e.stopPropagation(); deleteSession(s.id); }}><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button></div>)}</div></div></div>}
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">{messages.map(m => <div key={m.id} className="flex flex-col gap-1.5" style={{ alignItems: m.from === 'you' ? 'flex-end' : 'flex-start' }}><div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${m.from === 'flow' ? 'bg-surface-2/60 text-foreground rounded-bl-sm' : 'bg-primary text-primary-foreground rounded-br-sm'}`}>{m.text}</div>{m.actions && <div className="flex gap-2 flex-wrap">{m.actions.map(a => <button key={a.label} onClick={a.onClick} className="px-3 py-2 rounded-full text-xs font-display font-semibold border border-primary/30 bg-primary/10 text-primary">{a.label}</button>)}</div>}</div>)}{!addDraft && QUICK.map(q => <button key={q} onClick={() => ask(q)} className="self-start px-3 py-2 rounded-full text-xs font-display font-semibold border border-border bg-surface-2/30">{q}</button>)}</div>
    <form className="flex items-center gap-2 px-4 py-3 border-t border-border" onSubmit={e => { e.preventDefault(); const t = input.trim(); if (!t) return; setInput(''); ask(t); }}><input value={input} onChange={e => setInput(e.target.value)} placeholder={addDraft ? 'Answer Flow…' : 'Tell Flow what to do…'} className="flex-1 rounded-full border border-border bg-surface-2/40 px-4 py-3 text-sm" /><button type="submit" disabled={!input.trim()} className="w-11 h-11 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send"><Send className="w-4 h-4" /></button></form>
  </div>);
}
