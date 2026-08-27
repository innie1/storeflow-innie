import type { Product } from '@/types/store';
import { getStoredServicePricing, type ServicePricing } from '@/lib/service-pricing';

export const DEFAULT_LAUNDRY_GARMENTS = [
  'Shirt',
  'Trouser',
  'T-shirt',
  'Nicker / Shorts',
  'Gown / Dress',
  'Skirt',
  'Native Wear',
  'Jacket',
  'Bedsheet',
  'Towel',
  'Underwear',
] as const;

export interface LaundryGarmentSelection {
  garmentType: string;
  quantity: number;
}

export interface ExpandedLaundryGarment {
  garmentType: string;
  tagCode: string;
  sequence: number;
}

export interface LaundryOrderItemDraft {
  product_id: string;
  offering_id: string;
  item_kind: 'service';
  item_name: string;
  unit: string;
  quantity: number;
  price: number;
  subtotal: number;
  options: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

function randomCode(random: () => number): string {
  // Avoid characters that are easy to confuse when handwritten on a cloth tag.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let i = 0; i < 6; i += 1) {
    output += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  }
  return output;
}

/**
 * The receipt number is also the physical laundry tag code.
 * It is intentionally only six handwritten-friendly characters, e.g. K7M2Q9.
 */
export function generateLaundryReceiptNumber(_date = new Date(), random: () => number = Math.random): string {
  return randomCode(random);
}

export function sanitizeGarmentSelections(selections: LaundryGarmentSelection[]): LaundryGarmentSelection[] {
  return selections
    .map(item => ({ garmentType: item.garmentType.trim(), quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)) }))
    .filter(item => item.garmentType && item.quantity > 0);
}

export function countLaundryPieces(selections: LaundryGarmentSelection[]): number {
  return sanitizeGarmentSelections(selections).reduce((sum, item) => sum + item.quantity, 0);
}

/** Every garment in one intake shares the same tag code. */
export function expandLaundryGarments(receiptNumber: string, selections: LaundryGarmentSelection[]): ExpandedLaundryGarment[] {
  const expanded: ExpandedLaundryGarment[] = [];
  let sequence = 1;
  for (const item of sanitizeGarmentSelections(selections)) {
    for (let i = 0; i < item.quantity; i += 1) {
      expanded.push({ garmentType: item.garmentType, tagCode: receiptNumber, sequence });
      sequence += 1;
    }
  }
  return expanded;
}

export function suggestedLaundryTotal(service: Product, pieceCount: number, billingQuantity = 1): number {
  const pricing = getStoredServicePricing(service);
  const price = Math.max(0, Number(service.sellingPrice) || 0);
  if (pricing === 'per_piece') return price * Math.max(0, pieceCount);
  if (pricing === 'per_kg' || pricing === 'per_load') return price * Math.max(0, Number(billingQuantity) || 0);
  return price;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

/**
 * Build order_items for a physical laundry intake while keeping the agreed
 * receipt total exact even when staff override the configured catalogue price.
 */
export function buildLaundryOrderItems(
  service: Product,
  selections: LaundryGarmentSelection[],
  agreedTotal: number,
  billingQuantity = 1,
): LaundryOrderItemDraft[] {
  const clean = sanitizeGarmentSelections(selections);
  const pricing: ServicePricing = getStoredServicePricing(service);
  const serviceId = String(service.id);
  const serviceName = service.name;
  const rows: LaundryOrderItemDraft[] = [];
  const total = Math.max(0, Number(agreedTotal) || 0);

  if (pricing === 'per_piece') {
    const pieceCount = clean.reduce((sum, item) => sum + item.quantity, 0);
    const unitPrice = pieceCount > 0 ? total / pieceCount : 0;
    let allocated = 0;
    clean.forEach((item, index) => {
      const subtotal = index === clean.length - 1 ? total - allocated : unitPrice * item.quantity;
      allocated += subtotal;
      rows.push({
        product_id: `walkin:${serviceId}:${slug(item.garmentType)}`,
        offering_id: serviceId,
        item_kind: 'service',
        item_name: item.garmentType,
        unit: 'pcs',
        quantity: item.quantity,
        price: item.quantity > 0 ? subtotal / item.quantity : 0,
        subtotal,
        options: { service_name: serviceName, pricing },
        metadata: { source: 'walk_in_laundry' },
      });
    });
    return rows;
  }

  for (const item of clean) {
    rows.push({
      product_id: `walkin:${serviceId}:${slug(item.garmentType)}`,
      offering_id: serviceId,
      item_kind: 'service',
      item_name: item.garmentType,
      unit: 'pcs',
      quantity: item.quantity,
      price: 0,
      subtotal: 0,
      options: { service_name: serviceName, pricing },
      metadata: { source: 'walk_in_laundry', identification_only: true },
    });
  }

  rows.push({
    product_id: `walkin:${serviceId}:service-charge`,
    offering_id: serviceId,
    item_kind: 'service',
    item_name: `${serviceName} — Service charge`,
    unit: pricing === 'per_kg' ? 'kg' : pricing === 'per_load' ? 'load' : 'service',
    quantity: 1,
    price: total,
    subtotal: total,
    options: { service_name: serviceName, pricing, billing_quantity: Math.max(0, Number(billingQuantity) || 0) },
    metadata: { source: 'walk_in_laundry', charge_line: true },
  });

  return rows;
}

export function summarizeLaundryGarments(selections: LaundryGarmentSelection[]): string {
  return sanitizeGarmentSelections(selections).map(item => `${item.quantity} ${item.garmentType}`).join(', ');
}
