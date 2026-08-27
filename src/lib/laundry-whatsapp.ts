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

function garmentSummary(order: any, meta: Record<string, any>): string {
  if (meta.garment_summary) return String(meta.garment_summary);
  const lines = Array.isArray(meta.garment_lines) ? meta.garment_lines : [];
  if (lines.length) {
    return lines.map((item: any) => `${Number(item.quantity || 0)} ${item.garmentType || item.garment_type || 'item'}`).join(', ');
  }
  return (order?.order_items || [])
    .filter((item: any) => !item?.metadata?.charge_line)
    .map((item: any) => `${Number(item.quantity || 0)} ${item.item_name || item.product_name || 'item'}`)
    .join(', ');
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
  const items = garmentSummary(order, meta) || `${pieces} item${pieces === 1 ? '' : 's'}`;
  const total = money(order?.total);
  const lines: string[] = [`Hello ${name},`];

  if (kind === 'received') {
    lines.push(
      `Thank you for choosing ${store.storeName}. We have received your laundry.`,
      '',
      `Laundry code: ${tag}`,
      `Service: ${service}`,
      `Items (${pieces}): ${items}`,
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
      `Items (${pieces}): ${items}`,
      '',
      'We will message you again when it is ready.',
    );
  } else if (kind === 'ready') {
    lines.push(
      `Good news — your laundry is ready for pickup from ${store.storeName}.`,
      '',
      `Laundry code: ${tag}`,
      `Items (${pieces}): ${items}`,
      `Total: ${total}`,
      '',
      'Please bring or mention your laundry code when collecting.',
    );
  } else if (kind === 'reminder') {
    lines.push(
      `This is a friendly reminder from ${store.storeName} that your laundry is still ready for collection.`,
      '',
      `Laundry code: ${tag}`,
      `Items (${pieces}): ${items}`,
      '',
      'Please contact us or come by when convenient to arrange collection.',
    );
  } else {
    lines.push(
      `Thank you for using ${store.storeName}. Your laundry job has been completed.`,
      '',
      `Laundry code: ${tag}`,
      `Items (${pieces}): ${items}`,
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
