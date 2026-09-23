import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { StoreData } from '@/types/store';
import LaundrySyncAgent from '@/components/laundry/LaundrySyncAgent';
import {
  clearLaundrySyncWait,
  createLocalLaundryRecord,
  getLocalLaundryRecord,
  getLocalLaundryRecords,
  LAUNDRY_LOCAL_CHANGED_EVENT,
  setLocalLaundryStage,
  syncLaundryRecord,
  syncPendingLaundryRecords,
} from '@/lib/laundry-offline';

/**
 * A hundred requests a second.
 *
 * On 23 September 2026 one laptop with a laundry open sent the cloud 184,000
 * requests in 35 minutes, every one refused. A failed send was written onto
 * the bundle as if it were an edit; the sync agent sends on every edit; with
 * two or more bundles waiting they set each other off forever. Reproduced
 * before the fix: two bundles and a refusing cloud gave 17 requests in 0.3
 * seconds, still climbing.
 *
 * The waits here are per shop and kept in memory, so each test uses a shop of
 * its own rather than resetting modules - which would load a second copy of
 * React under the agent.
 */

type Answer = { data?: unknown; error?: unknown } | Error;
let answer: (name: string, args: Record<string, unknown>) => Answer = () => ({ data: { order_id: 'cloud-1' } });
let calls: { name: string; args: Record<string, unknown> }[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      await new Promise(resolve => setTimeout(resolve, 1));
      const given = answer(name, args);
      if (given instanceof Error) throw given;
      return { data: given.data ?? null, error: given.error ?? null };
    },
  },
}));

const sends = () => calls.filter(call => call.name === 'create_laundry_walkin_v2');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const quota = { error: { message: 'exceed_egress_quota' } };
const works = { data: { order_id: 'cloud-1' } };
const unknownShop = { error: { code: 'P0001', message: 'Store not found' } };

function bundle(shop: string, customerName: string, customerPhone = '08012345678') {
  return createLocalLaundryRecord({
    accessCode: shop,
    customerName,
    customerPhone,
    serviceId: 'wash',
    serviceName: 'Wash',
    pricing: 'fixed',
    billingQuantity: 1,
    total: 1500,
    garments: [{ garmentType: 'Shirt', quantity: 1, unitPrice: 1500 }],
  });
}

const laundry = (accessCode: string) => ({ accessCode, businessType: 'laundry', storeName: 'Clean Line' } as unknown as StoreData);

let now = new Date('2026-09-23T08:00:00Z').getTime();
const advance = (ms: number) => { now += ms; vi.setSystemTime(now); };

beforeEach(() => {
  localStorage.clear();
  calls = [];
  answer = () => works;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a laundry with bundles waiting and a cloud that says no', () => {
  it('asks once, not a hundred times a second', async () => {
    bundle('LOOP1', 'Ada');
    bundle('LOOP1', 'Chidi');
    bundle('LOOP1', 'Musa');
    answer = () => quota;

    // The agent exactly as the app mounts it.
    render(<LaundrySyncAgent store={laundry('LOOP1')} />);
    await pause(300);

    expect(sends(), 'the sync is feeding itself again').toHaveLength(1);
  });

  it('does not treat writing down a failed send as a change', async () => {
    const record = bundle('LOOP2', 'Ada');
    answer = () => quota;
    let announced = 0;
    const count = () => { announced += 1; };
    window.addEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, count);

    await syncPendingLaundryRecords('LOOP2');
    window.removeEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, count);

    expect(announced).toBe(0);
    // Still written down, where the records list can read it.
    expect(getLocalLaundryRecord('LOOP2', record.clientRef)?.lastSyncError).toBe('exceed_egress_quota');
    expect(getLocalLaundryRecord('LOOP2', record.clientRef)?.syncStatus).toBe('pending');
  });

  it('also survives a network that throws rather than answers', async () => {
    bundle('LOOP3', 'Ada');
    bundle('LOOP3', 'Chidi');
    answer = () => new TypeError('Failed to fetch');

    render(<LaundrySyncAgent store={laundry('LOOP3')} />);
    await pause(300);

    expect(sends()).toHaveLength(1);
  });
});

describe('waiting after a failure', () => {
  it('waits 30 seconds, then 1, 2, 5 and at most 10 minutes', async () => {
    bundle('WAIT1', 'Ada');
    answer = () => quota;
    await syncPendingLaundryRecords('WAIT1');
    expect(sends()).toHaveLength(1);

    for (const seconds of [30, 60, 120, 300, 600, 600]) {
      const before = sends().length;
      advance((seconds - 1) * 1000);
      await syncPendingLaundryRecords('WAIT1');
      expect(sends(), `asked again before ${seconds} seconds were up`).toHaveLength(before);
      advance(2000);
      await syncPendingLaundryRecords('WAIT1');
      expect(sends(), `did not ask again after ${seconds} seconds`).toHaveLength(before + 1);
    }
  });

  it('goes back to normal once a send works', async () => {
    bundle('WAIT2', 'Ada');
    answer = () => quota;
    await syncPendingLaundryRecords('WAIT2');

    advance(31_000);
    answer = () => works;
    await syncPendingLaundryRecords('WAIT2');
    expect(sends()).toHaveLength(2);

    // A new bundle goes at once: the failure is over and forgotten.
    bundle('WAIT2', 'Chidi');
    await syncPendingLaundryRecords('WAIT2');
    expect(sends()).toHaveLength(3);
  });

  it('tries again as soon as the phone comes back online', async () => {
    bundle('WAIT3', 'Ada');
    answer = () => quota;
    render(<LaundrySyncAgent store={laundry('WAIT3')} />);
    await pause(50);
    expect(sends()).toHaveLength(1);

    answer = () => works;
    window.dispatchEvent(new Event('online'));
    await pause(50);

    expect(sends()).toHaveLength(2);
    expect(getLocalLaundryRecords('WAIT3').every(record => record.syncStatus === 'synced')).toBe(true);
  });

  it('still gives a bundle recorded at the counter its own try, and sends the rest when it works', async () => {
    bundle('WAIT4', 'Ada');
    bundle('WAIT4', 'Chidi');
    answer = () => quota;
    await syncPendingLaundryRecords('WAIT4');
    expect(sends()).toHaveLength(1);

    // The background is waiting; somebody records a bundle and the cloud is back.
    answer = () => works;
    const fresh = bundle('WAIT4', 'Musa');
    await syncLaundryRecord('WAIT4', fresh.clientRef);
    await pause(50);

    expect(getLocalLaundryRecords('WAIT4').map(record => record.syncStatus)).toEqual(['synced', 'synced', 'synced']);
  });
});

describe('a shop the cloud has never heard of', () => {
  it('asks once, then leaves it for an hour', async () => {
    // Most laundries run on the phone alone. The phone cannot know that
    // without asking, because a worker's phone sends with the shop code alone.
    bundle('ALONE', 'Ada');
    bundle('ALONE', 'Chidi');
    answer = () => unknownShop;
    await syncPendingLaundryRecords('ALONE');
    expect(sends()).toHaveLength(1);

    advance(59 * 60_000);
    await syncPendingLaundryRecords('ALONE');
    // Coming online says nothing about whether the cloud knows the shop.
    clearLaundrySyncWait('ALONE');
    await syncPendingLaundryRecords('ALONE');
    // Nor does recording another bundle.
    const another = bundle('ALONE', 'Musa');
    await syncLaundryRecord('ALONE', another.clientRef);
    expect(sends()).toHaveLength(1);

    advance(2 * 60_000);
    await syncPendingLaundryRecords('ALONE');
    expect(sends()).toHaveLength(2);
  });
});

describe('one bundle the cloud will not take', () => {
  /*
   * A tag another phone in the shop has already used. That answer is about
   * this bundle, not the shop, so the bundles behind it must still go.
   */
  const taken = new Set<string>();
  const refusesTakenTags = (name: string, args: Record<string, unknown>): Answer =>
    name === 'create_laundry_walkin_v2' && taken.has(String(args.p_tag_code))
      ? { error: { code: 'P0001', message: 'Laundry tag already exists for this store' } }
      : works;

  it('does not hold up the bundles behind it', async () => {
    const ada = bundle('ASIDE1', 'Ada');
    const chidi = bundle('ASIDE1', 'Chidi');
    const clash = bundle('ASIDE1', 'Timi');
    taken.add(clash.tagCode);
    answer = refusesTakenTags;

    await syncPendingLaundryRecords('ASIDE1');

    expect(sends()).toHaveLength(3);
    expect(sends()[0].args.p_client_ref, 'the refused bundle was not first in line').toBe(clash.clientRef);
    expect(getLocalLaundryRecord('ASIDE1', ada.clientRef)?.syncStatus).toBe('synced');
    expect(getLocalLaundryRecord('ASIDE1', chidi.clientRef)?.syncStatus).toBe('synced');
    expect(getLocalLaundryRecord('ASIDE1', clash.clientRef)?.syncStatus).toBe('pending');
    expect(getLocalLaundryRecord('ASIDE1', clash.clientRef)?.lastSyncError).toBe('Laundry tag already exists for this store');
  });

  it('is not sent again until somebody changes it', async () => {
    const clash = bundle('ASIDE2', 'Timi');
    taken.add(clash.tagCode);
    answer = refusesTakenTags;
    await syncPendingLaundryRecords('ASIDE2');
    advance(60 * 60_000);
    await syncPendingLaundryRecords('ASIDE2');
    await syncPendingLaundryRecords('ASIDE2');
    expect(sends()).toHaveLength(1);

    // Somebody moves it along, so it is asked about again - and taken this time.
    taken.delete(clash.tagCode);
    setLocalLaundryStage('ASIDE2', clash.clientRef, 'washing');
    await syncPendingLaundryRecords('ASIDE2');

    expect(sends()).toHaveLength(2);
    expect(getLocalLaundryRecord('ASIDE2', clash.clientRef)?.syncStatus).toBe('synced');
  });

  it('sends a bundle with no phone number like any other', async () => {
    // The cloud stores it with no number rather than refusing it. What goes up
    // is simply blank; the database turns blank into "no number".
    const walkIn = bundle('ASIDE3', 'Timi', '');
    await syncPendingLaundryRecords('ASIDE3');

    expect(sends()).toHaveLength(1);
    expect(sends()[0].args.p_customer_phone).toBe('');
    expect(getLocalLaundryRecord('ASIDE3', walkIn.clientRef)?.syncStatus).toBe('synced');
  });
});

describe('one run per shop at a time', () => {
  it('sends each bundle once however many times it is asked', async () => {
    bundle('ONCE1', 'Ada');
    bundle('ONCE1', 'Chidi');
    bundle('ONCE1', 'Musa');

    await Promise.all([1, 2, 3, 4, 5].map(() => syncPendingLaundryRecords('ONCE1')));

    expect(sends()).toHaveLength(3);
    expect(new Set(sends().map(call => call.args.p_client_ref)).size).toBe(3);
  });

  it('asks a refusing cloud once, not once per caller', async () => {
    // Without one run per shop, five callers each take a different bundle and
    // five requests go out together - all to be refused.
    bundle('ONCE3', 'Ada');
    bundle('ONCE3', 'Chidi');
    bundle('ONCE3', 'Musa');
    answer = () => quota;

    await Promise.all([1, 2, 3, 4, 5].map(() => syncPendingLaundryRecords('ONCE3')));

    expect(sends()).toHaveLength(1);
  });

  it('picks up a bundle recorded while a run was going', async () => {
    bundle('ONCE2', 'Ada');
    const running = syncPendingLaundryRecords('ONCE2');
    const late = bundle('ONCE2', 'Chidi');
    void syncPendingLaundryRecords('ONCE2');
    await running;

    expect(getLocalLaundryRecord('ONCE2', late.clientRef)?.syncStatus).toBe('synced');
    expect(sends()).toHaveLength(2);
  });
});
