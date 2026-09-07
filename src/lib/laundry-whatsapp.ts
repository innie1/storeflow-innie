import type { StoreData } from '@/types/store';
import { parseLaundryRecordMetadata } from '@/lib/laundry-workspace';

export type LaundryMessageKind = 'received' | 'processing' | 'ready' | 'reminder' | 'completed';

export interface LaundryWhatsAppPayload {
  phone: string;
  message: string;
  url: string;
  kind: LaundryMessageKind;
}

export function normalizeWhatsAppPhone(phone: string, defaultCountryCode = '234'): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
  return digits;
}

function money(value: unknown): string {
  return `₦${Math.max(0, Number(value) || 0).toLocaleString()}`;
}

function storeDetails(store: StoreData): string[] {
  const profile = store.profile;
  return [
    store.storeName,
    profile?.location ? `Address: ${profile.location}` : '',
    profile?.phone ? `Phone: ${profile.phone}` : '',
  ].filter(Boolean);
}

/** One entry per kind of garment, so the message can lay them out itself. */
function garmentLines(order: any, meta: Record<string, any>): { name: string; quantity: number }[] {
  const lines = Array.isArray(meta.garment_lines) ? meta.garment_lines : [];
  if (lines.length) {
    return lines.map((item: any) => ({
      name: String(item.garmentType || item.garment_type || 'Item'),
      quantity: Math.max(1, Number(item.quantity) || 1),
    }));
  }
  return (order?.order_items || [])
    .filter((item: any) => !item?.metadata?.charge_line)
    .map((item: any) => ({
      name: String(item.item_name || item.product_name || 'Item'),
      quantity: Math.max(1, Number(item.quantity) || 1),
    }));
}

/**
 * The items, as a list a customer can actually check against their bag.
 *
 * This used to be one run-on line — "Items (6): 1 Shirt, 1 Trouser, 1 T-shirt,
 * 1 Nicker / Shorts, 1 Gown / Dress, 1 Skirt" — which wrapped across four
 * lines on a phone and had to be read word by word to count. WhatsApp has no
 * columns or tables to lay it out with (proportional font, no table markup),
 * so a numbered list down the message is the format that scans: the number on
 * the left is the count, and each garment sits on its own line.
 *
 * A quantity is only shown when there is more than one, because "1 ×" on every
 * line of a six-line list is noise.
 */
function formatItemBlock(order: any, meta: Record<string, any>, pieces: number): string[] {
  const lines = garmentLines(order, meta);
  const heading = `Items — ${pieces} piece${pieces === 1 ? '' : 's'}`;

  if (!lines.length) {
    const summary = meta.garment_summary ? String(meta.garment_summary) : '';
    return summary ? [heading, summary] : [heading];
  }

  return [
    heading,
    ...lines.map((item, index) => (
      item.quantity > 1
        ? `${index + 1}. ${item.name} ×${item.quantity}`
        : `${index + 1}. ${item.name}`
    )),
    // A blank line, so the total does not run straight on from the last item.
    '',
  ];
}

function determineKind(order: any): LaundryMessageKind {
  const stage = String(order?.workflow_stage || order?.status || '').toLowerCase().replace(/[_-]/g, ' ');
  const updatedAt = new Date(order?.updated_at || order?.created_at || Date.now()).getTime();
  const ageDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);

  if (stage.includes('complete') || stage.includes('collect') || stage.includes('delivered')) return 'completed';
  if (stage.includes('ready')) return ageDays >= 7 ? 'reminder' : 'ready';
  if (
    stage.includes('prepar') || stage.includes('process') || stage.includes('wash') ||
    stage.includes('dry') || stage.includes('iron') || stage.includes('fold') || stage.includes('quality')
  ) return 'processing';
  return 'received';
}

export function buildLaundryWhatsAppPayload(store: StoreData, order: any): LaundryWhatsAppPayload | null {
  const phone = normalizeWhatsAppPhone(order?.customer_phone || '');
  if (!phone) return null;

  const meta = parseLaundryRecordMetadata(order);
  const kind = determineKind(order);
  const name = String(order?.customer_name || 'Customer').trim();
  const tag = String(meta.tag_code || meta.receipt_number || order?.order_number || '').toUpperCase();
  const service = String(meta.service_name || 'Laundry service');
  const pieces = Number(meta.garment_count || 0) || (order?.order_items || []).reduce((sum: number, item: any) => {
    if (item?.metadata?.charge_line) return sum;
    return sum + Math.max(0, Number(item?.quantity) || 0);
  }, 0);
  const total = money(order?.total);
  const lines: string[] = [`Hello ${name},`];

  if (kind === 'received') {
    lines.push(
      `Thank you for choosing ${store.storeName}. We have received your laundry.`,
      '',
      `Laundry code: ${tag}`,
      `Service: ${service}`,
      ...formatItemBlock(order, meta, pieces),
      `Total: ${total}`,
      '',
      'We will keep you updated as your laundry moves through processing.',
    );
  } else if (kind === 'processing') {
    lines.push(
      `Update from ${store.storeName}: your laundry is currently being processed.`,
      '',
      `Laundry code: ${tag}`,
      `Service: ${service}`,
      ...formatItemBlock(order, meta, pieces),
      '',
      'We will message you again when it is ready.',
    );
  } else if (kind === 'ready') {
    lines.push(
      `Good news — your laundry is ready for pickup from ${store.storeName}.`,
      '',
      `Laundry code: ${tag}`,
      ...formatItemBlock(order, meta, pieces),
      `Total: ${total}`,
      '',
      'Please bring or mention your laundry code when collecting.',
    );
  } else if (kind === 'reminder') {
    lines.push(
      `This is a friendly reminder from ${store.storeName} that your laundry is still ready for collection.`,
      '',
      `Laundry code: ${tag}`,
      ...formatItemBlock(order, meta, pieces),
      '',
      'Please contact us or come by when convenient to arrange collection.',
    );
  } else {
    lines.push(
      `Thank you for using ${store.storeName}. Your laundry job has been completed.`,
      '',
      `Laundry code: ${tag}`,
      ...formatItemBlock(order, meta, pieces),
      '',
      'We appreciate your patronage and hope to serve you again.',
    );
  }

  lines.push('', ...storeDetails(store));
  const message = lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
  return {
    phone,
    message,
    url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    kind,
  };
}

export function openLaundryWhatsApp(store: StoreData, order: any): boolean {
  const payload = buildLaundryWhatsAppPayload(store, order);
  if (!payload || typeof window === 'undefined') return false;
  window.open(payload.url, '_blank', 'noopener,noreferrer');
  return true;
}
