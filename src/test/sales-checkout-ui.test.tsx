import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sales from '@/components/Sales';
import PendingPayments from '@/components/PendingPayments';
import { createStore, recordCheckout } from '@/lib/store-data';
import { printReceipt } from '@/lib/print-engine';
import type { StoreData } from '@/types/store';
vi.mock('@/lib/print-engine', () => ({ printReceipt: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/sound-effects', () => ({ playSoldSound: vi.fn(), playQuickAddSound: vi.fn() }));
vi.mock('@/lib/milestones', () => ({ checkNewMilestone: () => null, markMilestoneReached: (s: StoreData) => s }));
vi.mock('@/components/SaleReceipt', () => ({ default: () => null }));
function shop(): StoreData {
  const s = createStore('UI shop', 'retail');
  return { ...s, storeId: undefined, products: [{ id: 'p', name: 'Soap', costPrice: 600, sellingPrice: 1000, quantity: 10, category: 'Goods' }], sales: [], cashBalance: 0, bankBalance: 0, managerSettings: { ...s.managerSettings!, autoBackupsEnabled: false, multiDeviceSync: false, autoPrintReceipt: true, autoDiscountEnabled: false } };
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);
describe('checkout screens', () => {
  it('prints a discount once and prevents duplicate submission', async () => {
    const s = shop(); const onUpdate = vi.fn();
    render(<Sales store={s} onUpdate={onUpdate} managerSettings={s.managerSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Instant sell' }));
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '100' } });
    const save = screen.getByRole('button', { name: /Save Sale/ });
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));
    expect(printReceipt).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 1000, discount: 100, total: 900, paid: 900, balance: 0 }), expect.anything(), expect.anything());
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
  it('allows the sell button at zero stock when backorders are enabled', () => {
    const s = shop(); s.products[0].quantity = 0; s.managerSettings!.backorderSellingEnabled = true;
    render(<Sales store={s} onUpdate={vi.fn()} managerSettings={s.managerSettings} />);
    expect(screen.getByRole('button', { name: 'Instant sell' })).toBeEnabled();
  });
  it('asks for a payment method before marking debt paid', () => {
    const s = recordCheckout(shop(), [{ productId: 'p', quantity: 1 }], { paid: 200, method: 'cash', customerName: 'Ada' }).store;
    const onUpdate = vi.fn(); render(<PendingPayments store={s} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /✓ Paid/ }));
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'TRANSFER' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(onUpdate.mock.calls[0][0].bankBalance).toBe(800);
    expect(onUpdate.mock.calls[0][0].cashBalance).toBe(200);
  });
});
