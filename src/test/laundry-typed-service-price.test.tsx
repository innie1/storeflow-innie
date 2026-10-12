import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup';
import { publishLaundryPricingToTemplate } from '@/lib/laundry-pricing';
import { defaultGarmentPrice } from '@/lib/laundry-intake';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('@/lib/store-data', async () => {
  const actual = await vi.importActual<typeof import('@/lib/store-data')>('@/lib/store-data');
  return { ...actual, saveStore: vi.fn() };
});
vi.mock('@/lib/marketplace-publish', () => ({ publishStorefrontToCloud: () => Promise.resolve() }));

/**
 * The owner's rule: a price typed for a new service is the price of every
 * item - no made-up prices for some of them - and then the shop is asked
 * whether that is the price for everything or whether to set each one. Only
 * a price left empty starts from the usual going rates.
 */

const GARMENTS = ['Shirt', 'Trousers', 'Large Duvet', 'Agbada'];

function laundryStore(): StoreData {
  return publishLaundryPricingToTemplate({
    id: 'store-1', storeId: 'SF-WSH001', accessCode: 'ABC123', storeName: 'Washlie', storeType: 'laundry',
    products: [{
      id: 'full', name: 'Full service', category: 'Service', costPrice: 0, sellingPrice: 500,
      quantity: 999999, isService: true, servicePricing: 'per_piece', turnaround: '48 hours',
    }],
    laundryPricing: { version: 1, garmentTypes: GARMENTS, matrix: { full: { Shirt: 500, Trousers: 700, 'Large Duvet': 2500, Agbada: 1500 } } },
    sales: [], createdAt: new Date(0).toISOString(),
  } as any);
}

let latest: StoreData;
function Harness() {
  const [store, setStore] = useState<StoreData>(laundryStore);
  latest = store;
  return <LaundryPricingSetup store={store} onUpdate={next => { latest = next; setStore(next); }} currentUser={{ name: 'Owner', role: 'owner' }} />;
}

const rowFor = (name: string) => {
  const service = (latest.products || []).find(product => product.name === name)!;
  return (latest as any).laundryPricing.matrix[String(service.id)] as Record<string, number>;
};

function addService(name: string, price: string) {
  fireEvent.click(document.querySelector('[data-guide="add-service"]') as HTMLElement);
  fireEvent.change(screen.getByPlaceholderText('Or type your own'), { target: { value: name } });
  fireEvent.change(screen.getAllByPlaceholderText('0').at(-1)!, { target: { value: price } });
  fireEvent.click(screen.getByRole('button', { name: /Save Service/ }));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('a new per-item service with a typed price', () => {
  it('puts that price on every item - none of the usual rates - and asks', () => {
    render(<Harness />);
    addService('Steam Press', '500');
    const row = rowFor('Steam Press');
    for (const garment of GARMENTS) expect(row[garment]).toBe(500);
    expect(defaultGarmentPrice('Large Duvet')).not.toBe(500);
    const dialog = screen.getByRole('dialog', { name: 'Price for everything?' });
    expect(dialog.textContent).toContain('Is ₦500 the price for everything?');
  });

  it('"Yes" keeps ₦500 on everything', () => {
    render(<Harness />);
    addService('Steam Press', '500');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, ₦500 for everything' }));
    expect(screen.queryByRole('dialog', { name: 'Price for everything?' })).toBeNull();
    expect(Object.values(rowFor('Steam Press'))).toEqual([500, 500, 500, 500]);
  });

  it('"No" goes through each item, starting from ₦500', () => {
    render(<Harness />);
    addService('Steam Press', '500');
    fireEvent.click(screen.getByRole('button', { name: 'No, let me set each price' }));
    expect(screen.queryByRole('dialog', { name: 'Price for everything?' })).toBeNull();
    const run = screen.getByRole('dialog', { name: 'Set prices' });
    expect(within(run).getByText('Steam Press')).toBeTruthy();
    expect(within(run).getByDisplayValue('500')).toBeTruthy();
  });
});

describe('a price left empty', () => {
  it('starts from the usual price for each item, and asks nothing', () => {
    render(<Harness />);
    addService('Wash Only', '');
    const row = rowFor('Wash Only');
    expect(row.Shirt).toBe(defaultGarmentPrice('Shirt'));
    expect(row['Large Duvet']).toBe(defaultGarmentPrice('Large Duvet'));
    expect(screen.queryByRole('dialog', { name: 'Price for everything?' })).toBeNull();
  });
});

describe('changing the price of a service that already has item prices', () => {
  function editTo(price: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Edit Full service' }));
    fireEvent.change(screen.getAllByPlaceholderText('0').at(-1)!, { target: { value: price } });
    fireEvent.click(screen.getByRole('button', { name: /Save Service/ }));
  }

  it('leaves the item prices alone until the shop says otherwise', () => {
    render(<Harness />);
    editTo('600');
    expect(rowFor('Full service')).toMatchObject({ Shirt: 500, Trousers: 700, 'Large Duvet': 2500 });
    fireEvent.click(screen.getByRole('button', { name: 'Keep my item prices' }));
    expect(rowFor('Full service')).toMatchObject({ Shirt: 500, Trousers: 700, 'Large Duvet': 2500 });
  });

  it('or puts the new price on everything', () => {
    render(<Harness />);
    editTo('600');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, ₦600 for everything' }));
    expect(Object.values(rowFor('Full service'))).toEqual([600, 600, 600, 600]);
  });
});
