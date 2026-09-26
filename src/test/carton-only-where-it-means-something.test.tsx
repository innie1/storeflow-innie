import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Sales from '@/components/Sales';
import { createStore } from '@/lib/store-data';
import type { StoreData } from '@/types/store';

vi.mock('@/lib/print-engine', () => ({ printReceipt: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/sound-effects', () => ({ playSoldSound: vi.fn(), playQuickAddSound: vi.fn() }));
vi.mock('@/lib/milestones', () => ({ checkNewMilestone: () => null, markMilestoneReached: (s: StoreData) => s }));
vi.mock('@/components/SaleReceipt', () => ({ default: () => null }));

/**
 * "The wholesale and retail shop is wrong."
 *
 * The Wholesale / Retail switch only changes the price of a product sold both
 * by the carton and by the piece. A shop whose products are each sold one way
 * - a 1kg bag of rice, a tin of milk - still had the switch at the top of the
 * till, behind a store code, doing nothing; and every one of its products was
 * labelled "Carton" at checkout.
 */

const plain = { id: 'rice', name: 'Rice 1kg', costPrice: 1200, sellingPrice: 1500, quantity: 20, category: 'Food' };
const both = {
  id: 'indomie', name: 'Indomie', costPrice: 8000, sellingPrice: 9800, quantity: 5, category: 'Food',
  isCartonSingleEnabled: true, singlesPerCarton: 40, singleSellingPrice: 260,
};

function shop(products: object[]): StoreData {
  const s = createStore('Corner Provisions', 'retail');
  return {
    ...s, storeId: undefined, products, sales: [], cashBalance: 0, bankBalance: 0,
    managerSettings: { ...s.managerSettings!, autoBackupsEnabled: false, multiDeviceSync: false, autoDiscountEnabled: false },
  } as unknown as StoreData;
}

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe('the Wholesale / Retail switch', () => {
  it('is not shown when nothing is sold both by the carton and by the piece', () => {
    const s = shop([plain]);
    render(<Sales store={s} onUpdate={vi.fn()} managerSettings={s.managerSettings} />);
    expect(screen.queryByText(/Wholesale Mode/)).toBeNull();
    expect(screen.queryByText(/Retail Mode/)).toBeNull();
  });

  it('is shown once a product is sold both ways', () => {
    const s = shop([plain, both]);
    render(<Sales store={s} onUpdate={vi.fn()} managerSettings={s.managerSettings} />);
    expect(screen.getByText(/Wholesale Mode/)).toBeTruthy();
    expect(screen.getByText(/Retail Mode/)).toBeTruthy();
  });

  it('ignores a carton-and-piece product that has been discontinued', () => {
    const s = shop([plain, { ...both, discontinued: true }]);
    render(<Sales store={s} onUpdate={vi.fn()} managerSettings={s.managerSettings} />);
    expect(screen.queryByText(/Wholesale Mode/)).toBeNull();
  });
});

describe('the checkout line', () => {
  it('does not call a product sold one way a carton', () => {
    const s = shop([plain]);
    render(<Sales store={s} onUpdate={vi.fn()} managerSettings={s.managerSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Instant sell' }));
    const summary = screen.getByText('Order Summary').parentElement!;
    expect(within(summary).getByText('Rice 1kg')).toBeTruthy();
    expect(within(summary).queryByText(/Carton/)).toBeNull();
  });

  it('still lets a carton-and-piece product switch between the two', () => {
    const s = shop([both]);
    render(<Sales store={s} onUpdate={vi.fn()} managerSettings={s.managerSettings} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Instant sell' })[0]);
    const summary = screen.getByText('Order Summary').parentElement!;
    expect(within(summary).getByTitle('Click to toggle Carton/Single')).toBeTruthy();
  });
});
