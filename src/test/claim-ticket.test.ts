import { describe, expect, it } from 'vitest';
import { claimBalance, whenReady } from '@/components/laundry/ClaimTicket';
import { readSource } from './helpers/source';

/**
 * The half-ticket the customer walks away with.
 *
 * Paper always gives them something. The app gave them nothing unless the shop
 * remembered to press WhatsApp - and a customer with no number, or a shop in a
 * hurry, ended up with a bundle and no proof of it. The first time somebody
 * comes back and cannot say what they dropped, the shop goes back to paper.
 */

const ticket = readSource('src/components/laundry/ClaimTicket.tsx');
const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');
const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');

describe('what is left to pay', () => {
  it('is the total less what was handed over', () => {
    expect(claimBalance({ total: 3500, amountPaid: 1000 })).toBe(2500);
  });

  it('treats an unpaid bundle as owing all of it', () => {
    expect(claimBalance({ total: 3500 })).toBe(3500);
  });

  it('never prints a negative number on a customer ticket', () => {
    // An overpayment is something to sort out at the counter, not a minus sign
    // on the customer's copy.
    expect(claimBalance({ total: 1000, amountPaid: 1500 })).toBe(0);
  });
});

describe('when to come back', () => {
  it('says the promised time', () => {
    expect(whenReady(new Date('2026-09-10T17:00:00').toISOString())).not.toBe('Ask the shop');
  });

  it('shrugs honestly rather than inventing a date', () => {
    /*
     * A ticket that says "Ready today" because there was no promised time is
     * worse than one that says to ask - the customer turns up, the clothes are
     * not done, and the ticket was the thing that told them to come.
     */
    expect(whenReady(undefined)).toBe('Ask the shop');
    expect(whenReady('not a date')).toBe('Ask the shop');
    expect(whenReady('')).toBe('Ask the shop');
  });
});

describe('what is on the customer\'s copy', () => {
  it('carries the shop, so the photo means something in a week', () => {
    expect(ticket).toContain('{store.storeName}');
    expect(ticket).toContain('store.profile?.phone');
  });

  it('carries the code and what it is for', () => {
    expect(ticket).toContain('{record.tagCode}');
    expect(ticket).toContain('Show this when you collect');
  });

  it('carries the balance, so both sides have the same number', () => {
    // A balance only the shop knows about is a balance that gets argued about.
    expect(ticket).toContain('To pay on collection');
    expect(ticket).toContain('Paid in full');
  });

  it('does not carry instructions written for the counter', () => {
    // "Write this on every tag in the bundle" is the merchant's job, not the
    // customer's, and it is on the merchant's own receipt screen.
    expect(ticket).not.toContain('Write this on every tag');
    expect(intake).toContain('Write this on every tag');
  });

  it('is light whatever the app theme is, because it gets photographed', () => {
    expect(ticket).toContain('bg-white');
    expect(ticket).toContain('text-neutral-900');
  });
});

describe('where the customer gets it', () => {
  it('is offered the moment the bundle is recorded', () => {
    expect(intake).toContain('Show customer');
    expect(intake).toContain('<ClaimTicket');
  });

  it('does not need a phone number', () => {
    // Offered flat, with no reference to whether a number was given - a
    // walk-in who would not give one is exactly who this exists for.
    const offer = intake.slice(intake.indexOf('Show customer') - 300, intake.indexOf('Show customer'));
    expect(offer).not.toContain('customerPhone');
  });

  it('and neither does WhatsApp any more', () => {
    /*
     * It used to be hidden when there was nowhere to send it, then it offered
     * a contact picker, which is an odd answer to a customer with no number:
     * the shop wanted to message this person and the app knows exactly why it
     * cannot. It asks for the number now - and keeps it, on the customer and
     * on the bundle, so it is not the same question tomorrow. Sending to
     * somebody else is still there for the driver or the relative.
     */
    expect(intake).toContain("created.customerPhone ? sendWhatsApp : () => setAskingNumber(true)");
    expect(intake).toContain("`Add ${created.customerName.split(' ')[0]}'s number`");
    expect(intake).toContain('Send to someone else');
  });

  it('keeps a number given late, rather than asking again tomorrow', () => {
    expect(intake).toContain('setLocalLaundryPhone(String(store.accessCode');
    // The same rule the counter's save follows: only ever fills a blank.
    expect(intake).toContain("if (known && !String(known.phone || '').trim()) next = updateCustomer(next, known.id, { phone: typed });");
  });

  it('says plainly that the record was created', () => {
    expect(intake).toContain("{practice ? 'Practice run' : 'Order created'}");
    expect(intake).toContain("{practice ? 'Receipt / Tag Code' : 'Record created'}");
  });

  it('can be shown again from any record, which paper cannot do', () => {
    // A customer who has lost their half of a paper ticket has lost it. Here
    // the shop turns the phone round and it is back.
    expect(workspace).toContain('<ClaimTicket');
    expect(workspace).toContain('setTicket(record)');
  });

  it('shows the same balance the counter is looking at', () => {
    expect(workspace).toContain('amountPaid: ticket.total - ticket.balance');
  });
});
