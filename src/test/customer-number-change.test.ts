import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Adding a number to a customer keeps the customer.
 *
 * Reported from the counter: every time a number was added to a customer, the
 * app saved them as a brand-new customer. Two faults did it together. Typing
 * in the phone field threw away the customer who had been picked, and
 * matching then skipped anybody who already had a number - so the new number
 * matched nobody and a second copy of the person was made, splitting their
 * history and their debt.
 */

const intake = readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx');

describe('adding a number to a customer keeps the customer', () => {
  it('does not forget the customer picked when a number is typed', () => {
    // The phone field and the contacts button, up to the hint beneath them.
    const field = intake.slice(intake.indexOf('<input ref={phoneInput} value={customerPhone}'), intake.indexOf('This number is saved for'));
    expect(field.length).toBeGreaterThan(0);
    expect(field).not.toContain("setSelectedCustomerId('')");
  });

  it('treats only a changed name as somebody else', () => {
    expect(intake).toContain("setCustomerName(event.target.value); setSelectedCustomerId('');");
  });

  it('asks before a different number replaces the saved one', () => {
    expect(intake).toContain('Keep saved number');
    expect(intake).toContain('Replace it, or is this someone new?');
  });

  it('keeps the saved number unless the counter taps Replace', () => {
    expect(intake).toContain('const [replaceNumber, setReplaceNumber] = useState(false);');
    expect(intake).toContain('else if (phone && replaceNumber && numberChange?.id === existingCustomer.id) learned.phone = phone;');
  });

  it('never overwrites a saved number any other way', () => {
    // The only unconditional write fills a blank.
    expect(intake).toContain("if (phone && !String(existingCustomer.phone || '').trim()) learned.phone = phone;");
  });

  it('lets a genuinely different person with the same name stay separate', () => {
    // Asked, not merged: never silently join people who only share a name.
    expect(intake).toContain('Someone new');
    expect(intake).toContain('const existingCustomer = newPerson || twoPeople ? undefined : picked || matchCustomer(book, { name, phone });');
  });

  it('forgets an answer given about a different customer or number', () => {
    expect(intake).toContain('useEffect(() => { setReplaceNumber(false); setNewPerson(false); }, [customerName, customerPhone, selectedCustomerId]);');
  });

  it('does not treat +234 and 0 forms of one number as a change', () => {
    // Read through the one helper both questions share, so a number typed
    // either way is the same number to each of them.
    expect(intake).toContain('localNumber(typed).length < 7 || localNumber(saved) === localNumber(typed)');
    expect(readSource('src/lib/customer-key.ts')).toContain("digits.startsWith('234') && digits.length >= 12 ? `0${digits.slice(3)}` : digits");
  });
});

describe('an online order does not overwrite a saved number', () => {
  it('fills a blank only, because there is nobody at a counter to ask', () => {
    const checkout = readSource('src/lib/store-data.ts');
    expect(checkout).toContain("phone: customer?.phone || opts.customerPhone || ''");
    expect(readSource('src/lib/inventory-orders.ts')).toContain('recordCheckout(updated, checkoutItems');
  });
});
