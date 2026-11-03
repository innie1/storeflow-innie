/**
 * What the shop's rent comes to each month.
 *
 * The rent form shows Yearly when nothing has been chosen, and only saves a
 * frequency when somebody changes the box. So a shop that typed its yearly
 * rent and left the box on Yearly had no frequency saved, and the month's
 * target read that as monthly rent - twelve times too much. The box and the
 * figures now agree: no frequency saved means what the box showed.
 */

import type { RentFrequency, RentInfo } from '@/types/store';

export const DEFAULT_RENT_FREQUENCY: RentFrequency = 'yearly';

export function rentFrequency(rent: Pick<RentInfo, 'frequency'> | null | undefined): RentFrequency {
  return rent?.frequency || DEFAULT_RENT_FREQUENCY;
}

/** Zero when the shop is not rented or no amount is set. */
export function monthlyRent(rent: RentInfo | null | undefined): number {
  if (!rent?.isRented) return 0;
  const amount = Math.max(0, Number(rent.amount) || 0);
  const frequency = rentFrequency(rent);
  return frequency === 'yearly' ? amount / 12 : frequency === 'quarterly' ? amount / 3 : amount;
}
