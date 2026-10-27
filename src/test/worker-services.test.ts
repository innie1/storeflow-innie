import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { loadStore, saveStore } from '@/lib/store-data';
import { refreshWorkerCopy, sendWorkerRecords, signInWorker, unsentServices } from '@/lib/staff-session';
import { writeJoin } from '@/lib/staff-join';
import { readSource } from './helpers/source';

/**
 * A manager adds or changes a service on their own phone and it becomes the
 * shop's: sent through staff_save_services, kept on the phone until the cloud
 * has it. The cloud's half - the role check, stock left alone, the owner's
 * sync merging services one by one - is
 * supabase/migrations/20261027160000_managers_save_services.sql.
 */

const joined = { requestId: 'r1', storeRef: 'SF-SHOP01', storeName: 'Shop', staffId: 's1', staffName: 'Destiny', staffRole: 'manager', status: 'authorized' as const };
const wash = { id: 'svc-wash', name: 'Wash', sellingPrice: 500, isService: true, unit: 'pcs', servicePricing: 'per_piece', turnaround: '24 hours', serviceWorkflow: { mode: 'job', requiresStart: true, timer: false, allowPause: false, allowAddTime: false }, quantity: 999999, category: 'Service' };
const soap = { id: 'p-soap', name: 'Soap', sellingPrice: 300, quantity: 12, category: 'General' };
const viewFor = (role: string, products: object[] = [wash, soap], extra: object = {}) => ({
  storeName: 'Shop', products, customers: [],
  staffMembers: [{ id: 's1', name: 'Destiny', role }], managerSettings: {}, ...extra,
});
const pass = (role: string) => ({ token: 't'.repeat(64), expires_at: new Date(Date.now() + 86400000).toISOString(), store_ref: 'SF-SHOP01', worker: { id: 's1', name: 'Destiny', role } });
const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
const deps = { loadCopy: (code: string) => loadStore(code), saveCopy: (s: StoreData) => saveStore(s, { skipCloudSync: true }) };
const copy = () => loadStore('STAFF-SF-SHOP01')!;
const keep = (store: StoreData) => saveStore(store, { skipCloudSync: true });

async function signedIn(role = 'manager', view = viewFor(role)) {
  rpc.mockResolvedValue(ok({ ...pass(role), view }));
  await signInWorker('1234', deps);
}

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  writeJoin(joined);
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('what a manager has to send', () => {
  it('is nothing straight after signing in', async () => {
    await signedIn();
    expect(unsentServices(copy())).toEqual([]);
  });

  it('is a service added here, and one changed here - never stock', async () => {
    await signedIn();
    const store = copy();
    keep({
      ...store,
      products: [
        ...store.products.map(p => p.id === 'svc-wash' ? { ...p, sellingPrice: 600 } : p.id === 'p-soap' ? { ...p, quantity: 3 } : p),
        { id: 'svc-iron', name: 'Iron only', sellingPrice: 200, isService: true, quantity: 999999, category: 'Service', costPrice: 0 } as any,
      ],
    });
    const unsent = unsentServices(copy());
    expect(unsent.map(s => s.id).sort()).toEqual(['svc-iron', 'svc-wash']);
    expect(unsent.find(s => s.id === 'svc-wash')).toMatchObject({ sellingPrice: 600, servicePricing: 'per_piece', unitLabel: '/ piece' });
    expect(JSON.stringify(unsent)).not.toMatch(/quantity|costPrice|Soap/);
  });

  it('is nothing for anybody but a manager', async () => {
    await signedIn('attendant');
    const store = copy();
    keep({ ...store, products: [...store.products, { id: 'svc-x', name: 'X', sellingPrice: 1, isService: true } as any] });
    expect(unsentServices(copy())).toEqual([]);
  });

  it('carries a laundry service’s item prices', async () => {
    await signedIn('manager', viewFor('manager', [wash], { laundryPricing: { version: 1, garmentTypes: ['Shirt'], matrix: { 'svc-wash': { Shirt: 500 } } } }));
    const store = copy() as any;
    keep({ ...store, laundryPricing: { ...store.laundryPricing, matrix: { 'svc-wash': { Shirt: 700 } } } });
    expect(unsentServices(copy())).toEqual([expect.objectContaining({ id: 'svc-wash', garmentPrices: { Shirt: 700 } })]);
  });
});

describe('sending', () => {
  it('goes through the services door once, then there is nothing left to send', async () => {
    await signedIn();
    const store = copy();
    keep({ ...store, products: [...store.products, { id: 'svc-iron', name: 'Iron only', sellingPrice: 200, isService: true } as any] });
    rpc.mockResolvedValue(ok({ saved: ['svc-iron'], refused: [] }));
    expect(await sendWorkerRecords(copy())).toEqual({ state: 'sent' });
    expect(rpc).toHaveBeenCalledWith('staff_save_services', expect.objectContaining({
      p_services: [expect.objectContaining({ id: 'svc-iron', name: 'Iron only', sellingPrice: 200 })],
    }));
    expect(unsentServices(copy())).toEqual([]);
  });

  it('keeps trying while the cloud has not answered', async () => {
    await signedIn();
    const store = copy();
    keep({ ...store, products: [...store.products, { id: 'svc-iron', name: 'Iron only', sellingPrice: 200, isService: true } as any] });
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await sendWorkerRecords(copy());
    expect(unsentServices(copy()).map(s => s.id)).toEqual(['svc-iron']);
  });
});

describe('a refresh before it is sent', () => {
  it('keeps the manager’s new and changed services, and takes the cloud’s for the rest', async () => {
    await signedIn();
    const store = copy();
    keep({
      ...store,
      products: [
        ...store.products.map(p => p.id === 'svc-wash' ? { ...p, sellingPrice: 650 } : p),
        { id: 'svc-iron', name: 'Iron only', sellingPrice: 200, isService: true } as any,
      ],
    });
    // Meanwhile the owner changed the soap's price and added a service of their own.
    const ownerService = { id: 'svc-dry', name: 'Dry clean', sellingPrice: 2000, isService: true };
    rpc.mockResolvedValue(ok({ store_ref: 'SF-SHOP01', worker: pass('manager').worker, view: viewFor('manager', [wash, { ...soap, sellingPrice: 350 }, ownerService]) }));
    await refreshWorkerCopy(deps);
    const after = copy().products;
    expect(after.find(p => p.id === 'svc-wash')?.sellingPrice).toBe(650);
    expect(after.find(p => p.id === 'svc-iron')?.name).toBe('Iron only');
    expect(after.find(p => p.id === 'svc-dry')?.name).toBe('Dry clean');
    expect(after.find(p => p.id === 'p-soap')?.sellingPrice).toBe(350);
    expect(unsentServices(copy()).map(s => s.id).sort()).toEqual(['svc-iron', 'svc-wash']);
  });

  it('lets a service the owner removed go, when this phone never changed it', async () => {
    await signedIn();
    rpc.mockResolvedValue(ok({ store_ref: 'SF-SHOP01', worker: pass('manager').worker, view: viewFor('manager', [soap]) }));
    await refreshWorkerCopy(deps);
    expect(copy().products.map(p => p.id)).toEqual(['p-soap']);
  });
});

describe('removing a service', () => {
  it('is not offered on a worker’s phone - switching it off is', () => {
    for (const file of ['src/components/Services.tsx', 'src/components/laundry/LaundryPricingSetup.tsx']) {
      const source = readSource(file);
      expect(source, file).toMatch(/\{!store\.staffDevice && <button onClick=\{\(\) => (setConfirmDeleteId\(s\.id\)|removeService\(selectedService\))\}/);
    }
  });
});
