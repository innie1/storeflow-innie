export * from './flow-order-draft-core';

import type { StoreData } from '@/types/store';
import type { CreatedFlowOrder } from '@/lib/flow-message-orders';
import { resolveBusinessType } from '@/lib/business-runtime';
import {
  createLocalLaundryRecord,
  localLaundryRecordToOrder,
  syncLaundryRecord,
} from '@/lib/laundry-offline';
import {
  createFlowConversationOrder as createCloudFlowConversationOrder,
  nextFlowDraftQuestion,
  type FlowConversationOrderDraft,
} from './flow-order-draft-core';

/**
 * Laundry is local-first everywhere else in StoreFlow, so Flow must not require
 * a Supabase store UUID before it can take a bundle at the counter. Save the
 * order into the same local laundry book as the normal intake, then let the
 * existing background sync push it to the cloud when that is available.
 *
 * Non-laundry businesses keep the existing cloud order path unchanged.
 */
export async function createFlowConversationOrder(
  store: StoreData,
  draft: FlowConversationOrderDraft,
): Promise<CreatedFlowOrder & { flow_details?: any }> {
  if (resolveBusinessType(store) !== 'laundry') {
    return createCloudFlowConversationOrder(store, draft);
  }

  const missing = nextFlowDraftQuestion(draft);
  if (missing) throw new Error(missing);

  const accessCode = String(store.accessCode || '').trim();
  if (!accessCode) throw new Error('Store access code is missing.');

  const serviceIds = [...new Set(draft.items.map(item => String(item.productId || '')).filter(Boolean))];
  if (serviceIds.length !== 1) {
    throw new Error('Use one laundry service per order, then create a second order for a different service.');
  }

  const service = draft.items[0]?.product;
  if (!service?.isService) throw new Error('Choose a laundry service before creating the order.');

  const garments = draft.items
    .map(item => ({
      garmentType: String(item.metadata?.garment_type || '').trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
      unitPrice: Math.max(0, Number(item.unitPrice) || 0),
      subtotal: Math.max(0, Number(item.subtotal) || 0),
    }))
    .filter(item => item.garmentType && item.quantity > 0);

  if (!garments.length) throw new Error('Record at least one clothing item.');

  const requestedTime = String(draft.fulfillment.requestedTime || '').trim();
  const record = createLocalLaundryRecord({
    accessCode,
    customerId: draft.customerId,
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
    customerAddress: draft.fulfillment.address || draft.customerAddress,
    // In Flow, "pickup" means the customer will pick up from the shop. The
    // laundry local model calls a shop collection run "pickup", so only an
    // actual delivery maps to a run here; everything else is a walk-in order.
    fulfillment: draft.fulfillment.mode === 'delivery' ? 'delivery' : 'walk_in',
    runAddress: draft.fulfillment.mode === 'delivery' ? draft.fulfillment.address : undefined,
    serviceId: String(service.id),
    serviceName: service.name,
    pricing: String((service as any).servicePricing || 'per_piece'),
    billingQuantity: garments.reduce((sum, item) => sum + item.quantity, 0),
    total: draft.total,
    notes: requestedTime ? `Requested time: ${requestedTime}` : '',
    garments,
    recordedByName: 'Flow',
    recordedByRole: 'Assistant',
  });

  // Never make the counter wait for cloud setup. The local record is already
  // safely saved; sync is best-effort and can retry through the normal queue.
  void syncLaundryRecord(record.accessCode, record.clientRef).catch(() => {});

  const order = localLaundryRecordToOrder(record) as CreatedFlowOrder;
  return {
    ...order,
    flow_details: {
      source: 'flow_message',
      flow_draft_id: draft.draftId,
      flow_revision: draft.revision,
      local_first: true,
      sync_status: record.syncStatus,
    },
  };
}
