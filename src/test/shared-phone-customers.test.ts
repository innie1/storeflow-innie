import { describe, expect, it } from 'vitest';
import { matchCustomer } from '@/lib/store-data';
import { peopleOnThisNumber } from '@/lib/customer-key';
import { readSource } from './helpers/source';
import type { Customer } from '@/types/store';

/**
 * Two people, one phone.
 *
 * A number the book already held decided who a bundle belonged to on its own,
 * whatever name was typed. On a household phone or a shop line that filed the
 * second person's clothes - and the second person's debt - against the first
 * person's record: the customer book showed one customer owing both amounts,
 * searching the second person's name found nobody, and "has delayed payment
 * twice" named one person for two people's lateness.
 *
 * Nothing in the data can tell a shared phone from a regular whose name was
 * typed differently today, so the counter is asked, and only when the name and
 * the number actually disagree.
 */

const book = (...customers: Partial<Customer>[]) => customers as Customer[];

describe('a number that belongs to more than one person', () => {
  const ada = { id: 'cust-ada', name: 'Ada Obi', phone: '08012345678' };
  const chidi = { id: 'cust-chidi', name: 'Chidi Eze', phone: '08012345678' };

  it('lets the name decide which of them it is', () => {
    expect(matchCustomer(book(ada, chidi), { name: 'Chidi Eze', phone: '08012345678' })?.id).toBe('cust-chidi');
    expect(matchCustomer(book(ada, chidi), { name: 'Ada Obi', phone: '08012345678' })?.id).toBe('cust-ada');
  });

  it('does not depend on which of them was recorded first', () => {
    expect(matchCustomer(book(chidi, ada), { name: 'Ada Obi', phone: '08012345678' })?.id).toBe('cust-ada');
  });

  it('reads a name the way a counter types it', () => {
    expect(matchCustomer(book(ada, chidi), { name: '  ada obi ', phone: '08012345678' })?.id).toBe('cust-ada');
  });

  it('still answers with the person on that number when no name matches', () => {
    // A shop where one number means one person, which is nearly all of them:
    // a typo in the name must not turn a regular into a new customer.
    const only = matchCustomer(book(ada), { name: 'Ada Obl', phone: '08012345678' });
    expect(only?.id).toBe('cust-ada');
  });

  it('treats +234 and 0 as the same number when choosing between them', () => {
    expect(matchCustomer(book(ada, chidi), { name: 'Chidi Eze', phone: '+2348012345678' })?.id).toBe('cust-chidi');
  });
});

describe('the counter is asked whose number it is', () => {
  const intake = readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx');

  it('asks only when the name and the number disagree', () => {
    expect(intake).toContain('peopleOnThisNumber(book, customerPhone.trim(), customerName.trim())');
  });

  it('puts the question in the merchant\'s words', () => {
    expect(intake).toContain('Same person, or two different people?');
    expect(intake).toContain('Same person');
    expect(intake).toContain('Two different people');
  });

  it('offers the second person a number of their own, and takes no for an answer', () => {
    expect(intake).toContain('a different number?');
    expect(intake).toContain('Change the number');
    expect(intake).toContain('Keep the same number');
  });

  it('keeps two different people apart, each with their own record', () => {
    // Their own customer id is what keeps their bundles and their debt theirs.
    expect(intake).toContain("const twoPeople = sharedAnswer === 'different';");
    expect(intake).toContain('const existingCustomer = newPerson || twoPeople ? undefined : picked || matchCustomer(book, { name, phone });');
  });

  it('asks which name to keep when it is one person under two', () => {
    expect(intake).toContain('Which name should we use for them?');
    expect(intake).toContain('if (renameTo && !sameName(existingCustomer.name, renameTo)) learned.name = renameTo;');
  });

  it('offers every person on the number, not just the first', () => {
    expect(intake).toContain('Which of them is it?');
    expect(intake).toContain('sharedNumber.holders.map(holder => (');
  });

  it('forgets the answer when the name or the number changes', () => {
    // An answer about one customer says nothing about the next person in the
    // queue, and a stale yes would file their clothes against a stranger.
    expect(intake).toContain("useEffect(() => { setSharedAnswer(''); setRenameTo(''); }, [customerName, customerPhone, selectedCustomerId]);");
  });
});

describe('who the counter is asked about', () => {
  const ada = { id: 'cust-ada', name: 'Ada Obi', phone: '08012345678' };
  const chidi = { id: 'cust-chidi', name: 'Chidi Eze', phone: '08012345678' };
  const stranger = { id: 'cust-musa', name: 'Musa Bello', phone: '08099999999' };

  it('says nothing when that number belongs to no one else', () => {
    expect(peopleOnThisNumber([stranger], '08012345678', 'Ada Obi')).toBeNull();
  });

  it('says nothing when somebody on that number already has that name', () => {
    // The ordinary case: a regular, back again, typed the same way.
    expect(peopleOnThisNumber([ada], '08012345678', 'Ada Obi')).toBeNull();
    expect(peopleOnThisNumber([ada, chidi], '08012345678', 'chidi eze')).toBeNull();
  });

  it('names the one person on the number', () => {
    const asked = peopleOnThisNumber([ada, stranger], '08012345678', 'Chidi Eze');
    expect(asked?.savedName).toBe('Ada Obi');
    expect(asked?.many).toBe(false);
    expect(asked?.holders.map(h => h.id)).toEqual(['cust-ada']);
  });

  it('names everybody on the number once more than one shares it', () => {
    // Naming only the first of them would be half the truth, and the counter
    // would be choosing between two people while shown one.
    const asked = peopleOnThisNumber([chidi, ada], '08012345678', 'Ada O');
    expect(asked?.savedName).toBe('Chidi Eze and Ada Obi');
    expect(asked?.many).toBe(true);
    expect(asked?.holders).toHaveLength(2);
  });

  it('holds its tongue until there is enough number to match on', () => {
    expect(peopleOnThisNumber([ada], '0801', 'Chidi Eze')).toBeNull();
    expect(peopleOnThisNumber([ada], '', 'Chidi Eze')).toBeNull();
    expect(peopleOnThisNumber([ada], '08012345678', '')).toBeNull();
  });

  it('does not interrupt on the fourth digit because a book entry is a stub', () => {
    /*
     * A customer saved with half a number - a slip at a busy counter - would
     * otherwise be matched the moment somebody typed those same few digits,
     * and the question would jump in while they were still typing. Asked
     * mid-typing, it gets tapped through, and a tapped-through question files
     * clothes against a stranger.
     */
    const stub = { id: 'cust-stub', name: 'Half A Number', phone: '0801' };
    expect(peopleOnThisNumber([stub], '0801', 'Ada Obi')).toBeNull();
    // Once the whole number is there, a real match still asks.
    expect(peopleOnThisNumber([ada, stub], '08012345678', 'Ada Obl')?.holders).toHaveLength(1);
  });

  it('reads +234 and 0 as the same number', () => {
    expect(peopleOnThisNumber([ada], '+2348012345678', 'Chidi Eze')?.holders).toHaveLength(1);
  });
});
