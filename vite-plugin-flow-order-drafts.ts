import type { Plugin } from 'vite';

const FLOW_CHAT = '/src/components/FlowChat.tsx';

function patchFlowOrderDrafts(source: string): string {
  let code = source;

  const messageImport = "import { buildFlowOrderWhatsAppMessage, createFlowMessageOrder, formatFlowOrderReceipt, isFlowMessageOrderRequest, parseFlowMessageOrder, supportsFlowMessageOrders, whatsappUrl, type FlowMessageOrderDraft } from '@/lib/flow-message-orders';";
  const draftImport = "import { applyFlowConversationOrderLocalEffects, buildFlowConversationWhatsAppMessage, createFlowConversationOrder, formatFlowConversationDraft, formatFlowConversationReceipt, isFlowConversationOrderRequest, mergeFlowConversationOrderDraft, nextFlowDraftQuestion, parseFlowConversationOrder, type FlowConversationOrderDraft } from '@/lib/flow-order-draft';";
  if (!code.includes(draftImport)) {
    if (!code.includes(messageImport)) throw new Error('[flow-order-drafts] Flow message import anchor missing');
    code = code.replace(messageImport, `${messageImport}\n${draftImport}`);
  }

  const refAnchor = '  const recognitionRef = useRef<any>(null);';
  if (!code.includes('flowOrderDraftRef = useRef<FlowConversationOrderDraft')) {
    if (!code.includes(refAnchor)) throw new Error('[flow-order-drafts] Flow voice ref anchor missing');
    code = code.replace(
      refAnchor,
      `${refAnchor}\n  const [flowOrderDraftState, setFlowOrderDraftState] = useState<FlowConversationOrderDraft | null>(null);\n  const flowOrderDraftRef = useRef<FlowConversationOrderDraft | null>(null);`,
    );
  }

  const handlerAnchor = '  const sendFlowOrderToWhatsApp = (order: any) => {';
  if (!code.includes('const handleFlowConversationOrder = (text: string): boolean =>')) {
    if (!code.includes(handlerAnchor)) throw new Error('[flow-order-drafts] Existing Flow order handler anchor missing');
    const handlers = `  const setActiveFlowOrderDraft = (draft: FlowConversationOrderDraft | null) => {
    flowOrderDraftRef.current = draft;
    setFlowOrderDraftState(draft);
  };

  const cancelFlowOrderDraft = () => {
    setActiveFlowOrderDraft(null);
    flow('Order draft cancelled. Nothing was created.');
  };

  const presentFlowOrderDraft = (draft: FlowConversationOrderDraft, note?: string) => {
    setActiveFlowOrderDraft(draft);
    const question = nextFlowDraftQuestion(draft);
    const prefix = note ? note + '\\n\\n' : '';
    if (question) {
      flow(prefix + formatFlowConversationDraft(draft) + '\\n\\n' + question, [
        { label: 'Cancel order', onClick: cancelFlowOrderDraft },
      ]);
      return;
    }
    flow(prefix + formatFlowConversationDraft(draft) + '\\n\\nYou can still say things like **make Jollof Rice to 3**, **remove Coke**, **add 2 Chicken**, **paid ₦5,000 cash**, or **delivery to 12 Airport Road** before creating it.', [
      { label: 'Create order', onClick: () => void finalizeFlowConversationOrder(draft) },
      { label: 'Cancel order', onClick: cancelFlowOrderDraft },
    ]);
  };

  const sendFlowConversationOrderToWhatsApp = (order: any, draft: FlowConversationOrderDraft) => {
    if (!order?.customer_phone) {
      flow('This order has no customer phone number, so I cannot open WhatsApp for it.');
      return;
    }
    const message = buildFlowConversationWhatsAppMessage(store, order, draft);
    window.open(whatsappUrl(order.customer_phone, message), '_blank', 'noopener,noreferrer');
  };

  const finalizeFlowConversationOrder = async (draft: FlowConversationOrderDraft) => {
    const latest = flowOrderDraftRef.current;
    if (!latest || latest.draftId !== draft.draftId || latest.revision !== draft.revision) {
      if (latest) presentFlowOrderDraft(latest, 'That order changed after this button was created, so I kept the newest version.');
      else flow('That order draft is no longer active.');
      return;
    }
    const question = nextFlowDraftQuestion(latest);
    if (question) {
      presentFlowOrderDraft(latest, question);
      return;
    }
    try {
      flow('Creating the order and receipt…');
      const order = await createFlowConversationOrder(store, latest);
      const nextStore = applyFlowConversationOrderLocalEffects(store, order, latest);
      onUpdate(nextStore);
      setActiveFlowOrderDraft(null);
      flow('Order created ✅\\n\\n' + formatFlowConversationReceipt(store, order, latest), [
        { label: 'WhatsApp customer', onClick: () => sendFlowConversationOrderToWhatsApp(order, latest) },
        { label: 'Open Orders', onClick: () => onNavigate?.('orders') },
      ]);
      showToast('Order ' + order.order_number + ' created by Flow', 'success');
    } catch (error: any) {
      flow("I couldn't create that order. **" + (error?.message || 'Please try again.') + '**');
      showToast('Flow could not create the order', 'error');
    }
  };

  const handleFlowConversationOrder = (text: string): boolean => {
    const active = flowOrderDraftRef.current;
    if (active) {
      if (/^\\s*(?:yes|yes\\s+create|create|create\\s+(?:the\\s+)?order|confirm|confirm\\s+(?:the\\s+)?order|save|save\\s+(?:the\\s+)?order|place\\s+(?:the\\s+)?order)\\s*[.!]?\\s*$/i.test(text)) {
        const question = nextFlowDraftQuestion(active);
        if (question) presentFlowOrderDraft(active, question);
        else void finalizeFlowConversationOrder(active);
        return true;
      }

      const result = mergeFlowConversationOrderDraft(store, active, text);
      if (result.cancelled) {
        cancelFlowOrderDraft();
        return true;
      }
      if (result.changed) {
        presentFlowOrderDraft(result.draft, result.note);
        return true;
      }

      const question = nextFlowDraftQuestion(active);
      flow(formatFlowConversationDraft(active) + '\\n\\n' + (question || 'I still have this order open. Tell me what to change, or say **create order** when it is correct.'), [
        ...(question ? [] : [{ label: 'Create order', onClick: () => void finalizeFlowConversationOrder(active) }]),
        { label: 'Cancel order', onClick: cancelFlowOrderDraft },
      ]);
      return true;
    }

    if (!isFlowConversationOrderRequest(store, text)) return false;
    const draft = parseFlowConversationOrder(store, text);
    presentFlowOrderDraft(draft, draft.customerMatched ? 'I found this customer in your saved customer list.' : undefined);
    return true;
  };

`;
    code = code.replace(handlerAnchor, handlers + handlerAnchor);
  }

  const orderHandlerAnchor = '    if (handleFlowMessageOrder(text)) return;';
  if (!code.includes('if (handleFlowConversationOrder(text)) return;')) {
    if (!code.includes(orderHandlerAnchor)) throw new Error('[flow-order-drafts] Flow ask order-handler anchor missing');
    code = code.replace(orderHandlerAnchor, `    if (handleFlowConversationOrder(text)) return;\n${orderHandlerAnchor}`);
  }

  const newChatAnchor = "  const newChat = () => { const brain = loadBrainMemory(store);";
  if (!code.includes('setActiveFlowOrderDraft(null); setSessionId')) {
    if (!code.includes(newChatAnchor)) throw new Error('[flow-order-drafts] new message anchor missing');
    code = code.replace(newChatAnchor, "  const newChat = () => { const brain = loadBrainMemory(store); setActiveFlowOrderDraft(null);" );
  }

  const placeholder = "placeholder={addDraft ? 'Answer Flow…' : supportsFlowMessageOrders(store) ? 'Type or speak a customer order…' : 'Message Flow…'}";
  const draftPlaceholder = "placeholder={addDraft ? 'Answer Flow…' : flowOrderDraftState ? 'Edit the order or add missing details…' : supportsFlowMessageOrders(store) ? 'Type or speak a customer order…' : 'Message Flow…'}";
  if (code.includes(placeholder)) code = code.replace(placeholder, draftPlaceholder);

  return code;
}

export default function flowOrderDraftsPlugin(): Plugin {
  return {
    name: 'storeflow-flow-order-drafts',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.split('?')[0].replace(/\\/g, '/');
      if (normalizedId.endsWith(FLOW_CHAT)) return { code: patchFlowOrderDrafts(code), map: null };
      return null;
    },
  };
}

export { patchFlowOrderDrafts };
