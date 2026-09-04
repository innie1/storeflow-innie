import { beforeEach, describe, expect, it } from 'vitest';
import { countOccurrences, readSource } from './helpers/source';
import {
  LAUNDRY_INTAKE_OPEN_SIGNAL,
  LAUNDRY_INTAKE_OPEN_STORAGE,
  requestLaundryWorkspace,
} from '@/lib/laundry-workspace';
import { LAUNDRY_SETTLED_STAGES, nextLaundryStage } from '@/lib/laundry-offline';
import { rankGarmentsByUsage } from '@/components/laundry/LaundryWalkInIntakeV2';

describe('laundry control regressions', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('opens Record Laundry even when the record workspace is already mounted', () => {
    let opens = 0;
    const listener = () => { opens += 1; };
    window.addEventListener(LAUNDRY_INTAKE_OPEN_SIGNAL, listener);

    requestLaundryWorkspace('record');
    requestLaundryWorkspace('record');

    expect(window.sessionStorage.getItem(LAUNDRY_INTAKE_OPEN_STORAGE)).toBe('1');
    expect(opens).toBe(2);
    window.removeEventListener(LAUNDRY_INTAKE_OPEN_SIGNAL, listener);
  });

  it('advances a laundry bundle one stage at a time and stops after collection', () => {
    // Powers the one-tap "Mark <next>" button on each record row.
    expect(nextLaundryStage('received')).toEqual({ id: 'washing', label: 'Washing' });
    expect(nextLaundryStage('washing')).toEqual({ id: 'drying', label: 'Drying' });
    expect(nextLaundryStage('folding')).toEqual({ id: 'ready', label: 'Ready' });
    expect(nextLaundryStage('ready')).toEqual({ id: 'collected', label: 'Collected' });
    expect(nextLaundryStage('collected')).toBeNull();
  });

  it('treats only ready and collected bundles as settled', () => {
    // Anything else is still work in progress, and can therefore run overdue.
    expect(LAUNDRY_SETTLED_STAGES).toEqual(['ready', 'collected']);
    expect(LAUNDRY_SETTLED_STAGES.includes('washing' as never)).toBe(false);
  });

  it('puts the clothing this shop records most at the top of the picker', () => {
    const priceListOrder = ['Shirt', 'Trouser', 'T-shirt', 'Nicker / Shorts', 'Gown / Dress', 'Skirt'];
    localStorage.setItem('storeflow_laundry_local_records_ZZTEST', JSON.stringify([
      { garments: [{ garmentType: 'Skirt', quantity: 9 }, { garmentType: 'Gown / Dress', quantity: 7 }] },
      { garments: [{ garmentType: 'Skirt', quantity: 6 }, { garmentType: 'Nicker / Shorts', quantity: 4 }] },
    ]));

    // Skirt (15) beats Gown / Dress (7) beats Nicker / Shorts (4); everything
    // never recorded keeps the merchant's own price-list order behind them.
    expect(rankGarmentsByUsage('ZZTEST', priceListOrder)).toEqual([
      'Skirt', 'Gown / Dress', 'Nicker / Shorts', 'Shirt', 'Trouser', 'T-shirt',
    ]);
  });

  it('leaves the price-list order alone for a shop with no history', () => {
    const priceListOrder = ['Shirt', 'Trouser', 'Skirt'];
    expect(rankGarmentsByUsage('NOHIST', priceListOrder)).toEqual(priceListOrder);
  });

  it('gives laundry pricing show/hide controls and stronger custom clothing handling', () => {
    const source = readSource('src/components/laundry/LaundryPricingSetup.tsx');
    expect(source).toContain('showGarmentPrices');
    expect(source).toContain("'Hide all'");
    expect(source).toContain("'Show all'");
    expect(source).toContain('added to every laundry treatment');
    expect(source).toContain('already in the price list');
    expect(source).toContain('laundry-garment-');
  });

  it('keeps the cloud business type aligned with the actual store type', () => {
    const source = readSource('src/lib/store-data.ts');
    expect(source).toContain("business_type: store.storeType || store.category || 'retail'");
  });

  it('mounts exactly one floating Flow Shirt entry point in the main app shell', () => {
    const source = readSource('src/pages/Index.tsx');
    expect(source).toContain("import FlowShirtFab from '@/components/FlowShirtFab';");
    expect(countOccurrences(source, '<FlowShirtFab')).toBe(1);
    expect(source).toContain(
      '<FlowShirtFab store={store} onUpdate={setStore} onNavigate={handleNavigate} currentUser={currentUser} />',
    );
  });
});
