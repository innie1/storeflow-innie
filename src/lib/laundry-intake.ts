import type { Product } from '@/types/store';
import { getStoredServicePricing, type ServicePricing } from '@/lib/service-pricing';

/**
 * What a laundry is handed, and what it usually charges for it.
 *
 * The list stopped at clothing plus a bedsheet with no prices at all, so every
 * shop typed its own from nothing - the household washing a Nigerian laundry
 * earns most of its money on was not even on it.
 *
 * These prices are a starting point, not a rule. A shop that charges
 * differently changes them, and a shop that calls something else edits the
 * name; both are the merchant's from the moment they touch them.
 *
 * Sizes are separate entries where the work is genuinely different. A king
 * bedsheet is not a single bedsheet, and one price for "bedsheet" makes a shop
 * lose on every large one.
 */
export const DEFAULT_LAUNDRY_PRICES: { name: string; price: number }[] = [
  { name: 'Singlet / Vest', price: 300 },
  { name: 'T-Shirt', price: 400 },
  { name: 'Shirt', price: 500 },
  { name: 'Polo Shirt', price: 400 },
  { name: 'Trousers', price: 500 },
  { name: 'Jeans', price: 600 },
  { name: 'Shorts', price: 400 },
  { name: 'Skirt', price: 500 },
  { name: 'Blouse / Top', price: 500 },
  { name: 'Gown / Dress', price: 700 },
  { name: 'Native Wear - 1 Piece', price: 600 },
  { name: 'Native Wear - 2 Piece', price: 1100 },
  { name: 'Wrapper', price: 400 },
  { name: 'Towel - Small', price: 400 },
  { name: 'Towel - Large / Bath', price: 600 },
  { name: 'Pillowcase', price: 300 },
  { name: 'Single Bedsheet', price: 900 },
  { name: 'Double Bedsheet', price: 1100 },
  { name: 'King Bedsheet', price: 1300 },
  { name: 'Blanket - Small', price: 1500 },
  { name: 'Blanket - Large', price: 2000 },
  { name: 'Small Duvet', price: 2500 },
  { name: 'Large Duvet', price: 3000 },
  { name: 'Tracksuit - 2 Piece', price: 1000 },
  { name: 'Hoodie / Sweatshirt', price: 700 },
  { name: 'Jacket', price: 800 },
  { name: 'Senator - 2 Piece', price: 1100 },
  { name: 'Agbada - 3 Piece', price: 2500 },
];

export const DEFAULT_LAUNDRY_GARMENTS = DEFAULT_LAUNDRY_PRICES.map(entry => entry.name);

/** The starting price for an item nobody has priced yet, or null if unknown. */
export function defaultGarmentPrice(garmentType: string): number | null {
  const wanted = String(garmentType || '').trim().toLowerCase();
  const found = DEFAULT_LAUNDRY_PRICES.find(entry => entry.name.toLowerCase() === wanted);
  return found ? found.price : null;
}

/**
 * What almost every laundry offers, so setup is a tap rather than typing.
 *
 * Four shops asked to type their trade's standard services from a blank box
 * will write the same thing four ways, and on a phone it is slow. A shop with
 * something of its own still types it.
 */
export const COMMON_LAUNDRY_SERVICES = [
  'Wash & Iron',
  'Wash Only',
  'Ironing Only',
  'Dry Cleaning',
] as const;

export interface LaundryGarmentSelection {
  garmentType: string;
  quantity: number;
  /**
   * How this item is to be treated - heavy starch, no bleach, fold.
   * Per item, because the instruction usually belongs to one garment and the
   * bundle note is no place to say "not the white one".
   */
  modifiers?: string[];
  /** Price copied at intake time so later price-list edits never change old receipts. */
  unitPrice?: number;
  subtotal?: number;
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
    .map(item => {
      const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
      const unitPrice = Number(item.unitPrice);
      const explicitPrice = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined;
      const subtotal = explicitPrice === undefined ? undefined : explicitPrice * quantity;
      // Rebuilt field by field, so anything not named here is silently
      // dropped — which is what happened to the treatment instructions on
      // their way to the record.
      const modifiers = Array.isArray(item.modifiers)
        ? item.modifiers.map(entry => String(entry).trim()).filter(Boolean)
        : undefined;
      return {
        garmentType: item.garmentType.trim(),
        quantity,
        modifiers: modifiers && modifiers.length ? modifiers : undefined,
        unitPrice: explicitPrice,
        subtotal,
      };
    })
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
 * Build order_items for a physical laundry intake while keeping garment price
 * snapshots when present. Legacy callers without snapshots still allocate the
 * agreed total evenly, preserving backwards compatibility.
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
    const hasSnapshots = clean.every(item => Number.isFinite(Number(item.unitPrice)));
    if (hasSnapshots) {
      clean.forEach(item => {
        const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
        const subtotal = unitPrice * item.quantity;
        rows.push({
          product_id: `walkin:${serviceId}:${slug(item.garmentType)}`,
          offering_id: serviceId,
          item_kind: 'service',
          item_name: item.garmentType,
          unit: 'pcs',
          quantity: item.quantity,
          price: unitPrice,
          subtotal,
          options: { service_name: serviceName, pricing },
          metadata: { source: 'walk_in_laundry', garment_price_snapshot: true },
        });
      });
      return rows;
    }

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
