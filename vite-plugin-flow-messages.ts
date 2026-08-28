import type { Plugin } from 'vite';

const FLOW_CHAT = '/src/components/FlowChat.tsx';
const MANAGER = '/src/components/Manager.tsx';

function patchFlowChat(source: string): string {
  let code = source;

  const engineImport = "import { understand, resolveProduct, responseFor, storeAnalysis, FlowLineItem, OperatingIntent } from '@/lib/flow-operating-engine';";
  const messageImport = "import { buildFlowOrderWhatsAppMessage, createFlowMessageOrder, formatFlowOrderReceipt, isFlowMessageOrderRequest, parseFlowMessageOrder, supportsFlowMessageOrders, whatsappUrl, type FlowMessageOrderDraft } from '@/lib/flow-message-orders';";
  if (!code.includes(messageImport)) {
    if (!code.includes(engineImport)) throw new Error('[flow-messages] Flow operating engine import anchor missing');
    code = code.replace(engineImport, `${engineImport}\n${messageImport}`);
  }

  code = code.replace(
    "import { X, Send, History, Plus, Trash2, Volume2, VolumeX, RotateCcw, Bell, FileUp, FileText, KeyRound } from 'lucide-react';",
    "import { X, Send, History, Plus, Trash2, Volume2, VolumeX, RotateCcw, Bell, FileUp, FileText, KeyRound, Mic, MicOff } from 'lucide-react';",
  );

  code = code.replace(
    "const [messages, setMessages] = useState<ChatMessage[]>([{ id: id('greet'), from: 'flow', text: \"Hey 👋 I'm Flow. What would you like to do?\" }]);",
    "const [messages, setMessages] = useState<ChatMessage[]>([{ id: id('greet'), from: 'flow', text: \"Hey 👋 I'm Flow. Message me what you need. If this store takes orders, you can type or speak the customer's full order and I'll build the receipt.\" }]);",
  );

  // The existing prebuild attachment script inserts more state immediately
  // after restockCodeInput. Anchor to the one stable line instead of requiring
  // restockCodeInput and scrollRef to stay adjacent.
  const stateAnchor = "  const [restockCodeInput, setRestockCodeInput] = useState('');";
  if (!code.includes('const recognitionRef = useRef<any>(null);')) {
    if (!code.includes(stateAnchor)) throw new Error('[flow-messages] Flow voice state anchor missing');
    code = code.replace(
      stateAnchor,
      `${stateAnchor}\n  const [isListening, setIsListening] = useState(false);\n  const recognitionRef = useRef<any>(null);`,
    );
  }

  const financeAnchor = '  const handleFinanceMutation = (raw: string): boolean => {';
  if (!code.includes('const handleFlowMessageOrder = (text: string): boolean =>')) {
    if (!code.includes(financeAnchor)) throw new Error('[flow-messages] Finance handler anchor missing');
    const handlers = `  const sendFlowOrderToWhatsApp = (order: any) => {
    if (!order?.customer_phone) { flow('This order has no customer phone number, so I cannot open WhatsApp for it.'); return; }
    const message = buildFlowOrderWhatsAppMessage(store, order);
    const history = Array.isArray((store as any).communicationHistory) ? (store as any).communicationHistory : [];
    const next = {
      ...store,
      communicationHistory: [...history, {
        id: id('comm'), channel: 'whatsapp', direction: 'outbound',
        customerName: order.customer_name || '', customerPhone: order.customer_phone || '',
        message, orderNumber: order.order_number, source: 'flow_message', createdAt: new Date().toISOString(),
      }],
    } as StoreData;
    onUpdate(next);
    window.open(whatsappUrl(order.customer_phone, message), '_blank', 'noopener,noreferrer');
  };

  const finalizeFlowMessageOrder = async (draft: FlowMessageOrderDraft) => {
    try {
      flow('Creating the order and receipt…');
      const order = await createFlowMessageOrder(store, draft);
      flow(\`Order created ✅\\n\\n\${formatFlowOrderReceipt(store, order)}\`, [
        { label: 'WhatsApp customer', onClick: () => sendFlowOrderToWhatsApp(order) },
        { label: 'Open Orders', onClick: () => onNavigate?.('orders') },
      ]);
      showToast(\`Order \${order.order_number} created by Flow\`, 'success');
    } catch (error: any) {
      flow(\`I couldn't create that order. **\${error?.message || 'Please try again.'}**\`);
      showToast('Flow could not create the order', 'error');
    }
  };

  const handleFlowMessageOrder = (text: string): boolean => {
    if (!isFlowMessageOrderRequest(store, text)) return false;
    const draft = parseFlowMessageOrder(store, text);
    if (!draft.items.length) {
      flow('I heard that as a customer order, but I could not safely match any item to this store’s catalogue. Say the exact product or service names and I’ll try again.');
      return true;
    }
    const unavailable = draft.items.filter(item => !item.product.isService && item.quantity > Number(item.product.quantity || 0) && !store.managerSettings?.backorderSellingEnabled);
    if (unavailable.length) {
      flow(\`I matched the order, but I won't create it yet because there isn't enough stock for:\\n\${unavailable.map(item => \`• \${item.product.name}: requested \${item.quantity}, available \${item.product.quantity}\`).join('\\n')}\`);
      return true;
    }
    const missing = [!draft.customerName && 'customer name', !draft.customerPhone && 'customer phone'].filter(Boolean);
    if (missing.length) {
      flow(\`I picked the items, but I still need the **\${missing.join(' and ')}** before I can create a real order. Say the order again with that detail included.\`);
      return true;
    }
    const summary = draft.items.map(item => \`• \${item.quantity} × \${item.label} — \${money(item.subtotal)}\`).join('\\n');
    flow(\`I picked this order for **\${draft.customerName}**:\\n\${summary}\\n\\nTotal: **\${money(draft.total)}**\\n\\nCreate the order and receipt?\`, [
      { label: 'Create order', onClick: () => void finalizeFlowMessageOrder(draft) },
      { label: 'Cancel', onClick: () => flow('Order cancelled. Nothing was changed.') },
    ]);
    return true;
  };

`;
    code = code.replace(financeAnchor, handlers + financeAnchor);
  }

  const askAnchor = "    if (handleAppControl(text)) return;\n    if (handleFinanceMutation(text)) return;";
  const askPatch = "    if (handleFlowMessageOrder(text)) return;\n    if (handleAppControl(text)) return;\n    if (handleFinanceMutation(text)) return;";
  if (code.includes(askAnchor)) code = code.replace(askAnchor, askPatch);
  else if (!code.includes('if (handleFlowMessageOrder(text)) return;')) throw new Error('[flow-messages] ask() anchor missing');

  const newChatAnchor = "  const newChat = () => { const brain = loadBrainMemory(store);";
  if (!code.includes('const startFlowVoiceInput = () =>')) {
    if (!code.includes(newChatAnchor)) throw new Error('[flow-messages] newChat anchor missing');
    const voiceHandler = `  const startFlowVoiceInput = () => {
    if (isListening) {
      try { recognitionRef.current?.stop?.(); } catch {}
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      flow('Voice input is not supported by this browser. You can still type the customer order here.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-NG';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsListening(true);
      recognition.onerror = () => { setIsListening(false); flow('I could not hear that clearly. Tap the microphone and try again.'); };
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
        if (!transcript) return;
        setInput('');
        ask(transcript);
      };
      recognition.start();
    } catch {
      setIsListening(false);
      flow('I could not start the microphone. Check microphone permission and try again.');
    }
  };

`;
    code = code.replace(newChatAnchor, voiceHandler + newChatAnchor);
  }

  code = code.replace(
    "<h3 className=\"text-base font-display font-bold\">Flow</h3>",
    "<div><h3 className=\"text-base font-display font-bold\">Flow Messages</h3><p className=\"text-[10px] text-muted-foreground\">Talk, take orders & message customers</p></div>",
  );
  code = code.replace('>Chat history</h4>', '>Message history</h4>');
  code = code.replace('>No past chats yet.</p>', '>No past messages yet.</p>');
  code = code.replace("title: (messages.find(m => m.from === 'you')?.text || 'New chat').slice(0, 42)", "title: (messages.find(m => m.from === 'you')?.text || 'New message').slice(0, 42)");
  code = code.replace("text: 'Fresh chat. What should we do?'", "text: 'Fresh message. Tell me what you want to do, or speak a customer order.'");

  const quickAnchor = "        {QUICK.map(q => <button key={q} onClick={() => ask(q)} className=\"px-3 py-2 rounded-full text-xs font-display font-semibold border border-border bg-surface-2/30 hover:bg-surface-2/60\">{q}</button>)}";
  if (code.includes(quickAnchor) && !code.includes('>New customer order</button>')) {
    code = code.replace(quickAnchor, `${quickAnchor}\n        {supportsFlowMessageOrders(store) && <button onClick={() => flow('Tell me the customer name, phone number, and everything they want. You can type it or tap the microphone and say it naturally.')} className=\"px-3 py-2 rounded-full text-xs font-display font-semibold border border-primary/30 bg-primary/10 text-primary\">New customer order</button>}`);
  }

  // Keep the existing attachment + button. Only upgrade the input prompt and
  // insert the microphone immediately before the existing Send button. This
  // works against both the source file and the attachment-enhanced prebuild UI.
  const oldPlaceholder = "placeholder={addDraft ? 'Answer Flow…' : 'Tell Flow what to do…'}";
  const newPlaceholder = "placeholder={addDraft ? 'Answer Flow…' : supportsFlowMessageOrders(store) ? 'Type or speak a customer order…' : 'Message Flow…'}";
  if (code.includes(oldPlaceholder)) code = code.replace(oldPlaceholder, newPlaceholder);

  if (!code.includes('onClick={startFlowVoiceInput}')) {
    const submitAnchor = '<button type="submit" disabled={!input.trim()}';
    const submitIndex = code.lastIndexOf(submitAnchor);
    if (submitIndex < 0) throw new Error('[flow-messages] Flow send button anchor missing');
    const microphone = `<button type="button" onClick={startFlowVoiceInput} className={\`w-11 h-11 shrink-0 flex items-center justify-center rounded-full border \${isListening ? 'border-destructive bg-destructive/10 text-destructive animate-pulse' : 'border-border bg-surface-2/40 text-muted-foreground hover:text-primary'}\`} aria-label={isListening ? 'Stop listening' : 'Speak to Flow'} title={isListening ? 'Listening… tap to stop' : 'Speak to Flow'}>{isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>`;
    code = code.slice(0, submitIndex) + microphone + code.slice(submitIndex);
  }

  return code;
}

function patchManager(source: string): string {
  return source.replace(/Chat with Flow/g, 'Message with Flow');
}

export default function flowMessagesPlugin(): Plugin {
  return {
    name: 'storeflow-flow-messages',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/');
      if (normalizedId.endsWith(FLOW_CHAT)) return { code: patchFlowChat(code), map: null };
      if (normalizedId.endsWith(MANAGER)) return { code: patchManager(code), map: null };
      return null;
    },
  };
}

export { patchFlowChat, patchManager };
