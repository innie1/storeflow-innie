import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { getServicePricingLabel, serviceUnitLabel } from '@/lib/service-pricing';
import { analyzeSales } from '@/lib/manager-intel';
import { readSource } from './helpers/source';

/**
 * Six things the app was quietly dropping.
 *
 * None of these threw, none showed an error, and none had a test. They
 * surfaced only when the project was typechecked properly for the first time
 * - the root tsconfig has `files: []` and checks nothing, so `tsc -p
 * tsconfig.json` had been exiting clean over two hundred and fifty real
 * errors. What follows is a test per fault, so that fixing them once is
 * enough.
 */

const inventory = readSource('src/components/Inventory.tsx');
const index = readSource('src/pages/Index.tsx');
const scanner = readSource('src/components/qr/QRScannerPage.tsx');

describe('a barcode survives being typed', () => {
  /*
   * The Add Product form has always had a "Barcode (Optional)" box. The state
   * behind it never declared the field, and the save listed its fields one by
   * one without it, so the value went in and nothing came out.
   *
   * The flow built for this is where it stung: scanning a code the shop does
   * not have offers "add it as a new product" and pre-fills the code. The save
   * dropped it, so scanning the same tin tomorrow found nothing again.
   */
  it('is passed to addProduct when a product is created', () => {
    const add = inventory.slice(inventory.indexOf('const handleActualAdd'));
    const call = add.slice(0, add.indexOf('currentUser?.name'));
    expect(call).toContain('barcode:');
  });

  it('is read back onto the form when a product is edited', () => {
    const seed = inventory.slice(inventory.indexOf('setEditDraft({'));
    expect(seed.slice(0, seed.indexOf('});'))).toContain('barcode: p.barcode');
  });

  it('is written back when that edit is saved', () => {
    const save = inventory.slice(inventory.indexOf('const updates'));
    expect(save.slice(0, save.indexOf('updateProduct('))).toContain('barcode:');
  });
});

describe('clearing the form does not clear the unit', () => {
  /*
   * Two of the buttons that start a fresh product rebuilt the state without
   * `unit`, which left it undefined rather than 'pcs' - so the next product
   * saved with no unit at all, and nothing said so.
   */
  it('every reset of newProduct names a unit', () => {
    const resets = inventory.split('setNewProduct({').slice(1);
    expect(resets.length).toBeGreaterThan(2);
    for (const reset of resets) {
      const body = reset.slice(0, reset.indexOf('});'));
      // The spread form (`{ ...newProduct, x }`) is an edit, not a reset.
      if (body.includes('...newProduct')) continue;
      expect(body).toContain('unit:');
    }
  });
});

describe('a notification arrives with something to read', () => {
  /*
   * Both places that turn a server notification into a FlowNotification set
   * `message`. The type says `text`, and both drawers render `{n.description
   * || n.text}` - so an order landed in the tray showing its title above an
   * empty line.
   */
  /** The two object literals that build a FlowNotification from a server row. */
  const notificationBuilders = () =>
    index.split("|| 'Flow Alert',").slice(1).map(built => built.slice(0, built.indexOf('};')));

  it('does not build notifications around a field nothing renders', () => {
    const bodies = notificationBuilders();
    expect(bodies.length).toBe(2);
    for (const body of bodies) {
      expect(body).toContain('text:');
      expect(body).not.toContain('message:');
    }
  });

  it('only uses tones the drawer knows how to paint', () => {
    // 'destructive' is not one of the four FlowNotification tones, so a
    // cancelled order was painted the same neutral grey as a routine update.
    // Scoped to what the builders assign: `bg-destructive` is a real Tailwind
    // class used all over this file and has nothing to do with tone.
    const known = ["'success'", "'warning'", "'info'", "'danger'"];
    const bodies = notificationBuilders();
    expect(bodies.length).toBe(2);
    for (const body of bodies) {
      const assigned = body.match(/tone: (.+)/);
      expect(assigned).not.toBeNull();
      for (const literal of (assigned as RegExpMatchArray)[1].match(/'[a-z]+'/g) || []) {
        expect(known).toContain(literal);
      }
    }
  });
});

describe('the torch button calls something that exists', () => {
  /*
   * It called getActiveTrack(), which html5-qrcode has never had. Every press
   * threw, the catch turned it into "Flash operation failed", and it read as a
   * phone without a torch instead of a method that was not there.
   */
  it('uses the library surface rather than a method it does not have', () => {
    // The call, not the word - the comment above the fix names the old method
    // to explain what went wrong, and should not fail this test.
    expect(scanner).not.toContain('.getActiveTrack(');
    expect(scanner).toContain('.getRunningTrackCapabilities(');
    expect(scanner).toContain('.applyVideoConstraints(');
  });

  it('still checks the capability before asking for it', () => {
    expect(scanner).toContain("'torch' in capabilities");
  });
});

describe('a bundle is priced as a bundle', () => {
  /*
   * per_bundle had no entry in the label map, so it fell through to `fixed`
   * and described itself as "Fixed price" with no unit - in an app that is
   * otherwise careful that a bundle of twenty shirts is not one piece.
   */
  it('has a label of its own', () => {
    expect(getServicePricingLabel('per_bundle').id).toBe('per_bundle');
    expect(getServicePricingLabel('per_bundle').label).toBe('Per bundle');
  });

  it('carries a unit, like the other per-something modes', () => {
    expect(serviceUnitLabel('per_bundle')).toBe('/ bundle');
  });

  it('is not silently answered with the fixed-price entry', () => {
    expect(getServicePricingLabel('per_bundle')).not.toEqual(getServicePricingLabel('fixed'));
  });
});

describe('stock that never moved says what it cost', () => {
  /*
   * The "stop reordering this" advice multiplies costPrice by quantity to show
   * what is tied up. The never-sold list carried neither, so the figure was
   * always zero and the app hid it - leaving advice with no number behind it.
   */
  const store = {
    id: 's1',
    accessCode: 'TEST',
    storeName: 'Test',
    category: 'retail',
    createdAt: new Date('2026-01-01').toISOString(),
    products: [{
      id: 'p1',
      name: 'Tinned milk',
      costPrice: 900,
      sellingPrice: 1200,
      quantity: 40,
      category: 'General',
      addedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    }],
    sales: [],
    expenses: [],
    investments: [],
    cashBalance: 0,
    bankBalance: 0,
    walletBalance: 0,
  } as unknown as StoreData;

  it('reports the cost and the count, not just a name', () => {
    const [dead] = analyzeSales(store).neverSold;
    expect(dead.name).toBe('Tinned milk');
    expect(dead.costPrice).toBe(900);
    expect(dead.quantity).toBe(40);
  });

  it('multiplies to a figure worth showing', () => {
    const [dead] = analyzeSales(store).neverSold;
    expect(dead.costPrice * dead.quantity).toBe(36000);
  });
});
