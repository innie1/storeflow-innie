import { describe, expect, it } from 'vitest';
import { readLinkedTab, readOrderDeepLink, stripOrderDeepLink } from '@/lib/order-deep-link';
import { readSource } from './helpers/source';

describe('order notification deep links', () => {
  it('reads the order the service worker points at', () => {
    // Exactly the shape src/sw.ts builds for an order notification.
    expect(readOrderDeepLink('?tab=orders&order_id=abc-123&order_number=SF9001')).toEqual({
      orderId: 'abc-123',
      orderNumber: 'SF9001',
    });
  });

  it('works when the notification carries no order number', () => {
    expect(readOrderDeepLink('?tab=orders&order_id=abc-123')).toEqual({ orderId: 'abc-123' });
  });

  it('ignores links that name no order', () => {
    expect(readOrderDeepLink('?tab=dashboard')).toBeNull();
    expect(readOrderDeepLink('?order_id=')).toBeNull();
    expect(readOrderDeepLink('')).toBeNull();
  });

  it('only follows tabs a notification is allowed to open', () => {
    expect(readLinkedTab('?tab=orders')).toBe('orders');
    expect(readLinkedTab('?tab=dashboard')).toBe('dashboard');
    // A crafted URL must not be able to drive the app to an arbitrary surface.
    expect(readLinkedTab('?tab=settings')).toBeNull();
    expect(readLinkedTab('?tab=../evil')).toBeNull();
    expect(readLinkedTab('')).toBeNull();
  });

  it('strips the link so a refresh does not re-focus a stale order', () => {
    expect(stripOrderDeepLink('?tab=orders&order_id=abc-123&order_number=SF9001')).toBe('');
    // Anything unrelated in the query string survives.
    expect(stripOrderDeepLink('?tab=orders&order_id=abc&type=signup')).toBe('?type=signup');
  });

  it('opens the order even behind a status tab, search or date filter', () => {
    const source = readSource('src/components/Orders.tsx');
    // Any of these left active by the merchant would otherwise hide the order
    // the notification is about.
    expect(source).toContain("setActiveTab('All')");
    expect(source).toContain("setSearchQuery('')");
    expect(source).toContain("setDatePreset('all')");
    expect(source).toContain('setExpandedOrder(String(focusOrderId))');
    expect(source).toContain('id={`order-${order.id}`}');
  });

  it('keeps the service worker and the app agreed on the parameter names', () => {
    const sw = readSource('src/sw.ts');
    expect(sw).toContain('order_id');
    expect(sw).toContain('order_number');
    expect(sw).toContain("tab:'orders'");
  });
});
