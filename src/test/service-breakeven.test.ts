import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import {
  breakEven,
  breakEvenSentence,
  monthlyFixedCosts,
  monthToDate,
  variableCostPerPiece,
  MIN_PIECES_FOR_UNIT_COST,
} from '@/lib/service-breakeven';

const CODE = 'BREAK1';
const today = () => new Date().toISOString();

const store = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-B', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', products: [], sales: [], customers: [],
  expenses: [], recurringBills: [], createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const expense = (amount: number, category: any, note = '') => ({
  id: `e${Math.random()}`, amount, category, date: today(), note,
});

/** A drop-off of `pieces` shirts for `total`. */
const bundle = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'A', customerPhone: '08010000000',
  serviceId: 'svc', serviceName: 'Wash & Iron',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

describe('what the month costs before any washing', () => {
  beforeEach(() => localStorage.clear());

  it('adds up what actually went out', () => {
    const s = store({ expenses: [expense(90_000, 'Rent'), expense(60_000, 'Salaries')] as any });
    expect(monthlyFixedCosts(s)).toBe(150_000);
  });

  /**
   * Detergent moves with the washing, so it is not a cost the shop carries
   * regardless - counting it here would double it, since it is taken off the
   * revenue side as what each piece consumed.
   */
  it('leaves out what the washing itself consumes', () => {
    const s = store({ expenses: [expense(90_000, 'Rent'), expense(20_000, 'Consumables')] as any });
    expect(monthlyFixedCosts(s)).toBe(90_000);
  });

  /** A rent day that has not arrived is still rent owed this month. */
  it('counts a recurring bill that has not been paid yet', () => {
    const s = store({
      expenses: [expense(60_000, 'Salaries')] as any,
      recurringBills: [{ id: 'b1', label: 'Shop rent', amount: 90_000, category: 'Rent', frequency: 'monthly', nextDueDate: today(), active: true }] as any,
    });
    expect(monthlyFixedCosts(s)).toBe(150_000);
  });

  it('does not count a recurring bill twice once it is paid', () => {
    const s = store({
      expenses: [expense(90_000, 'Rent', 'Shop rent for the month')] as any,
      recurringBills: [{ id: 'b1', label: 'Shop rent', amount: 90_000, category: 'Rent', frequency: 'monthly', nextDueDate: today(), active: true }] as any,
    });
    expect(monthlyFixedCosts(s)).toBe(90_000);
  });
});

describe('counting pieces, not drop-offs', () => {
  beforeEach(() => localStorage.clear());

  /**
   * One customer with a single shirt and one with a bundle of twenty are not
   * the same event. Counting each drop-off as one would make a shop doing many
   * small jobs look identical to one doing few large ones.
   */
  it('counts one shirt as one and twenty as twenty', () => {
    bundle(1, 500);
    bundle(20, 10_000);
    const totals = monthToDate(store());
    expect(totals.pieces).toBe(21);
    expect(totals.revenue).toBe(10_500);
  });
});

describe('what a piece costs to do', () => {
  beforeEach(() => localStorage.clear());

  it('divides real consumable spending by real pieces', () => {
    for (let i = 0; i < 5; i += 1) bundle(10, 5_000);
    const s = store({ expenses: [expense(10_000, 'Consumables')] as any });
    expect(variableCostPerPiece(s)).toBe(200);
  });

  /**
   * Withheld rather than guessed: a drum of detergent divided by three shirts
   * produces a confident figure built on nothing, and a shop could reprice
   * off it.
   */
  it('says nothing when there are too few pieces to divide by', () => {
    bundle(MIN_PIECES_FOR_UNIT_COST - 1, 3_000);
    expect(variableCostPerPiece(store({ expenses: [expense(10_000, 'Consumables')] as any }))).toBeNull();
  });

  it('says nothing when no consumables have been bought', () => {
    bundle(50, 25_000);
    expect(variableCostPerPiece(store())).toBeNull();
  });
});

describe('where the month stands', () => {
  beforeEach(() => localStorage.clear());

  it('raises the target above fixed costs once the work has a cost', () => {
    for (let i = 0; i < 10; i += 1) bundle(10, 5_000);
    const s = store({ expenses: [expense(100_000, 'Rent'), expense(10_000, 'Consumables')] as any });
    const state = breakEven(s);

    // 100 pieces at 50,000... revenue 50,000, consumed 10,000: 80% of each
    // naira is left, so 100,000 of rent needs 125,000 of turnover.
    expect(state.fixedCosts).toBe(100_000);
    expect(Math.round(state.target)).toBe(125_000);
    expect(state.pieces).toBe(100);
  });

  /** Understating is safer than inventing a margin nobody measured. */
  it('uses the fixed costs alone when the piece cost is not known', () => {
    bundle(2, 1_000);
    const s = store({ expenses: [expense(100_000, 'Rent')] as any });
    expect(breakEven(s).target).toBe(100_000);
  });

  it('reports the surplus once the month is covered', () => {
    for (let i = 0; i < 30; i += 1) bundle(10, 10_000);
    const s = store({ expenses: [expense(50_000, 'Rent')] as any });
    const state = breakEven(s);
    expect(state.reached).toBe(true);
    expect(state.surplus).toBe(250_000);
    expect(breakEvenSentence(state)).toContain('above them');
  });

  it('asks for the costs rather than inventing a target', () => {
    const state = breakEven(store());
    expect(state.target).toBe(0);
    expect(breakEvenSentence(state)).toContain('Record your rent');
  });

  it('never asks for a negative amount per day', () => {
    for (let i = 0; i < 30; i += 1) bundle(10, 10_000);
    expect(breakEven(store({ expenses: [expense(50_000, 'Rent')] as any })).perDayNeeded).toBe(0);
  });
});

describe('wages the shop still owes', () => {
  beforeEach(() => localStorage.clear());

  const withStaff = (salary: number, over: Partial<StoreData> = {}) => store({
    staffMembers: [{ id: 'st1', name: 'Hanna', pin: '1234', role: 'attendant', monthlySalary: salary, permissions: {} }] as any,
    ...over,
  });

  /**
   * Wages are usually the largest cost after rent. Without them a shop was
   * told it had covered its month while a salary it had not yet paid was
   * still due - the target looked reachable right up until payday.
   */
  it('counts a salary that has not been paid yet', () => {
    expect(monthlyFixedCosts(withStaff(60_000))).toBe(60_000);
  });

  it('does not count it twice once it has been paid', () => {
    const s = withStaff(60_000, { expenses: [expense(60_000, 'Salaries')] as any });
    expect(monthlyFixedCosts(s)).toBe(60_000);
  });

  it('counts only the part still owed when some has been paid', () => {
    const s = withStaff(60_000, { expenses: [expense(20_000, 'Salaries')] as any });
    expect(monthlyFixedCosts(s)).toBe(60_000);
  });

  /** A family member helping out may not be on a wage, and that is not a gap. */
  it('is untroubled by staff with no salary set', () => {
    const s = store({ staffMembers: [{ id: 'st1', name: 'Cousin', pin: '1', role: 'attendant', permissions: {} }] as any });
    expect(monthlyFixedCosts(s)).toBe(0);
  });
});
