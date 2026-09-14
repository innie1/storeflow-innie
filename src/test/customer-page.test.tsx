import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import Customers from '@/components/Customers';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { readSource } from './helpers/source';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * Tapping a customer opens their page.
 *
 * It used to open a short summary under the row - what they had spent, what
 * they owed - with none of the bundles behind the numbers. Asked for from the
 * shop: see the list of their records, and how they affect the shop.
 */

const musa = {
  id: 'c1', name: 'Musa Bello', phone: '08011111111', totalPurchases: 0, outstandingDebt: 0,
  purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0,
};
const kola = {
  id: 'c2', name: 'Kola Ade', phone: '08044444444', totalPurchases: 7000, outstandingDebt: 0,
  purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0,
};

function shop(): StoreData {
  localStorage.setItem(laundryLocalStorageKey('CP001'), JSON.stringify([{
    clientRef: 'r1', accessCode: 'CP001', tagCode: 'AAAAA1', customerId: 'c1', customerName: 'Musa Bello', customerPhone: '08011111111',
    garments: [{ garmentType: 'Shirt', quantity: 2, unitPrice: 500, subtotal: 1000 }], serviceId: 's1', serviceName: 'Wash & Iron',
    pricing: 'per_item', billingQuantity: 2, total: 1000, pieceCount: 2, garmentSummary: '2 Shirt', workflowStage: 'washing',
    createdAt: new Date().toISOString(), syncStatus: 'pending',
  }]));
  return {
    storeName: 'Wash', accessCode: 'CP001', storeType: 'laundry', products: [], expenses: [], customers: [musa, kola],
    sales: [{ id: 'p1', productId: 's1', productName: 'Wash', quantity: 1, unitPrice: 400, total: 400, profit: 400,
      date: new Date().toISOString(), pendingPaymentId: 'laundry-r1', channel: 'in_store' }],
    pendingPayments: [{ id: 'laundry-r1', customerId: 'c1', customerName: 'Musa Bello', customerPhone: '08011111111', items: [],
      total: 1000, paid: 400, balance: 600, createdAt: new Date().toISOString(), status: 'pending', events: [] }],
    createdAt: new Date(0).toISOString(),
  } as unknown as StoreData;
}

function openMusa(role: string) {
  render(<Customers store={shop()} onUpdate={() => {}} orders={[]} currentUser={{ role }} />);
  fireEvent.click(screen.getByRole('button', { name: /Musa Bello/ }));
  return screen.getByRole('dialog', { name: 'Musa Bello' });
}

afterEach(() => { cleanup(); localStorage.clear(); });

describe("a customer's page", () => {
  it('opens on a tap, with their bundles', () => {
    const page = openMusa('owner');
    expect(within(page).getByText('Their bundles')).toBeTruthy();
    expect(within(page).getByText('AAAAA1')).toBeTruthy();
    expect(within(page).getByText(/owes ₦600/)).toBeTruthy();
  });

  it('does not say nothing was bought, above the bundles they brought', () => {
    // Found on the running app: the purchase rhythm, which knows nothing of
    // bundles, said "No purchase recorded yet" for a customer with two.
    const page = openMusa('owner');
    expect(within(page).queryByText('No purchase recorded yet.')).toBeNull();
    expect(within(page).getByText(/2 pieces brought in/)).toBeTruthy();
  });

  it('shows the owner what they brought in and what they mean to the shop', () => {
    const page = openMusa('owner');
    expect(within(page).getByText('Brought in')).toBeTruthy();
    expect(within(page).getByText('₦400')).toBeTruthy();
    expect(within(page).getByText(/of what you received in the last 90 days/)).toBeTruthy();
  });

  it('shows a worker the bundles and what is owed, but not the takings', () => {
    const page = openMusa('attendant');
    expect(within(page).getByText('AAAAA1')).toBeTruthy();
    expect(within(page).getByText('Owes now')).toBeTruthy();
    expect(within(page).queryByText('Brought in')).toBeNull();
    expect(within(page).queryByText(/of what you received/)).toBeNull();
  });

  it('goes back to the list', () => {
    openMusa('owner');
    fireEvent.click(screen.getByLabelText('Back to customers'));
    expect(screen.queryByRole('dialog', { name: 'Musa Bello' })).toBeNull();
  });
});

describe('the list itself', () => {
  it("does not show a worker what a customer has spent", () => {
    render(<Customers store={shop()} onUpdate={() => {}} currentUser={{ role: 'attendant' }} />);
    expect(screen.queryByText('₦7,000')).toBeNull();
  });

  it('still shows the owner', () => {
    render(<Customers store={shop()} onUpdate={() => {}} currentUser={{ role: 'owner' }} />);
    expect(screen.getByText('₦7,000')).toBeTruthy();
  });

  it('is given the cloud bundles and who is looking', () => {
    expect(readSource('src/pages/Index.tsx')).toContain('<Customers store={store} onUpdate={setStore} orders={orders} currentUser={currentUser} />');
  });
});
