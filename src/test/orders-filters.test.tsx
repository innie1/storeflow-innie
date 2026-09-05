import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Orders from '@/components/Orders';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * The status filters were eight pills, each carrying a count badge, in a
 * wrapping row. On a phone that is three stacked lines of chips before a single
 * order — and most of the counts read "0", so a shop with two live orders still
 * gave a row each to "Rejected 0" and "Cancelled 0".
 *
 * The fade drawn on the right edge was written for a row that scrolls, which a
 * wrapping row never does; it just painted over the last chip of the top line.
 */

const store = (): StoreData => ({
  id: 's1', storeId: 'SF-T', storeName: 'T', accessCode: 'T1', storeType: 'provision',
  createdAt: new Date(0).toISOString(), products: [], sales: [], expenses: [],
} as StoreData);

const order = (id: string, status: string) => ({
  id, order_number: id, status, customer_name: 'A', customer_phone: '080',
  total: 1000, created_at: new Date().toISOString(), order_items: [],
});

function renderOrders(orders: any[]) {
  return render(
    <Orders store={store()} orders={orders} onUpdateOrderStatus={() => {}} onUpdate={() => {}} />
  );
}

/** The status filter pills, in the order they are rendered. */
function pillLabels(container: HTMLElement): string[] {
  const names = ['All', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Rejected', 'Cancelled'];
  return [...container.querySelectorAll('button')]
    .map(b => (b.textContent || '').trim())
    .filter(t => names.some(n => t === n || t.startsWith(n)))
    .filter((t, i, all) => all.indexOf(t) === i);
}

describe('the status filter row', () => {
  it('leads with the statuses that actually have orders', () => {
    const { container } = renderOrders([
      order('1', 'Cancelled'),
      order('2', 'Pending'),
      order('3', 'Pending'),
    ]);

    const labels = pillLabels(container);
    expect(labels[0]).toBe('All3');

    // Pending and Cancelled have orders, so they come before the empty ones.
    const pendingAt = labels.findIndex(l => l.startsWith('Pending'));
    const cancelledAt = labels.findIndex(l => l.startsWith('Cancelled'));
    const preparingAt = labels.findIndex(l => l.startsWith('Preparing'));
    expect(pendingAt).toBeLessThan(preparingAt);
    expect(cancelledAt).toBeLessThan(preparingAt);
  });

  it('shows a count only where there is something to count', () => {
    const { container } = renderOrders([order('1', 'Pending')]);
    const labels = pillLabels(container);

    expect(labels).toContain('Pending1');
    // A row of zeros is noise: an empty status is just its name.
    expect(labels).toContain('Rejected');
    expect(labels).not.toContain('Rejected0');
    expect(labels.some(l => l.endsWith('0'))).toBe(false);
  });

  it('still offers every status, so none becomes unreachable', () => {
    const { container } = renderOrders([order('1', 'Pending')]);
    const labels = pillLabels(container).map(l => l.replace(/\d+$/, ''));
    for (const status of ['All', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Rejected', 'Cancelled']) {
      expect(labels, `${status} filter disappeared`).toContain(status);
    }
  });
});

describe('the row scrolls rather than wraps', () => {
  const source = () => readSource('src/components/Orders.tsx');

  it('is one scrolling line, which is what the edge fade was drawn for', () => {
    const code = source();
    const row = code.slice(code.indexOf('{orderedTabs.map('));
    expect(code).toContain('overflow-x-auto no-scrollbar');
    expect(row.slice(0, 200)).not.toContain('flex-wrap');
  });

  it('anchors the fade to the row it belongs to', () => {
    // Was right-4 on mobile, so it floated inside the row instead of at its edge.
    expect(source()).toContain('absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l');
  });
});
