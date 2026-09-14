import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import FlowShirtFab from '@/components/FlowShirtFab';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * Switching stores on a phone crashed the app with React error #310,
 * "Rendered more hooks than during the previous render".
 *
 * The Flow button stays on screen across a switch, and it returned early for a
 * store with its floating shortcut switched off - before two of its hooks. Going
 * from a store with it off to one with it on called more hooks than the render
 * before, which React does not allow, and the whole app fell over.
 */

const shop = (code: string, shortcutOn: boolean): StoreData => ({
  storeName: code, accessCode: code, storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], expenses: [], customers: [], pendingPayments: [],
  createdAt: new Date(0).toISOString(),
  managerSettings: { floatingFlowShortcutEnabled: shortcutOn },
} as unknown as StoreData);

const props = { onUpdate: () => {}, onNavigate: () => {}, currentUser: { role: 'owner' } };

afterEach(() => { cleanup(); localStorage.clear(); });

describe('the Flow button across a store switch', () => {
  it('survives switching to a store that shows it', () => {
    const { rerender } = render(<FlowShirtFab store={shop('OFFSHP', false)} {...props} />);
    expect(() => rerender(<FlowShirtFab store={shop('ONSHOP', true)} {...props} />)).not.toThrow();
  });

  it('survives switching to a store that hides it', () => {
    const { rerender } = render(<FlowShirtFab store={shop('ONSHOP', true)} {...props} />);
    expect(() => rerender(<FlowShirtFab store={shop('OFFSHP', false)} {...props} />)).not.toThrow();
  });
});
