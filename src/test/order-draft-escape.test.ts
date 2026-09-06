import { describe, expect, it } from 'vitest';
import { flowQuickActions } from '@/lib/flow-quick-actions';
import { isFlowConversationOrderRequest } from '@/lib/flow-order-draft';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * An open order draft swallowed every other thing the merchant asked for.
 *
 * handleFlowConversationOrder is the first check in ask(), and while a draft
 * exists it returns true for anything that is not an explicit confirm or
 * cancel — treating it as an edit to the order. So with a draft open, "sell 2
 * rice", "create list", "open settings" and "dark theme" all disappeared into
 * it and nothing happened. The chat looked like it could only build customer
 * orders.
 *
 * Easy to fall into, too: the "New customer order" button sent "take a new
 * customer order" through the engine, which matches an order request and opens
 * an empty draft. The chip it replaced only explained how to give an order,
 * which is the right behaviour — the order begins when the merchant says what
 * it is.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function shop(): StoreData {
  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(200),
    products: [{ id: 'rice', name: 'Rice 50kg', category: 'x', costPrice: 70000, sellingPrice: 87500, quantity: 0 }] as any,
    sales: [] as any,
    expenses: [],
  } as StoreData;
}

const chat = readSource('src/components/FlowChat.tsx');

/** The component's own rule, so the patterns can be exercised directly. */
const isClearlyNotOrderInput = (text: string) => {
  const q = text.trim().toLowerCase();
  return (
    /^(?:undo|help|cancel everything)\b/.test(q) ||
    /^(?:open|go to|take me to|navigate to|switch to|show me)\s+\w+/.test(q) ||
    /^(?:create|make|build|generate)\s+(?:a\s+)?(?:smart\s+)?(?:buy|shopping|purchase)?\s*list\b/.test(q) ||
    /^(?:dark|light|system)\s+(?:theme|mode)\b/.test(q) ||
    /^(?:change|switch)\s+(?:the\s+)?theme\b/.test(q) ||
    /^(?:turn|switch)\s+(?:on|off)\b/.test(q) ||
    /^(?:sell|sold|restock|receive)\s+\d/.test(q) ||
    /^(?:what|how|why|which|show)\b/.test(q)
  );
};

describe('an open order does not block everything else', () => {
  it('lets the instructions the merchant complained about through', () => {
    for (const command of [
      'sell 2 rice',
      'create list',
      'create a buy list',
      'open settings',
      'dark theme',
      'change theme',
      'turn off notifications',
      'go to inventory',
      'undo',
      "what's low?",
    ]) {
      expect(isClearlyNotOrderInput(command), command).toBe(true);
    }
  });

  it('does not mistake a real order line for a command', () => {
    // Everything above is anchored at the start, so an order that happens to
    // mention one of those words is still an order.
    for (const line of [
      'John wants 2 bags of rice',
      'Ada needs 3 Rice 50kg tomorrow',
      'customer would like to open an account and buy rice',
      '2 rice for Bola',
      'add 5 more rice to it',
    ]) {
      expect(isClearlyNotOrderInput(line), line).toBe(false);
    }
  });

  it('is checked before the draft absorbs the message', () => {
    const handler = chat.slice(chat.indexOf('const handleFlowConversationOrder'), chat.indexOf('const sendFlowOrderToWhatsApp'));
    expect(handler).toContain('isClearlyNotOrderInput(text)');
    // Returning false is what lets ask() carry on to the real handler.
    expect(handler).toContain('return false;');
  });

  it('says what happened to the order rather than dropping it silently', () => {
    const handler = chat.slice(chat.indexOf('const handleFlowConversationOrder'), chat.indexOf('const sendFlowOrderToWhatsApp'));
    expect(handler).toContain('put that order aside');
  });
});

describe('the order button does not start an empty order', () => {
  it('would have opened a draft if sent as a prompt', () => {
    // This is why the button had to stop sending it.
    expect(isFlowConversationOrderRequest(shop(), 'take a new customer order')).toBe(true);
  });

  it('explains instead of asking', () => {
    const action = flowQuickActions(shop()).find(a => a.label === 'New customer order');
    expect(action?.say).toBeTruthy();
    expect(action!.say).toContain('phone number');
  });

  it('and the chat honours that', () => {
    expect(chat).toContain('a.say ? flow(a.say) : ask(a.prompt)');
  });

  it('leaves the other two buttons asking as normal', () => {
    for (const a of flowQuickActions(shop())) {
      if (a.label === 'New customer order') continue;
      expect(a.say, a.label).toBeUndefined();
    }
  });
});
