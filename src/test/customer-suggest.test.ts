import { describe, expect, it } from 'vitest';
import { suggestCustomers } from '@/lib/customer-suggest';
import { readSource } from './helpers/source';
import type { Customer } from '@/types/store';

/**
 * Finding a returning customer while their name is being typed.
 *
 * The only way to reuse one was a dropdown listing every customer in the shop.
 * Fine with six, useless with six hundred — and an attendant with a queue in
 * front of them types the name again rather than scrolling, which quietly
 * creates a second record for the same person, splits their history, and loses
 * whatever they still owed.
 */

const customer = (name: string, phone: string, debt = 0): Customer => ({
  id: name.toLowerCase().replace(/\W/g, ''), name, phone,
  totalPurchases: 0, outstandingDebt: debt, purchaseHistory: [],
} as Customer);

const book = [
  customer('Ada Nwosu', '08099887766', 2500),
  customer('Adebayo Johnson', '08031112222'),
  customer('Chinedu Okeke', '08144445555'),
  customer('Blessing Ada', '07066667777'),
];

describe('it offers customers as the name is typed', () => {
  it('says nothing for a single letter', () => {
    // One letter matches half the book; that is noise, not help.
    expect(suggestCustomers(book, 'A')).toHaveLength(0);
  });

  it('finds everyone whose name starts with what was typed', () => {
    const names = suggestCustomers(book, 'Ad').map(s => s.customer.name);
    expect(names).toContain('Ada Nwosu');
    expect(names).toContain('Adebayo Johnson');
  });

  it('puts a name that starts with it above one that merely contains it', () => {
    // "Ada" should lead with Ada Nwosu, not Blessing Ada.
    expect(suggestCustomers(book, 'Ada')[0].customer.name).toBe('Ada Nwosu');
    expect(suggestCustomers(book, 'Ada').map(s => s.customer.name)).toContain('Blessing Ada');
  });

  it('ignores case and stray spacing', () => {
    expect(suggestCustomers(book, '  chinedu ')[0].customer.name).toBe('Chinedu Okeke');
  });

  it('finds a customer by phone number', () => {
    const hit = suggestCustomers(book, '0814444');
    expect(hit[0].customer.name).toBe('Chinedu Okeke');
    expect(hit[0].matchedOn).toBe('phone');
  });

  it('does not search on one or two digits', () => {
    expect(suggestCustomers(book, '08')).toHaveLength(0);
  });

  it('stops suggesting once the name is typed out in full', () => {
    // The field already says it; repeating it below is clutter.
    expect(suggestCustomers(book, 'Ada Nwosu').map(s => s.customer.name)).not.toContain('Ada Nwosu');
  });

  it('offers nothing for a genuinely new customer', () => {
    expect(suggestCustomers(book, 'Zainab')).toHaveLength(0);
  });

  it('keeps the list short enough to scan at a counter', () => {
    const many = Array.from({ length: 40 }, (_, i) => customer(`Adaeze ${i}`, `0800000${i}`));
    expect(suggestCustomers(many, 'Ada').length).toBeLessThanOrEqual(5);
  });

  it('survives a book with missing or malformed entries', () => {
    const messy = [null, { id: 'x' }, customer('Ada Nwosu', '')] as any as Customer[];
    expect(() => suggestCustomers(messy, 'Ada')).not.toThrow();
  });

  it('does not guess wildly at a misspelling', () => {
    // Being handed the wrong customer at the counter is worse than typing the
    // name out, so matching stays literal here.
    expect(suggestCustomers(book, 'Abed')).toHaveLength(0);
  });
});

describe('it is offered everywhere a customer name is typed', () => {
  it('is one component, not three copies of a floating list', () => {
    const shared = readSource('src/components/CustomerSuggestions.tsx');
    expect(shared).toContain('suggestCustomers');
    expect(shared).toContain('onPick');
  });

  it('is on a credit sale, where a misspelling hides a debt', () => {
    // The debt is filed under whatever is typed, so a second spelling is a
    // second person who never appears to owe anything.
    const sales = readSource('src/components/Sales.tsx');
    expect(sales).toContain('<CustomerSuggestions');
    expect(sales).toContain('setPickedCustomer(true)');
  });

  it('warns rather than offers on the form for adding someone new', () => {
    // Picking is the wrong answer on a form whose purpose is to create a new
    // customer; knowing they already exist is the right one.
    const customers = readSource('src/components/Customers.tsx');
    expect(customers).toContain('suggestCustomers(store.customers || [], name)');
    expect(customers).toContain('Already in your book');
    expect(customers).toContain('!editingCustomer');
  });
});

describe('the intake screen uses it', () => {
  const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');
  const shared = readSource('src/components/CustomerSuggestions.tsx');

  it('shows matches under the name field', () => {
    expect(intake).toContain('<CustomerSuggestions');
    expect(intake).toContain('query={customerName}');
  });

  it('fills the whole customer in when one is picked', () => {
    expect(intake).toContain('onPick={customer => selectCustomer(customer.id)}');
    const fn = intake.slice(intake.indexOf('const selectCustomer'), intake.indexOf('const changeCount'));
    expect(fn).toContain('setCustomerPhone');
    expect(fn).toContain('setCustomerAddress');
  });

  it('closes the list once one is picked', () => {
    const fn = intake.slice(intake.indexOf('const selectCustomer'), intake.indexOf('const changeCount'));
    expect(fn).toContain('setShowSuggestions(false)');
    expect(intake).toContain('enabled={showSuggestions && !selectedCustomerId}');
  });

  it('warns the attendant when that customer already owes money', () => {
    // Now in the shared list, so every screen says it, not just this one.
    expect(shared).toContain('customer.outstandingDebt > 0');
  });
});
