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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function randomCode(random: () => number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let i = 0; i < 4; i += 1) {
    output += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  }
  return output;
}

export function generateLaundryReceiptNumber(date = new Date(), random: () => number = Math.random): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `LND-${yy}${mm}${dd}-${hh}${min}-${randomCode(random)}`;
}

export function sanitizeGarmentSelections(selections: LaundryGarmentSelection[]): LaundryGarmentSelection[] {
  return selections
    .map(item => ({ garmentType: item.garmentType.trim(), quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)) }))
    .filter(item => item.garmentType && item.quantity > 0);
}

export function countLaundryPieces(selections: LaundryGarmentSelection[]): number {
  return sanitizeGarmentSelections(selections).reduce((sum, item) => sum + item.quantity, 0);
}

export function expandLaundryGarments(receiptNumber: string, selections: LaundryGarmentSelection[]): ExpandedLaundryGarment[] {
  const expanded: ExpandedLaundryGarment[] = [];
  let sequence = 1;
  for (const item of sanitizeGarmentSelections(selections)) {
    for (let i = 0; i < item.quantity; i += 1) {
      expanded.push({
        garmentType: item.garmentType,
        tagCode: `${receiptNumber}-${String(sequence).padStart(2, '0')}`,
        sequence,
      });
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
 * Build the existing order_items rows for a physical laundry intake.
 * Per-piece pricing is attached directly to each garment group. For KG/load/fixed
 * pricing, garments remain visible as zero-price identification lines and a single
 * service-charge line carries the agreed total.
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

  if (pricing === 'per_piece') {
    const unitPrice = Math.max(0, Number(service.sellingPrice) || 0);
    for (const item of clean) {
      rows.push({
        product_id: `walkin:${serviceId}:${slug(item.garmentType)}`,
        offering_id: serviceId,
        item_kind: 'service',
        item_name: item.garmentType,
        unit: 'pcs',
        quantity: item.quantity,
        price: unitPrice,
        subtotal: unitPrice * item.quantity,
        options: { service_name: serviceName, pricing },
        metadata: { source: 'walk_in_laundry' },
      });
    }
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

  const total = Math.max(0, Number(agreedTotal) || 0);
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
