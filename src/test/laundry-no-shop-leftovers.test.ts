import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { generateAdvice, generateNotifications, seasonNotice } from '@/lib/manager-intel';
import { isBusinessTabAllowed } from '@/lib/business-runtime';
import { readSource } from './helpers/source';

/*
 * A laundry keeps no stock, has no suppliers and no sales cart. These are the
 * leftovers from the shop version of the app that a laundry was still shown,
 * and the season, which is a notice now rather than a card.
 */

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-L', storeName: 'Shine', accessCode: 'LNDRY1',
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], pendingPayments: [],
  managerSettings: { enabled: true, businessAdvice: true },
  createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
  ...over,
} as unknown as StoreData);

describe('the season is a notice', () => {
  it('is raised once for the season, with what it means for drying', () => {
    const note = seasonNotice(laundry(), '2026-11-15T09:00:00.000Z')!;
    expect(note.id).toBe('season-harmattan-season-2026');
    expect(note.title).toBe('Harmattan Season (Nov–Feb)');
    expect(note.description).toContain('Clothes dry fast');
  });

  it('keeps one id from November to February, so January does not raise it again', () => {
    expect(seasonNotice(laundry(), '2027-01-20T09:00:00.000Z')!.id).toBe('season-harmattan-season-2026');
  });

  it('raises a new one when the season changes', () => {
    expect(seasonNotice(laundry(), '2027-06-01T09:00:00.000Z')!.id).toBe('season-rainy-season-2027');
  });

  it('respects the switch that turned the old card off', () => {
    expect(seasonNotice(laundry({ managerSettings: { enabled: true, weatherImpactEnabled: false } } as any), '2026-11-15T09:00:00.000Z')).toBeNull();
  });

  it('is in the bell, and no longer a card on Flow', () => {
    expect(generateNotifications(laundry()).some(note => note.id.startsWith('season-'))).toBe(true);
    expect(readSource('src/components/Manager.tsx')).not.toContain('Seasonal &amp; Climate Insights');
  });
});

describe('Flow opens the way the owner asked', () => {
  const overview = readSource('src/components/manager/OverviewTab.tsx');

  it('leads with Store Health, then the month', () => {
    expect(overview.indexOf('<StoreHealthCard')).toBeGreaterThan(0);
    expect(overview.indexOf('<StoreHealthCard')).toBeLessThan(overview.indexOf('<BreakEvenCard'));
  });

  it('has no "do this next" card on the Overview', () => {
    expect(overview).not.toContain('Do this next');
    expect(overview).not.toContain('Next Best Action');
  });

  it('opens the busy-times chart on the week', () => {
    expect(readSource('src/components/manager/MostActivePeriodsCard.tsx')).toContain("useState<ActivityRange>('7d')");
  });
});

describe('nothing from the shop version', () => {
  it('has no Marketplace, and the menu no longer offers a tab the trade cannot open', () => {
    expect(isBusinessTabAllowed(laundry(), 'marketplace')).toBe(false);
    expect(readSource('src/pages/index/useIndexScreen.tsx'))
      .toContain('return isTabAllowed(directTab, currentUser) && isBusinessTabAllowed(store, directTab);');
  });

  it('gets savings advice that does not mention restocking', () => {
    const save = generateAdvice(laundry(), []).find(item => item.id === 'save');
    if (save) expect(save.detail).not.toMatch(/restock/i);
  });

  it('is not offered suppliers, purchase orders, a Restocks filter or barcode ordering', () => {
    const advice = readSource('src/components/manager/AdviceTab.tsx');
    expect(advice).toContain('{!serviceShop && <SupplierPanel />}');
    expect(advice).toMatch(/\{!serviceShop && \(\s*<button\s*onClick=\{\(\) => setPoListOpen\(true\)\}/);
    expect(readSource('src/components/CommunicationCenter.tsx')).toContain("hasBusinessModule(store, 'suppliers') && navItem('suppliers'");
    expect(readSource('src/components/SalesHistory.tsx')).toContain("isServiceFirstBusiness(store) ? [] : [{ key: 'restocks'");
    const storefront = readSource('src/components/MarketplaceSettings.tsx');
    for (const label of ['Accept Scan & Buy Orders', 'Accept In-Store Scan Orders', 'Show Low-Stock Warnings to Customers']) {
      expect(storefront).toContain(`{!serviceShop && <ToggleRow\n                  label="${label}"`);
    }
  });

  it('is not sent to a page about the shopping cart', () => {
    expect(readSource('src/components/settings/views/HomeView.tsx')).toContain("{hasBusinessModule(store, 'sales') && <SettingTile");
  });
});
