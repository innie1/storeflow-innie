import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import StaffManagement from '@/components/StaffManagement';
import { showToast } from '@/components/Toast';
import { WORK_TASKS } from '@/lib/piece-work';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * The Add / Edit worker form.
 *
 * Reported from a phone: the form could not be filled in. It sat centred in a
 * fixed box with no height limit and nothing inside it could scroll, so the top
 * of it and the Save button were off the screen.
 *
 * And per-piece rates were slow to set: one box per task for "any item", then
 * every other garment typed out by hand.
 */

const laundry = (): StoreData => ({
  storeName: 'Wash', accessCode: 'STF001', storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], expenses: [], customers: [], pendingPayments: [], staffMembers: [],
  createdAt: new Date(0).toISOString(),
  laundryPricing: { version: 1, garmentTypes: ['Shirt', 'Trouser', 'Native Wear'], matrix: {} },
} as unknown as StoreData);

let onUpdate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onUpdate = vi.fn();
  render(<StaffManagement store={laundry()} onUpdate={onUpdate} currentUser={{ role: 'owner', name: 'Owner' }} />);
  fireEvent.click(screen.getByRole('button', { name: /Add Staff Member/ }));
});

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

const form = () => document.querySelector('form') as HTMLFormElement;
const scroller = () => screen.getByPlaceholderText('e.g. Joy Okafor').closest('.overflow-y-auto') as HTMLElement | null;
const chip = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
const typeRate = (value: string) => fireEvent.change(screen.getByLabelText('Rate per piece'), { target: { value } });

function fillAndSave() {
  fireEvent.change(screen.getByPlaceholderText('e.g. Joy Okafor'), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. 1234'), { target: { value: '1234' } });
  fireEvent.submit(form());
  expect(onUpdate).toHaveBeenCalledTimes(1);
  return onUpdate.mock.calls[0][0].staffMembers[0];
}

describe('the worker form on a phone', () => {
  it('scrolls its middle', () => {
    expect(scroller()).toBeTruthy();
    expect(form().contains(scroller())).toBe(true);
  });

  it('keeps Save outside the part that scrolls, so it is always on screen', () => {
    const save = screen.getByRole('button', { name: 'Add worker' });
    expect(form().contains(save)).toBe(true);
    expect(scroller()!.contains(save)).toBe(false);
  });

  it('is never taller than the screen', () => {
    expect(form().className).toContain('max-h-[92dvh]');
    expect(form().className).toContain('flex-col');
  });
});

describe('how a worker is paid', () => {
  it('is Monthly, Per piece or None (owner)', () => {
    for (const label of ['Monthly', 'Per piece', 'None (owner)']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'No payroll' })).toBeNull();
  });
});

describe('per-piece rates', () => {
  beforeEach(() => { fireEvent.click(screen.getByRole('button', { name: 'Per piece' })); });

  it('start empty, with no rate the owner did not type', () => {
    expect((screen.getByLabelText('Rate per piece') as HTMLInputElement).value).toBe('');
    for (const label of ['Everything else', 'Shirt', 'Trouser', 'Native Wear']) {
      expect(chip(label).getAttribute('aria-pressed'), label).toBe('false');
    }
    expect(fillAndSave().pieceRates).toEqual([]);
  });

  it('are set by typing one rate and tapping the clothes it is for', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ironing' }));
    typeRate('50');
    fireEvent.click(chip('Shirt'));
    fireEvent.click(chip('Trouser'));
    const saved = fillAndSave();
    expect(saved.payType).toBe('per_piece');
    expect(saved.pieceRates).toHaveLength(2);
    expect(saved.pieceRates).toEqual(expect.arrayContaining([
      { task: 'ironing', garmentType: 'Shirt', rate: 50 },
      { task: 'ironing', garmentType: 'Trouser', rate: 50 },
    ]));
  });

  it('can be tapped off again, and changed one item at a time afterwards', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ironing' }));
    typeRate('50');
    fireEvent.click(chip('Shirt'));
    fireEvent.click(chip('Trouser'));
    fireEvent.click(chip('Shirt'));
    fireEvent.change(screen.getByLabelText('Ironing rate for Trouser'), { target: { value: '70' } });
    expect(fillAndSave().pieceRates).toEqual([{ task: 'ironing', garmentType: 'Trouser', rate: 70 }]);
  });

  it('cover everything else with one catch-all', () => {
    typeRate('40');
    fireEvent.click(chip('Everything else'));
    expect(fillAndSave().pieceRates).toEqual([{ task: 'washing', garmentType: '*', rate: 40 }]);
  });

  it('ask for the rate first rather than saving an item at nothing', () => {
    fireEvent.click(chip('Shirt'));
    expect(vi.mocked(showToast)).toHaveBeenCalled();
    expect(chip('Shirt').getAttribute('aria-pressed')).toBe('false');
    expect(fillAndSave().pieceRates).toEqual([]);
  });

  it('can include an item that is not on the price list yet', () => {
    typeRate('100');
    fireEvent.change(screen.getByPlaceholderText('Other item, e.g. Native Wear'), { target: { value: 'Agbada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(fillAndSave().pieceRates).toEqual([{ task: 'washing', garmentType: 'Agbada', rate: 100 }]);
  });
});

describe('the tasks a worker is paid for', () => {
  it('call folding Folding / Packaging, under the id old work was saved with', () => {
    expect(WORK_TASKS.find(task => task.id === 'folding')?.label).toBe('Folding / Packaging');
  });
});

describe('trusting a supervisor with the money', () => {
  const roleSelect = () => form().querySelector('select') as HTMLSelectElement;

  it('is off unless the owner turns it on', () => {
    fireEvent.change(roleSelect(), { target: { value: 'supervisor' } });
    expect((screen.getByLabelText('Can see money') as HTMLInputElement).checked).toBe(false);
    expect(fillAndSave().permissions.money).toBe(false);
  });

  it('is saved with the account when it is on', () => {
    fireEvent.change(roleSelect(), { target: { value: 'supervisor' } });
    fireEvent.click(screen.getByLabelText('Can see money'));
    expect(fillAndSave().permissions.money).toBe(true);
  });

  it('is only offered for a supervisor, and never saved for another role', () => {
    fireEvent.change(roleSelect(), { target: { value: 'supervisor' } });
    fireEvent.click(screen.getByLabelText('Can see money'));
    fireEvent.change(roleSelect(), { target: { value: 'attendant' } });
    expect(screen.queryByLabelText('Can see money')).toBeNull();
    expect(fillAndSave().permissions.money).toBe(false);
  });
});
