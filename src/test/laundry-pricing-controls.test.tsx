import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup';
import { publishLaundryPricingToTemplate } from '@/lib/laundry-pricing';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('@/lib/store-data', async () => {
  const actual = await vi.importActual<typeof import('@/lib/store-data')>('@/lib/store-data');
  return { ...actual, saveStore: vi.fn() };
});

function laundryStore() {
  return publishLaundryPricingToTemplate({
    id: '212f2223-24ce-4979-9a15-b1a75ee155e8',
    storeId: 'SF-5R9R2F',
    accessCode: 'AMZXWE',
    storeName: 'Washlie',
    storeType: 'laundry',
    products: [{
      id: 'full', name: 'Full service', category: 'Service', costPrice: 0,
      sellingPrice: 500, quantity: 999999, isService: true,
      servicePricing: 'per_piece', turnaround: '48 hours',
    }],
    laundryPricing: {
      version: 1,
      garmentTypes: ['Shirt', 'Trouser'],
      matrix: { full: { Shirt: 500, Trouser: 700 } },
    },
    sales: [],
    createdAt: new Date(0).toISOString(),
  } as any);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('laundry garment controls', () => {
  it('opens the editor and saves a renamed garment with its price', () => {
    const onUpdate = vi.fn();
    render(<LaundryPricingSetup store={laundryStore()} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Shirt' }));
    const input = screen.getByRole('textbox', { name: 'Edit Shirt name' });
    fireEvent.change(input, { target: { value: 'Work Shirt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Shirt name' }));

    const updated = onUpdate.mock.calls.at(-1)?.[0] as any;
    expect(updated.laundryPricing.garmentTypes).toEqual(['Work Shirt', 'Trouser']);
    expect(updated.laundryPricing.matrix.full['Work Shirt']).toBe(500);
    expect(updated.laundryPricing.matrix.full.Shirt).toBeUndefined();
  });

  it('asks for confirmation and removes the selected garment only', () => {
    const onUpdate = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LaundryPricingSetup store={laundryStore()} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Shirt' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Existing laundry records will not be changed'));
    const updated = onUpdate.mock.calls.at(-1)?.[0] as any;
    expect(updated.laundryPricing.garmentTypes).toEqual(['Trouser']);
    expect(updated.laundryPricing.matrix.full.Shirt).toBeUndefined();
    expect(updated.laundryPricing.matrix.full.Trouser).toBe(700);
  });
});
