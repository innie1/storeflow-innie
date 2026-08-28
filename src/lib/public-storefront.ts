import { supabase } from '@/integrations/supabase/client';
import type { StoreData } from '@/types/store';

export interface PublicStorefrontClient {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

/** Convert the deliberately limited public RPC response into customer-facing store data. */
export function publicStorefrontRowToStoreData(row: any): StoreData | null {
  if (!row || !row.data || typeof row.data !== 'object') return null;

  const data = row.data as StoreData;
  const legacyBusinessType = (data as any).businessType;
  const accessCode = data.accessCode || row.access_code;
  if (!accessCode) return null;

  return {
    ...data,
    id: row.id || data.id,
    storeId: row.store_id || data.storeId,
    storeName: data.storeName || row.business_name || 'Store',
    accessCode,
    products: Array.isArray(data.products) ? data.products : [],
    storeType: (data.storeType || legacyBusinessType || 'other') as any,
    businessType: (legacyBusinessType || data.storeType || 'other') as any,
    profile: {
      ...(data.profile || ({} as any)),
      phone: data.profile?.phone || row.phone || '',
      email: data.profile?.email || row.email || '',
      location: data.profile?.location || row.address || '',
    },
  } as StoreData;
}

/** Resolve exactly one published storefront for guests and signed-in customers. */
export async function getPublicStorefront(
  key: string,
  client: PublicStorefrontClient = supabase as unknown as PublicStorefrontClient,
): Promise<StoreData | null> {
  const lookupKey = String(key || '').trim();
  if (!lookupKey) return null;

  const { data, error } = await client.rpc('get_public_storefront', { p_key: lookupKey });
  if (error) throw new Error(error.message || 'Could not load this storefront.');
  return publicStorefrontRowToStoreData(data);
}

export interface StorefrontOrderItemInput {
  offeringId: string;
  quantity: number;
  isService: boolean;
}

export interface StorefrontOrderResult {
  id: string;
  order_number: string;
  status: string;
  total: number;
  store_name?: string;
}

export async function placeStorefrontOrder(
  input: {
    storeKey: string;
    customerName: string;
    customerPhone: string;
    items: StorefrontOrderItemInput[];
    notes?: string;
    fulfillment?: 'pickup' | 'delivery';
  },
  client: PublicStorefrontClient = supabase as unknown as PublicStorefrontClient,
): Promise<StorefrontOrderResult> {
  const { data, error } = await client.rpc('customer_place_storefront_order', {
    p_store_key: input.storeKey,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim(),
    p_items: input.items.map(item => ({
      offering_id: item.offeringId,
      quantity: item.quantity,
      is_service: item.isService,
    })),
    p_notes: input.notes?.trim() || '',
    p_fulfillment: input.fulfillment || 'pickup',
  });
  if (error) throw new Error(error.message || 'Could not place this order.');
  return data as StorefrontOrderResult;
}
