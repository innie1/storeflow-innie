import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Orders from '@/components/Orders';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('@/lib/push-notifications', () => ({
  subscribeToOrderPush: vi.fn(),
  getPushSubscriptionState: vi.fn().mockResolvedValue(null),
}));

beforeAll(() => {
  // jsdom implements neither, and the focus effect calls both.
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as any;
  window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as any;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function store(): any {
  return {
    id: 'store-1', storeId: 'SF-1', accessCode: 'ABC123', storeName: 'Test Shop',
    products: [], sales: [], customers: [], createdAt: new Date(0).toISOString(),
  };
}

function order(id: string, number: string, status: string, createdAt: string): any {
  return {
    id, order_number: number, status, total: 2500, created_at: createdAt,
    customer_name: `Customer ${number}`, customer_phone: '08000000000', order_items: [],
  };
}

const ORDERS = [
  order('order-new', 'SF9002', 'Pending', '2026-09-04T10:00:00Z'),
  order('order-target', 'SF9001', 'Completed', '2026-09-01T10:00:00Z'),
];

describe('tapping an order notification', () => {
  it('opens the exact order it points at and scrolls to it', async () => {
    const { container } = render(
      <Orders store={store()} orders={ORDERS} onUpdateOrderStatus={vi.fn()} onUpdate={vi.fn()} focusOrderId="order-target" />,
    );

    const card = container.querySelector('#order-order-target') as HTMLElement;
    expect(card).toBeTruthy();

    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    // Highlighted so the merchant can see which order the alert was about.
    expect(container.querySelector('#order-order-target')?.className).toContain('ring-2');
  });

  it('still finds the order when a status tab would hide it', async () => {
    // The target is Completed. Landing on it must not depend on which tab the
    // merchant happened to leave selected.
    const { container } = render(
      <Orders store={store()} orders={ORDERS} onUpdateOrderStatus={vi.fn()} onUpdate={vi.fn()} focusOrderId="order-target" />,
    );

    await waitFor(() => expect(container.querySelector('#order-order-target')).toBeTruthy());
  });

  it('reports back so the focus is not re-applied on later renders', async () => {
    const onFocusHandled = vi.fn();
    render(
      <Orders store={store()} orders={ORDERS} onUpdateOrderStatus={vi.fn()} onUpdate={vi.fn()} focusOrderId="order-target" onFocusHandled={onFocusHandled} />,
    );

    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
  });

  it('does nothing when no order is being focused', async () => {
    const { container } = render(
      <Orders store={store()} orders={ORDERS} onUpdateOrderStatus={vi.fn()} onUpdate={vi.fn()} />,
    );

    expect(container.querySelector('.ring-2')).toBeNull();
  });
});
