import type { Customer, PendingPayment, PaymentMethod, Product, StoreData } from '@/types/store';
import { supabase } from '@/integrations/supabase/client';
import {
  createFlowMessageOrder,
  flowOrderKind,
  parseFlowMessageOrder,
  supportsFlowMessageOrders,
  type CreatedFlowOrder,
  type FlowMessageOrderDraft,
  type FlowMessageOrderItem,
} from '@/lib/flow-message-orders';
import { resolveBusinessType } from '@/lib/business-runtime';
import { getLaundryGarmentPrice } from '@/lib/laundry-pricing';

export interface FlowOrderPaymentDraft {
  paidAmount?: number;
  method?: PaymentMethod;
  balanceLater?: boolean;
  explicitlyMentioned?: boolean;
}

export interface FlowOrderFulfillmentDraft {
  mode?: 'pickup' | 'delivery';
  address?: string;
  requestedTime?: string;
}

export interface FlowConversationOrderDraft extends FlowMessageOrderDraft {
  draftId: string;
  revision: number;
  customerId?: string;
  customerAddress?: string;
  customerMatched?: boolean;
  payment: FlowOrderPaymentDraft;
  fulfillment: FlowOrderFulfillmentDraft;
}

export interface FlowDraftMergeResult {
  draft: FlowConversationOrderDraft;
  changed: boolean;
  cancelled?: boolean;
  note?: string;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function normalize(value: unknown): string {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9+]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function compact(value: unknown): string {
  return normalize(value).split(' ').map(word => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word).join(' ');
}

function moneyValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function quantityValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const clean = raw.toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (NUMBER_WORDS[clean]) return NUMBER_WORDS[clean];
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function phoneDigits(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length >= 13) return `0${digits.slice(3)}`;
  return digits;
}

function phoneFromText(text: string): string {
  const match = text.match(/(?:\+?234|0)?[\s-]?[789](?:[\s-]?\d){9}\b/);
  return match?.[0]?.replace(/[\s-]/g, '') || '';
}

function customerReference(text: string): string {
  const clean = text.replace(/(?:\+?234|0)?[\s-]?[789](?:[\s-]?\d){9}\b/g, ' ').trim();
  const patterns = [
    /\b(?:order|job|booking)\s+for\s+([a-z][a-z .'-]{1,45}?)(?=\s+(?:who|wants|needs|ordered|phone|number|is|with|for|:|,)|$)/i,
    /\b([a-z][a-z .'-]{1,35}?)['’]s\s+(?:order|job|booking)\b/i,
    /\b(?:customer|client|buyer)\s+(?:is\s+)?([a-z][a-z .'-]{1,45}?)(?=\s+(?:wants|needs|ordered|phone|number|is|with|for|:|,)|$)/i,
    /^\s*([a-z][a-z .'-]{1,45}?)\s+(?:wants|needs|ordered|would like)\b/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

export function resolveFlowOrderCustomer(store: StoreData, text: string): { customer?: Customer; ambiguous?: Customer[] } {
  const customers = store.customers || [];
  const phone = phoneDigits(phoneFromText(text));
  if (phone) {
    const byPhone = customers.find(customer => phoneDigits(customer.phone) === phone);
    if (byPhone) return { customer: byPhone };
  }

  const q = normalize(text);
  const exactInText = customers
    .filter(customer => normalize(customer.name) && (` ${q} `).includes(` ${normalize(customer.name)} `))
    .sort((a, b) => b.name.length - a.name.length);
  if (exactInText.length) return { customer: exactInText[0] };

  const reference = normalize(customerReference(text));
  if (!reference) return {};
  const candidates = customers.filter(customer => {
    const name = normalize(customer.name);
    if (name === reference) return true;
    const first = name.split(' ')[0];
    return first === reference || name.startsWith(`${reference} `);
  });
  if (candidates.length === 1) return { customer: candidates[0] };
  if (candidates.length > 1) return { ambiguous: candidates };
  return {};
}

function paymentDetails(text: string, total: number, current: FlowOrderPaymentDraft = {}): FlowOrderPaymentDraft {
  const next = { ...current };
  const lower = text.toLowerCase();
  if (/\b(?:paid\s+in\s+full|fully\s+paid|paid\s+everything|all\s+paid)\b/.test(lower)) {
    next.paidAmount = total;
    next.balanceLater = false;
    next.explicitlyMentioned = true;
  }
  const paid = text.match(/\b(?:paid|deposit(?:ed)?|advance|received)\s*(?:of\s*)?(?:₦|ngn)?\s*([\d,]+(?:\.\d+)?)/i)
    || text.match(/(?:₦|ngn)\s*([\d,]+(?:\.\d+)?)\s*(?:paid|deposit|advance)/i);
  const paidAmount = moneyValue(paid?.[1]);
  if (paidAmount !== undefined) {
    next.paidAmount = Math.min(Math.max(0, paidAmount), Math.max(total, paidAmount));
    next.explicitlyMentioned = true;
  }
  if (/\b(?:balance\s+(?:later|remaining)|pay\s+(?:the\s+)?balance\s+later|pay\s+later|owing|on\s+credit|credit)\b/i.test(text)) {
    next.balanceLater = true;
    next.explicitlyMentioned = true;
  }
  if (/\b(?:no\s+payment|not\s+paid|hasn['’]?t\s+paid|nothing\s+paid)\b/i.test(text)) {
    next.paidAmount = 0;
    next.balanceLater = true;
    next.explicitlyMentioned = true;
  }
  if (/\b(?:bank\s+)?transfer\b/i.test(text)) next.method = 'transfer';
  else if (/\bpos\b|\bcard\b/i.test(text)) next.method = 'pos';
  else if (/\bcash\b/i.test(text)) next.method = 'cash';
  else if (/\bmixed\b/i.test(text)) next.method = 'mixed';
  return next;
}

function requestedTimeFromText(text: string): string | undefined {
  const day = '(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
  const clock = '(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))';
  const date = '(?:\\d{1,2}[\\/-]\\d{1,2}(?:[\\/-]\\d{2,4})?)';
  const contextual = text.match(new RegExp(`\\b(?:ready|due|deliver(?:y)?|pickup|pick\\s+up|collect(?:ion)?)\\s*(?:by|on|at)?\\s*((?:${day}|${date})(?:\\s+(?:at\\s+)?${clock})?|${clock})`, 'i'));
  if (contextual?.[1]) return contextual[1].trim();
  const by = text.match(new RegExp(`\\bby\\s+((?:${day}|${date})(?:\\s+(?:at\\s+)?${clock})?|${clock})`, 'i'));
  return by?.[1]?.trim();
}

function fulfillmentDetails(text: string, customer: Customer | undefined, current: FlowOrderFulfillmentDraft = {}): FlowOrderFulfillmentDraft {
  const next = { ...current };
  if (/\b(?:deliver|delivery)\b/i.test(text)) next.mode = 'delivery';
  if (/\b(?:pickup|pick\s+up|collect(?:ion)?)\b/i.test(text) && !/\bdeliver(?:y)?\b/i.test(text)) next.mode = 'pickup';

  const address = text.match(/\b(?:deliver(?:y)?\s+(?:to|at)|address\s*(?:is|:)?|send\s+to)\s+(.+?)(?=\s+(?:by|on|at|paid|deposit|cash|transfer|pos)\b|[,;]|$)/i)?.[1]?.trim();
  if (address) next.address = address;
  if (next.mode === 'delivery' && !next.address && customer?.address) next.address = customer.address;

  const requestedTime = requestedTimeFromText(text);
  if (requestedTime) next.requestedTime = requestedTime;
  return next;
}

function draftTotal(items: FlowMessageOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

function itemKey(item: FlowMessageOrderItem): string {
  return `${item.productId}|${compact(item.metadata?.garment_type || item.label)}`;
}

function mergeItems(existing: FlowMessageOrderItem[], additions: FlowMessageOrderItem[]): FlowMessageOrderItem[] {
  const result = existing.map(item => ({ ...item }));
  for (const addition of additions) {
    const index = result.findIndex(item => itemKey(item) === itemKey(addition));
    if (index >= 0) {
      const quantity = result[index].quantity + addition.quantity;
      result[index] = { ...result[index], quantity, subtotal: quantity * result[index].unitPrice };
    } else result.push({ ...addition });
  }
  return result;
}

function matchDraftItem(items: FlowMessageOrderItem[], phrase: string): number {
  const target = compact(phrase).replace(/\b(?:the|item|items|service|treatment)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!target) return -1;
  let best = -1;
  let bestScore = 0;
  items.forEach((item, index) => {
    const garment = compact(item.metadata?.garment_type || '');
    const label = compact(item.label);
    const product = compact(item.product?.name || '');
    let score = 0;
    if (garment && (garment === target || garment.includes(target) || target.includes(garment))) score = 4;
    else if (label === target) score = 4;
    else if (label.includes(target) || target.includes(label)) score = 3;
    else if (product && (product.includes(target) || target.includes(product))) score = 2;
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}

function findLaundryService(store: StoreData, text: string): Product | null {
  const q = ` ${compact(text)} `;
  let best: Product | null = null;
  let bestLength = 0;
  for (const product of store.products || []) {
    if (!product.isService || product.discontinued) continue;
    for (const raw of [product.name, ...(product.voiceAliases || [])]) {
      const name = compact(raw);
      if (name && q.includes(` ${name} `) && name.length > bestLength) { best = product; bestLength = name.length; }
    }
  }
  return best;
}

function switchLaundryService(store: StoreData, draft: FlowConversationOrderDraft, text: string): FlowMessageOrderItem[] | null {
  if (resolveBusinessType(store) !== 'laundry' || !draft.items.length) return null;
  const service = findLaundryService(store, text);
  if (!service) return null;
  if (!/\b(?:service|treatment|use|switch|change|make|express|wash|iron|dry\s*clean)\b/i.test(text)) return null;
  let changed = false;
  const items = draft.items.map(item => {
    const garment = String(item.metadata?.garment_type || '').trim();
    if (!garment) return item;
    const unitPrice = getLaundryGarmentPrice(store, service, garment);
    changed = changed || item.productId !== String(service.id) || unitPrice !== item.unitPrice;
    return {
      ...item,
      product: service,
      productId: String(service.id),
      label: `${garment} — ${service.name}`,
      unitPrice,
      subtotal: item.quantity * unitPrice,
      metadata: { ...(item.metadata || {}), garment_type: garment, service_name: service.name },
    };
  });
  return changed ? items : null;
}

function parsedItemsForContinuation(store: StoreData, draft: FlowConversationOrderDraft, text: string): FlowMessageOrderItem[] {
  let phrase = text.trim();
  if (resolveBusinessType(store) === 'laundry') {
    const serviceName = String(draft.items.find(item => item.metadata?.service_name)?.metadata?.service_name || '');
    if (serviceName && !findLaundryService(store, phrase)) phrase = `${serviceName} ${phrase}`;
  }
  return parseFlowMessageOrder(store, `Customer wants ${phrase}`).items;
}

function looksLikeNameAnswer(text: string): boolean {
  const clean = text.trim();
  return /^[a-z][a-z .'-]{1,45}$/i.test(clean)
    && !/\b(?:add|remove|make|change|paid|deposit|delivery|pickup|cash|transfer|pos|order|item|service)\b/i.test(clean);
}

function newDraftId(): string {
  return `flow-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function isFlowConversationOrderRequest(store: StoreData, text: string): boolean {
  if (!supportsFlowMessageOrders(store)) return false;
  const base = parseFlowMessageOrder(store, text);
  if (/\b(?:create|make|take|place|record|start)\s+(?:an?\s+)?(?:new\s+)?(?:customer\s+)?order\b/i.test(text)) return true;
  if (/\b[a-z][a-z .'-]{0,30}['’]s\s+(?:order|job|booking)\b/i.test(text) && base.items.length > 0) return true;
  if (/\b(?:customer|client|buyer)\b.{0,45}\b(?:wants|needs|ordered|would like)\b/i.test(text)) return true;
  const resolved = resolveFlowOrderCustomer(store, text);
  return !!resolved.customer && /\b(?:wants|needs|ordered|would like|order)\b/i.test(text) && base.items.length > 0;
}

export function parseFlowConversationOrder(store: StoreData, text: string): FlowConversationOrderDraft {
  const base = parseFlowMessageOrder(store, text);
  const resolved = resolveFlowOrderCustomer(store, text);
  const customer = resolved.customer;
  const customerName = customer?.name || base.customerName;
  const customerPhone = phoneFromText(text) || customer?.phone || base.customerPhone;
  const customerAddress = customer?.address;
  const payment = paymentDetails(text, base.total);
  const fulfillment = fulfillmentDetails(text, customer, {});
  return {
    ...base,
    rawText: text.trim(),
    customerName,
    customerPhone,
    customerId: customer?.id,
    customerAddress,
    customerMatched: !!customer,
    payment,
    fulfillment,
    draftId: newDraftId(),
    revision: 0,
  };
}

export function flowDraftBalance(draft: FlowConversationOrderDraft): number {
  return Math.max(0, draft.total - Math.max(0, draft.payment.paidAmount || 0));
}

export function mergeFlowConversationOrderDraft(store: StoreData, current: FlowConversationOrderDraft, text: string): FlowDraftMergeResult {
  if (/^\s*(?:cancel|discard|forget|stop)(?:\s+(?:this\s+)?order)?\s*$/i.test(text)) return { draft: current, changed: false, cancelled: true, note: 'Order draft cancelled.' };

  let draft: FlowConversationOrderDraft = {
    ...current,
    items: current.items.map(item => ({ ...item, metadata: { ...(item.metadata || {}) } })),
    payment: { ...current.payment },
    fulfillment: { ...current.fulfillment },
    rawText: `${current.rawText}\n${text.trim()}`.trim(),
  };
  let changed = false;
  const notes: string[] = [];

  const resolved = resolveFlowOrderCustomer(store, text);
  if (resolved.customer) {
    const customer = resolved.customer;
    if (draft.customerId !== customer.id || draft.customerPhone !== customer.phone || draft.customerName !== customer.name) {
      draft.customerId = customer.id;
      draft.customerName = customer.name;
      draft.customerPhone = customer.phone || draft.customerPhone;
      draft.customerAddress = customer.address;
      draft.customerMatched = true;
      if (draft.fulfillment.mode === 'delivery' && !draft.fulfillment.address && customer.address) draft.fulfillment.address = customer.address;
      changed = true;
      notes.push(`Matched saved customer ${customer.name}.`);
    }
  }

  const phone = phoneFromText(text);
  if (phone && phoneDigits(phone) !== phoneDigits(draft.customerPhone)) { draft.customerPhone = phone; changed = true; }
  if (!draft.customerName && looksLikeNameAnswer(text)) {
    draft.customerName = text.trim();
    changed = true;
  }

  const serviceItems = switchLaundryService(store, draft, text);
  if (serviceItems) {
    draft.items = serviceItems;
    changed = true;
    notes.push('Laundry treatment updated.');
  }

  const remove = text.match(/\b(?:remove|delete|take\s+off|drop)\s+(?:the\s+)?(.+?)(?=$|[,;])/i);
  if (remove?.[1]) {
    const index = matchDraftItem(draft.items, remove[1]);
    if (index >= 0) {
      const removed = draft.items[index].label;
      draft.items.splice(index, 1);
      changed = true;
      notes.push(`Removed ${removed}.`);
    }
  }

  const quantityEdit = text.match(/\b(?:make|change|set|update)\s+(?:the\s+)?(.+?)\s+(?:to|=|x)\s*(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i);
  if (quantityEdit?.[1]) {
    const quantity = quantityValue(quantityEdit[2]);
    const index = matchDraftItem(draft.items, quantityEdit[1]);
    if (quantity && index >= 0) {
      const item = draft.items[index];
      draft.items[index] = { ...item, quantity, subtotal: quantity * item.unitPrice };
      changed = true;
      notes.push(`Changed ${item.label} to ${quantity}.`);
    }
  }

  const add = text.match(/^\s*(?:please\s+)?add\s+(.+)$/i);
  if (add?.[1] && !/\b(?:service|treatment)\b/i.test(text)) {
    const additions = parsedItemsForContinuation(store, draft, add[1]);
    if (additions.length) {
      draft.items = mergeItems(draft.items, additions);
      changed = true;
      notes.push(`Added ${additions.map(item => item.label).join(', ')}.`);
    }
  } else if ((!draft.items.length || /\b(?:wants|needs|ordered|would like)\b/i.test(text)) && !/\b(?:paid|deposit|balance|delivery|pickup)\b/i.test(text)) {
    const additions = parsedItemsForContinuation(store, draft, text);
    if (additions.length) {
      draft.items = draft.items.length ? mergeItems(draft.items, additions) : additions;
      changed = true;
    }
  }

  const beforePayment = JSON.stringify(draft.payment);
  draft.payment = paymentDetails(text, draftTotal(draft.items), draft.payment);
  if (beforePayment !== JSON.stringify(draft.payment)) { changed = true; notes.push('Payment details updated.'); }

  const matchedCustomer = draft.customerId ? (store.customers || []).find(customer => customer.id === draft.customerId) : undefined;
  const beforeFulfillment = JSON.stringify(draft.fulfillment);
  draft.fulfillment = fulfillmentDetails(text, matchedCustomer, draft.fulfillment);
  if (beforeFulfillment !== JSON.stringify(draft.fulfillment)) { changed = true; notes.push('Pickup/delivery details updated.'); }

  const total = draftTotal(draft.items);
  if (draft.total !== total) { draft.total = total; changed = true; }
  if (draft.payment.paidAmount !== undefined && draft.payment.paidAmount > total && total > 0) draft.payment.paidAmount = total;
  if (changed) draft.revision = current.revision + 1;
  return { draft, changed, note: notes.join(' ') || undefined };
}

export function nextFlowDraftQuestion(draft: FlowConversationOrderDraft): string | null {
  if (!draft.customerName.trim()) return 'What is the customer name?';
  if (!draft.customerPhone.trim()) return `I have ${draft.customerName}. What is the customer phone number?`;
  if (!draft.items.length) return 'What items or services does the customer want?';
  if (draft.fulfillment.mode === 'delivery' && !draft.fulfillment.address?.trim()) return 'What delivery address should I use?';
  return null;
}

function paymentSummary(draft: FlowConversationOrderDraft): string {
  if (!draft.payment.explicitlyMentioned) return 'Payment: Not recorded yet';
  const paid = Math.max(0, draft.payment.paidAmount || 0);
  const balance = flowDraftBalance(draft);
  const method = draft.payment.method ? ` via ${draft.payment.method.toUpperCase()}` : '';
  return `Payment: ₦${paid.toLocaleString()} paid${method} • Balance ₦${balance.toLocaleString()}`;
}

export function formatFlowConversationDraft(draft: FlowConversationOrderDraft): string {
  const items = draft.items.map(item => `• ${item.quantity} × ${item.label} — ₦${item.subtotal.toLocaleString()}`).join('\n') || '• No items yet';
  const customer = draft.customerMatched ? `Saved customer ✓ ${draft.customerName}` : (draft.customerName || 'Customer not set');
  const phone = draft.customerPhone || 'Phone not set';
  const fulfilment = draft.fulfillment.mode
    ? `${draft.fulfillment.mode === 'delivery' ? 'Delivery' : 'Pickup'}${draft.fulfillment.address ? ` • ${draft.fulfillment.address}` : ''}${draft.fulfillment.requestedTime ? ` • ${draft.fulfillment.requestedTime}` : ''}`
    : 'Not specified';
  return `**Order draft**\nCustomer: **${customer}**\nPhone: **${phone}**\n\n${items}\n\nTotal: **₦${draft.total.toLocaleString()}**\n${paymentSummary(draft)}\nFulfilment: ${fulfilment}`;
}

function detailsPayload(draft: FlowConversationOrderDraft) {
  return {
    source: 'flow_message',
    flow_draft_id: draft.draftId,
    flow_revision: draft.revision,
    customer: { id: draft.customerId || null, address: draft.customerAddress || null, matched: !!draft.customerMatched },
    payment: {
      paid_amount: Math.max(0, draft.payment.paidAmount || 0),
      balance: flowDraftBalance(draft),
      method: draft.payment.method || null,
      balance_later: !!draft.payment.balanceLater,
      explicitly_mentioned: !!draft.payment.explicitlyMentioned,
    },
    fulfillment: {
      mode: draft.fulfillment.mode || null,
      address: draft.fulfillment.address || null,
      requested_time: draft.fulfillment.requestedTime || null,
    },
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveStoreUuid(store: StoreData): Promise<string> {
  if (isUuid(store.id)) return store.id;
  const client: any = supabase;
  for (const [column, value] of [['access_code', store.accessCode], ['store_id', store.storeId]] as Array<[string, string | undefined]>) {
    if (!value) continue;
    const { data, error } = await client.from('stores').select('id').eq(column, value).maybeSingle();
    if (!error && data?.id) return data.id;
  }
  throw new Error('Store is not fully synced to the cloud yet. Try again in a moment.');
}

function rpcItems(items: FlowMessageOrderItem[]) {
  return items.map(item => ({
    product_id: item.productId,
    offering_id: item.productId,
    item_name: item.label,
    item_kind: item.itemKind,
    quantity: item.quantity,
    price: item.unitPrice,
    unit: item.unit || null,
    metadata: item.metadata || {},
    options: {},
  }));
}

export async function createFlowConversationOrder(store: StoreData, draft: FlowConversationOrderDraft): Promise<CreatedFlowOrder & { flow_details?: any }> {
  if (!supportsFlowMessageOrders(store)) throw new Error('This business type does not use customer orders.');
  const missing = nextFlowDraftQuestion(draft);
  if (missing) throw new Error(missing);
  const client: any = supabase;
  const storeId = await resolveStoreUuid(store);
  const details = detailsPayload(draft);
  const notes = JSON.stringify({ source: 'flow_message', transcript: draft.rawText, createdBy: 'Flow', ...details });
  const rpc = await client.rpc('merchant_create_flow_message_order', {
    p_store_id: storeId,
    p_customer_name: draft.customerName.trim(),
    p_customer_phone: draft.customerPhone.trim(),
    p_items: rpcItems(draft.items),
    p_order_number: null,
    p_notes: notes,
    p_business_type: resolveBusinessType(store),
    p_order_kind: flowOrderKind(store, draft.items),
    p_details: details,
  });
  if (!rpc.error && rpc.data) return { ...(rpc.data as CreatedFlowOrder), flow_details: details };

  const code = String(rpc.error?.code || '');
  const message = String(rpc.error?.message || '');
  if (!['PGRST202', '42883'].includes(code) && !/could not find.*merchant_create_flow_message_order/i.test(message)) {
    throw new Error(message || 'Could not create the order.');
  }

  const order = await createFlowMessageOrder(store, draft);
  try {
    await client.from('orders').update({ notes, service_metadata: details }).eq('id', order.id);
  } catch { /* backward-compatible best effort only */ }
  return { ...order, flow_details: details };
}

export function formatFlowConversationReceipt(store: StoreData, order: CreatedFlowOrder, draft: FlowConversationOrderDraft): string {
  const items = (order.order_items || []).map((item: any) => {
    const name = item.item_name || item.product_name || store.products?.find(product => String(product.id) === String(item.product_id))?.name || 'Item';
    const quantity = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal ?? quantity * (Number(item.price) || 0)) || 0;
    return `• ${quantity} × ${name} — ₦${subtotal.toLocaleString()}`;
  }).join('\n');
  const balance = flowDraftBalance(draft);
  const paid = Math.max(0, draft.payment.paidAmount || 0);
  const payment = draft.payment.explicitlyMentioned ? `\nPaid: **₦${paid.toLocaleString()}**\nBalance: **₦${balance.toLocaleString()}**` : '';
  const fulfilment = draft.fulfillment.mode ? `\n${draft.fulfillment.mode === 'delivery' ? 'Delivery' : 'Pickup'}: **${draft.fulfillment.address || draft.fulfillment.requestedTime || 'Selected'}**${draft.fulfillment.address && draft.fulfillment.requestedTime ? `\nRequested time: **${draft.fulfillment.requestedTime}**` : ''}` : '';
  return `Receipt **${order.order_number}**\nCustomer: **${order.customer_name}**\n${items}\n\nTotal: **₦${Number(order.total || draft.total).toLocaleString()}**${payment}${fulfilment}`;
}

export function buildFlowConversationWhatsAppMessage(store: StoreData, order: CreatedFlowOrder, draft: FlowConversationOrderDraft): string {
  const items = (order.order_items || []).map((item: any) => {
    const name = item.item_name || item.product_name || store.products?.find(product => String(product.id) === String(item.product_id))?.name || 'Item';
    const quantity = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal ?? quantity * (Number(item.price) || 0)) || 0;
    return `• ${quantity} × ${name} — ₦${subtotal.toLocaleString()}`;
  }).join('\n');
  const lines = [`Hi ${order.customer_name},`, '', `Here is your order from ${store.storeName}.`, '', `Receipt: ${order.order_number}`, items, '', `Total: ₦${Number(order.total || draft.total).toLocaleString()}`];
  if (draft.payment.explicitlyMentioned) {
    lines.push(`Paid: ₦${Math.max(0, draft.payment.paidAmount || 0).toLocaleString()}`);
    lines.push(`Balance: ₦${flowDraftBalance(draft).toLocaleString()}`);
    if (draft.payment.method) lines.push(`Payment method: ${draft.payment.method.toUpperCase()}`);
  }
  if (draft.fulfillment.mode) {
    lines.push('', `Fulfilment: ${draft.fulfillment.mode === 'delivery' ? 'Delivery' : 'Pickup'}`);
    if (draft.fulfillment.address) lines.push(`Address: ${draft.fulfillment.address}`);
    if (draft.fulfillment.requestedTime) lines.push(`Requested time: ${draft.fulfillment.requestedTime}`);
  }
  const shopPhone = store.profile?.phone || store.managerSettings?.receiptPhone;
  const shopAddress = store.profile?.location || store.managerSettings?.receiptAddress;
  if (shopPhone || shopAddress) {
    lines.push('');
    if (shopAddress) lines.push(`Store address: ${shopAddress}`);
    if (shopPhone) lines.push(`Store phone: ${shopPhone}`);
  }
  lines.push('', 'Please review the details. You can reply here if anything needs to be changed. Thank you.');
  return lines.join('\n');
}

function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function applyFlowConversationOrderLocalEffects(store: StoreData, order: CreatedFlowOrder, draft: FlowConversationOrderDraft): StoreData {
  let customers = [...(store.customers || [])];
  let customerIndex = customers.findIndex(customer => customer.id === draft.customerId);
  if (customerIndex < 0) customerIndex = customers.findIndex(customer => phoneDigits(customer.phone) === phoneDigits(draft.customerPhone));
  if (customerIndex < 0) customerIndex = customers.findIndex(customer => normalize(customer.name) === normalize(draft.customerName));

  if (customerIndex >= 0) {
    customers[customerIndex] = {
      ...customers[customerIndex],
      name: draft.customerName || customers[customerIndex].name,
      phone: draft.customerPhone || customers[customerIndex].phone,
      address: draft.fulfillment.address || draft.customerAddress || customers[customerIndex].address,
    };
  } else {
    customers.push({
      id: localId('customer'),
      name: draft.customerName,
      phone: draft.customerPhone,
      address: draft.fulfillment.address || draft.customerAddress,
      totalPurchases: 0,
      outstandingDebt: 0,
      purchaseHistory: [],
      loyaltyPoints: 0,
      visitsCount: 0,
    });
  }

  let pendingPayments = [...(store.pendingPayments || [])];
  const paid = Math.max(0, draft.payment.paidAmount || 0);
  const balance = flowDraftBalance(draft);
  const shouldTrackBalance = draft.payment.explicitlyMentioned && balance > 0 && (paid > 0 || draft.payment.balanceLater);
  if (shouldTrackBalance && !pendingPayments.some(payment => payment.id === `flow-order-${order.id}`)) {
    const pending: PendingPayment = {
      id: `flow-order-${order.id}`,
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      customerNote: `Flow order ${order.order_number}${draft.fulfillment.mode ? ` • ${draft.fulfillment.mode}` : ''}${draft.fulfillment.requestedTime ? ` • ${draft.fulfillment.requestedTime}` : ''}`,
      items: draft.items.map(item => ({ productId: item.productId, productName: item.label, quantity: item.quantity, unitPrice: item.unitPrice })),
      total: draft.total,
      paid,
      balance,
      createdAt: new Date().toISOString(),
      status: 'pending',
      events: paid > 0 ? [{ date: new Date().toISOString(), amount: paid, method: draft.payment.method, note: `Deposit on ${order.order_number}` }] : [],
      saleIds: [],
    };
    pendingPayments.push(pending);
  }

  return { ...store, customers, pendingPayments };
}
