import { describe, expect, it } from 'vitest';
import { readNotificationAct, stripOrderDeepLink } from '@/lib/order-deep-link';
import { readSource } from './helpers/source';

/**
 * Notification buttons were decoration.
 *
 * `buildActions` returned a single `{ action: 'open' }` for everything —
 * orders, streaks, debts, all of it — and `notificationclick` never looked at
 * which button had been pressed, only at the URL. So a merchant who wanted to
 * answer a customer or mark an order ready had to open the app, find the
 * order, and start again from there.
 */

const sw = readSource('src/sw.ts');

describe('a notification offers something to do', () => {
  it('gives an order more than one button', () => {
    const fn = sw.slice(sw.indexOf('function buildActions'), sw.indexOf('function notificationUrl'));
    expect(fn).toContain("action:'order-ready'");
    expect(fn).toContain("action:'reply'");
  });

  it('offers a typing field where the browser has one', () => {
    // Chrome renders a reply box for type:'text' and hands back what was
    // typed as event.reply.
    expect(sw).toContain("type:'text'");
    expect(sw).toContain('placeholder');
    expect(sw).toContain('(event as any).reply');
  });

  it('lets a warning be closed from the shade without opening the app', () => {
    const fn = sw.slice(sw.indexOf('function buildActions'), sw.indexOf('function notificationUrl'));
    expect(fn).toContain("action:'acknowledge'");
    expect(fn).toContain('I understand');
  });
});

describe('the button that was pressed is acted on', () => {
  it('reads event.action rather than ignoring it', () => {
    expect(sw).toContain('const action = event.action');
  });

  it('does not open a window just to say "understood"', () => {
    const handler = sw.slice(sw.indexOf("addEventListener('notificationclick'"), sw.indexOf('addEventListener(\'message\''));
    const ack = handler.slice(handler.indexOf("action === 'acknowledge'"), handler.indexOf("const actionParam"));
    expect(ack).toContain('STOREFLOW_NOTIFICATION_ACK');
    expect(ack).toContain('return;');
    expect(ack).not.toContain('openWindow');
  });

  it('carries the action and the typed reply into the app', () => {
    expect(sw).toContain('notif_action=');
    expect(sw).toContain('notif_reply=');
  });
});

describe('the app understands what it was sent', () => {
  it('reads a known action', () => {
    expect(readNotificationAct('?notif_action=order-ready')).toEqual({ action: 'order-ready' });
  });

  it('carries the reply text through', () => {
    const act = readNotificationAct('?notif_action=reply&notif_reply=' + encodeURIComponent('Ready by 5pm'));
    expect(act).toEqual({ action: 'reply', reply: 'Ready by 5pm' });
  });

  it('ignores an action it does not recognise', () => {
    // A notification URL is a URL: anything could put one in front of the app.
    expect(readNotificationAct('?notif_action=delete-everything')).toBeNull();
    expect(readNotificationAct('?notif_action=')).toBeNull();
    expect(readNotificationAct('')).toBeNull();
  });

  it('caps how much text it will take', () => {
    const long = 'x'.repeat(5000);
    const act = readNotificationAct(`?notif_action=reply&notif_reply=${long}`);
    expect(act!.reply!.length).toBe(500);
  });

  it('clears the parameters from the address bar afterwards', () => {
    // Otherwise a refresh would replay the action.
    const stripped = stripOrderDeepLink('?tab=orders&order_id=7&notif_action=reply&notif_reply=hi');
    expect(stripped).not.toContain('notif_action');
    expect(stripped).not.toContain('notif_reply');
  });
});

describe('the order screen carries the action out', () => {
  it('marks the order ready without being asked twice', () => {
    const orders = readSource('src/components/Orders.tsx');
    expect(orders).toContain("notificationAct.action === 'order-ready'");
    expect(orders).toContain("onUpdateOrderStatus(String(order.id), 'Ready')");
  });

  it('sends the typed reply to the customer', () => {
    const orders = readSource('src/components/Orders.tsx');
    expect(orders).toContain("notificationAct.action === 'reply'");
    expect(orders).toContain('wa.me/');
  });

  it('says so rather than failing silently when there is no number', () => {
    const orders = readSource('src/components/Orders.tsx');
    expect(orders).toContain('has no phone number saved');
  });
});

describe('savings and stock warnings are recognised as their own thing', () => {
  it('sorts them into their own categories', () => {
    const fn = sw.slice(sw.indexOf('function categoryOf'), sw.indexOf('function quietNow'));
    expect(fn).toContain("'savings'");
    expect(fn).toContain("'stock_loss'");
    expect(fn).toContain("raw.includes('saving')");
  });

  it('the app records an acknowledged stock warning', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain('STOREFLOW_NOTIFICATION_ACK');
    expect(index).toContain('acknowledgeStockLoss()');
  });
});
