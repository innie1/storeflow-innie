import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Product } from '@/types/store';
import { createFlowShirtCode, parseFlowShirtText } from '@/lib/flow-shirt';

const products: Product[] = [
  { id: 'indomie', name: 'Indomie', costPrice: 300, sellingPrice: 500, quantity: 20, category: 'Food', addedAt: '2026-01-01' },
  { id: 'garri', name: 'Garri White', costPrice: 500, sellingPrice: 800, quantity: 12, category: 'Food', addedAt: '2026-01-01', voiceAliases: ['white garri'] },
];

describe('Flow Shirt smart sale parser', () => {
  it('builds a multi-item list from normal typed selling language', () => {
    const result = parseFlowShirtText('2 Indomie, 1 white garri', products);
    expect(result).toHaveLength(2);
    expect(result[0].product?.id).toBe('indomie');
    expect(result[0].quantity).toBe(2);
    expect(result[1].product?.id).toBe('garri');
  });

  it('keeps an unknown item as a new item and extracts its price', () => {
    const [item] = parseFlowShirtText('3 chin chin for 700', products);
    expect(item.product).toBeNull();
    expect(item.name).toBe('Chin Chin');
    expect(item.quantity).toBe(3);
    expect(item.priceGuess).toBe(700);
  });

  it('creates short transaction codes for saved Flow Shirt sales', () => {
    expect(createFlowShirtCode(1_787_872_000_000)).toMatch(/^FS-[A-Z0-9]{8}$/);
  });

  it('shows one chat button, the same in every trade, and lets it be moved', () => {
    const source = fs.readFileSync('src/components/FlowShirtFab.tsx', 'utf8');
    expect(source).toContain("const FLOW_HOLD_MS = 3000");
    expect(source).toContain("storeflow:open-flow-messages");
    expect(source).toContain("openFlowMessages(false)");
    expect(source).toContain("openFlowMessages(true)");

    // One icon everywhere. A shirt on a laundry read as a record button, and
    // it behaved like one - it jumped to laundry records instead of opening
    // Flow - so both the icon and the trade branch are gone.
    expect(source).toContain('holding ? <Mic');
    expect(source).toContain('<MessageCircle className="w-6 h-6"');
    expect(source).not.toContain('? <Shirt className="w-6 h-6"');
    expect(source).not.toContain("const isLaundry = businessType === 'laundry'");
    expect(source).not.toContain("requestLaundryWorkspace('record')");

    // Draggable, and it remembers where it was put.
    expect(source).toContain('onPointerDown={onFabPointerDown}');
    expect(source).toContain('onPointerMove={onFabPointerMove}');
    expect(source).toContain('FAB_POSITION_KEY');
    expect(source).toContain('FAB_DRAG_THRESHOLD');
    // A drag must not also count as a tap.
    expect(source).toContain('if (draggedRef.current) { draggedRef.current = false; return; }');
    // touch-none, or a drag on a phone scrolls the page instead.
    expect(source).toContain('touch-none');
  });

  it('hides all floating Flow shortcuts when the setting is switched off', () => {
    const source = fs.readFileSync('src/components/FlowShirtFab.tsx', 'utf8');
    expect(source).toContain("floatingFlowShortcutEnabled !== false");
    expect(source).toContain("if (!floatingShortcutEnabled) return null");
  });
});
