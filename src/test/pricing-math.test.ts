import { describe, expect, it } from 'vitest';
import { productMargin, productMarkup, describePricing } from '@/lib/pricing-math';
import { pricingAlerts } from '@/lib/manager-intel';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * "Margin" meant two different formulas depending on the screen.
 *
 * manager-intel, both dashboards and the marketplace intel divided profit by
 * COST — that is markup. SmartRestockEngine, the Sell screen, the buy list and
 * the Get Advice report divided by SELLING PRICE — that is margin. Both were
 * shown to the merchant under the same word, so on Rice 50kg (₦70,000 cost,
 * ₦87,500 selling) one screen said 25% and another said 20%.
 *
 * The formulas were not wrong. The pricing advice genuinely wants markup: every
 * price it suggests is cost × (1 + target). Only the naming was wrong, so the
 * names changed and the numbers did not.
 */

const rice = { sellingPrice: 87500, costPrice: 70000 };

describe('the two ratios are different, and named apart', () => {
  it('measures margin against the selling price', () => {
    expect(Math.round(productMargin(rice) * 100)).toBe(20);
  });

  it('measures markup against what was paid', () => {
    expect(Math.round(productMarkup(rice) * 100)).toBe(25);
  });

  it('never divides by zero', () => {
    expect(productMargin({ sellingPrice: 0, costPrice: 100 })).toBe(0);
    expect(productMarkup({ sellingPrice: 100, costPrice: 0 })).toBe(0);
  });

  it('reports both together so neither can be read as the other', () => {
    expect(describePricing(rice)).toBe('20% margin · 25% markup');
  });
});

describe('the pricing advice still behaves exactly as it did', () => {
  const store = (sellingPrice: number, costPrice: number): StoreData => ({
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: new Date(0).toISOString(), sales: [], expenses: [],
    products: [{ id: 'p', name: 'Tin', category: 'x', sellingPrice, costPrice, quantity: 10 } as any],
  } as StoreData);

  it('flags a product priced under a 25% markup, as before', () => {
    // 100 -> 110 is 10% on cost: under the 25% target, so underpriced.
    const alert = pricingAlerts(store(110, 100))[0];
    expect(alert.type).toBe('underpriced');
    expect(Math.round(alert.currentMarkup * 100)).toBe(10);
    // The suggestion is still cost x 1.25, rounded to the nearest 10.
    expect(alert.suggestedPrice).toBe(130);
  });

  it('still calls selling at or below cost a zero margin', () => {
    expect(pricingAlerts(store(90, 100))[0].type).toBe('zero_margin');
  });

  it('leaves a healthily priced product alone', () => {
    expect(pricingAlerts(store(130, 100))).toEqual([]);
  });
});

describe('no screen reports one ratio under the other name', () => {
  it('has no cost-based ratio left labelled as margin', () => {
    for (const file of [
      'src/lib/manager-intel.ts',
      'src/lib/flow-marketplace-intel.ts',
      'src/components/dashboards/AccountantDashboard.tsx',
      'src/components/dashboards/OwnerDashboard.tsx',
    ]) {
      const code = readSource(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${file} still divides profit by cost inline`)
        .not.toMatch(/sellingPrice - \w+\.costPrice\)\s*\/\s*\w+\.costPrice/);
    }
  });

  it('says markup where it means markup, to the merchant', () => {
    expect(readSource('src/components/Manager.tsx')).toContain('% on top of cost');
    expect(readSource('src/components/dashboards/AccountantDashboard.tsx')).toContain('% markup');
    expect(readSource('src/components/dashboards/OwnerDashboard.tsx')).toContain('% markup');
  });
});

describe('the product details sheet no longer carries the mascot', () => {
  it('has no Mascot left on the page', () => {
    expect(readSource('src/components/Inventory.tsx')).not.toContain('Mascot');
  });
});
