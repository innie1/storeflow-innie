import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import MyPieceWork from '@/components/laundry/MyPieceWork';
import { readSource } from './helpers/source';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * Record Work was only a button on the owner's Staff page, which a casual
 * worker cannot open. Asked for from the shop: a casual worker records their
 * own work - the task first, then real customer bundles that still need it,
 * never more pieces than the bundle holds - against their own name, so their
 * earnings add up without anybody typing them.
 */

const ironer = {
  id: 'w1', name: 'Tunde', pin: '1111', role: 'attendant', payType: 'per_piece',
  pieceRates: [{ task: 'ironing', garmentType: '*', rate: 50 }],
  permissions: { sales: true, inventory: false, reports: false, settings: false },
};
const salaried = { ...ironer, id: 'w2', name: 'Joy', payType: 'monthly', pieceRates: [] };

const shop = (): StoreData => ({
  storeName: 'Wash', accessCode: 'MPW001', storeType: 'laundry', products: [], sales: [], expenses: [],
  customers: [], pendingPayments: [], pieceWork: [], staffMembers: [ironer, salaried],
  createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

// Taken in on the counter phone, so on this phone it exists only in the cloud.
const counterBundle = {
  id: 'o1', client_ref: 'r9', order_number: 'LT-900', customer_name: 'Ada', workflow_stage: 'washing',
  business_type: 'laundry', order_kind: 'service',
  service_metadata: {
    source: 'walk_in_laundry', intake_type: 'physical_store', client_ref: 'r9', tag_code: 'LT-900',
    garment_lines: [{ garmentType: 'Shirt', quantity: 4 }],
  },
  order_items: [{ item_name: 'Shirt', quantity: 4, metadata: { source: 'walk_in_laundry' } }],
};

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("a per-piece worker's home screen", () => {
  it('offers Record my work and My earnings', () => {
    render(<MyPieceWork store={shop()} orders={[]} currentUser={{ id: 'w1', role: 'attendant' }} onUpdate={() => {}} />);
    expect(screen.getByRole('button', { name: /Record my work/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /My earnings/ })).toBeTruthy();
  });

  it('shows nothing to a worker on a monthly wage, or to the owner', () => {
    const { container, rerender } = render(
      <MyPieceWork store={shop()} currentUser={{ id: 'w2', role: 'attendant' }} onUpdate={() => {}} />,
    );
    expect(container.textContent).toBe('');
    rerender(<MyPieceWork store={shop()} currentUser={{ role: 'owner' }} onUpdate={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('starts from the task, then offers real bundles, including one booked on another phone', () => {
    render(<MyPieceWork store={shop()} orders={[counterBundle]} currentUser={{ id: 'w1', role: 'attendant' }} onUpdate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Record my work/ }));
    expect(screen.getByText('What did you do?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ironing' }));
    expect(screen.getByText('LT-900')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
  });

  it("records the claim against that worker, capped at the bundle, waiting for the owner", () => {
    const onUpdate = vi.fn();
    render(<MyPieceWork store={shop()} orders={[counterBundle]} currentUser={{ id: 'w1', role: 'attendant' }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Record my work/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ironing' }));
    fireEvent.click(screen.getByText('LT-900'));
    const more = screen.getByLabelText('One more Shirt');
    for (let i = 0; i < 6; i++) fireEvent.click(more);
    fireEvent.click(screen.getByRole('button', { name: /Send for approval/ }));

    const saved = onUpdate.mock.calls.at(-1)![0] as StoreData;
    expect(saved.pieceWork).toHaveLength(1);
    expect(saved.pieceWork![0]).toMatchObject({
      workerId: 'w1', clientRef: 'r9', garmentType: 'Shirt', quantity: 4, amount: 200, approved: false,
    });
  });

  it('counts every tap, even three before the screen redraws', () => {
    // Found on a phone-sized screen: each tap added one to the count the
    // screen was drawn with, so quick taps counted once.
    const onUpdate = vi.fn();
    render(<MyPieceWork store={shop()} orders={[counterBundle]} currentUser={{ id: 'w1', role: 'attendant' }} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /Record my work/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ironing' }));
    fireEvent.click(screen.getByText('LT-900'));
    const more = screen.getByLabelText('One more Shirt') as HTMLButtonElement;
    act(() => { more.click(); more.click(); more.click(); });
    fireEvent.click(screen.getByRole('button', { name: /Send for approval/ }));
    expect((onUpdate.mock.calls.at(-1)![0] as StoreData).pieceWork![0].quantity).toBe(3);
  });

  it('shows a worker their own pay, but never lets them approve or pay it', () => {
    const store = {
      ...shop(),
      pieceWork: [{
        id: 'pw1', workerId: 'w1', workerName: 'Tunde', clientRef: 'r9', tagCode: 'LT-900', customerName: 'Ada',
        task: 'ironing', garmentType: 'Shirt', quantity: 2, rate: 50, amount: 100, at: new Date().toISOString(), approved: false,
      }],
    } as unknown as StoreData;
    render(<MyPieceWork store={store} currentUser={{ id: 'w1', role: 'attendant' }} onUpdate={() => {}} />);

    expect(screen.getByText(/1 waiting for approval/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /My earnings/ }));
    expect(screen.getByText('₦100 more is waiting for the owner to check it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pay' })).toBeNull();
  });
});

describe('wired in once', () => {
  const index = readSource('src/pages/Index.tsx');

  it('above both the full home screen and the simple one', () => {
    // The home screen is a case in screenFor now, not one of thirty-one
    // hidden divs; the card still sits above whichever home screen is used.
    const tab = index.indexOf("case 'dashboard':");
    const simple = index.indexOf("{store.uiMode === 'simple' ? (", tab);
    const card = index.indexOf('<MyPieceWork store={store} orders={orders} currentUser={currentUser} onUpdate={setStore} />', tab);
    expect(tab).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(tab);
    expect(card).toBeLessThan(simple);
  });

  it("gives the owner's Record work the same bundles", () => {
    expect(index).toContain('<StaffManagement store={store} onUpdate={setStore} currentUser={currentUser} orders={orders} />');
    expect(readSource('src/components/StaffManagement.tsx')).toContain('orders={orders}');
  });
});
