import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mergeRecordFields, mergeRecordsById } from '@/lib/store-sync-guard';
import { addArrivedServiceChanges, approveServiceChange, canApproveServiceChanges, pendingServiceChanges, rejectServiceChange, serviceChangeLines } from '@/lib/service-changes';
import { inspectStoreRecords } from '@/lib/store-reconciliation';
import ServiceChangeApprovals from '@/components/laundry/ServiceChangeApprovals';
import type { ServiceChangeRequest, StoreData } from '@/types/store';

const owner = { name: 'Owner', role: 'owner' };

function shop(): StoreData {
  return {
    storeName: 'Washlie', accessCode: 'TEST01', createdAt: '2026-10-01T00:00:00Z',
    products: [{ id: 'iron', name: 'Ironing Only', isService: true, sellingPrice: 300, servicePricing: 'per_piece', quantity: 999999, costPrice: 0, units_sold: 5 } as any],
    sales: [], restocks: [], expenses: [], investments: [],
    laundryPricing: { version: 1, garmentTypes: ['Shirt', 'Pillowcase'], matrix: { iron: { Shirt: 200, Pillowcase: 300 } } },
  } as unknown as StoreData;
}

function request(over: Partial<ServiceChangeRequest> = {}): ServiceChangeRequest {
  return {
    id: 'sc_1', serviceId: 'iron', serviceName: 'Ironing Only',
    before: { garmentPrices: { Pillowcase: 300 } }, proposed: { garmentPrices: { Pillowcase: 250 } },
    _fromStaff: { staffId: 'destiny', name: 'Destiny', at: '2026-11-25T14:48:00Z' }, status: 'pending',
    ...over,
  };
}

describe('two phones changing different parts of one record', () => {
  // 25 Nov: the owner's phone moved the sales count; the manager's save stamped "edited".
  const was: any = { id: 'iron', name: 'Ironing Only', units_sold: 5, _editedByStaff: { at: '16 Nov' } };
  const now = { ...was, units_sold: 6 };
  const there = { ...was, _editedByStaff: { at: '25 Nov' } };

  it('keeps both', () => {
    expect(mergeRecordFields(was, now, there)).toEqual({ id: 'iron', name: 'Ironing Only', units_sold: 6, _editedByStaff: { at: '25 Nov' } });
    expect(mergeRecordsById([was], [now], [there], 'services')).toEqual([{ id: 'iron', name: 'Ironing Only', units_sold: 6, _editedByStaff: { at: '25 Nov' } }]);
  });

  it('still refuses the same field changed two ways', () => {
    expect(mergeRecordFields(was, { ...was, name: 'Iron' }, { ...was, name: 'Pressing' })).toBeNull();
    expect(() => mergeRecordsById([was], [{ ...was, name: 'Iron' }], [{ ...was, name: 'Pressing' }], 'services')).toThrow(/same record/);
  });

  it('keeps one customer both phones added the same way, and a field only one of them has', () => {
    const phone = { id: 'joy', name: 'Joy', totalPurchases: 0 };
    const cloud = { id: 'joy', name: 'Joy', _fromStaff: { name: 'Destiny' } };
    expect(mergeRecordsById([], [phone], [cloud], 'customers')).toEqual([{ id: 'joy', name: 'Joy', totalPurchases: 0, _fromStaff: { name: 'Destiny' } }]);
  });
});

describe("a manager's price change waits for the owner", () => {
  it('arrives as a notice, and nothing changes yet', () => {
    const { store, added } = addArrivedServiceChanges(shop(), [request()], new Date('2026-11-25T14:50:00Z'));
    expect(added).toBe(1);
    expect(pendingServiceChanges(store)).toHaveLength(1);
    expect(store.flowNotifications?.[0]).toMatchObject({ title: 'Destiny wants to change Ironing Only', actionTab: 'inventory', read: false });
    expect((store as any).laundryPricing.matrix.iron.Pillowcase).toBe(300);
  });

  it('says each change as before and after', () => {
    expect(serviceChangeLines(request())).toEqual(['Pillowcase: ₦300 → ₦250']);
    expect(serviceChangeLines(request({ before: { sellingPrice: 300 }, proposed: { sellingPrice: 350, discontinued: true } }))).toEqual(['Starting price: ₦300 → ₦350', 'Turned off']);
  });

  it('leaves only the newest of two requests for the same service', () => {
    let { store } = addArrivedServiceChanges(shop(), [request()]);
    store = addArrivedServiceChanges(store, [request({ id: 'sc_2', _fromStaff: { staffId: 'destiny', name: 'Destiny', at: '2026-11-25T15:00:00Z' } })]).store;
    expect(pendingServiceChanges(store).map(r => r.id)).toEqual(['sc_2']);
    expect(store.serviceChangeRequests?.find(r => r.id === 'sc_1')?.status).toBe('superseded');
  });

  it('applies on Approve, once', () => {
    const arrived = addArrivedServiceChanges(shop(), [request({ proposed: { sellingPrice: 350, garmentPrices: { Pillowcase: 250 } } })]).store;
    const approved = approveServiceChange(arrived, 'sc_1', owner);
    expect((approved as any).laundryPricing.matrix.iron.Pillowcase).toBe(250);
    expect(approved.products[0].sellingPrice).toBe(350);
    expect(approved.products[0].units_sold).toBe(5);
    expect(approved.serviceChangeRequests?.[0].status).toBe('approved');
    expect(approved.flowNotifications?.[0].read).toBe(true);
    expect(approveServiceChange(approved, 'sc_1', owner)).toBe(approved);
  });

  it('renames an item for the whole price list once approved', () => {
    const base = shop();
    (base as any).products.push({ id: 'wash', name: 'Wash Only', isService: true, sellingPrice: 300, quantity: 999999, costPrice: 0 });
    (base as any).laundryPricing.matrix.wash = { Shirt: 150, Pillowcase: 300 };
    const rename = (id: string, serviceId: string, price: number) => request({
      id, serviceId, serviceName: serviceId,
      before: { garmentPrices: { Uniform: 300 } },
      proposed: { itemRenames: [{ from: 'Pillowcase', to: 'Uniform' }], garmentPrices: { Uniform: price } },
    });
    expect(serviceChangeLines(rename('x', 'iron', 250))).toEqual(['Item renamed: Pillowcase → Uniform', 'Uniform: ₦300 → ₦250']);
    let store = addArrivedServiceChanges(base, [rename('r1', 'iron', 250), { ...rename('r2', 'wash', 300), _fromStaff: { staffId: 'destiny', name: 'Destiny', at: '2026-11-25T14:49:00Z' } }]).store;
    expect((store as any).laundryPricing.garmentTypes).toContain('Pillowcase');
    store = approveServiceChange(store, 'r1', owner);
    store = approveServiceChange(store, 'r2', owner);
    const pricing = (store as any).laundryPricing;
    expect(pricing.garmentTypes).toEqual(['Shirt', 'Uniform']);
    expect(pricing.matrix.iron).toEqual({ Shirt: 200, Uniform: 250 });
    expect(pricing.matrix.wash).toEqual({ Shirt: 150, Uniform: 300 });
  });

  it('adds a new item once approved', () => {
    let store = addArrivedServiceChanges(shop(), [request({ before: {}, proposed: { addItems: ['Curtain'], garmentPrices: { Curtain: 700 } } })]).store;
    expect(serviceChangeLines(store.serviceChangeRequests![0])).toEqual(['New item: Curtain', 'Curtain: ₦700']);
    store = approveServiceChange(store, 'sc_1', owner);
    expect((store as any).laundryPricing.garmentTypes).toContain('Curtain');
    expect((store as any).laundryPricing.matrix.iron.Curtain).toBe(700);
  });

  it('changes nothing on Reject', () => {
    const arrived = addArrivedServiceChanges(shop(), [request()]).store;
    const rejected = rejectServiceChange(arrived, 'sc_1', owner);
    expect((rejected as any).laundryPricing.matrix.iron.Pillowcase).toBe(300);
    expect(rejected.serviceChangeRequests?.[0].status).toBe('rejected');
  });

  it('is decided by the owner only', () => {
    expect(canApproveServiceChanges({ role: 'manager' })).toBe(false);
    const arrived = addArrivedServiceChanges(shop(), [request()]).store;
    expect(approveServiceChange(arrived, 'sc_1', { name: 'Destiny', role: 'manager' })).toBe(arrived);
  });

  it('shows Approve and Reject on the owner\'s Price List', () => {
    const arrived = addArrivedServiceChanges(shop(), [request()]).store;
    let saved: StoreData | null = null;
    render(<ServiceChangeApprovals store={arrived} persist={s => { saved = s; }} currentUser={owner} />);
    expect(screen.getByText('Pillowcase: ₦300 → ₦250')).toBeTruthy();
    fireEvent.click(screen.getByText('Approve'));
    expect((saved as any).laundryPricing.matrix.iron.Pillowcase).toBe(250);
  });

  it("tells a manager's phone that changes go to the owner", () => {
    const { container } = render(<ServiceChangeApprovals store={{ ...shop(), staffDevice: { requestId: 'r', storeRef: 'S', staffId: 'destiny' } } as any} persist={() => {}} currentUser={{ role: 'manager' }} />);
    expect(container.querySelector('[data-service-change-note]')).toBeTruthy();
  });
});

describe('laundry debts are not a customer-balance problem', () => {
  it('does not flag a customer whose only debts are laundry bundles', () => {
    const store = {
      ...shop(),
      customers: [{ id: 'gold', name: 'Mrs Gold', phone: '', outstandingDebt: 0, totalPurchases: 0 }],
      pendingPayments: [{ id: 'laundry-abc', customerId: 'gold', customerName: 'Mrs Gold', total: 9000, paid: 0, balance: 9000, saleIds: [], events: [] }],
    } as unknown as StoreData;
    expect(inspectStoreRecords(store).filter(issue => issue.id.startsWith('customer-'))).toEqual([]);
  });
});
