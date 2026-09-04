import { beforeEach, describe, expect, it } from 'vitest';
import { countOccurrences, readSource } from './helpers/source';
import {
  LAUNDRY_INTAKE_OPEN_SIGNAL,
  LAUNDRY_INTAKE_OPEN_STORAGE,
  requestLaundryWorkspace,
} from '@/lib/laundry-workspace';

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
