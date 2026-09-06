import { describe, expect, it } from 'vitest';
import { buyListOrigin } from '@/lib/buy-list-origin';
import { readSource } from './helpers/source';

/**
 * Two buy lists sitting next to each other — one where Flow worked the
 * quantities out from sales history, one where the shopkeeper ticked items and
 * typed the numbers — looked identical in the list.
 *
 * They were also stored identically: the restock engine wrote source 'manual'
 * whichever mode had built the list, so the record did not know either.
 */

describe('a list says who chose the quantities', () => {
  it('calls a list Flow sized "Smart"', () => {
    expect(buyListOrigin({ source: 'smart_budget' }).label).toBe('Smart');
    // Flow acting on its own, through an Auto Fix, is the same thing.
    expect(buyListOrigin({ source: 'auto_fix' }).label).toBe('Smart');
  });

  it('calls a list the merchant built "Hand-picked"', () => {
    expect(buyListOrigin({ source: 'manual' }).label).toBe('Hand-picked');
  });

  it('explains what that meant, rather than leaving a bare word', () => {
    expect(buyListOrigin({ source: 'smart_budget' }).hint).toMatch(/sales, stock and budget/);
    expect(buyListOrigin({ source: 'manual' }).hint).toMatch(/yourself/);
  });

  it('still reads records saved before the distinction existed', () => {
    // Only 'manual' and 'auto_fix' were ever written before, and both are
    // meaningful, so no stored list becomes unlabelled.
    for (const source of ['manual', 'auto_fix'] as const) {
      expect(['Smart', 'Hand-picked']).toContain(buyListOrigin({ source }).label);
    }
  });
});

describe('the record keeps which mode built it', () => {
  it('writes smart_budget from Smart mode and manual from hand-picking', () => {
    const engine = readSource('src/components/SmartRestockEngine.tsx');
    expect(engine).toContain("source: mode === 'smart' ? 'smart_budget' : 'manual'");
    // The old line wrote 'manual' unconditionally.
    expect(engine).not.toMatch(/status: 'ordered',\s*\n\s*source: 'manual',/);
  });

  it('offers the badge on both screens that list buy lists', () => {
    for (const file of ['src/components/MyBuyLists.tsx', 'src/components/PurchaseOrdersList.tsx']) {
      expect(readSource(file), file).toContain('buyListOrigin(po)');
    }
  });
});

describe('the mode picker says what the modes do', () => {
  it('names the modes after who picks the quantities', () => {
    const engine = readSource('src/components/SmartRestockEngine.tsx');
    expect(engine).toContain('✋ Hand-pick');
    expect(engine).toContain('✨ Smart');
    // "Simple" and "Smart Budget" said nothing about the actual difference.
    expect(engine).not.toContain('✅ Simple');
    expect(engine).not.toContain('🪄 Smart Budget');
  });

  it('uses the same words as the badge, so the two connect', () => {
    // The picker used to spell out "Saved as a Hand-picked list" underneath.
    // With the buttons themselves reading Hand-pick and Smart, that sentence
    // repeated the button directly above it, so it went when the panel's copy
    // was cut back. What matters is that the vocabulary matches.
    const engine = readSource('src/components/SmartRestockEngine.tsx');
    const picker = engine.slice(engine.indexOf('✋ Hand-pick'), engine.indexOf('✋ Hand-pick') + 1200);
    expect(picker).toContain('You pick the items and quantities.');
    expect(picker).toMatch(/Flow sizes each order/);
  });
});
