import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { patchFlowChat, patchManager } from '../../vite-plugin-flow-messages';
import { patchFlowOrderDrafts } from '../../vite-plugin-flow-order-drafts';

describe('Flow message UI transform', () => {
  it('upgrades the existing FlowChat instead of replacing its brain', () => {
    const source = fs.readFileSync('src/components/FlowChat.tsx', 'utf8');
    const transformed = patchFlowChat(source);
    expect(transformed).toContain("from '@/lib/flow-operating-engine'");
    expect(transformed).toContain("from '@/lib/flow-message-orders'");
    expect(transformed).toContain('handleFlowMessageOrder(text)');
    expect(transformed).toContain('createFlowMessageOrder(store, draft)');
    expect(transformed).toContain('formatFlowOrderReceipt(store, order)');
    expect(transformed).toContain('WhatsApp customer');
    expect(transformed).toContain('startFlowVoiceInput');
    expect(transformed).toContain('<Mic className="w-4 h-4" />');
    expect(transformed).toContain('New customer order');
    expect(transformed).toContain('Flow Messages');
  });

  it('puts conversational drafts in front of the old one-shot order handler', () => {
    const source = fs.readFileSync('src/components/FlowChat.tsx', 'utf8');
    const messageUi = patchFlowChat(source);
    const transformed = patchFlowOrderDrafts(messageUi);

    expect(transformed).toContain("from '@/lib/flow-order-draft'");
    expect(transformed).toContain('flowOrderDraftRef = useRef<FlowConversationOrderDraft | null>(null)');
    expect(transformed).toContain('handleFlowConversationOrder(text)');
    expect(transformed.indexOf('if (handleFlowConversationOrder(text)) return;')).toBeLessThan(
      transformed.indexOf('if (handleFlowMessageOrder(text)) return;'),
    );
    expect(transformed).toContain('mergeFlowConversationOrderDraft(store, active, text)');
    expect(transformed).toContain('createFlowConversationOrder(store, latest)');
    expect(transformed).toContain('applyFlowConversationOrderLocalEffects(store, order, latest)');
    expect(transformed).toContain('buildFlowConversationWhatsAppMessage(store, order, draft)');
    expect(transformed).toContain("flowOrderDraftState ? 'Edit the order or add missing details…'");
    expect(transformed).toContain('setActiveFlowOrderDraft(null); setSessionId');
  });

  it('renames the merchant action from chat to message', () => {
    const source = fs.readFileSync('src/components/Manager.tsx', 'utf8');
    const transformed = patchManager(source);
    expect(transformed).toContain('Message with Flow');
    expect(transformed).not.toContain('Chat with Flow');
  });
});
