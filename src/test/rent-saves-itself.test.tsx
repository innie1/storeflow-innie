import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { StoreData } from '@/types/store';
import Settings from '@/components/Settings';

/**
 * The rent card saved every change as it was made, but said nothing, so it
 * looked as though only Save Profile would keep it. And the period box showed
 * Yearly without saving it, which made yearly rent count as monthly.
 */

afterEach(cleanup);

const store = {
  accessCode: 'RENT01', storeId: 'SF-R', storeName: 'Washlie', storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], managerSettings: {}, createdAt: new Date().toISOString(),
  profile: { rent: { isRented: true, amount: 300_000 } },
} as unknown as StoreData;

const openProfile = () => {
  const onUpdate = vi.fn();
  render(<Settings store={store} onUpdate={onUpdate} />);
  fireEvent.click(screen.getAllByText('Washlie')[0].closest('button')!);
  const card = screen.getByRole('heading', { name: 'Store Rent' }).closest('div')!.parentElement!;
  return { onUpdate, card };
};

describe('the rent card', () => {
  it('says what the rent comes to a month before anything is changed', () => {
    const { card } = openProfile();
    expect(within(card).getByText(/Counted as ₦25,000 a month/)).toBeTruthy();
  });

  it('saves the period as soon as it is chosen, and says so', () => {
    const { onUpdate, card } = openProfile();
    expect(within(card).queryByText('✓ Saved')).toBeNull();

    fireEvent.change(within(card).getByRole('combobox'), { target: { value: 'monthly' } });

    const saved = onUpdate.mock.calls.at(-1)![0] as StoreData;
    expect(saved.profile?.rent).toEqual(expect.objectContaining({ amount: 300_000, frequency: 'monthly' }));
    expect(within(card).getByText('✓ Saved')).toBeTruthy();
    expect(within(card).getByText(/Counted as ₦300,000 a month/)).toBeTruthy();
  });

  it('writes down the period it shows when anything else changes', () => {
    const { onUpdate, card } = openProfile();
    fireEvent.change(card.querySelector('input[type="date"]')!, { target: { value: '2027-08-15' } });
    const saved = onUpdate.mock.calls.at(-1)![0] as StoreData;
    expect(saved.profile?.rent?.frequency).toBe('yearly');
  });
});
