import { supabase } from '@/integrations/supabase/client';
import { appendRunEvent, type LaundryFulfillment, type LaundryRunStatus, type RunEvent } from '@/lib/laundry-runs';
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

/** Somebody other than the customer who may collect a bundle. */
export interface LaundryCollector {
  name: string;
  phone?: string;
}

export interface LocalLaundryRecord {
  clientRef: string;
  accessCode: string;
  tagCode: string;
  /**
   * Whose bundle this is, by internal customer id.
   *
   * One customer record, one id, one balance, many bundles. The name on the
   * ticket is how the counter finds them; this is which of the two Musa
   * Bellos it actually was. Absent on everything taken in before it existed.
   */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  /**
   * Other people the customer has said may collect these clothes - a brother,
   * a driver. Kept on this phone only: the cloud copy of a bundle is never
   * given them.
   */
  collectors?: LaundryCollector[];
  /** Who the clothes were handed to, when it was not the customer. */
  collectedBy?: string;
  /**
   * Where the bundle physically is.
   *
   * Losing a bundle is the most damaging thing that happens in a laundry, and
   * the app could say everything about a job except which shelf it was on. Free
   * text, because every shop numbers its own space differently - "Rack B",
   * "3rd shelf", "under the counter".
   */
  shelfLocation?: string;
  /** How the bundle reaches the shop and gets back: walk-in, we collect, we deliver. */
  fulfillment?: LaundryFulfillment;
  /** Where to go. Free text, with a landmark, because that is how it is given. */
  runAddress?: string;
  runLandmark?: string;
  /**
   * The journey, kept apart from the wash stage: a bundle can be ready and out
   * on a bike at the same time.
   */
  runStatus?: LaundryRunStatus;
  /** Charged for the run, and part of what the customer owes. */
  deliveryFee?: number;
  /** What has happened to the run and when, oldest first. */
  runEvents?: RunEvent[];
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
  /**
   * Who put this record in, and the role they held at the time.
   *
   * The actor was already passed into recordSale and used only for the
   * activity log, so once a shop had two people working nothing on the record
   * itself said who did it.
   */
  recordedByName?: string;
  recordedByRole?: string;
}

export interface NewLocalLaundryRecord {
  accessCode: string;
  /** Which customer, when the counter picked or created one. */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  /** Other people allowed to collect. */
  collectors?: LaundryCollector[];
  /**
   * Where the bundle physically is.
   *
   * Losing a bundle is the most damaging thing that happens in a laundry, and
   * the app could say everything about a job except which shelf it was on. Free
   * text, because every shop numbers its own space differently - "Rack B",
   * "3rd shelf", "under the counter".
   */
  shelfLocation?: string;
  /** How the bundle reaches the shop and gets back: walk-in, we collect, we deliver. */
  fulfillment?: LaundryFulfillment;
  /** Where to go. Free text, with a landmark, because that is how it is given. */
  runAddress?: string;
  runLandmark?: string;
  /**
   * The journey, kept apart from the wash stage: a bundle can be ready and out
   * on a bike at the same time.
   */
  runStatus?: LaundryRunStatus;
  /** Charged for the run, and part of what the customer owes. */
  deliveryFee?: number;
  /** What has happened to the run and when, oldest first. */
  runEvents?: RunEvent[];
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
  recordedByName?: string;
  recordedByRole?: string;
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

/**
 * `announce` is false only for writing down how a send to the cloud went. The
 * sync agent sends on every announced change, so announcing its own results
 * would have it send again straight away - see "Sending bundles to the cloud".
 */
function writeLocalLaundryRecords(accessCode: string, records: LocalLaundryRecord[], announce = true): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(laundryLocalStorageKey(accessCode), JSON.stringify(records.slice(0, 1000)));
  if (announce) emit(LAUNDRY_LOCAL_CHANGED_EVENT);
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

/** Named people only, trimmed and each once, with a phone where one was given. */
export function cleanCollectors(list: LaundryCollector[] | undefined): LaundryCollector[] | undefined {
  const seen = new Set<string>();
  const kept: LaundryCollector[] = [];
  for (const entry of list || []) {
    const name = String(entry?.name || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const phone = String(entry?.phone || '').trim();
    kept.push(phone ? { name, phone } : { name });
  }
  return kept.length ? kept : undefined;
}

export function createLocalLaundryRecord(input: NewLocalLaundryRecord): LocalLaundryRecord {
  const accessCode = normalizeAccessCode(input.accessCode);
  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  if (!accessCode) throw new Error('Store access code is missing');
  if (!customerName) throw new Error('Customer name is required');
  /*
   * No phone is allowed here on purpose.
   *
   * The counter stopped demanding one - a walk-in who will not give a number
   * has to be recordable, or the attendant reaches for the paper book and
   * stays there - and this refusing would have made that change fail at the
   * last step, with an error about a field the form no longer asks for.
   */
  const garments = sanitizeGarmentSelections(input.garments);
  if (!garments.length) throw new Error('Record at least one clothing item');

  const existing = getLocalLaundryRecords(accessCode);
  const now = new Date().toISOString();
  const record: LocalLaundryRecord = {
    clientRef: makeClientRef(),
    accessCode,
    tagCode: uniqueLocalTag(existing),
    customerId: (input.customerId || '').trim() || undefined,
    customerName,
    customerPhone,
    customerAddress: (input.customerAddress || '').trim() || undefined,
    collectors: cleanCollectors(input.collectors),
    shelfLocation: (input.shelfLocation || '').trim() || undefined,
    fulfillment: input.fulfillment,
    runAddress: (input.runAddress || '').trim() || undefined,
    runLandmark: (input.runLandmark || '').trim() || undefined,
    // A collection is outstanding the moment it is booked; a delivery only
    // becomes a run once the washing is done, so it starts with no status.
    runStatus: input.fulfillment === 'pickup' ? 'awaiting_pickup' : undefined,
    deliveryFee: Math.max(0, Number(input.deliveryFee) || 0) || undefined,
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
    recordedByName: input.recordedByName,
    recordedByRole: input.recordedByRole,
  };

  writeLocalLaundryRecords(accessCode, [record, ...existing]);
  return record;
}

function updateLocalRecord(accessCode: string, clientRef: string, updates: Partial<LocalLaundryRecord>, announce = true): LocalLaundryRecord | null {
  const records = getLocalLaundryRecords(accessCode);
  let changed: LocalLaundryRecord | null = null;
  const next = records.map(record => {
    if (record.clientRef !== clientRef) return record;
    changed = { ...record, ...updates };
    return changed;
  });
  if (changed) {
    writeLocalLaundryRecords(accessCode, next, announce);
    emit(LAUNDRY_SYNC_CHANGED_EVENT, changed);
  }
  return changed;
}

/**
 * Points old bundles at the customer they belong to.
 *
 * Everything taken in before records carried a customer id is filed under a
 * name, which is not a person - two customers may answer to it. This is how
 * that history gets attached to real customer records, once, on load.
 *
 * The caller decides which records to link; this only writes them. A link the
 * counter chose is protected there, where the reason lives - see
 * customer-backfill.
 *
 * Returns how many were linked, and writes nothing when that is none.
 */
export function setLocalLaundryCustomerIds(accessCode: string, links: Record<string, string>): number {
  if (typeof localStorage === 'undefined') return 0;
  const records = getLocalLaundryRecords(accessCode);
  let linked = 0;
  const next = records.map(record => {
    const id = links[record.clientRef];
    if (!id || record.customerId === id) return record;
    linked += 1;
    return { ...record, customerId: id };
  });
  if (linked > 0) writeLocalLaundryRecords(accessCode, next);
  return linked;
}

/**
 * A number given after the bundle was taken in.
 *
 * A walk-in who would not give one at the counter, and then does when the shop
 * says it will message them when the clothes are ready. The bundle keeps it,
 * so every reminder about these clothes can reach them.
 */
export function setLocalLaundryPhone(accessCode: string, clientRef: string, phone: string): LocalLaundryRecord | null {
  if (typeof localStorage === 'undefined') return null;
  const number = String(phone || '').trim();
  if (!number) return null;
  const records = getLocalLaundryRecords(accessCode);
  const found = records.find(record => record.clientRef === clientRef);
  if (!found) return null;
  const updated = { ...found, customerPhone: number, syncStatus: 'pending' as LaundrySyncStatus };
  writeLocalLaundryRecords(accessCode, records.map(record => record.clientRef === clientRef ? updated : record));
  return updated;
}

/** Who else may collect a bundle, set or changed after it was taken in. Null when it is not on this phone. */
export function setLocalLaundryCollectors(accessCode: string, clientRef: string, collectors: LaundryCollector[]): LocalLaundryRecord | null {
  if (typeof localStorage === 'undefined') return null;
  const changed = updateLocalRecord(normalizeAccessCode(accessCode), clientRef, { collectors: cleanCollectors(collectors) });
  if (changed) emit(LAUNDRY_LOCAL_CHANGED_EVENT, changed);
  return changed;
}

/** Who the clothes were handed to. Empty means the customer came for them. */
export function setLocalLaundryCollectedBy(accessCode: string, clientRef: string, name: string): LocalLaundryRecord | null {
  if (typeof localStorage === 'undefined') return null;
  const changed = updateLocalRecord(normalizeAccessCode(accessCode), clientRef, { collectedBy: String(name || '').trim() || undefined });
  if (changed) emit(LAUNDRY_LOCAL_CHANGED_EVENT, changed);
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

/**
 * Move a bundle along its run.
 *
 * Separate from setLocalLaundryStage because the two are separate journeys:
 * this must not touch workflowStage, or a bundle going out for delivery would
 * stop counting as ready and the counter's totals would drift.
 */
export function setLocalLaundryRunStatus(
  accessCode: string,
  clientRef: string,
  runStatus: LaundryRunStatus,
  by?: string,
): LocalLaundryRecord | null {
  const existing = getLocalLaundryRecords(accessCode).find(record => record.clientRef === clientRef);
  return updateLocalRecord(accessCode, clientRef, {
    runStatus,
    // The status says where it is; the trail says how it got there, which is
    // what answers "when did we deliver it?" when a customer says otherwise.
    runEvents: appendRunEvent(existing?.runEvents, runStatus, by),
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
    // Carried into the order shape too, or the workspace - which rebuilds
    // every row from an order - loses who took the bundle in.
    shelf_location: record.shelfLocation,
    fulfillment: record.fulfillment,
    run_address: record.runAddress,
    run_landmark: record.runLandmark,
    run_status: record.runStatus,
    run_events: record.runEvents,
    delivery_fee: record.deliveryFee,
    recorded_by_name: record.recordedByName,
    recorded_by_role: record.recordedByRole,
    receipt_number: record.tagCode,
    tag_code: record.tagCode,
    instructions: record.notes,
    customer_address: record.customerAddress || '',
    // Read by the Records list. Never part of what is sent to the cloud.
    collectors: record.collectors,
    collected_by: record.collectedBy,
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
      metadata: { source: 'walk_in_laundry', garment_price_snapshot: true, modifiers: item.modifiers },
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
      // Who may collect lives only on this phone, so it is carried across from
      // the local copy, or the Records list would lose it once the bundle syncs.
      const carried = local && (local.collectors?.length || local.collectedBy)
        ? { service_metadata: { ...meta, collectors: local.collectors, collected_by: local.collectedBy } }
        : {};
      return {
        ...order,
        ...carried,
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

/*
 * Sending bundles to the cloud, without hammering it.
 *
 * On 23 September 2026 one laptop sent the cloud 184,000 requests in 35
 * minutes - about a hundred a second, every one refused. A failed send was
 * written onto the bundle through the same path as a real edit, which
 * announced "a bundle changed", and LaundrySyncAgent sends on every change. A
 * single waiting bundle was caught by the in-flight guard; two or more set
 * each other off forever, with nothing in between to slow them down. It had
 * been that way since August, whenever the cloud said no.
 *
 * So now:
 *  - how a send went is written down without announcing it. Only a real edit -
 *    a new bundle, a stage moved - wakes the sync.
 *  - a run stops at the first failure that is about the shop or the line,
 *    because every other bundle would get the same answer.
 *  - after one, the background waits 30 seconds, then 1, 2, 5 and at most 10
 *    minutes. A send that works, or the phone coming back online, clears it.
 *  - one run per shop at a time. Edits made during it fold into one more run.
 *  - a shop the cloud has never heard of - most laundries run on the phone
 *    alone - is asked again in an hour, or when the app is next opened, rather
 *    than every half minute for as long as the app is open.
 *  - a bundle the cloud refuses on its own account (a tag another phone has
 *    already used, say) is set aside, so it neither stops the bundles behind it nor
 *    gets sent again until somebody changes it or the app is next opened.
 *
 * All of this lives in memory on purpose: opening the app again is always one
 * fresh try, never a lockout that outlives the problem.
 */

/** Answers about the shop, not the bundle. Every other bundle would get the same one. */
const SHOP_REFUSALS = /^(store not found|this store is not a laundry business|store is not active|store access code is required)$/i;
const RETRY_WAITS_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
const UNKNOWN_SHOP_WAIT_MS = 60 * 60_000;

interface SyncWait { until: number; failures: number; unknownShop: boolean }
/** Per shop: how long the background leaves the cloud alone. */
const waits = new Map<string, SyncWait>();
/** Per bundle: the version of it the cloud refused. */
const setAside = new Map<string, string>();
/** Per shop: the run in progress, and whether an edit arrived during it. */
const runs = new Map<string, Promise<void>>();
const runAgain = new Set<string>();

type SendOutcome = 'sent' | 'nothing-to-send' | 'busy' | 'offline' | 'set-aside' | 'failed';

function isWaiting(code: string): boolean {
  return (waits.get(code)?.until || 0) > Date.now();
}

/** The bundle as the counter last left it: everything except how its sends went. */
function bundleVersion(record: LocalLaundryRecord): string {
  const { syncStatus: _status, syncedAt: _at, cloudOrderId: _cloud, lastSyncError: _error, ...content } = record;
  return JSON.stringify(content);
}

/** Writes down how a send went, without waking the sync - and without writing at all when nothing changed. */
function noteSend(code: string, clientRef: string, updates: Partial<LocalLaundryRecord>): LocalLaundryRecord | null {
  const current = getLocalLaundryRecord(code, clientRef);
  if (!current) return null;
  if (Object.entries(updates).every(([field, value]) => (current as any)[field] === value)) return current;
  return updateLocalRecord(code, clientRef, updates, false);
}

function noteFailure(code: string, clientRef: string, sent: LocalLaundryRecord, error: any): SendOutcome {
  const message = String(error?.message || '').trim() || 'Sync failed';
  const answeredByCloud = error?.code === 'P0001';
  if (answeredByCloud && !SHOP_REFUSALS.test(message)) {
    setAside.set(`${code}:${clientRef}`, bundleVersion(sent));
    noteSend(code, clientRef, { lastSyncError: message });
    return 'set-aside';
  }
  const failures = (waits.get(code)?.failures || 0) + 1;
  waits.set(code, {
    failures,
    unknownShop: answeredByCloud,
    until: Date.now() + (answeredByCloud ? UNKNOWN_SHOP_WAIT_MS : RETRY_WAITS_MS[Math.min(failures, RETRY_WAITS_MS.length) - 1]),
  });
  noteSend(code, clientRef, { lastSyncError: message });
  return 'failed';
}

/**
 * Back online: whatever stood between the phone and the cloud may be gone. What
 * the cloud itself answered about the shop has not changed, so that wait stays.
 */
export function clearLaundrySyncWait(accessCode: string): void {
  const code = normalizeAccessCode(accessCode);
  if (!waits.get(code)?.unknownShop) waits.delete(code);
}

/**
 * One bundle, because somebody just did something to it at the counter.
 *
 * It gets its own try even while the background is waiting out a failure -
 * the cloud may be back, and it costs one request per thing a person did. Not
 * for a shop the cloud has said it does not know: recording a bundle does not
 * change that.
 */
export async function syncLaundryRecord(accessCode: string, clientRef: string): Promise<boolean> {
  const code = normalizeAccessCode(accessCode);
  const wait = waits.get(code);
  if (wait?.unknownShop && wait.until > Date.now()) return false;
  const outcome = await sendLaundryRecord(code, clientRef);
  // It works again, so what was waiting behind the failure can go too.
  if (outcome === 'sent' && wait) void syncPendingLaundryRecords(code).catch(() => {});
  return outcome === 'sent' || outcome === 'nothing-to-send';
}

async function sendLaundryRecord(normalized: string, clientRef: string): Promise<SendOutcome> {
  const key = `${normalized}:${clientRef}`;
  if (inflight.has(key)) return 'busy';

  const record = getLocalLaundryRecord(normalized, clientRef);
  if (!record || record.syncStatus === 'synced') return 'nothing-to-send';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';

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

    if (error) return noteFailure(normalized, clientRef, record, error);

    const stageData = await syncLaundryStage(normalized, record);
    const cloudOrderId = String(stageData?.order_id || data?.order_id || '');
    const updated = noteSend(normalized, clientRef, {
      syncStatus: 'synced',
      syncedAt: new Date().toISOString(),
      cloudOrderId,
      lastSyncError: undefined,
    });
    waits.delete(normalized);
    setAside.delete(key);

    if (typeof window !== 'undefined' && cloudOrderId) {
      window.dispatchEvent(new CustomEvent('storeflow:order-created', { detail: { orderId: cloudOrderId } }));
    }
    emit(LAUNDRY_SYNC_CHANGED_EVENT, updated || record);
    return 'sent';
  } catch (error: any) {
    return noteFailure(normalized, clientRef, record, error);
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

/**
 * Everything waiting to go, in the background. One run per shop at a time: a
 * call made while one is going joins it, and asks for one more pass once it
 * ends, so an edit made mid-run is not missed.
 */
export function syncPendingLaundryRecords(accessCode: string): Promise<void> {
  const code = normalizeAccessCode(accessCode);
  const running = runs.get(code);
  if (running) {
    runAgain.add(code);
    return running;
  }
  const run = (async () => {
    try {
      do {
        runAgain.delete(code);
        await sendWaitingBundles(code);
      } while (runAgain.has(code));
    } finally {
      runs.delete(code);
    }
  })();
  runs.set(code, run);
  return run;
}

async function sendWaitingBundles(code: string): Promise<void> {
  if (isWaiting(code)) return;
  for (const record of getLocalLaundryRecords(code)) {
    if (record.syncStatus === 'synced') continue;
    if (setAside.get(`${code}:${record.clientRef}`) === bundleVersion(record)) continue;
    const outcome = await sendLaundryRecord(code, record.clientRef);
    // Stop at the first answer about the shop or the line: the rest would get it too.
    if (outcome === 'failed' || outcome === 'offline' || isWaiting(code)) return;
  }
}
