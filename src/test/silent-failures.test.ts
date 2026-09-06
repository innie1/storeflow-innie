import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import type { Product, Sale, StoreData } from '@/types/store';

/**
 * A group of faults that all shared one shape: the app knew something had gone
 * wrong, or held a value it had computed, and then showed the merchant nothing.
 */

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
  it('uses quantity, not the stock field that does not exist', () => {
    const src = readSource('src/lib/flow-finance.ts');
    expect(src).not.toContain('n(product.stock)');
    expect(src).toContain('n(product.quantity)');
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
      for (const m of code.matchAll(/const \[(\w+), set\w+\] = useState/g)) {
        const name = m[1];
        // Built without backslash escapes so the word boundary survives.
        const boundary = new RegExp('[^A-Za-z0-9_$]' + name + '[^A-Za-z0-9_$]', 'g');
        const reads = ((' ' + code + ' ').match(boundary) || []).length;
        expect(reads, `${file}: ${name} is set but never read`).toBeGreaterThan(1);
      }
    }
  });

  it('no longer reads the abandoned Flow XP keys on every Manager mount', () => {
    const src = readSource('src/components/Manager.tsx');
    expect(src).not.toContain('storeflow_flow_patted');
    expect(src).not.toContain('storeflow_flow_xp');
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
