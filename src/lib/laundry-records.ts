/**
 * One laundry bundle, read the same way everywhere.
 *
 * This lived inside LaundryWorkspace, which meant the workspace was the only
 * screen that knew what "late" or "ready" or "still owed" meant. Anything else
 * wanting those counts - the home screen, most obviously - would have had to
 * work them out again, and two answers to one question is how a shop stops
 * trusting the number.
 *
 * Nothing here is new. It is the workspace's own logic, moved to where more
 * than one screen can reach it.
 */

import type { StoreData } from '@/types/store';
import { getLaundryRecordSearchText, parseLaundryRecordMetadata } from '@/lib/laundry-workspace';
import { describeDue, type DueLabel } from '@/lib/laundry-due';
import { laundryBalance, laundryTenderSummary } from '@/lib/laundry-money';
import { LAUNDRY_SETTLED_STAGES, LAUNDRY_WORKFLOW_STAGES, type LaundryWorkflowStage } from '@/lib/laundry-offline';
import { buildLaundryWhatsAppPayload } from '@/lib/laundry-whatsapp';
import type { LaundryFulfillment, LaundryRunStatus } from '@/lib/laundry-runs';
import { bundleModifiers } from '@/lib/laundry-modifiers';
import { getPromisedTime } from '@/lib/business-insights';

export interface DecoratedRecord {
  order: any;
  key: string;
  tagCode: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  garmentSummary: string;
  pieceCount: number;
  stage: LaundryWorkflowStage;
  statusLabel: string;
  due: DueLabel | null;
  /** Still owed on this bundle, 0 when settled. */
  balance: number;
  clientRef: string;
  /** Free-text shelf or rack, as the attendant wrote it at drop-off. */
  shelfLocation?: string;
  recordedByName?: string;
  recordedByRole?: string;
  /** Walk-in, collected from the customer, or delivered back. */
  fulfillment?: LaundryFulfillment;
  /** The journey, which is not the wash stage. */
  runStatus?: LaundryRunStatus;
  /** Every instruction in the bundle, said once. */
  modifiers: string[];
  synced: boolean;
  whatsapp: ReturnType<typeof buildLaundryWhatsAppPayload>;
  total: number;
  createdAt: number;
  promisedAt: number | null;
  overdue: boolean;
  address: string;
  washMethod: string;
  dryMethod: string;
  searchText: string;
}

export function decorateRecord(order: any, store: StoreData): DecoratedRecord {
  const meta = parseLaundryRecordMetadata(order);
  const items = order.order_items || [];
  const garments = items.filter((item: any) => !item?.metadata?.charge_line);
  const stageRaw = String(order.workflow_stage || 'received').toLowerCase() as LaundryWorkflowStage;
  const clientRef = String(order._localClientRef || order.client_ref || order?.service_metadata?.client_ref || '');
  const stage = LAUNDRY_WORKFLOW_STAGES.some(item => item.id === stageRaw) ? stageRaw : 'received';
  const promisedValue = getPromisedTime(order);
  const promisedDate = promisedValue ? new Date(promisedValue) : null;
  const promisedAt = promisedDate && Number.isFinite(promisedDate.getTime()) ? promisedDate.getTime() : null;
  const createdDate = order.created_at ? new Date(order.created_at) : null;
  const baseServiceName = meta.service_name || items.find((item: any) => item?.metadata?.charge_line)?.item_name || 'Laundry service';
  const tender = laundryTenderSummary(store, clientRef || String(meta.tag_code || meta.receipt_number || order.order_number || ''));
  const serviceName = tender?.change
    ? `${baseServiceName} · Gave ₦${tender.tendered.toLocaleString()} · Change ₦${tender.change.toLocaleString()}`
    : baseServiceName;

  return {
    order,
    key: String(order._localClientRef || order.client_ref || order.id || ''),
    tagCode: String(meta.tag_code || meta.receipt_number || order.order_number || '—').toUpperCase(),
    customerName: order.customer_name || 'Walk-in Customer',
    shelfLocation: meta.shelf_location || undefined,
    fulfillment: meta.fulfillment || undefined,
    runStatus: meta.run_status || undefined,
    modifiers: bundleModifiers(garments.map((item: any) => item?.metadata || {})),
    recordedByName: meta.recorded_by_name || undefined,
    recordedByRole: meta.recorded_by_role || undefined,
    customerPhone: order.customer_phone || '',
    serviceName,
    garmentSummary: meta.garment_summary
      || garments.map((item: any) => `${Number(item.quantity || 0)} ${item.item_name || 'item'}`).join(', '),
    pieceCount: Number(meta.garment_count || 0)
      || garments.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
    stage,
    statusLabel: String(order.workflow_stage || order.status || 'Received').replace(/_/g, ' '),
    synced: order._laundrySyncStatus === 'synced',
    whatsapp: buildLaundryWhatsAppPayload(store, order),
    total: Number(order.total || 0),
    createdAt: createdDate && Number.isFinite(createdDate.getTime()) ? createdDate.getTime() : 0,
    promisedAt,
    overdue: promisedAt !== null && promisedAt < Date.now() && !LAUNDRY_SETTLED_STAGES.includes(stage),
    clientRef,
    balance: laundryBalance(store, clientRef),
    due: LAUNDRY_SETTLED_STAGES.includes(stage)
      ? describeDue(promisedAt, promisedAt !== null ? Math.min(Date.now(), promisedAt) : Date.now())
      : describeDue(promisedAt),
    address: meta.customer_address || '',
    washMethod: meta.wash_method_name || '',
    dryMethod: meta.dry_method_name || '',
    searchText: getLaundryRecordSearchText(order),
  };
}
