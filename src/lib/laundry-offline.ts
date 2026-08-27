import { supabase } from '@/integrations/supabase/client';
import { generateLaundryReceiptNumber, sanitizeGarmentSelections, summarizeLaundryGarments, type LaundryGarmentSelection } from '@/lib/laundry-intake';

export type LaundrySyncStatus = 'pending' | 'synced';

export interface LocalLaundryRecord {
  clientRef: string;
  accessCode: string;
  tagCode: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  pricing: string;
  billingQuantity: number;
  total: number;
  notes: string;
  garments: LaundryGarmentSelection[];
  pieceCount: number;
  garmentSummary: string;
  createdAt: string;
  syncStatus: LaundrySyncStatus;
  syncedAt?: string;
  cloudOrderId?: string;
  lastSyncError?: string;
}

export interface NewLocalLaundryRecord {
  accessCode: string;
  customerName: string;
  customerPhone?: string;
  serviceId: string;
  serviceName: string;
  pricing: string;
  billingQuantity: number;
  total: number;
  notes?: string;
  garments: LaundryGarmentSelection[];
}

export const LAUNDRY_LOCAL_CHANGED_EVENT = 'storeflow:laundry-local-changed';
export const LAUNDRY_SYNC_CHANGED_EVENT = 'storeflow:laundry-sync-changed';
const STORAGE_PREFIX = 'storeflow_laundry_local_records_';
const inflight = new Set<string>();

function normalizeAccessCode(accessCode: string): string {
  return accessCode.trim().toUpperCase();
}

export function laundryLocalStorageKey(accessCode: string): string {
  return `${STORAGE_PREFIX}${normalizeAccessCode(accessCode)}`;
}

function emit(name: string, record?: LocalLaundryRecord) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail: record ? { record } : undefined }));
}

export function getLocalLaundryRecords(accessCode: string): LocalLaundryRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(laundryLocalStorageKey(accessCode));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalLaundryRecords(accessCode: string, records: LocalLaundryRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(laundryLocalStorageKey(accessCode), JSON.stringify(records.slice(0, 1000)));
  emit(LAUNDRY_LOCAL_CHANGED_EVENT);
}

function makeClientRef(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `laundry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueLocalTag(existing: LocalLaundryRecord[]): string {
  const used = new Set(existing.map(record => record.tagCode.toUpperCase()));
  let tag = generateLaundryReceiptNumber();
  let attempts = 0;
  while (used.has(tag) && attempts < 50) {
    tag = generateLaundryReceiptNumber();
    attempts += 1;
  }
  if (used.has(tag)) throw new Error('Could not generate a unique laundry tag');
  return tag;
}

export function createLocalLaundryRecord(input: NewLocalLaundryRecord): LocalLaundryRecord {
  const accessCode = normalizeAccessCode(input.accessCode);
  if (!accessCode) throw new Error('Store access code is missing');
  const garments = sanitizeGarmentSelections(input.garments);
  if (!garments.length) throw new Error('Record at least one clothing item');

  const existing = getLocalLaundryRecords(accessCode);
  const record: LocalLaundryRecord = {
    clientRef: makeClientRef(),
    accessCode,
    tagCode: uniqueLocalTag(existing),
    customerName: input.customerName.trim(),
    customerPhone: (input.customerPhone || '').trim(),
    serviceId: String(input.serviceId || ''),
    serviceName: input.serviceName.trim(),
    pricing: input.pricing || 'fixed',
    billingQuantity: Math.max(0, Number(input.billingQuantity) || 0),
    total: Math.max(0, Number(input.total) || 0),
    notes: (input.notes || '').trim(),
    garments,
    pieceCount: garments.reduce((sum, item) => sum + item.quantity, 0),
    garmentSummary: summarizeLaundryGarments(garments),
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  };

  writeLocalLaundryRecords(accessCode, [record, ...existing]);
  return record;
}

function updateLocalRecord(accessCode: string, clientRef: string, updates: Partial<LocalLaundryRecord>): LocalLaundryRecord | null {
  const records = getLocalLaundryRecords(accessCode);
  let changed: LocalLaundryRecord | null = null;
  const next = records.map(record => {
    if (record.clientRef !== clientRef) return record;
    changed = { ...record, ...updates };
    return changed;
  });
  if (changed) {
    writeLocalLaundryRecords(accessCode, next);
    emit(LAUNDRY_SYNC_CHANGED_EVENT, changed);
  }
  return changed;
}

export function getLocalLaundryRecord(accessCode: string, clientRef: string): LocalLaundryRecord | null {
  return getLocalLaundryRecords(accessCode).find(record => record.clientRef === clientRef) || null;
}

export function isWalkInLaundryOrder(order: any): boolean {
  const meta = order?.service_metadata && typeof order.service_metadata === 'object'
    ? order.service_metadata
    : (() => {
        try { return JSON.parse(order?.notes || '{}'); } catch { return {}; }
      })();
  return meta?.source === 'walk_in_laundry' || meta?.intake_type === 'physical_store';
}

export function localLaundryRecordToOrder(record: LocalLaundryRecord): any {
  const serviceMetadata = {
    source: 'walk_in_laundry',
    intake_type: 'physical_store',
    client_ref: record.clientRef,
    service_id: record.serviceId,
    service_name: record.serviceName,
    pricing: record.pricing,
    billing_quantity: record.billingQuantity,
    garment_count: record.pieceCount,
    garment_summary: record.garmentSummary,
    receipt_number: record.tagCode,
    tag_code: record.tagCode,
    instructions: record.notes,
  };

  return {
    id: `local:${record.clientRef}`,
    client_ref: record.clientRef,
    order_number: record.tagCode,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    status: 'Accepted',
    workflow_stage: 'received',
    business_type: 'laundry',
    order_kind: 'service',
    total: record.total,
    subtotal: record.total,
    created_at: record.createdAt,
    service_metadata: serviceMetadata,
    notes: JSON.stringify(serviceMetadata),
    _laundrySyncStatus: record.syncStatus,
    _localClientRef: record.clientRef,
    order_items: [
      ...record.garments.map(item => ({
        item_name: item.garmentType,
        quantity: item.quantity,
        price: 0,
        subtotal: 0,
        metadata: { source: 'walk_in_laundry', identification_only: true },
      })),
      {
        item_name: `${record.serviceName} — Service charge`,
        quantity: 1,
        price: record.total,
        subtotal: record.total,
        metadata: { source: 'walk_in_laundry', charge_line: true },
      },
    ],
  };
}

export function mergeLaundryRecords(cloudOrders: any[], localRecords: LocalLaundryRecord[]): any[] {
  const localByClient = new Map(localRecords.map(record => [record.clientRef, record]));
  const localByTag = new Map(localRecords.map(record => [record.tagCode.toUpperCase(), record]));
  const matched = new Set<string>();

  const cloud = (cloudOrders || [])
    .filter(isWalkInLaundryOrder)
    .map(order => {
      const meta = order?.service_metadata && typeof order.service_metadata === 'object' ? order.service_metadata : {};
      const clientRef = String(order?.client_ref || meta?.client_ref || '');
      const tag = String(order?.order_number || meta?.tag_code || '').toUpperCase();
      const local = (clientRef && localByClient.get(clientRef)) || (tag && localByTag.get(tag));
      if (local) matched.add(local.clientRef);
      return {
        ...order,
        _laundrySyncStatus: 'synced',
        _localClientRef: local?.clientRef || clientRef || undefined,
      };
    });

  const localOnly = localRecords
    .filter(record => !matched.has(record.clientRef))
    .map(localLaundryRecordToOrder);

  return [...cloud, ...localOnly].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

export async function syncLaundryRecord(accessCode: string, clientRef: string): Promise<boolean> {
  const normalized = normalizeAccessCode(accessCode);
  const key = `${normalized}:${clientRef}`;
  if (inflight.has(key)) return false;

  const record = getLocalLaundryRecord(normalized, clientRef);
  if (!record || record.syncStatus === 'synced') return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  inflight.add(key);
  try {
    const { data, error } = await (supabase as any).rpc('create_laundry_walkin_v2', {
      p_access_code: normalized,
      p_client_ref: record.clientRef,
      p_tag_code: record.tagCode,
      p_customer_name: record.customerName,
      p_customer_phone: record.customerPhone,
      p_service_id: record.serviceId,
      p_service_name: record.serviceName,
      p_pricing: record.pricing,
      p_billing_quantity: record.billingQuantity,
      p_total: record.total,
      p_notes: record.notes,
      p_garments: record.garments.map(item => ({ garment_type: item.garmentType, quantity: item.quantity })),
    });

    if (error) {
      updateLocalRecord(normalized, clientRef, { lastSyncError: error.message || 'Sync failed' });
      return false;
    }

    const updated = updateLocalRecord(normalized, clientRef, {
      syncStatus: 'synced',
      syncedAt: new Date().toISOString(),
      cloudOrderId: String(data?.order_id || ''),
      lastSyncError: undefined,
    });

    if (typeof window !== 'undefined' && data?.order_id) {
      window.dispatchEvent(new CustomEvent('storeflow:order-created', { detail: { orderId: data.order_id } }));
    }
    emit(LAUNDRY_SYNC_CHANGED_EVENT, updated || record);
    return true;
  } catch (error: any) {
    updateLocalRecord(normalized, clientRef, { lastSyncError: error?.message || 'Sync failed' });
    return false;
  } finally {
    inflight.delete(key);
  }
}

export async function syncPendingLaundryRecords(accessCode: string): Promise<void> {
  const records = getLocalLaundryRecords(accessCode).filter(record => record.syncStatus !== 'synced');
  for (const record of records) {
    await syncLaundryRecord(accessCode, record.clientRef);
  }
}