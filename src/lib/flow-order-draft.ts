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
  mergeFlowConversationOrderDraft as mergeCoreFlowConversationOrderDraft,
  nextFlowDraftQuestion as nextCoreFlowDraftQuestion,
  type FlowConversationOrderDraft,
  type FlowDraftMergeResult,
} from './flow-order-draft-core';

interface LaundryClarification {
  family: string;
  candidates: string[];
}

const PENDING_LAUNDRY_KEY = '__flowPendingLaundryClarifications';

function normalizePhrase(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pendingLaundryClarifications(draft: FlowConversationOrderDraft): LaundryClarification[] {
  const value = (draft as any)[PENDING_LAUNDRY_KEY];
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      family: String(row?.family || '').trim(),
      candidates: Array.isArray(row?.candidates) ? row.candidates.map((candidate: unknown) => String(candidate || '').trim()).filter(Boolean) : [],
    }))
    .filter((row: LaundryClarification) => row.family && row.candidates.length > 1);
}

function setPendingLaundryClarifications(draft: FlowConversationOrderDraft, pending: LaundryClarification[]): void {
  if (pending.length) (draft as any)[PENDING_LAUNDRY_KEY] = pending;
  else delete (draft as any)[PENDING_LAUNDRY_KEY];
}

function clarificationsFromNote(note?: string): LaundryClarification[] {
  if (!note) return [];
  const found: LaundryClarification[] = [];
  const pattern = /Which \*\*([^*]+)\*\* do you mean:\s*((?:\*\*[^*]+\*\*(?:,\s*)?)+)\?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(note))) {
    const candidates = [...match[2].matchAll(/\*\*([^*]+)\*\*/g)].map(row => row[1].trim()).filter(Boolean);
    if (candidates.length > 1) found.push({ family: match[1].trim(), candidates });
  }
  return found;
}

function clarificationPrompt(pending: LaundryClarification[]): string {
  const questions = pending.map(row => `Which ${row.family} do you mean: ${row.candidates.join(', ')}?`);
  const removable = pending.map(row => `remove ${row.family}`).join(' or ');
  return `Before I create this order, I still need to resolve the clothing: ${questions.join(' ')} Choose the exact one${pending.length > 1 ? 's' : ''}, or say ${removable} if it is not part of the order.`;
}

function explicitRemoval(text: string, family: string): boolean {
  const q = normalizePhrase(text);
  const target = normalizePhrase(family);
  if (!q || !target) return false;
  return new RegExp(`\\b(?:remove|delete|drop|skip|ignore|no)\\s+(?:the\\s+)?${target.replace(/\s+/g, '\\s+')}\\b`, 'i').test(q);
}

function garmentExists(draft: FlowConversationOrderDraft, garment: string): boolean {
  const target = normalizePhrase(garment);
  return draft.items.some(item => normalizePhrase(item.metadata?.garment_type || '') === target && Number(item.quantity || 0) > 0);
}

/**
 * A merchant will naturally answer "small" after Flow asks "Small Duvet or
 * Large Duvet?". Expand a unique short answer back to the exact priced garment
 * before handing it to the existing parser.
 */
function expandClarificationAnswer(pending: LaundryClarification[], text: string): string {
  if (!pending.length) return text;
  const q = normalizePhrase(text);
  if (!q) return text;

  const choices = pending.flatMap(row => row.candidates.map(candidate => ({ row, candidate })));
  for (const { candidate } of choices) {
    const full = normalizePhrase(candidate);
    if (` ${q} `.includes(` ${full} `)) return text;
  }

  const shortMatches = choices.filter(({ row, candidate }) => {
    const family = normalizePhrase(row.family);
    const full = normalizePhrase(candidate);
    const qualifier = full
      .split(' ')
      .filter(word => !family.split(' ').includes(word))
      .join(' ')
      .trim();
    return qualifier && q === qualifier;
  });

  return shortMatches.length === 1 ? `add ${shortMatches[0].candidate}` : text;
}

/**
 * Add safety around the core draft parser: ambiguous priced garment families
 * remain part of the draft state until the merchant resolves or removes them.
 * This prevents Flow from quietly creating a Jeans-only order after hearing
 * "jean duvet bedsheet" and asking which duvet/bedsheet was meant.
 */
export function mergeFlowConversationOrderDraft(
  store: StoreData,
  current: FlowConversationOrderDraft,
  text: string,
): FlowDraftMergeResult {
  if (resolveBusinessType(store) !== 'laundry') {
    return mergeCoreFlowConversationOrderDraft(store, current, text);
  }

  const before = pendingLaundryClarifications(current);
  const interpreted = expandClarificationAnswer(before, text);
  const result = mergeCoreFlowConversationOrderDraft(store, current, interpreted);
  if (result.cancelled) return result;

  let pending = before.filter(row => {
    if (explicitRemoval(text, row.family)) return false;
    const selected = row.candidates.some(candidate => {
      const candidateText = normalizePhrase(candidate);
      const inputText = normalizePhrase(interpreted);
      return garmentExists(result.draft, candidate)
        && (` ${inputText} `.includes(` ${candidateText} `) || normalizePhrase(interpreted) === normalizePhrase(`add ${candidate}`));
    });
    return !selected;
  });

  for (const clarification of clarificationsFromNote(result.note)) {
    if (explicitRemoval(text, clarification.family)) continue;
    const key = normalizePhrase(clarification.family);
    const existing = pending.findIndex(row => normalizePhrase(row.family) === key);
    if (existing >= 0) pending[existing] = clarification;
    else pending.push(clarification);
  }

  const removed = before.filter(row => !pending.some(next => normalizePhrase(next.family) === normalizePhrase(row.family)) && explicitRemoval(text, row.family));
  setPendingLaundryClarifications(result.draft, pending);

  if (removed.length && !result.changed) {
    result.changed = true;
    result.draft.revision = current.revision + 1;
    result.note = `Removed unresolved ${removed.map(row => row.family).join(' and ')} from this order.`;
  } else if (removed.length) {
    const removalNote = `Removed unresolved ${removed.map(row => row.family).join(' and ')} from this order.`;
    result.note = result.note ? `${result.note} ${removalNote}` : removalNote;
  }

  return result;
}

export function nextFlowDraftQuestion(draft: FlowConversationOrderDraft): string | null {
  const coreQuestion = nextCoreFlowDraftQuestion(draft);
  if (coreQuestion) return coreQuestion;
  const pending = pendingLaundryClarifications(draft);
  return pending.length ? clarificationPrompt(pending) : null;
}

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
  const missing = nextFlowDraftQuestion(draft);
  if (missing) throw new Error(missing);

  if (resolveBusinessType(store) !== 'laundry') {
    return createCloudFlowConversationOrder(store, draft);
  }

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
