import {
  getLocalLaundryRecords,
  isWalkInLaundryOrder,
  LAUNDRY_WORKFLOW_STAGES,
  type LaundryStageStep,
  type LaundryWorkflowStage,
  type LocalLaundryRecord,
} from '@/lib/laundry-offline';

/**
 * Every laundry bundle the shop has, not just the ones taken in on this phone.
 *
 * About twenty screens - the month ring and report, forecasts, Flow's advice,
 * piece work, pricing advice, customer history, day records - counted bundles
 * from this phone's own list. A bundle taken in on a worker's phone, on a
 * second counter phone, or before this phone was set up exists only in the
 * cloud, so all of those quietly left it out: the shop's history looked as
 * old as the phone it was read on.
 *
 * The cloud copy is the shop's record. Index hands over the bundles it already
 * holds (the saved copy of the shop's orders, kept up to date), and this list
 * is those plus anything on this phone the cloud has not got yet. Where both
 * have a bundle, this phone's copy is used while it has changes still to send,
 * and otherwise whichever has the later stage.
 */

export const SHOP_LAUNDRY_CHANGED_EVENT = 'storeflow:shop-laundry-changed';

const cloudByShop = new Map<string, LocalLaundryRecord[]>();
const key = (accessCode: string) => String(accessCode || '').trim().toUpperCase();

const STAGES = new Set(LAUNDRY_WORKFLOW_STAGES.map(stage => stage.id));

function meta(order: any): Record<string, any> {
  if (order?.service_metadata && typeof order.service_metadata === 'object') return order.service_metadata;
  try { return JSON.parse(order?.notes || '{}') || {}; } catch { return {}; }
}

/** A cloud bundle in the shape this phone's own bundles have. */
export function orderToLaundryRecord(order: any, accessCode: string): LocalLaundryRecord {
  const m = meta(order);
  const items: any[] = Array.isArray(order?.order_items) ? order.order_items : [];
  const garmentLines = items.filter(item => !item?.metadata?.charge_line);
  const garments = garmentLines.map(item => ({
    garmentType: String(item.item_name || 'Item'),
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.price) || 0,
    subtotal: Number(item.subtotal ?? (Number(item.price) || 0) * (Number(item.quantity) || 0)),
  }));
  const stage = String(order?.workflow_stage || m.workflow_stage || 'received').toLowerCase();
  return {
    clientRef: String(order?.client_ref || m.client_ref || order?.id || ''),
    accessCode,
    tagCode: String(order?.order_number || m.tag_code || m.receipt_number || '').toUpperCase(),
    customerId: m.customer_id || undefined,
    customerName: order?.customer_name || 'Walk-in Customer',
    customerPhone: order?.customer_phone || '',
    customerAddress: order?.customer_address || m.customer_address || undefined,
    shelfLocation: m.shelf_location || undefined,
    fulfillment: m.fulfillment || undefined,
    runStatus: m.run_status || undefined,
    deliveryFee: Number(m.delivery_fee) || undefined,
    promisedFor: m.promised_for || undefined,
    washMethodName: m.wash_method_name || undefined,
    dryMethodName: m.dry_method_name || undefined,
    serviceId: String(m.service_id || ''),
    serviceName: String(m.service_name || 'Laundry service'),
    pricing: String(m.pricing || 'per_piece'),
    billingQuantity: Number(m.billing_quantity) || 1,
    total: Number(order?.total) || 0,
    notes: String(m.instructions || ''),
    garments: garments as LocalLaundryRecord['garments'],
    pieceCount: Number(m.garment_count) || garments.reduce((sum, item) => sum + item.quantity, 0),
    garmentSummary: String(m.garment_summary || garments.map(item => `${item.quantity} ${item.garmentType}`).join(', ')),
    createdAt: String(order?.created_at || new Date(0).toISOString()),
    workflowStage: (STAGES.has(stage as LaundryWorkflowStage) ? stage : 'received') as LaundryWorkflowStage,
    stageUpdatedAt: m.stage_updated_at || order?.updated_at || undefined,
    stageHistory: Array.isArray(m.stage_history) ? (m.stage_history as LaundryStageStep[]) : undefined,
    recordedByName: m.recorded_by_name || undefined,
    recordedByRole: m.recorded_by_role || undefined,
    syncStatus: 'synced',
    cloudOrderId: order?.id ? String(order.id) : undefined,
  } as LocalLaundryRecord;
}

/** Index keeps this up to date with the bundles it holds for the open shop. */
export function setShopCloudOrders(accessCode: string, orders: any[]): void {
  const records = (orders || [])
    .filter(order => order && !String(order.id || '').startsWith('local:') && isWalkInLaundryOrder(order))
    .map(order => orderToLaundryRecord(order, accessCode));
  cloudByShop.set(key(accessCode), records);
  // After the render that handed them over, so no screen is updated mid-render.
  queueMicrotask(() => {
    try { window.dispatchEvent(new CustomEvent(SHOP_LAUNDRY_CHANGED_EVENT, { detail: key(accessCode) })); } catch { /* no window */ }
  });
}

const later = (a?: string, b?: string) => (Date.parse(String(a || '')) || 0) > (Date.parse(String(b || '')) || 0);

/** Every bundle the shop has: the cloud's, plus this phone's not yet sent. */
export function shopLaundryRecords(accessCode: string): LocalLaundryRecord[] {
  const local = getLocalLaundryRecords(accessCode);
  const cloud = cloudByShop.get(key(accessCode)) || [];
  if (!cloud.length) return local;

  const byRef = new Map<string, LocalLaundryRecord>();
  const byTag = new Map<string, string>();
  for (const record of cloud) {
    if (!record.clientRef) continue;
    byRef.set(record.clientRef, record);
    if (record.tagCode) byTag.set(record.tagCode, record.clientRef);
  }
  for (const mine of local) {
    const ref = byRef.has(mine.clientRef) ? mine.clientRef : byTag.get(String(mine.tagCode || '').toUpperCase());
    const theirs = ref ? byRef.get(ref) : undefined;
    if (!theirs) { byRef.set(mine.clientRef, mine); continue; }
    // This phone's copy carries what only it knows (who may collect, who did).
    // The stage is whichever moved last, unless this phone has a move to send.
    const useMine = mine.syncStatus !== 'synced' || !later(theirs.stageUpdatedAt, mine.stageUpdatedAt);
    byRef.delete(ref!);
    byRef.set(mine.clientRef, useMine ? mine : {
      ...mine,
      workflowStage: theirs.workflowStage,
      stageUpdatedAt: theirs.stageUpdatedAt,
      stageHistory: (theirs.stageHistory?.length || 0) >= (mine.stageHistory?.length || 0) ? theirs.stageHistory : mine.stageHistory,
    });
  }
  return [...byRef.values()].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}
