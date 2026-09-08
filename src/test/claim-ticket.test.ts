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

  it('does not need a phone number, unlike WhatsApp', () => {
    /*
     * The WhatsApp button is hidden when there is nowhere to send it. If the
     * ticket were gated the same way, a walk-in who gave no number would still
     * leave with nothing - which is the case this exists for.
     */
    const footer = intake.slice(intake.indexOf('<div className="shrink-0 border-t border-border p-4 flex gap-2">'), intake.indexOf('Done</button>'));
    // WhatsApp is gated on having somewhere to send it...
    expect(footer).toContain('Boolean(created.customerPhone)');
    // ...and the ticket, which comes after it, is not.
    const showCustomer = footer.slice(footer.indexOf('setShowTicket'));
    expect(showCustomer).not.toContain('customerPhone');
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
