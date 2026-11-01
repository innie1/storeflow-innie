import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { StoreData } from '@/types/store';
import BusinessAnalytics from '@/components/analytics/BusinessAnalytics';
import LaundryFlowCard from '@/components/laundry/LaundryFlowCard';
import Manager from '@/components/Manager';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';

/**
 * The clothes-and-money section went on top of the page that was already there,
 * so a laundry's Analysis said the same figures three times, had two sets of
 * range buttons, and listed its days twice. Each thing is now said once.
 */

const CODE = 'ONCETEST';
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
const record = (ref: string, total: number, hours: number) => ({
  clientRef: ref, accessCode: CODE, tagCode: ref.toUpperCase(), customerName: `C ${ref}`, createdAt: hoursAgo(hours),
  total, pieceCount: 5, workflowStage: 'ready', syncStatus: 'synced', garments: [],
});
const shop = (extra: object = {}) => ({
  accessCode: CODE, storeName: 'Washlie', storeType: 'laundry', businessType: 'laundry', products: [], customers: [], expenses: [], restocks: [],
  simpleOnboarding: { complete: true }, createdAt: hoursAgo(24 * 90), managerSettings: {},
  sales: [{ id: 's1', date: hoursAgo(2), total: 4000, profit: 4000, productId: 'x', productName: 'x', quantity: 1, unitPrice: 4000 }],
  pendingPayments: [{ id: 'laundry-a', paid: 4000, balance: 0, total: 4000, status: 'paid', items: [], customerName: 'C a', createdAt: hoursAgo(30) }],
  ...extra,
}) as unknown as StoreData;

beforeEach(() => {
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify([record('a', 4000, 30), record('b', 4500, 40), record('c', 5000, 50)]));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a laundry's Analysis page", () => {
  it('says the figures once, in Clothes and money', () => {
    render(<BusinessAnalytics store={shop()} />);
    expect(screen.getByRole('region', { name: 'Clothes and money' })).toBeTruthy();
    for (const repeated of ['Jobs taken in', 'Handed back', 'Work taken in', 'Still owed', 'Customer journey', 'What this means']) {
      expect(screen.queryByText(repeated)).toBeNull();
    }
    // The graph's own legend, and no card beside it.
    expect(screen.getAllByText('Money received')).toHaveLength(1);
  });

  it('keeps the figures Clothes and money does not give', () => {
    render(<BusinessAnalytics store={shop()} />);
    for (const kept of ['Customers served', 'Came back again', 'Average job', 'Waiting to be collected']) {
      expect(screen.getByText(kept)).toBeTruthy();
    }
  });

  it('has one set of range buttons, and they move the story', () => {
    render(<BusinessAnalytics store={shop()} />);
    const card = screen.getByRole('region', { name: 'Clothes and money' });
    expect(within(card).queryByRole('button', { name: '7 days' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '7 days' })).toHaveLength(1);
    expect(within(card).getByTestId('flow-story').textContent).toContain('In the last 30 days');
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(within(card).getByTestId('flow-story').textContent).toContain('In the last 7 days');
  });

  it('opens on the days, and lists them once', () => {
    render(<BusinessAnalytics store={shop()} />);
    expect(screen.getByRole('heading', { name: 'Day by day' })).toBeTruthy();
    expect(screen.queryByText(/See the numbers for each/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();
  });

  it('offers scans only when there are some', () => {
    render(<BusinessAnalytics store={shop()} />);
    expect(screen.queryByRole('button', { name: 'Scan activity' })).toBeNull();
    cleanup();
    render(<BusinessAnalytics store={shop({ scanEvents: [{ id: 'v', kind: 'qr', created_at: hoursAgo(1) }] })} />);
    expect(screen.getByRole('button', { name: 'Scan activity' })).toBeTruthy();
    expect(screen.getByText('Where the work comes from')).toBeTruthy();
  });
});

describe('another kind of shop', () => {
  it('keeps its page as it was', () => {
    render(<BusinessAnalytics store={shop({ storeType: 'provision', businessType: 'provision' })} />);
    expect(screen.getByText('Customer journey')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scan activity' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Clothes and money' })).toBeNull();
  });
});

describe('the money for older work', () => {
  it('is added only when there is some', () => {
    render(<LaundryFlowCard store={shop()} range="30d" />);
    expect(screen.queryByText(/older work included/)).toBeNull();
    cleanup();
    const more = shop({ sales: [{ id: 's1', date: hoursAgo(2), total: 9000, profit: 9000, productId: 'x', productName: 'x', quantity: 1, unitPrice: 9000 }] });
    render(<LaundryFlowCard store={more} range="30d" />);
    expect(screen.getByText(/older work included: ₦9,000/)).toBeTruthy();
  });
});

describe('the Flow page', () => {
  const noMoney = (extra: object = {}) => shop({ managerSettings: { enabled: true }, sales: [], pendingPayments: [], ...extra });
  const page = (store: StoreData) => <Manager store={store} onUpdate={() => {}} onNavigate={() => {}} />;
  const open = (tab: string) => fireEvent.click(screen.getByRole('button', { name: tab }));

  it('has no clothes-and-money section on any tab', () => {
    render(page(noMoney()));
    for (const tab of ['Overview', 'Forecasts', 'Analysis']) {
      open(tab);
      expect(screen.queryByRole('region', { name: 'Clothes and money' })).toBeNull();
      expect(screen.queryByText('Next week at this pace')).toBeNull();
    }
    expect(screen.getByText('What is selling')).toBeTruthy();
  });

  it('moves the candles when clothes are received, before any money', () => {
    const now = new Date().toISOString();
    const key = laundryLocalStorageKey(CODE);
    localStorage.setItem(key, JSON.stringify([record('a', 4000, 0), record('b', 500, 0)].map(item => ({ ...item, createdAt: now }))));
    const view = render(page(noMoney()));
    open('Analysis');
    expect(screen.getByRole('button', { name: /₦4,500 worth of clothes \(2 bundles\)/ })).toBeTruthy();

    localStorage.setItem(key, JSON.stringify(['a', 'b', 'c'].map(ref => ({ ...record(ref, 1500, 0), createdAt: now }))));
    view.rerender(page(noMoney()));
    expect(screen.getByRole('button', { name: /₦4,500 worth of clothes \(3 bundles\)/ })).toBeTruthy();

    open('Money in');
    expect(screen.queryByRole('button', { name: /worth of clothes/ })).toBeNull();
    expect(screen.getByText('No sales in this period yet.')).toBeTruthy();
  });
});
