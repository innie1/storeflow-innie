import { describe, expect, it } from 'vitest';
import { BUSINESS_TEMPLATES } from '@/lib/business-templates';
import { getBusinessTemplate, getOrderProgressText, isBusinessTabAllowed, isServiceFirstBusiness, resolveBusinessType, shouldRunRetailRestockEngine } from '@/lib/business-runtime';

const store = (storeType: any, category: any = 'retail') => ({ storeType, category, storeName: 'Test Store' } as any);

describe('business isolation runtime', () => {
  it('uses storeType as the canonical business type and category only as fallback', () => {
    expect(resolveBusinessType(store('laundry', 'retail'))).toBe('laundry');
    expect(resolveBusinessType({ category: 'games' } as any)).toBe('games');
  });

  it('keeps laundry service-first and blocks retail-only supplier/restock surfaces', () => {
    const laundry = store('laundry');
    expect(isServiceFirstBusiness(laundry)).toBe(true);
    expect(isBusinessTabAllowed(laundry, 'inventory')).toBe(true);
    expect(isBusinessTabAllowed(laundry, 'suppliers')).toBe(false);
    expect(isBusinessTabAllowed(laundry, 'marketplace')).toBe(false);
    expect(shouldRunRetailRestockEngine(laundry)).toBe(false);
    expect(getOrderProgressText(laundry, 'Preparing')).toContain('being processed');
    expect(getOrderProgressText(laundry, 'Preparing')).not.toContain('prepared');
  });

  it('keeps provision retail inventory/sales/suppliers enabled', () => {
    const provision = store('provision');
    expect(isBusinessTabAllowed(provision, 'inventory')).toBe(true);
    expect(isBusinessTabAllowed(provision, 'sales')).toBe(true);
    expect(isBusinessTabAllowed(provision, 'suppliers')).toBe(true);
    expect(shouldRunRetailRestockEngine(provision)).toBe(true);
  });

  it('keeps gaming tabs exclusive to gaming stores', () => {
    expect(isBusinessTabAllowed(store('games', 'games'), 'games-dashboard')).toBe(true);
    expect(isBusinessTabAllowed(store('laundry'), 'games-dashboard')).toBe(false);
    expect(isBusinessTabAllowed(store('provision'), 'games-settings')).toBe(false);
  });

  it('derives capabilities from every registered business template', () => {
    for (const type of Object.keys(BUSINESS_TEMPLATES)) {
      const template = getBusinessTemplate(store(type));
      expect(template.type).toBe(type);
      if (!template.modules.includes('inventory')) {
        expect(shouldRunRetailRestockEngine(store(type))).toBe(false);
      }
    }
  });
});
