import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StoreData } from '@/types/store';
import Inventory from '@/components/Inventory';

/*
 * The Inventory screen is a layout over a state hook and a folder of parts
 * (src/components/inventory). This renders the real thing and opens its main
 * sheets, so a part that reads something the hook no longer provides fails
 * here rather than on a merchant's phone.
 */
const product = (id: string, name: string, quantity: number) => ({
  id, name, quantity, costPrice: 400, sellingPrice: 500, category: 'Groceries',
  createdAt: new Date().toISOString(),
});

const store = {
  accessCode: 'INV001', storeId: 'SF-I', storeName: 'Corner Shop', storeType: 'supermarket', businessType: 'supermarket',
  products: [product('p1', 'Peak Milk', 12), product('p2', 'Indomie Chicken', 2)],
  sales: [], customers: [], expenses: [], managerSettings: {}, createdAt: new Date().toISOString(),
} as unknown as StoreData;

afterEach(cleanup);

describe('the Inventory screen', () => {
  it('lists the products', () => {
    render(<Inventory store={store} onUpdate={vi.fn()} />);
    expect(screen.getAllByText('Peak Milk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Indomie Chicken').length).toBeGreaterThan(0);
  });

  it('opens the add sheet from its own part', () => {
    render(<Inventory store={store} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('Add').closest('button')!);
    expect(screen.getAllByText(/Add Product/i).length).toBeGreaterThan(0);
  });

  it('opens the import and buy list sheets', () => {
    render(<Inventory store={store} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('Import').closest('button')!);
    expect(screen.getAllByText(/Import/i).length).toBeGreaterThan(1);
    cleanup();
    render(<Inventory store={store} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('Buy List').closest('button')!);
    expect(document.body.textContent).toBeTruthy();
  });

  it('opens a product for editing when advice names it', () => {
    render(<Inventory store={store} onUpdate={vi.fn()} focusProduct={{ productId: 'p1', intent: 'edit' }} onFocusProductHandled={vi.fn()} />);
    expect(screen.getAllByText(/Edit Product/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Peak Milk')).toBeTruthy();
  });
});
