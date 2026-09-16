import { beforeEach, describe, expect, it } from 'vitest';
import type { StaffMember, StoreData } from '@/types/store';
import { identityForStore, readActiveUser, writeActiveUser } from '@/lib/store-session';
import { readSource } from './helpers/source';

/**
 * Who is signed in, in the shop being opened.
 *
 * The app keeps one signed-in person for the device while each shop keeps its
 * own team. Switching shops changed the shop and left the person alone: the new
 * shop's screens could draw with the old shop's role, and a worker whose record
 * was not in the new shop was signed out of the app altogether - losing the
 * shop they were actually working in.
 */

const worker = (id: string, role: string, name: string): StaffMember => ({
  id, name, pin: '1111', role: role as StaffMember['role'],
  permissions: { sales: true, inventory: false, reports: false, settings: false },
} as StaffMember);

const shop = (name: string, staff: StaffMember[]): StoreData => ({
  storeName: name, accessCode: name.toUpperCase().slice(0, 6), storeType: 'laundry',
  staffMembers: staff, products: [], sales: [], expenses: [], customers: [], pendingPayments: [],
  createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

// The same person, with a different job in each shop.
const shopA = shop('Shop A', [worker('w1', 'manager', 'Tunde'), worker('w2', 'attendant', 'Ada')]);
const shopB = shop('Shop B', [worker('w1', 'attendant', 'Tunde')]);

beforeEach(() => localStorage.clear());

describe('who this person is in the shop being opened', () => {
  it('gives a worker the role that shop gives them', () => {
    const inA = identityForStore(shopA, { id: 'w1', name: 'Tunde', role: 'manager' });
    expect(inA).toMatchObject({ ok: true, user: { id: 'w1', role: 'manager' } });

    // The same worker, switching to the shop where they are on the floor.
    const inB = identityForStore(shopB, { id: 'w1', name: 'Tunde', role: 'manager' });
    expect(inB).toMatchObject({ ok: true, user: { id: 'w1', role: 'attendant' } });
  });

  it('keeps a worker out of a shop whose team they are not on', () => {
    const ada = identityForStore(shopB, { id: 'w2', name: 'Ada', role: 'attendant' });
    expect(ada).toEqual({ ok: false, reason: 'not-on-the-team' });
  });

  it('lets the owner into every shop on their own device', () => {
    const owner = { name: 'Owner', role: 'owner' };
    expect(identityForStore(shopA, owner)).toEqual({ ok: true, user: owner });
    expect(identityForStore(shopB, owner)).toEqual({ ok: true, user: owner });
  });

  it('leaves the shop to decide when nobody is signed in', () => {
    expect(identityForStore(shopA, null)).toEqual({ ok: true, user: null });
  });

  it('still moves anyone left on the retired admin role across', () => {
    writeActiveUser({ id: 'w9', name: 'Old', role: 'admin' });
    expect(readActiveUser()).toMatchObject({ role: 'manager' });
    // And the device stops carrying it.
    expect(JSON.parse(localStorage.getItem('storeflow_active_user') || '{}').role).toBe('manager');
  });
});

describe('the switch itself', () => {
  it('asks before it moves, and says why when it refuses', () => {
    const switcher = readSource('src/components/StoreSwitcher.tsx');
    expect(switcher).toContain('const identity = identityForStore(store, readActiveUser());');
    expect(switcher).toContain('You are not on the team at ${store.storeName}. Ask the owner to add you.');
    // Nothing moves before the answer: the session is saved after the check.
    expect(switcher.indexOf('identityForStore(store')).toBeLessThan(switcher.indexOf('saveSession(store.accessCode)'));
  });

  it('binds the person to the shop as the shop is set', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain('const identity = identityForStore(s, readActiveUser());');
    // Bound first, then the shop is set - not the other way round, which is how
    // the new shop's screens drew with the old shop's role.
    expect(index.indexOf('setCurrentUser(identity.user);')).toBeLessThan(index.indexOf('setStore(s);'));
  });

  it('reads the signed-in person from one place', () => {
    const session = readSource('src/lib/store-session.ts');
    expect(session).toContain('export function readActiveUser');
    expect(session).toContain("user?.role !== 'admin'");
    expect(readSource('src/pages/Index.tsx')).not.toContain('const readActiveUser = (): any =>');
  });
});
