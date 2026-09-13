import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SalesHistory from '@/components/SalesHistory';
import type { StoreData } from '@/types/store';
vi.mock('@/lib/store-data', () => ({ getTrash: () => [], clearSales: vi.fn(), deleteSale: vi.fn(), deleteExpense: vi.fn() }));
vi.mock('@/lib/export-data', () => ({ exportHistoryCSV: vi.fn(), exportHistoryPDF: vi.fn() }));
vi.mock('@/components/SaleReceipt', () => ({ default: () => <div>Private receipt</div> }));
vi.mock('@/components/RecentlyDeleted', () => ({ default: () => null }));
const store = {
  sales: [{ id: 'sale-1', productName: 'Soap', quantity: 2, unitPrice: 451, total: 902, date: '2026-09-12', channel: 'in_store' }],
  restocks: [{ id: 'restock-1', productId: 'p1', productName: 'Towels', quantity: 3, costPrice: 731, total: 2193, date: '2026-09-12' }],
  expenses: [],
} as unknown as StoreData;
afterEach(cleanup);
describe('Sales History financial access', () => {
  it.each(['supervisor', 'cashier', 'attendant'])('keeps %s history operational without exposing prices or exports', role => {
    const { container } = render(<SalesHistory store={store} onUpdate={vi.fn()} currentUser={{ role }} />);
    expect(screen.getByText('Soap')).toBeTruthy();
    expect(screen.getByText('Towels')).toBeTruthy();
    expect(container.textContent).not.toContain('₦');
    expect(screen.queryByTitle('Export CSV')).toBeNull();
    expect(screen.queryByTitle('Export PDF')).toBeNull();
    expect(screen.queryByText('Clear Sales')).toBeNull();
    fireEvent.click(screen.getByText('Soap'));
    expect(screen.queryByText('Private receipt')).toBeNull();
    fireEvent.click(screen.getByText('Towels'));
    expect(screen.queryByText('Restock details')).toBeNull();
  });
  it('preserves owner financial views and closes an open receipt when permissions change', () => {
    const { rerender, container } = render(<SalesHistory store={store} onUpdate={vi.fn()} currentUser={{ role: 'owner' }} />);
    expect(screen.getByTitle('Export CSV')).toBeTruthy();
    expect(container.textContent).toContain('₦');
    fireEvent.click(screen.getByText('Soap'));
    expect(screen.getByText('Private receipt')).toBeTruthy();
    rerender(<SalesHistory store={store} onUpdate={vi.fn()} currentUser={{ role: 'supervisor' }} />);
    expect(screen.queryByText('Private receipt')).toBeNull();
    expect(container.textContent).not.toContain('₦');
  });
});
