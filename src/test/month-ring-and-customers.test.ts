import { describe, expect, it } from 'vitest';
import { tones } from '@/components/BreakEvenPip';
import { matchCustomer } from '@/lib/store-data';
import type { Customer, StoreData } from '@/types/store';
import { readSource } from './helpers/source';

/**
 * The ring in the corner, and the customer book behind the counter.
 *
 * Two things a merchant told us were missing: a ring showing how the month is
 * going that they had never once seen, and customers who were not being saved.
 */

type Pace = ReturnType<typeof paceState>['pace'];

function paceState(over: Partial<{ target: number; progress: number; reached: boolean; pace: string }> = {}) {
  return { target: 100000, progress: 0.5, reached: false, pace: 'on track', ...over } as any;
}

describe('the ring says how the month is going', () => {
  /*
   * It returned null whenever the shop had not recorded what its month costs -
   * which is every shop on its first day and most for a while after - so the
   * thing meant to be always in the corner was almost never there, and the
   * merchant never knew it existed.
   */
  it('is grey, not absent, before the shop has said what its month costs', () => {
    const { ring, text } = tones(paceState({ target: 0 }));
    expect(ring).toContain('muted-foreground');
    expect(text).toContain('muted-foreground');
  });

  it('is green when the month is covered', () => {
    expect(tones(paceState({ reached: true })).ring).toContain('success');
  });

  it('is green while the shop is keeping up', () => {
    expect(tones(paceState({ pace: 'on track' })).ring).toContain('success');
    expect(tones(paceState({ pace: 'ahead' })).ring).toContain('success');
  });

  it('is amber when it starts slipping', () => {
    expect(tones(paceState({ pace: 'slightly behind' })).ring).toContain('amber');
  });

  it('is red when the month will not be covered at this rate', () => {
    // The one state worth interrupting somebody about, and the only red.
    expect(tones(paceState({ pace: 'behind' })).ring).toContain('destructive');
  });

  it('shows on the full dashboard, not only the simple one', () => {
    // It lived only on the simple home screen, so anybody on the default
    // dashboard had never seen it.
    expect(readSource('src/components/dashboards/BusinessOwnerDashboard.tsx')).toContain('<BreakEvenPip');
    expect(readSource('src/components/simple/BusinessSimpleHome.tsx')).toContain('<BreakEvenPip');
  });
});

describe('recognising a customer', () => {
  const book = [
    { id: '1', name: 'Musa Bello', phone: '08031234567' },
    { id: '2', name: 'Ngozi A.', phone: '' },
  ] as Customer[];

  it('finds somebody by their number, however it was typed', () => {
    expect(matchCustomer(book, { name: 'Anyone', phone: '0803-123-4567' })?.id).toBe('1');
  });

  it('prefers the number over the name, because names repeat', () => {
    expect(matchCustomer(book, { name: 'Ngozi A.', phone: '08031234567' })?.id).toBe('1');
  });

  it('falls back to the name for somebody who gave no number', () => {
    expect(matchCustomer(book, { name: 'ngozi a.' })?.id).toBe('2');
  });

  it('does not make every anonymous walk-in the same person', () => {
    /*
     * The trap: matching '' against '' means the fourth nameless walk-in is
     * the first one, and a shop that served four finds one customer with four
     * visits.
     */
    expect(matchCustomer(book, { name: 'Somebody Else' })).toBeUndefined();
  });

  it('does not match a named person against somebody who has a number', () => {
    // Musa-with-a-phone is not the same record as a walk-in called Musa.
    expect(matchCustomer(book, { name: 'Musa Bello' })).toBeUndefined();
  });

  it('recognises a number given by somebody we had no number for', () => {
    /*
     * Ten bundles taken in for a walk-in called Ngozi, and on the eleventh she
     * gives her number. Without this the number makes a second Ngozi, and the
     * first one keeps her history and whatever she owes.
     */
    expect(matchCustomer(book, { name: 'Ngozi A.', phone: '08055556666' })?.id).toBe('2');
  });

  it('will not guess between two walk-ins of the same name', () => {
    /*
     * Neither gave a number, so nothing distinguishes them. Handing back the
     * first files this bundle and its money against whichever happened to be
     * recorded first - a coin toss the shop cannot see and cannot undo.
     */
    const twoMusas = [
      { id: '1', name: 'Musa Bello', phone: '' },
      { id: '2', name: 'Musa Bello', phone: '' },
    ] as Customer[];
    expect(matchCustomer(twoMusas, { name: 'Musa Bello' })).toBeUndefined();
  });

  it('still recognises the one walk-in there is', () => {
    const one = [{ id: '1', name: 'Musa Bello', phone: '' }] as Customer[];
    expect(matchCustomer(one, { name: 'Musa Bello' })?.id).toBe('1');
  });

  it('will not guess when two people by that name have no number', () => {
    const twoNgozis = [
      ...book,
      { id: '3', name: 'Ngozi A.', phone: '' },
    ] as Customer[];
    // A coin toss, and the wrong guess puts a stranger's number on somebody
    // else's clothes.
    expect(matchCustomer(twoNgozis, { name: 'Ngozi A.', phone: '08055556666' })).toBeUndefined();
  });

  it('recognises nobody from nothing', () => {
    expect(matchCustomer(book, {})).toBeUndefined();
    expect(matchCustomer(undefined, { name: 'Musa Bello' })).toBeUndefined();
  });
});

describe('everybody the counter names goes in the book', () => {
  const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');

  it('no longer skips the book for a walk-in with no phone', () => {
    // Making the phone optional, this briefly refused to save the customer at
    // all - so the shop typed a name and the app quietly dropped it.
    expect(intake).toContain('const existingCustomer = picked || matchCustomer(book, { name, phone });');
    expect(intake).toContain('if (!existingCustomer) {');
    expect(intake).toContain('nextStore = addCustomer(nextStore, { name, phone,');
    expect(intake).not.toContain("if (phone && !customers.some(");
  });

  it('checks the book itself, not the wider list of everyone we have named', () => {
    /*
     * The counter searches everybody the shop has ever named - bundles, debts,
     * storefront orders. Checking that list before writing to the book would
     * mean a customer who only exists on an old bundle is treated as already
     * filed, and never actually gets there.
     */
    expect(intake).toContain('const book = store.customers || [];');
    expect(intake).not.toContain('matchCustomer(directory');
  });

  it('fills in a number for somebody the book had none for', () => {
    expect(intake).toContain('nextStore = updateCustomer(nextStore, existingCustomer.id, learned);');
    // Only ever a blank: a mistyped number must not overwrite a good one.
    expect(intake).toContain("if (phone && !String(existingCustomer.phone || '').trim()) learned.phone = phone;");
  });

  it('files the bundle and its debt against one internal customer id', () => {
    /*
     * One customer record, one id, one balance, many bundles. Without the id
     * the debt is filed under a name, so two customers who share one - and may
     * both have given no number - would each be shown owing what the other
     * owes.
     */
    expect(intake).toContain('customerId,');
    expect(readSource('src/lib/laundry-offline.ts')).toContain('customerId: (input.customerId');
    expect(readSource('src/lib/laundry-money.ts')).toContain('customerId: input.customerId || existing?.customerId,');
  });

  it('writes the money to the device, not only to the screen', () => {
    /*
     * onUpdate is setStore - React state and nothing else. The payment and the
     * debt reached the disk only as a side effect of addCustomer calling
     * saveStore on its way past, so a bundle taken in for somebody already in
     * the book, with nothing new to tell us, saved the bundle and silently
     * dropped what was owed for it. The bundle lives in its own store, so
     * everything on screen still looked right.
     */
    expect(intake).toContain('saveStore(nextStore);');
    expect(intake.indexOf('saveStore(nextStore);')).toBeGreaterThan(intake.indexOf('nextStore = recordLaundryPayment('));
  });

  it('lets a pick beat any matching the app could do', () => {
    // The counter saying which person this is settles it.
    expect(intake).toContain('const picked = selectedCustomerId && isInCustomerBook');
  });
});

describe('settings ask what the shop has, not what trade it is', () => {
  const settings = readSource('src/components/Settings.tsx');

  it('gates the stock settings on having stock', () => {
    // A laundry was being offered a low-stock threshold, restock suggestions
    // and backorder selling.
    expect(settings).toContain("hasBusinessModule(store, 'inventory')");
    expect(settings).toContain('{keepsStock && <SettingTile');
  });

  it('does not offer to suggest products to a shop with no products', () => {
    expect(settings).toContain('{keepsStock && <ToggleRow label="Product Suggestions"');
  });
});

describe('the ring sits with the revenue, and explains itself', () => {
  const revenue = readSource('src/components/RevenueCard.tsx');
  const simple = readSource('src/components/simple/BusinessSimpleHome.tsx');
  const full = readSource('src/components/dashboards/BusinessOwnerDashboard.tsx');

  it('puts the arrow against the word it changes', () => {
    /*
     * The period used to sit in its own box on the right, which put the thing
     * being measured and the thing measuring it at opposite ends of the card.
     */
    const header = revenue.slice(revenue.indexOf('>Revenue<') - 400, revenue.indexOf('>Revenue<') + 400);
    expect(header).toContain('<ChevronDown');
  });

  it('puts which stretch you are looking at under the figure, small', () => {
    const body = revenue.slice(revenue.indexOf('toLocaleString()'));
    expect(body).toContain('{label}');
  });

  it('carries the ring in its corner on both screens', () => {
    expect(revenue).toContain('trailing');
    for (const home of [simple, full]) {
      expect(home).toContain('trailing={<BreakEvenPip');
    }
  });

  it('asks for the full figures to be lit when the ring is tapped', () => {
    // Landing on a page of cards with no idea which one you were sent to is
    // not an answer, it is a second question.
    for (const home of [simple, full]) {
      expect(home).toContain('requestSpotlight(BREAK_EVEN_SPOTLIGHT)');
    }
    expect(readSource('src/components/BreakEvenCard.tsx')).toContain('claimSpotlight(BREAK_EVEN_SPOTLIGHT)');
  });
});

describe('the spotlight is one-shot', () => {
  it('lights the card that was asked for', async () => {
    const { requestSpotlight, claimSpotlight } = await import('@/lib/spotlight');
    requestSpotlight('break-even');
    expect(claimSpotlight('break-even')).toBe(true);
  });

  it('does not light a card nobody asked for', async () => {
    const { requestSpotlight, claimSpotlight } = await import('@/lib/spotlight');
    requestSpotlight('break-even');
    expect(claimSpotlight('something-else')).toBe(false);
  });

  it('does not light the same card twice', async () => {
    // A card that keeps glowing on every later visit is a card that is broken.
    const { requestSpotlight, claimSpotlight } = await import('@/lib/spotlight');
    requestSpotlight('break-even');
    expect(claimSpotlight('break-even')).toBe(true);
    expect(claimSpotlight('break-even')).toBe(false);
  });
});

describe('the spotlight reaches a card that is already on the page', () => {
  /*
   * The one that made it not work at all.
   *
   * Every tab in this app is mounted at once and hidden with CSS, so the
   * break-even card has been on the page since the app opened - its mount-time
   * check ran long before the merchant tapped the ring, and a stored flag
   * alone sat there unread. Clicking the ring did nothing visible, which is
   * exactly what was reported.
   */
  it('broadcasts as well as storing', async () => {
    const { requestSpotlight, SPOTLIGHT_SIGNAL } = await import('@/lib/spotlight');
    let heard: string | null = null;
    const listener = (event: Event) => { heard = (event as CustomEvent<string>).detail; };
    window.addEventListener(SPOTLIGHT_SIGNAL, listener);
    requestSpotlight('break-even');
    window.removeEventListener(SPOTLIGHT_SIGNAL, listener);
    expect(heard).toBe('break-even');
  });

  it('and the card listens for it rather than only checking once', () => {
    const card = readSource('src/components/BreakEvenCard.tsx');
    expect(card).toContain('window.addEventListener(SPOTLIGHT_SIGNAL, onRequest)');
    expect(card).toContain('window.removeEventListener(SPOTLIGHT_SIGNAL, onRequest)');
  });

  it('brings the card into view, since lighting an unseen card lights nothing', () => {
    expect(readSource('src/components/BreakEvenCard.tsx')).toContain('scrollSpotlightIntoView(cardRef.current)');
  });

  it('shows a solid ring, not only a pulse that may be caught at its faintest', () => {
    const css = readSource('src/index.css');
    const lit = css.slice(css.indexOf('.spotlight-lit'));
    expect(lit).toContain('outline:');
    expect(lit).toContain('animation:');
  });
});
