import type { Customer, Sale, StoreData } from '@/types/store';
import {
  getLocalLaundryRecords,
  LAUNDRY_WORKFLOW_STAGES,
  mergeLaundryRecords,
  type LocalLaundryRecord,
} from '@/lib/laundry-offline';
import { decorateRecord, type DecoratedRecord } from '@/lib/laundry-records';
import { owedByCustomer } from '@/lib/flow-service-brain';
import { explainStanding } from '@/lib/customer-rhythm';
import { receivedBetween } from '@/lib/money-figures';

/**
 * One customer's history with the shop, and what they mean to it.
 *
 * Tapping a customer showed a short summary - what they had spent, what they
 * owed - and nothing of the bundles behind those numbers. Asked for from the
 * shop: tap a customer and see their records, and how they affect the shop.
 *
 * Which bundles are theirs is decided the way debts already are, so the two can
 * never disagree about who somebody is: the customer id the bundle was saved
 * with first, then the phone number, then the name - and a name only when
 * nobody else in the book has it, because two Musa Bellos without a number
 * are two people, and showing one of them the other's clothes is worse than
 * showing nothing.
 */

const DAY = 86400000;

/** The window "what they mean to the shop" is measured over. */
export const IMPACT_WINDOW_DAYS = 90;

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const norm = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** A number written +234 or 0, compared as the same number. */
function localNumber(value: unknown): string {
  const raw = digits(value);
  return raw.startsWith('234') && raw.length >= 12 ? `0${raw.slice(3)}` : raw;
}

function time(value: unknown): number {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
}

export interface CustomerBundle {
  clientRef: string;
  tagCode: string;
  createdAt: number;
  garmentSummary: string;
  pieceCount: number;
  stage: string;
  stageLabel: string;
  /** What the bundle is priced at. */
  total: number;
  /** Still owed on it. */
  balance: number;
  /** Money actually received for it. */
  paid: number;
  collected: boolean;
}

export interface CustomerHistory {
  /** Newest first. */
  bundles: CustomerBundle[];
  /** Money actually received from them, ever. */
  broughtIn: number;
  /** Everything they owe right now. */
  owes: number;
  dropOffs: number;
  pieces: number;
  /** Their bundles still in the shop. */
  waitingCount: number;
  /** What is not paid yet on those. */
  waitingUnpaid: number;
  lastVisit: number | null;
  /** Their share of all money received in the window, 0 to 1; null when either is nothing. */
  share: number | null;
  /** Their place among customers by money brought in over the window; null when they brought in nothing. */
  rank: number | null;
  standing: string;
}

/** Every bundle the phone knows about - its own and the cloud's - with the customer id each was saved with. */
function shopBundles(store: StoreData, orders: any[]): { records: DecoratedRecord[]; savedIds: Map<string, string> } {
  const accessCode = String(store.accessCode || '');
  let local: LocalLaundryRecord[] = [];
  try {
    local = accessCode ? getLocalLaundryRecords(accessCode) : [];
  } catch {
    local = [];
  }
  // Only a bundle taken in on this phone knows its customer id; the cloud copy
  // is not given one.
  const savedIds = new Map(local.filter(record => record.customerId).map(record => [record.clientRef, String(record.customerId)]));
  const records = mergeLaundryRecords(orders || [], local).map(order => decorateRecord(order, store));
  return { records, savedIds };
}

/** Money received for each bundle, by the bundle's reference. */
function salesByBundle(store: Pick<StoreData, 'sales'>): Map<string, Sale[]> {
  const found = new Map<string, Sale[]>();
  for (const sale of store.sales || []) {
    const id = String(sale?.pendingPaymentId || '');
    if (!id.startsWith('laundry-')) continue;
    const ref = id.slice('laundry-'.length);
    found.set(ref, [...(found.get(ref) || []), sale]);
  }
  return found;
}

/**
 * Whose each bundle is, among the customers in the book.
 *
 * A bundle nobody can be sure of belongs to nobody here. It still counts for
 * the shop; it just is not put on a customer's page.
 */
export function bundleOwners(
  customers: Customer[],
  records: Pick<DecoratedRecord, 'clientRef' | 'customerName' | 'customerPhone'>[],
  savedIds: Map<string, string> = new Map(),
): Map<string, string> {
  const byId = new Map(customers.map(customer => [customer.id, customer]));
  const byPhone = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const customer of customers) {
    const phone = localNumber(customer.phone);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) || []), customer.id]);
    const name = norm(customer.name);
    if (name) byName.set(name, [...(byName.get(name) || []), customer.id]);
  }

  const owners = new Map<string, string>();
  for (const record of records) {
    const ref = record.clientRef;
    if (!ref) continue;

    // Saved with an id: that customer, or nobody in this book.
    const saved = savedIds.get(ref);
    if (saved) {
      if (byId.has(saved)) owners.set(ref, saved);
      continue;
    }

    const phone = localNumber(record.customerPhone);
    const name = norm(record.customerName);
    let candidates = phone ? byPhone.get(phone) || [] : [];

    if (candidates.length === 0 && name) {
      // A different number on both sides is a different person, whatever
      // the name says.
      candidates = (byName.get(name) || []).filter(id => {
        const theirs = localNumber(byId.get(id)?.phone);
        return !(phone && theirs && theirs !== phone);
      });
    }

    // One number shared in the book: the name decides, if it can.
    if (candidates.length > 1 && name) {
      candidates = candidates.filter(id => norm(byId.get(id)?.name) === name);
    }

    if (candidates.length === 1) owners.set(ref, candidates[0]);
  }
  return owners;
}

export function customerHistory(
  store: StoreData,
  customer: Customer,
  orders: any[] = [],
  now: number = Date.now(),
): CustomerHistory {
  const book = Array.isArray(store.customers) ? store.customers : [];
  const customers = book.some(entry => entry.id === customer.id) ? book : [...book, customer];
  const { records, savedIds } = shopBundles(store, orders);
  const owners = bundleOwners(customers, records, savedIds);
  const sales = salesByBundle(store);
  const from = now - IMPACT_WINDOW_DAYS * DAY;

  const moneyIn = (ref: string, since = Number.NEGATIVE_INFINITY) =>
    (sales.get(ref) || []).reduce((sum, sale) => {
      const at = time(sale.date);
      return at >= since && at <= now ? sum + (Number(sale.total) || 0) : sum;
    }, 0);

  const mine = records
    .filter(record => owners.get(record.clientRef) === customer.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  const bundles: CustomerBundle[] = mine.map(record => ({
    clientRef: record.clientRef,
    tagCode: record.tagCode,
    createdAt: record.createdAt,
    garmentSummary: record.garmentSummary,
    pieceCount: record.pieceCount,
    stage: record.stage,
    stageLabel: LAUNDRY_WORKFLOW_STAGES.find(stage => stage.id === record.stage)?.label || record.stage,
    total: record.total,
    balance: record.balance,
    paid: moneyIn(record.clientRef),
    collected: record.stage === 'collected',
  }));

  // A laundry's money is its bundles. Anywhere else the book's own running
  // total is the record of what somebody spent, and nothing else counts it.
  const isLaundry = norm(store.storeType || (store as any).businessType) === 'laundry';
  const broughtIn = bundles.reduce((sum, bundle) => sum + bundle.paid, 0)
    + (isLaundry ? 0 : Number(customer.totalPurchases) || 0);

  // Every customer's money over the window, for their share and their place.
  const byCustomer = new Map<string, number>();
  for (const record of records) {
    const owner = owners.get(record.clientRef);
    if (!owner) continue;
    const amount = moneyIn(record.clientRef, from);
    if (amount > 0) byCustomer.set(owner, (byCustomer.get(owner) || 0) + amount);
  }
  if (!isLaundry) {
    for (const entry of customers) {
      const amount = (entry.purchaseHistory || []).reduce((sum, purchase) => {
        const at = time(purchase.date);
        return at >= from && at <= now ? sum + (Number(purchase.amount) || 0) : sum;
      }, 0);
      if (amount > 0) byCustomer.set(entry.id, (byCustomer.get(entry.id) || 0) + amount);
    }
  }

  const theirs = byCustomer.get(customer.id) || 0;
  const shopReceived = receivedBetween(store, from, now + 1);
  const waiting = mine.filter(record => record.stage !== 'collected');
  const visits = [...bundles.map(bundle => bundle.createdAt), time(customer.lastPurchaseDate)].filter(at => at > 0);

  return {
    bundles,
    broughtIn,
    owes: owedByCustomer(store, customer),
    dropOffs: bundles.length,
    pieces: bundles.reduce((sum, bundle) => sum + (Number(bundle.pieceCount) || 0), 0),
    waitingCount: waiting.length,
    waitingUnpaid: waiting.reduce((sum, record) => sum + Math.max(0, Number(record.balance) || 0), 0),
    lastVisit: visits.length ? Math.max(...visits) : null,
    share: shopReceived > 0 && theirs > 0 ? Math.min(1, theirs / shopReceived) : null,
    rank: theirs > 0 ? 1 + [...byCustomer.values()].filter(amount => amount > theirs).length : null,
    standing: explainStanding(customer),
  };
}

/** What a customer means to the shop, in a line, or null when there is nothing to say yet. */
export function impactLine(history: Pick<CustomerHistory, 'share' | 'rank'>): string | null {
  const parts: string[] = [];
  if (history.share !== null) {
    const percent = history.share * 100;
    parts.push(`${percent < 1 ? 'Under 1%' : `${Math.round(percent)}%`} of what you received in the last ${IMPACT_WINDOW_DAYS} days`);
  }
  if (history.rank !== null && history.rank <= 10) {
    parts.push(history.rank === 1 ? 'your top customer' : `your number ${history.rank} customer`);
  }
  return parts.length ? parts.join(' · ') : null;
}
