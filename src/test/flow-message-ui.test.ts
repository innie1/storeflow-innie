import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

describe('Flow message UI', () => {
  it('builds on the existing FlowChat brain rather than replacing it', () => {
    const source = readSource('src/components/FlowChat.tsx');
    expect(source).toContain("from '@/lib/flow-operating-engine'");
    expect(source).toContain("from '@/lib/flow-message-orders'");
    expect(source).toContain('handleFlowMessageOrder(text)');
    expect(source).toContain('createFlowMessageOrder(store, draft)');
    expect(source).toContain('formatFlowOrderReceipt(store, order)');
    expect(source).toContain('WhatsApp customer');
    expect(source).toContain('startFlowVoiceInput');
    expect(source).toContain('storeflow:start-flow-voice');
    expect(source).toContain('<Mic className="w-4 h-4" />');
    expect(source).toContain('New customer order');
    expect(source).toContain('Flow Messages');
  });

  it('puts conversational drafts in front of the older one-shot order handler', () => {
    const source = readSource('src/components/FlowChat.tsx');
    expect(source).toContain("from '@/lib/flow-order-draft'");
    expect(source).toContain('flowOrderDraftRef = useRef<FlowConversationOrderDraft | null>(null)');
    expect(source).toContain('handleFlowConversationOrder(text)');
    expect(source.indexOf('if (handleFlowConversationOrder(text)) return;'))
      .toBeLessThan(source.indexOf('if (handleFlowMessageOrder(text)) return;'));
    expect(source).toContain('mergeFlowConversationOrderDraft(store, active, text)');
    expect(source).toContain('createFlowConversationOrder(store, latest)');
    expect(source).toContain('applyFlowConversationOrderLocalEffects(store, order, latest)');
    expect(source).toContain('buildFlowConversationWhatsAppMessage(store, order, draft)');
    expect(source).toContain("flowOrderDraftState ? 'Edit the order or add missing details…'");
    expect(source).toContain('setActiveFlowOrderDraft(null); setSessionId');
  });

  it('dispatches each order handler exactly once in ask()', () => {
    const source = readSource('src/components/FlowChat.tsx');
    // A build-time transform used to prepend these dispatch lines with an
    // inverted guard, so a second pass duplicated them. They are plain source
    // now; pin the count so a stray duplicate cannot creep back in.
    expect(source.split('if (handleFlowMessageOrder(text)) return;')).toHaveLength(2);
    expect(source.split('if (handleFlowConversationOrder(text)) return;')).toHaveLength(2);
  });

  it('opens the Flow Messages modal directly when the global shortcut fires', () => {
    const source = readSource('src/components/Manager.tsx');
    expect(source).toContain('Message with Flow');
    expect(source).not.toContain('Chat with Flow');
    expect(source).toContain('storeflow:open-flow-messages');
    expect(source).toContain('setChatOpen(true)');
    expect(source).toContain('storeflow:start-flow-voice');
  });
});
