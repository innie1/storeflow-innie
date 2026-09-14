import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotificationDrawer from '@/components/NotificationDrawer';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * Opening the tray and acting on one alert wiped every other alert.
 *
 * The tray shows only unread notifications, and closing it marked the whole
 * list read — so tapping an action, which closes the tray, silently cleared
 * everything the merchant had not looked at yet.
 *
 * Worse, it did not come back. New notifications are deduplicated by id and
 * the ids are stable per product (`low-<productId>`), so once an alert was
 * marked read it could never be re-added — the product could stay out of stock
 * for a month without another word about it.
 */

const note = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  icon: '🚨',
  title: `Alert ${id}`,
  description: `Body ${id}`,
  text: `Body ${id}`,
  tone: 'danger',
  date: new Date().toISOString(),
  read: false,
  ...over,
});

function store(notifications: any[]): StoreData {
  return {
    id: 's1', storeId: 'SF-T', storeName: 'T', accessCode: 'T1', storeType: 'provision',
    createdAt: new Date(0).toISOString(),
    products: [], sales: [], expenses: [],
    flowNotifications: notifications,
  } as unknown as StoreData;
}

/** The tray is always opened by somebody; these are the owner's. */
const owner = { role: 'owner' };

describe('acting on one notification leaves the others alone', () => {
  it('marks only the one acted on, not the whole tray', () => {
    const onUpdate = vi.fn();
    const withAction = note('a', { actionLabel: 'Open', actionTab: 'inventory' });

    render(
      <NotificationDrawer
        store={store([withAction, note('b'), note('c')])}
        onClose={() => {}}
        onUpdate={onUpdate}
        onNavigate={() => {}}
        currentUser={owner}
      />
    );

    fireEvent.click(screen.getByText('Open'));

    const saved = onUpdate.mock.calls.at(-1)![0] as StoreData;
    const byId = Object.fromEntries((saved.flowNotifications || []).map(n => [n.id, n.read]));
    expect(byId).toEqual({ a: true, b: false, c: false });
  });

  it('does not clear anything just because the tray was closed', () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();

    render(
      <NotificationDrawer
        store={store([note('a'), note('b')])}
        onClose={onClose}
        onUpdate={onUpdate}
        onNavigate={() => {}}
        currentUser={owner}
      />
    );

    fireEvent.click(screen.getByLabelText('Close notifications'));

    expect(onClose).toHaveBeenCalled();
    // Closing is closing. It used to be a bulk dismiss of everything unread.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('can dismiss one that has nothing to act on', () => {
    const onUpdate = vi.fn();
    render(
      <NotificationDrawer
        store={store([note('a'), note('b')])}
        onClose={() => {}}
        onUpdate={onUpdate}
        onNavigate={() => {}}
        currentUser={owner}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Dismiss this notification')[0]);

    const saved = onUpdate.mock.calls.at(-1)![0] as StoreData;
    expect(Object.fromEntries((saved.flowNotifications || []).map(n => [n.id, n.read])))
      .toEqual({ a: true, b: false });
  });
});

/**
 * The notifications belong to the shop, so every phone signed in to it showed
 * the owner's: a bill reminder with its amount on a worker's screen. A worker
 * is shown the work - an order coming in - and nothing about the money.
 */
describe('a worker is shown the work, not the money', () => {
  const bill = note('bill', { category: 'alert', title: 'Bill Reminder', description: 'Rent (₦50,000) is due tomorrow.' });
  const order = note('order', { category: 'customerRequest', title: 'New order', actionLabel: 'View Orders', actionTab: 'orders' });

  it("keeps the owner's money reminders out of a worker's tray", () => {
    render(
      <NotificationDrawer
        store={store([bill, order])}
        onClose={() => {}}
        onUpdate={() => {}}
        onNavigate={() => {}}
        currentUser={{ role: 'attendant' }}
      />
    );

    expect(screen.queryByText('Bill Reminder')).toBeNull();
    expect(screen.getByText('New order')).toBeTruthy();
  });

  it("marks read only what the worker was shown, leaving the owner's tray alone", () => {
    const onUpdate = vi.fn();
    render(
      <NotificationDrawer
        store={store([bill, order])}
        onClose={() => {}}
        onUpdate={onUpdate}
        onNavigate={() => {}}
        currentUser={{ role: 'attendant' }}
      />
    );

    fireEvent.click(screen.getByText('Mark all read'));

    const saved = onUpdate.mock.calls.at(-1)![0] as StoreData;
    expect(Object.fromEntries((saved.flowNotifications || []).map(n => [n.id, n.read])))
      .toEqual({ bill: false, order: true });
  });
});

describe('an alert can be raised again once its cause returns', () => {
  it('drops a handled alert whose condition has cleared, freeing its id', () => {
    // Alerts are deduplicated by id and ids are stable per product, so keeping
    // a read alert forever meant the same product running low again months
    // later could never notify. Unread ones are always kept.
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).toContain('const liveIds = new Set(newNotes.map(n => n.id));');
    expect(manager).toContain('existing.filter(n => !n.read || liveIds.has(n.id))');
  });

  it('only writes when something actually changed', () => {
    // The regeneration effect runs on every store change; writing every time
    // would loop.
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).toContain('if (fresh.length > 0 || kept.length !== existing.length)');
  });
});
