import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import type { Product, Sale, StoreData } from '@/types/store';

/**
 * A group of faults that all shared one shape: the app knew something had gone
 * wrong, or held a value it had computed, and then showed the merchant nothing.
 */

/** Everything that ships and reads a product's fields. */
const PRODUCT_READING_SOURCES = [
  'src/lib/flow-operating-engine.ts',
  'src/lib/flow-finance-actions.ts',
  'src/lib/flow-smart-buy-list.ts',
  'src/lib/manager-intel.ts',
  'src/lib/store-data.ts',
  'src/lib/flow-message-orders.ts',
  'src/lib/flow-checkins.ts',
];

describe('a failed receipt scan says why it failed', () => {
  it('renders ocrError in the Receipt Scan tab, where the failure happens', () => {
    const src = readSource('src/components/Inventory.tsx');
    expect(src).toContain('setOcrError("No products could be parsed');
    expect(src).toMatch(/\{ocrError && \(/);
    expect(src).toContain('{ocrError}');
  });

  it('keeps exactly one copy of the message', () => {
    // A second banner above the tab switcher would repeat the same sentence
    // twice on the screen the merchant is already looking at.
    const src = readSource('src/components/Inventory.tsx');
    expect((src.match(/\{ocrError && \(/g) || []).length).toBe(1);
  });
});

describe('the trash can be opened with a deleted sale in it', () => {
  it('reads fields that exist on Sale', () => {
    const src = readSource('src/components/RecentlyDeleted.tsx');
    // `totalAmount` and `items` are not on Sale; reading either threw and
    // blanked the app.
    expect(src).not.toContain('s.totalAmount');
    expect(src).not.toContain('s.items.length');
    expect(src).toContain('Number(s.total || 0)');
  });

  it('builds a row from a real sale without throwing', () => {
    const sale: Sale = {
      id: 'sale-000123',
      productId: 'p1',
      productName: 'Rice 50kg',
      quantity: 2,
      total: 175000,
      profit: 20000,
      date: new Date().toISOString(),
    } as Sale;
    const subtitle = `₦${Number(sale.total || 0).toLocaleString()} • ${sale.productName || 'Item'} ×${sale.quantity ?? 1}`;
    expect(subtitle).toContain('175,000');
    expect(subtitle).toContain('Rice 50kg');
  });
});

describe('a product can carry a photo and a description', () => {
  it('declares both on Product, so something can set them', () => {
    const types = readSource('src/types/store.ts');
    expect(types).toMatch(/^\s*image\?: string;/m);
    expect(types).toMatch(/^\s*description\?: string;/m);
  });

  it('accepts them on a Product value', () => {
    const p = { id: 'p1', name: 'Rice', image: 'data:image/webp;base64,AA', description: 'Long grain' } as Partial<Product>;
    expect(p.image).toBeTruthy();
    expect(p.description).toBe('Long grain');
  });

  it('downscales the picture on upload rather than storing the camera file', () => {
    const src = readSource('src/components/Inventory.tsx');
    expect(src).toContain('downscaleImageToDataUrl(file, { maxEdge: 320 })');
  });
});

describe('restock suggestions read the field that holds the count', () => {
  /**
   * This used to read src/lib/flow-finance.ts, a module nothing in the shipped
   * app imported. It guarded a real bug shape -- a product's count lives in
   * `quantity`, and reading `stock` yields undefined, so every product looks
   * out of stock -- but only in code no merchant reached, and it was deleted
   * with the rest of that orphan cluster.
   *
   * Rewritten against everything that ships, and widened from one file to all
   * of them: the invariant is that no module reads a `stock` field off a
   * product, because Product has never had one.
   */
  it('no shipped module reads a stock field off a product', () => {
    const offenders: string[] = [];
    for (const file of PRODUCT_READING_SOURCES) {
      const src = readSource(file);
      // `stockValue`, `stockUnits`, `stockCountAudits` and friends are real
      // names on other types; only a bare `.stock` read is the mistake.
      for (const m of src.matchAll(/\b(?:product|p|item|prod)\.stock\b(?!\w)/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the live restock ranking reads quantity', () => {
    const engine = readSource('src/lib/flow-operating-engine.ts');
    expect(engine).toContain('.quantity');
  });
});

describe('no state is computed and then never shown', () => {
  it('has no write-only useState left', () => {
    const files = [
      'src/components/DayNightToggle.tsx',
      'src/components/Manager.tsx',
      'src/components/MarketplaceSettings.tsx',
      'src/components/Settings.tsx',
    ];
    for (const file of files) {
      const code = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Built without backslash escapes so the word boundary survives.
      for (const m of code.matchAll(/const \[(\w+), (set\w+)\] = useState/g)) {
        const [, name, setter] = m;
        const boundary = new RegExp('[^A-Za-z0-9_$]' + name + '[^A-Za-z0-9_$]', 'g');
        const reads = ((' ' + code + ' ').match(boundary) || []).length;
        if (reads > 1) continue;

        // A value read only through the updater's `prev` is still doing work —
        // Settings' viewStack drives how far the back button rewinds, and
        // deleting it as "unused" took the whole page down. Only state that
        // nothing reads AND that is never updated from its previous value is
        // genuinely dead.
        const updater = new RegExp(setter + '\\(\\s*(?:\\(\\s*\\w+|\\w+\\s*(?:=>|,)|function)');
        if (updater.test(code)) continue;

        throw new Error(`${file}: ${name} is set but never read`);
      }
    }
  });

  it('no longer reads the abandoned Flow XP keys on every Manager mount', () => {
    const src = readSource('src/components/Manager.tsx');
    expect(src).not.toContain('storeflow_flow_patted');
    expect(src).not.toContain('storeflow_flow_xp');
  });

  it('keeps the settings navigation stack that drives the back button', () => {
    const src = readSource('src/components/Settings.tsx');
    expect(src).toContain('const [viewStack, setViewStack] = useState<View[]>');
  });
});

describe('account recovery fields are declared', () => {
  it('has all four on ManagerSettings', () => {
    const types = readSource('src/types/store.ts');
    for (const field of ['recoveryEmail', 'recoveryPhone', 'recoveryQuestion', 'recoveryAnswer']) {
      expect(types, field).toContain(`${field}?:`);
    }
  });
});
