import { describe, expect, it } from 'vitest';
import { bundleModifiers, describeModifiers, toggleModifier, LAUNDRY_MODIFIERS } from '@/lib/laundry-modifiers';
import { createLocalLaundryRecord, localLaundryRecordToOrder } from '@/lib/laundry-offline';
import { getLaundryRecordSearchText } from '@/lib/laundry-workspace';
import { appendRunEvent, describeRunEvent } from '@/lib/laundry-runs';

const base = {
  accessCode: 'mod001',
  customerName: 'Ada Obi',
  customerPhone: '08012345678',
  serviceId: 'svc',
  serviceName: 'Full Service',
  pricing: 'per_piece' as const,
  billingQuantity: 1,
  total: 3000,
};

describe('how an item is to be treated', () => {
  /**
   * Starch is one decision, not three. A ticket reading "heavy starch, no
   * starch" is worse than one reading neither, because it will be guessed at.
   */
  it('replaces a contradictory choice rather than stacking it', () => {
    let picked = toggleModifier([], 'Heavy starch');
    picked = toggleModifier(picked, 'No starch');
    expect(picked).toEqual(['No starch']);
  });

  it('keeps choices that do not contradict', () => {
    let picked = toggleModifier([], 'Heavy starch');
    picked = toggleModifier(picked, 'No bleach');
    expect(picked).toContain('Heavy starch');
    expect(picked).toContain('No bleach');
  });

  it('treats a second tap as taking it off', () => {
    expect(toggleModifier(['Fold'], 'Fold')).toEqual([]);
  });

  it('swaps fold for hang, since a garment gets one or the other', () => {
    expect(toggleModifier(['Fold'], 'Hang')).toEqual(['Hang']);
  });

  it('offers the instructions a laundry is actually asked for', () => {
    expect(LAUNDRY_MODIFIERS).toContain('No bleach');
    expect(LAUNDRY_MODIFIERS).toContain('Heavy starch');
  });

  it('says nothing when there is nothing to say', () => {
    expect(describeModifiers([])).toBe('');
    expect(describeModifiers(undefined)).toBe('');
  });

  /** The person at the machine needs the set of things to do, said once. */
  it('gathers every instruction in the bundle without repeating any', () => {
    const all = bundleModifiers([
      { modifiers: ['No bleach', 'Fold'] },
      { modifiers: ['No bleach'] },
      {},
    ]);
    expect(all).toEqual(['No bleach', 'Fold']);
  });

  it('carries the instruction onto the record and makes it findable', () => {
    const record = createLocalLaundryRecord({
      ...base,
      garments: [{ garmentType: 'Shirt', quantity: 2, modifiers: ['No bleach'] }],
    });
    const order = localLaundryRecordToOrder(record);
    expect(order.order_items[0].metadata.modifiers).toEqual(['No bleach']);
    expect(getLaundryRecordSearchText(order)).toContain('no bleach');
  });
});

describe('what happened to the run', () => {
  /**
   * A status says where a bundle is now and nothing about how it got there,
   * which cannot answer "when did we deliver it?" — the question that comes up
   * precisely when a customer says they never received their clothes.
   */
  it('keeps every step in the order it happened', () => {
    let trail = appendRunEvent(undefined, 'out_for_delivery', 'Hanna');
    trail = appendRunEvent(trail, 'delivered', 'Hanna');
    expect(trail.map(event => event.status)).toEqual(['out_for_delivery', 'delivered']);
    expect(trail[0].at <= trail[1].at).toBe(true);
  });

  it('records who moved it, so a disputed delivery has a name on it', () => {
    const [event] = appendRunEvent(undefined, 'delivered', 'Hanna');
    expect(event.by).toBe('Hanna');
    expect(describeRunEvent(event)).toContain('Hanna');
    expect(describeRunEvent(event)).toContain('Delivered');
  });

  it('does not invent a name when nobody was signed in', () => {
    const [event] = appendRunEvent(undefined, 'delivered');
    expect(event.by).toBeUndefined();
    expect(describeRunEvent(event)).not.toContain('by');
  });
});
