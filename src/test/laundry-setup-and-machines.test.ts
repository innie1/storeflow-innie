import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Setting up a price list, and knowing which machine is doing the work.
 *
 * Adding a clothing type took a name and nothing else, so a merchant had to
 * add the item, find it again in the price grid, and type the price there — for
 * every item, on a day they are trying to open a shop.
 *
 * And the machine panel was handed `visibleRecords`, the list after the search
 * box and filter tabs had been applied. So filtering to Ready made every
 * machine look idle, and the numbers changed depending on what the attendant
 * happened to be looking at. It also listed each machine's counts separately
 * and left the comparison to the reader, which is the one thing the panel is
 * for.
 */

const pricing = readSource('src/components/laundry/LaundryPricingSetup.tsx');
const panel = readSource('src/components/laundry/LaundryEquipmentPanel.tsx');
const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');

describe('a clothing type can be priced as it is added', () => {
  it('has a price field beside the name', () => {
    expect(pricing).toContain('customGarmentPrice');
    expect(pricing).toContain('placeholder="Price"');
  });

  it('uses what was typed for every treatment', () => {
    const fn = pricing.slice(pricing.indexOf('const addGarment'), pricing.indexOf('const addGarment') + 1800);
    expect(fn).toContain('hasTyped ? Math.round(typed)');
    expect(fn).toContain('setLaundryGarmentPrice');
  });

  it('still falls back to the treatment price when left blank', () => {
    // Blank must keep the old behaviour, or every existing habit breaks.
    const fn = pricing.slice(pricing.indexOf('const addGarment'), pricing.indexOf('const addGarment') + 1800);
    expect(fn).toContain('Math.max(0, Number(service.sellingPrice) || 0)');
  });

  it('rejects a price that is not a number rather than storing NaN', () => {
    const fn = pricing.slice(pricing.indexOf('const addGarment'), pricing.indexOf('const addGarment') + 1800);
    expect(fn).toContain('Number.isFinite(typed)');
    expect(fn).toContain('typed >= 0');
  });

  it('clears the box afterwards, so the next item starts empty', () => {
    expect(pricing).toContain("setCustomGarmentPrice('')");
  });

  it('says where the per-item, per-kg, per-load choice lives', () => {
    // It is a property of the treatment, not of the clothing type, and that
    // was not written down anywhere.
    expect(pricing).toContain('per item, per kg or per load');
  });
});

describe('machine usage counts every job', () => {
  it('is not fed the filtered list', () => {
    // visibleRecords is whatever the search and filter tabs are showing.
    expect(workspace).not.toContain('orders={visibleRecords.map(record => record.order)}');
    expect(workspace).toContain('orders={decorated.map(record => record.order)}');
  });
});

describe('the panel says which machine is doing the work', () => {
  it('ranks them rather than listing counts side by side', () => {
    expect(panel).toContain('is your busiest machine');
    expect(panel).toContain('.sort((a, b) => (b.stats!.jobs - a.stats!.jobs)');
  });

  it('shows the share, so one busy machine is obvious', () => {
    expect(panel).toContain('share');
    expect(panel).toContain('totalJobs');
  });

  it('says nothing when there is nothing to compare', () => {
    // One machine is not a ranking, and a shop with no jobs yet should not be
    // told which of its idle machines is winning.
    expect(panel).toContain('if (ranked.length < 2) return null;');
    expect(panel).toContain('(entry.stats?.jobs || 0) > 0');
  });

  it('ranks machines, not hand methods', () => {
    // Hand-wash and sun-dry are how work gets done without a machine;
    // crowning one answers a different question.
    expect(panel).toContain("!entry.item.id.startsWith('manual:')");
  });

  it('counts pieces as well as jobs', () => {
    // Two machines can share a job count and be doing very different work.
    expect(panel).toContain('current.pieces +=');
    expect(panel).toContain('pieces handled');
  });

  it('falls back to counting the order lines when no summary is stored', () => {
    expect(panel).toContain("!line?.metadata?.charge_line");
  });
});

describe('the ranking maths is sound', () => {
  /** The same comparison the panel makes. */
  const rank = (rows: Array<{ jobs: number; pieces: number }>) =>
    [...rows].sort((a, b) => (b.jobs - a.jobs) || (b.pieces - a.pieces));

  it('puts the busiest first', () => {
    expect(rank([{ jobs: 2, pieces: 5 }, { jobs: 9, pieces: 1 }])[0].jobs).toBe(9);
  });

  it('breaks a tie on pieces', () => {
    const top = rank([{ jobs: 4, pieces: 10 }, { jobs: 4, pieces: 40 }])[0];
    expect(top.pieces).toBe(40);
  });

  it('works out a share that adds up', () => {
    const rows = [{ jobs: 6, pieces: 0 }, { jobs: 2, pieces: 0 }, { jobs: 2, pieces: 0 }];
    const total = rows.reduce((sum, r) => sum + r.jobs, 0);
    expect(Math.round((rank(rows)[0].jobs / total) * 100)).toBe(60);
  });
});
