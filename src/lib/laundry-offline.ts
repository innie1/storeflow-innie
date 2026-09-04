import { supabase } from '@/integrations/supabase/client';
import { generateLaundryReceiptNumber, sanitizeGarmentSelections, summarizeLaundryGarments, type LaundryGarmentSelection } from '@/lib/laundry-intake';

export type LaundrySyncStatus = 'pending' | 'synced';
export type LaundryWorkflowStage = 'received' | 'washing' | 'drying' | 'ironing' | 'folding' | 'ready' | 'collected';

export const LAUNDRY_WORKFLOW_STAGES: { id: LaundryWorkflowStage; label: string }[] = [
  { id: 'received', label: 'Received' },
  { id: 'washing', label: 'Washing' },
  { id: 'drying', label: 'Drying' },
  { id: 'ironing', label: 'Ironing' },
  { id: 'folding', label: 'Folding' },
  { id: 'ready', label: 'Ready' },
  { id: 'collected', label: 'Collected' },
];

/** Stages a bundle has already passed through -- nothing is pending on it. */
export const LAUNDRY_SETTLED_STAGES: LaundryWorkflowStage[] = ['ready', 'collected'];

/**
 * The stage a bundle moves to next, so the counter can advance a job in one
 * tap instead of opening the full stage dropdown. Returns null once a bundle
 * has been collected, which is the end of the workflow.
 */
export function nextLaundryStage(stage: LaundryWorkflowStage): { id: LaundryWorkflowStage; label: string } | null {
  const index = LAUNDRY_WORKFLOW_STAGES.findIndex(item => item.id === stage);
  if (index < 0 || index >= LAUNDRY_WORKFLOW_STAGES.length - 1) return null;
  return LAUNDRY_WORKFLOW_STAGES[index + 1];
}

export interface LocalLaundryRecord {
  clientRef: string;
  accessCode: string;
  tagCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  promisedFor?: string;
  washMethodId?: string;
  washMethodName?: string;
  dryMethodId?: string;
  dryMethodName?: string;
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
  workflowStage?: LaundryWorkflowStage;
  stageUpdatedAt?: string;
  syncStatus: LaundrySyncStatus;
  syncedAt?: string;
  cloudOrderId?: string;
  lastSyncError?: string;
}

export interface NewLocalLaundryRecord {
  accessCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  promisedFor?: string;
  washMethodId?: string;
  washMethodName?: string;
  dryMethodId?: string;
  dryMethodName?: string;
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

function isLaundryWorkflowStage(value: string): value is LaundryWorkflowStage {
  return LAUNDRY_WORKFLOW_STAGES.some(stage => stage.id === value);
}

export function createLocalLaundryRecord(input: NewLocalLaundryRecord): LocalLaundryRecord {
  const accessCode = normalizeAccessCode(input.accessCode);
  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  if (!accessCode) throw new Error('Store access code is missing');
  if (!customerName) throw new Error('Customer name is required');
  if (!customerPhone) throw new Error('Customer phone number is required');
  const garments = sanitizeGarmentSelections(input.garments);
  if (!garments.length) throw new Error('Record at least one clothing item');

  const existing = getLocalLaundryRecords(accessCode);
  const now = new Date().toISOString();
  const record: LocalLaundryRecord = {
    clientRef: makeClientRef(),
    accessCode,
    tagCode: uniqueLocalTag(existing),
    customerName,
    customerPhone,
    customerAddress: (input.customerAddress || '').trim() || undefined,
    promisedFor: input.promisedFor && Number.isFinite(new Date(input.promisedFor).getTime()) ? new Date(input.promisedFor).toISOString() : undefined,
    washMethodId: input.washMethodId || undefined,
    washMethodName: input.washMethodName || undefined,
    dryMethodId: input.dryMethodId || undefined,
    dryMethodName: input.dryMethodName || undefined,
    serviceId: String(input.serviceId || ''),
    serviceName: input.serviceName.trim(),
    pricing: input.pricing || 'fixed',
    billingQuantity: Math.max(0, Number(input.billingQuantity) || 0),
    total: Math.max(0, Number(input.total) || 0),
    notes: (input.notes || '').trim(),
    garments,
    pieceCount: garments.reduce((sum, item) => sum + item.quantity, 0),
    garmentSummary: summarizeLaundryGarments(garments),
    createdAt: now,
    workflowStage: 'received',
    stageUpdatedAt: now,
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

export function setLocalLaundryStage(accessCode: string, clientRef: string, stage: LaundryWorkflowStage): LocalLaundryRecord | null {
  if (!isLaundryWorkflowStage(stage)) return null;
  return updateLocalRecord(accessCode, clientRef, {
    workflowStage: stage,
    stageUpdatedAt: new Date().toISOString(),
    syncStatus: 'pending',
    lastSyncError: undefined,
  });
}

export function isWalkInLaundryOrder(order: any): boolean {
  const meta = order?.service_metadata && typeof order.service_metadata === 'object'
    ? order.service_metadata
    : (() => {
        try { return JSON.parse(order?.notes || '{}'); } catch { return {}; }
      })();
  return meta?.source === 'walk_in_laundry' || meta?.intake_type === 'physical_store';
}

function statusForStage(stage: LaundryWorkflowStage): string {
  if (stage === 'ready') return 'Ready';
  if (stage === 'collected') return 'Completed';
  if (stage === 'received') return 'Accepted';
  return 'Preparing';
}

export function localLaundryRecordToOrder(record: LocalLaundryRecord): any {
  const workflowStage = record.workflowStage || 'received';
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
    garment_lines: record.garments,
    receipt_number: record.tagCode,
    tag_code: record.tagCode,
    instructions: record.notes,
    customer_address: record.customerAddress || '',
    promised_for: record.promisedFor || '',
    wash_method_id: record.washMethodId || '',
    wash_method_name: record.washMethodName || '',
    dry_method_id: record.dryMethodId || '',
    dry_method_name: record.dryMethodName || '',
  };

  const pricedGarments = record.garments.map(item => {
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const subtotal = Number.isFinite(Number(item.subtotal)) ? Math.max(0, Number(item.subtotal)) : unitPrice * item.quantity;
    return {
      item_name: item.garmentType,
      quantity: item.quantity,
      price: unitPrice,
      subtotal,
      metadata: { source: 'walk_in_laundry', garment_price_snapshot: true },
    };
  });

  return {
    id: `local:${record.clientRef}`,
    client_ref: record.clientRef,
    order_number: record.tagCode,
    customer_name: record.customerName,
    customer_phone: record.customerPhone,
    customer_address: record.customerAddress,
    status: statusForStage(workflowStage),
    workflow_stage: workflowStage,
    business_type: 'laundry',
    order_kind: 'service',
    total: record.total,
    subtotal: record.total,
    created_at: record.createdAt,
    updated_at: record.stageUpdatedAt || record.createdAt,
    service_metadata: serviceMetadata,
    notes: JSON.stringify(serviceMetadata),
    _laundrySyncStatus: record.syncStatus,
    _localClientRef: record.clientRef,
    order_items: pricedGarments,
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
      // If the local copy has a newer unsynced stage, show it immediately rather
      // than letting the older cloud stage overwrite what staff just selected.
      if (local && local.syncStatus !== 'synced') {
        const localOrder = localLaundryRecordToOrder(local);
        return { ...order, ...localOrder, id: order.id, _laundrySyncStatus: 'pending' };
      }
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

async function syncLaundryStage(accessCode: string, record: LocalLaundryRecord): Promise<{ order_id?: string } | null> {
  const stage = record.workflowStage || 'received';
  const { data, error } = await (supabase as any).rpc('update_laundry_walkin_stage', {
    p_access_code: normalizeAccessCode(accessCode),
    p_client_ref: record.clientRef,
    p_stage: stage,
  });
  if (error) throw error;
  return data || null;
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
      p_notes: JSON.stringify({
        instructions: record.notes,
        customer_address: record.customerAddress || '',
        promised_for: record.promisedFor || '',
        wash_method_id: record.washMethodId || '',
        wash_method_name: record.washMethodName || '',
        dry_method_id: record.dryMethodId || '',
        dry_method_name: record.dryMethodName || '',
      }),
      p_garments: record.garments.map(item => ({
        garment_type: item.garmentType,
        quantity: item.quantity,
        unit_price: Math.max(0, Number(item.unitPrice) || 0),
        subtotal: Number.isFinite(Number(item.subtotal)) ? Math.max(0, Number(item.subtotal)) : Math.max(0, Number(item.unitPrice) || 0) * item.quantity,
      })),
    });

    if (error) {
      updateLocalRecord(normalized, clientRef, { lastSyncError: error.message || 'Sync failed' });
      return false;
    }

    const stageData = await syncLaundryStage(normalized, record);
    const cloudOrderId = String(stageData?.order_id || data?.order_id || '');
    const updated = updateLocalRecord(normalized, clientRef, {
      syncStatus: 'synced',
      syncedAt: new Date().toISOString(),
      cloudOrderId,
      lastSyncError: undefined,
    });

    if (typeof window !== 'undefined' && cloudOrderId) {
      window.dispatchEvent(new CustomEvent('storeflow:order-created', { detail: { orderId: cloudOrderId } }));
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

export async function updateLaundryOrderStage(
  accessCode: string,
  order: any,
  stage: LaundryWorkflowStage,
): Promise<boolean> {
  const clientRef = String(order?._localClientRef || order?.client_ref || order?.service_metadata?.client_ref || '');
  if (!clientRef || !isLaundryWorkflowStage(stage)) return false;

  const local = getLocalLaundryRecord(accessCode, clientRef);
  if (local) {
    setLocalLaundryStage(accessCode, clientRef, stage);
    syncLaundryRecord(accessCode, clientRef).catch(() => {});
    return true;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  const { data, error } = await (supabase as any).rpc('update_laundry_walkin_stage', {
    p_access_code: normalizeAccessCode(accessCode),
    p_client_ref: clientRef,
    p_stage: stage,
  });
  if (error) return false;
  if (typeof window !== 'undefined' && data?.order_id) {
    window.dispatchEvent(new CustomEvent('storeflow:order-created', { detail: { orderId: data.order_id } }));
  }
  return true;
}

export async function syncPendingLaundryRecords(accessCode: string): Promise<void> {
  const records = getLocalLaundryRecords(accessCode).filter(record => record.syncStatus !== 'synced');
  for (const record of records) {
    await syncLaundryRecord(accessCode, record.clientRef);
  }
}
