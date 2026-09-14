import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * A new bundle starts with nothing left over from the last one.
 *
 * Reported from the counter: a "paid now" amount typed for one customer was
 * still in the box for the next bundle, so the next customer could be booked
 * as having paid money they never handed over. Commit 8ac262d cleared the
 * field on reset; nothing stopped it coming back. This does.
 */

const intake = readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx');
const reset = intake.slice(intake.indexOf('const reset = () => {'), intake.indexOf('const openIntake = () => {'));

describe('a new bundle starts clean', () => {
  it('finds the reset it is checking', () => {
    expect(reset.length).toBeGreaterThan(0);
  });

  it('clears what was paid on the last bundle', () => {
    expect(reset).toContain("setPaidNow('');");
    // Otherwise the deposit rule is never allowed to fill it in again.
    expect(reset).toContain('setPaidTouched(false);');
  });

  it('clears the price and the clothes', () => {
    expect(reset).toContain("setTotalPrice('');");
    expect(reset).toContain('setGarmentCounts(emptyCounts(garmentTypes));');
  });

  it('clears the customer', () => {
    expect(reset).toContain("setCustomerName('');");
    expect(reset).toContain("setCustomerPhone('');");
    expect(reset).toContain("setSelectedCustomerId('');");
  });

  it('runs on every way a bundle is started or put away', () => {
    expect(intake).toMatch(/const openIntake = \(\) => \{\s*sessionStorage\.removeItem\(OPEN_STORAGE\);\s*reset\(\);/);
    expect(intake).toMatch(/const close = \(\) => \{\s*setOpen\(false\);\s*reset\(\);/);
  });
});
