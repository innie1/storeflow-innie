import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import {
  ASK_EVERY_DAYS,
  MIN_DAYS_TRADING,
  markAsked,
  recordSoapAnswer,
  shouldAskAboutSoap,
  soapHistorySentence,
  soapLog,
} from '@/lib/soap-log';
import { estimateUnitCost } from '@/lib/cost-estimator';

const CODE = 'SOAP01';
const DAY = 86400000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-S', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [],
  createdAt: daysAgo(90),
  ...over,
} as unknown as StoreData);

describe('when it is reasonable to ask', () => {
  beforeEach(() => localStorage.clear());

  it('asks a shop that has been trading a while and never recorded soap', () => {
    expect(shouldAskAboutSoap(laundry())).toBe(true);
  });

  /** A shop open five minutes has nothing to be asked about. */
  it('leaves a brand-new shop alone', () => {
    expect(shouldAskAboutSoap(laundry({ createdAt: daysAgo(MIN_DAYS_TRADING - 1) }))).toBe(false);
  });

  /**
   * Closing it is an answer - "not now" - and asking again tomorrow would be
   * ignoring it.
   */
  it('does not ask again for a fortnight, answered or not', () => {
    markAsked(CODE);
    expect(shouldAskAboutSoap(laundry())).toBe(false);
    expect(shouldAskAboutSoap(laundry(), Date.now() + (ASK_EVERY_DAYS + 1) * DAY)).toBe(true);
  });

  /** A shop already recording its soap has answered the question by doing. */
  it('does not ask a shop that records its consumables', () => {
    const store = laundry({
      expenses: [{ id: 'e1', amount: 9_000, category: 'Consumables', date: daysAgo(3) }] as any,
    });
    expect(shouldAskAboutSoap(store)).toBe(false);
  });

  it('asks again once that recording has gone stale', () => {
    const store = laundry({
      expenses: [{ id: 'e1', amount: 9_000, category: 'Consumables', date: daysAgo(ASK_EVERY_DAYS + 5) }] as any,
    });
    expect(shouldAskAboutSoap(store)).toBe(true);
  });
});

describe('what the answer does', () => {
  beforeEach(() => localStorage.clear());

  /**
   * Filed as a real expense, so everything that reads spending sees it. A soap
   * log the rest of the app could not see would be a diary, not a record.
   */
  it('becomes an expense the cost estimator can find', () => {
    const store = recordSoapAnswer(laundry(), { amount: 12_000, quantity: 2, brand: 'Waw' });
    const consumables = (store.expenses || []).filter(e => e.category === 'Consumables');

    expect(consumables).toHaveLength(1);
    expect(consumables[0].amount).toBe(12_000);
    expect(consumables[0].note).toContain('Waw');
    expect(estimateUnitCost(store).spend).toBe(12_000);
  });

  it('remembers the brand without deciding anything about it', () => {
    recordSoapAnswer(laundry(), { amount: 12_000, brand: 'Waw' });
    recordSoapAnswer(laundry(), { amount: 9_000, brand: 'Klin' });

    const sentence = soapHistorySentence(CODE);
    expect(sentence).toContain('Klin');
    expect(sentence).toContain('Waw');
    // No verdict: which soap is better is not knowable from one shop's month.
    expect(sentence).not.toMatch(/better|worse|best|worst|recommend/i);
  });

  it('counts as asked even when the amount is nothing', () => {
    const store = recordSoapAnswer(laundry(), { amount: 0 });
    expect(store.expenses || []).toHaveLength(0);
    expect(soapLog(CODE)).toHaveLength(1);
    expect(shouldAskAboutSoap(store)).toBe(false);
  });
});

describe('the money actually leaving', () => {
  beforeEach(() => localStorage.clear());

  /**
   * Appending to the expenses array looked equivalent to recording an expense
   * and was not: the proper path also takes the money out of the cash balance.
   * Soap bought out of the drawer that never left the drawer on paper would
   * make the books drift by exactly the amount this feature exists to capture.
   */
  it('comes out of the cash balance, like any other expense', () => {
    const store = recordSoapAnswer(laundry({ cashBalance: 50_000 } as any), { amount: 18_000 });
    expect(store.cashBalance).toBe(32_000);
  });

  it('does not take the balance below nothing', () => {
    const store = recordSoapAnswer(laundry({ cashBalance: 5_000 } as any), { amount: 18_000 });
    expect(store.cashBalance).toBe(0);
  });
});
