import type { Product, StoreData } from '@/types/store';
import { supabase } from '@/integrations/supabase/client';
import { getBusinessTemplate, hasBusinessModule, resolveBusinessType } from '@/lib/business-runtime';
import { resolveProduct } from '@/lib/flow-operating-engine';
import { getLaundryGarmentPrice, getLaundryPricingConfig } from '@/lib/laundry-pricing';
import { getStoredServicePricing } from '@/lib/service-pricing';

export type FlowMessageItemKind = 'product' | 'service' | 'appointment' | 'session' | 'metered' | 'custom';

export interface FlowMessageOrderItem {
  product: Product;
  productId: string;
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unit?: string;
  itemKind: FlowMessageItemKind;
  metadata?: Record<string, unknown>;
}

export interface FlowMessageOrderDraft {
  rawText: string;
  customerName: string;
  customerPhone: string;
  items: FlowMessageOrderItem[];
  unmatched: string[];
  total: number;
}

export interface CreatedFlowOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  subtotal: number;
  status: string;
  created_at: string;
  order_items: any[];
  business_type?: string;
  order_kind?: string;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function normalized(value: string): string {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9+]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function quantityFromToken(token?: string): number | null {
  if (!token) return null;
  const clean = token.toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (NUMBER_WORDS[clean]) return NUMBER_WORDS[clean];
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function quantityNear(text: string, start: number, end: number): number {
  const before = text.slice(Math.max(0, start - 35), start);
  const after = text.slice(end, Math.min(text.length, end + 25));
  const qtyWord = '(?:\\d+(?:\\.\\d+)?|' + Object.keys(NUMBER_WORDS).join('|') + ')';
  const beforeMatch = before.match(new RegExp(`(${qtyWord})\\s*(?:x|pcs?|pieces?|units?|packs?|cartons?|loads?|kg|kgs)?\\s*$`, 'i'));
  if (beforeMatch) return quantityFromToken(beforeMatch[1]) || 1;
  const afterMatch = after.match(new RegExp(`^\\s*(?:x|qty|quantity)?\\s*(${qtyWord})\\b`, 'i'));
  return quantityFromToken(afterMatch?.[1]) || 1;
}

function phoneFromText(text: string): string {
  const raw = (text.match(/(?:\+?234|0)?[\s-]?[789](?:[\s-]?\d){9}\b/g) || [])[0] || '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length >= 13) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 11) return digits;
  return raw.trim();
}

function existingCustomerFromText(store: StoreData, text: string): { name: string; phone: string } | null {
  const q = normalized(text);
  const customers = [...(store.customers || [])].sort((a, b) => b.name.length - a.name.length);
  for (const customer of customers) {
    const name = normalized(customer.name);
    if (name && (` ${q} `).includes(` ${name} `)) return { name: customer.name, phone: customer.phone || '' };
  }
  return null;
}

function inferredCustomerName(text: string): string {
  const clean = text.replace(/(?:\+?234|0)?[\s-]?[789](?:[\s-]?\d){9}\b/g, ' ').trim();
  const patterns = [
    /\b(?:customer|client|buyer)\s+(?:is\s+)?([a-z][a-z .'-]{1,45}?)(?=\s+(?:wants|needs|ordered|phone|number|would like)\b|[,;])/i,
    /\b(?:create|make|take|place|record)\s+(?:an?\s+)?(?:new\s+)?(?:customer\s+)?order\s+for\s+([a-z][a-z .'-]{1,45}?)(?=\s+(?:who|wants|needs|ordered|phone|number|for)\b|[,;:])/i,
    /^\s*([a-z][a-z .'-]{1,45}?)\s+(?:wants|needs|ordered|would like)\b/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

function itemKindFor(product: Product): FlowMessageItemKind {
  if (!product.isService) return 'product';
  const mode = String((product as any).serviceWorkflow?.mode || '').toLowerCase();
  if (mode === 'appointment') return 'appointment';
  if (mode === 'session') return 'session';
  const pricing = getStoredServicePricing(product);
  if (pricing === 'per_kg' || pricing === 'per_hour') return 'metered';
  return 'service';
}

function catalogMentions(store: StoreData, text: string): Array<{ product: Product; start: number; end: number }> {
  const q = normalized(text);
  const padded = ` ${q} `;
  const hits: Array<{ product: Product; start: number; end: number; aliasLength: number }> = [];
  for (const product of store.products || []) {
    if (product.discontinued) continue;
    const aliases = [product.name, ...((product as any).voiceAliases || [])].map(normalized).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      const index = padded.indexOf(` ${alias} `);
      if (index < 0) continue;
      hits.push({ product, start: Math.max(0, index), end: Math.max(0, index) + alias.length, aliasLength: alias.length });
      break;
    }
  }
  hits.sort((a, b) => a.start - b.start || b.aliasLength - a.aliasLength);
  const kept: typeof hits = [];
  for (const hit of hits) if (!kept.some(item => hit.start >= item.start && hit.end <= item.end)) kept.push(hit);
  return kept.sort((a, b) => a.start - b.start);
}

function genericItems(store: StoreData, text: string): { items: FlowMessageOrderItem[]; unmatched: string[] } {
  const q = normalized(text);
  const items = catalogMentions(store, text).map(({ product, start, end }) => {
    const quantity = quantityNear(q, start, end);
    const unitPrice = Math.max(0, Number(product.sellingPrice) || 0);
    return { product, productId: String(product.id), label: product.name, quantity, unitPrice, subtotal: quantity * unitPrice, unit: product.unit, itemKind: itemKindFor(product) };
  });
  if (items.length) return { items, unmatched: [] };

  const chunks = text.replace(/(?:\+?234|0)?[\s-]?[789](?:[\s-]?\d){9}\b/g, ' ').split(/[,;]|\s+and\s+/i).map(part => part.trim()).filter(Boolean);
  const unmatched: string[] = [];
  for (const chunk of chunks) {
    const qtyMatch = chunk.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i);
    const quantity = quantityFromToken(qtyMatch?.[1]) || 1;
    const phrase = chunk.replace(/\b(?:create|make|take|place|record|new|customer|order|client|buyer|wants|needs|ordered|would like|please|for|phone|number)\b/gi, ' ')
      .replace(qtyMatch?.[0] || '', ' ').replace(/\s+/g, ' ').trim();
    if (!phrase) continue;
    const match = resolveProduct(store, phrase);
    if (!match || match.score < 0.76) { unmatched.push(chunk); continue; }
    const product = match.product;
    const unitPrice = Math.max(0, Number(product.sellingPrice) || 0);
    items.push({ product, productId: String(product.id), label: product.name, quantity, unitPrice, subtotal: quantity * unitPrice, unit: product.unit, itemKind: itemKindFor(product) });
  }
  return { items, unmatched };
}

function laundryItems(store: StoreData, text: string): FlowMessageOrderItem[] {
  const services = (store.products || []).filter(product => product.isService && !product.discontinued);
  if (!services.length) return [];
  const q = normalized(text);
  let service: Product | null = null;
  let bestLength = 0;
  for (const candidate of services) for (const alias of [candidate.name, ...((candidate as any).voiceAliases || [])]) {
    const name = normalized(alias);
    if (name && (` ${q} `).includes(` ${name} `) && name.length > bestLength) { service = candidate; bestLength = name.length; }
  }
  if (!service && services.length === 1) service = services[0];
  if (!service) return [];
  const config = getLaundryPricingConfig(store);
  const hits = config.garmentTypes.map(garment => ({ garment, key: normalized(garment), index: (` ${q} `).indexOf(` ${normalized(garment)} `) }))
    .filter(hit => hit.key && hit.index >= 0).sort((a, b) => a.index - b.index);
  return hits.map(hit => {
    const quantity = quantityNear(q, Math.max(0, hit.index), Math.max(0, hit.index) + hit.key.length);
    const unitPrice = getLaundryGarmentPrice(store, service!, hit.garment);
    return { product: service!, productId: String(service!.id), label: `${hit.garment} — ${service!.name}`, quantity, unitPrice, subtotal: quantity * unitPrice, unit: 'pcs', itemKind: 'service' as const, metadata: { garment_type: hit.garment, service_name: service!.name } };
  });
}

export function supportsFlowMessageOrders(store: StoreData): boolean {
  return hasBusinessModule(store, 'orders');
}

export function isFlowMessageOrderRequest(store: StoreData, text: string): boolean {
  if (!supportsFlowMessageOrders(store)) return false;
  const q = normalized(text);
  if (/\b(?:create|make|take|place|record|start)\s+(?:an?\s+)?(?:new\s+)?(?:customer\s+)?order\b/.test(q)) return true;
  if (/\b(?:customer|client|buyer)\b.{0,45}\b(?:wants|needs|ordered|would like)\b/.test(q)) return true;
  return /\b(?:wants|needs|ordered|would like)\b/.test(q) && !!existingCustomerFromText(store, text);
}

export function parseFlowMessageOrder(store: StoreData, text: string): FlowMessageOrderDraft {
  const knownCustomer = existingCustomerFromText(store, text);
  const customerName = knownCustomer?.name || inferredCustomerName(text);
  const customerPhone = phoneFromText(text) || knownCustomer?.phone || '';
  const laundry = resolveBusinessType(store) === 'laundry' ? laundryItems(store, text) : [];
  const parsed = laundry.length ? { items: laundry, unmatched: [] as string[] } : genericItems(store, text);
  return { rawText: text.trim(), customerName, customerPhone, items: parsed.items, unmatched: parsed.unmatched, total: parsed.items.reduce((sum, item) => sum + item.subtotal, 0) };
}

export function flowOrderKind(store: StoreData, items: FlowMessageOrderItem[]): string {
  const types = new Set(items.map(item => item.itemKind));
  if (types.size === 1) return [...types][0];
  const template = getBusinessTemplate(store);
  if (template.modes.includes('sessions') && !template.modes.includes('products')) return 'session';
  if (template.modes.includes('appointments') && !template.modes.includes('products')) return 'appointment';
  if (template.modes.includes('metered') && !template.modes.includes('products')) return 'metered';
  return 'mixed';
}

export function formatFlowOrderReceipt(store: StoreData, order: Pick<CreatedFlowOrder, 'order_number'|'customer_name'|'order_items'|'total'>): string {
  const lines = (order.order_items || []).map((item: any) => {
    const name = item.item_name || item.product_name || store.products?.find(p => String(p.id) === String(item.product_id))?.name || 'Item';
    const quantity = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal ?? quantity * (Number(item.price) || 0)) || 0;
    return `• ${quantity} × ${name} — ₦${subtotal.toLocaleString()}`;
  });
  return `Receipt **${order.order_number}**\nCustomer: **${order.customer_name}**\n${lines.join('\n')}\n\nTotal: **₦${Number(order.total || 0).toLocaleString()}**`;
}

export function buildFlowOrderWhatsAppMessage(store: StoreData, order: Pick<CreatedFlowOrder, 'order_number'|'customer_name'|'order_items'|'total'>): string {
  const items = (order.order_items || []).map((item: any) => {
    const name = item.item_name || item.product_name || store.products?.find(p => String(p.id) === String(item.product_id))?.name || 'Item';
    const quantity = Number(item.quantity) || 0;
    const subtotal = Number(item.subtotal ?? (Number(item.price) || 0) * quantity) || 0;
    return `• ${quantity} × ${name} — ₦${subtotal.toLocaleString()}`;
  }).join('\n');
  return `Hi ${order.customer_name},\n\nHere is your order from ${store.storeName}.\n\nReceipt: ${order.order_number}\n${items}\n\nTotal: ₦${Number(order.total || 0).toLocaleString()}\n\nPlease reply here if anything needs to be changed. Thank you.`;
}

export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalizedPhone = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveStoreUuid(store: StoreData): Promise<string> {
  if (isUuid((store as any).id)) return (store as any).id;
  const client: any = supabase;
  for (const [column, value] of [['access_code', store.accessCode], ['store_id', (store as any).storeId]] as Array<[string, string | undefined]>) {
    if (!value) continue;
    const { data, error } = await client.from('stores').select('id').eq(column, value).maybeSingle();
    if (!error && data?.id) return data.id;
  }
  throw new Error('Store is not fully synced to the cloud yet. Try again in a moment.');
}

function rpcItems(items: FlowMessageOrderItem[]) {
  return items.map(item => ({ product_id: item.productId, offering_id: item.productId, item_name: item.label, item_kind: item.itemKind, quantity: item.quantity, price: item.unitPrice, unit: item.unit || null, metadata: item.metadata || {}, options: {} }));
}

function fallbackOrderNumber(): string {
  return `FL-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).toUpperCase().slice(2, 4)}`;
}

export async function createFlowMessageOrder(store: StoreData, draft: FlowMessageOrderDraft): Promise<CreatedFlowOrder> {
  if (!supportsFlowMessageOrders(store)) throw new Error('This business type does not use customer orders.');
  if (!draft.customerName.trim()) throw new Error('Customer name is required.');
  if (!draft.customerPhone.trim()) throw new Error('Customer phone number is required.');
  if (!draft.items.length) throw new Error('No catalog items were matched.');

  const client: any = supabase;
  const storeId = await resolveStoreUuid(store);
  const businessType = resolveBusinessType(store);
  const orderKind = flowOrderKind(store, draft.items);
  const notes = JSON.stringify({ source: 'flow_message', transcript: draft.rawText, createdBy: 'Flow' });
  const items = rpcItems(draft.items);
  const rpc = await client.rpc('merchant_create_flow_message_order', {
    p_store_id: storeId, p_customer_name: draft.customerName.trim(), p_customer_phone: draft.customerPhone.trim(), p_items: items,
    p_order_number: null, p_notes: notes, p_business_type: businessType, p_order_kind: orderKind,
  });
  if (!rpc.error && rpc.data) return rpc.data as CreatedFlowOrder;

  const orderNumber = fallbackOrderNumber();
  const total = draft.items.reduce((sum, item) => sum + item.subtotal, 0);
  const { data: order, error: orderError } = await client.from('orders').insert({
    store_id: storeId, customer_name: draft.customerName.trim(), customer_phone: draft.customerPhone.trim(), order_number: orderNumber,
    status: 'Pending', subtotal: total, discount: 0, total, notes, business_type: businessType, order_kind: orderKind, workflow_stage: 'pending', service_metadata: { source: 'flow_message' },
  }).select('*').single();
  if (orderError || !order) throw new Error(orderError?.message || rpc.error?.message || 'Could not create the order.');
  const rows = items.map(item => ({ order_id: order.id, product_id: item.product_id, offering_id: item.offering_id, item_name: item.item_name, item_kind: item.item_kind, quantity: item.quantity, price: item.price, subtotal: Number(item.quantity) * Number(item.price), unit: item.unit, metadata: item.metadata, options: item.options }));
  const { data: insertedItems, error: itemError } = await client.from('order_items').insert(rows).select('*');
  if (itemError) throw new Error(`Order ${orderNumber} was created, but its items could not sync: ${itemError.message}. Open Orders and refresh before retrying.`);
  return { ...order, order_items: insertedItems || [] } as CreatedFlowOrder;
}
