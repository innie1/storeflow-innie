import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlowAdviceReport from '@/components/FlowAdviceReport';
import { buildFlowReport } from '@/lib/manager-intel';
import type { StoreData } from '@/types/store';
import { readSource } from './helpers/source';

/**
 * Get Advice used to write markdown and hand it to the greeting Typewriter,
 * which puts raw characters into a <span> — so the merchant read the markup
 * itself ("###", "**41/100**"), one character every 30ms.
 *
 * It also emitted the same five sections in the same fixed order, so a
 * sold-out product was reported underneath a paragraph saying expenses were
 * fine. These pin the replacement: what the report leads with has to follow
 * what it actually found.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function makeStore(overrides: Partial<StoreData> = {}): StoreData {
  return {
    id: 'store-1',
    storeId: 'SF-TEST01',
    storeName: 'Test Store',
    accessCode: 'TEST01',
    storeType: 'provision',
    products: [],
    sales: [],
    expenses: [],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  } as StoreData;
}

const healthyProduct = {
  id: 'p-rice', name: 'Rice', category: 'Groceries',
  costPrice: 6000, sellingPrice: 9000, quantity: 40,
};

/** A store trading normally, so nothing is urgent unless a test makes it so. */
function tradingStore(overrides: Partial<StoreData> = {}) {
  return makeStore({
    products: [healthyProduct as any],
    sales: Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, productId: 'p-rice', productName: 'Rice', quantity: 2,
      unitPrice: 9000, total: 18000, profit: 6000, date: daysAgo(i),
    })) as any,
    ...overrides,
  });
}

describe('the report leads with what is actually wrong', () => {
  it('puts a sold-out product ahead of everything else', () => {
    const store = tradingStore({
      products: [healthyProduct as any, { id: 'p-out', name: 'Indomie', category: 'Food', costPrice: 100, sellingPrice: 150, quantity: 0 } as any],
    });

    const report = buildFlowReport(store);
    expect(report.headline).not.toBeNull();
    expect(report.headline!.id).toBe('inventory');
    expect(report.headline!.tone).toBe('critical');
    expect(report.headline!.summary).toContain('sold out');
    // Ranked, not fixed: stock now sorts above sales, expenses and debts.
    expect(report.sections[0].id).toBe('inventory');
  });

  it('leads with the margin when the store is selling at a loss', () => {
    const store = makeStore({
      products: [{ id: 'p-loss', name: 'Sugar', category: 'Groceries', costPrice: 1000, sellingPrice: 900, quantity: 30 } as any],
      sales: [{ id: 's1', productId: 'p-loss', productName: 'Sugar', quantity: 5, unitPrice: 900, total: 4500, profit: -500, date: daysAgo(1) }] as any,
    });

    const report = buildFlowReport(store);
    expect(report.headline!.id).toBe('sales');
    expect(report.headline!.tone).toBe('critical');
  });

  it('has no headline when nothing needs attention', () => {
    const report = buildFlowReport(tradingStore());
    expect(report.headline).toBeNull();
    expect(report.intro).toMatch(/Nothing is going wrong/);
  });
});

describe('the report carries actions, not just prose', () => {
  it('offers Auto Fix on a critical stockout, with the real restock payload', () => {
    const store = tradingStore({
      products: [{ id: 'p-out', name: 'Indomie', category: 'Food', costPrice: 100, sellingPrice: 150, quantity: 0 } as any],
    });

    const stock = buildFlowReport(store).sections.find(s => s.id === 'inventory')!;
    const autoFix = stock.actions?.find(a => a.autoFix)?.autoFix;
    expect(autoFix?.type).toBe('generate_purchase_order');
    expect(autoFix?.payload.items[0].productId).toBe('p-out');
    expect(stock.actions?.some(a => a.goTo === 'inventory')).toBe(true);
  });

  it('sends you somewhere useful for the finding, not one generic link', () => {
    const noSales = buildFlowReport(makeStore({ products: [healthyProduct as any] }));
    expect(noSales.sections.find(s => s.id === 'sales')!.actions![0].goTo).toBe('sales');

    const thinMargin = buildFlowReport(makeStore({
      products: [{ id: 'p', name: 'Tin', category: 'x', costPrice: 95, sellingPrice: 100, quantity: 10 } as any],
      sales: [{ id: 's', productId: 'p', productName: 'Tin', quantity: 10, unitPrice: 100, total: 1000, profit: 50, date: daysAgo(1) }] as any,
    }));
    expect(thinMargin.sections.find(s => s.id === 'sales')!.actions![0].goTo).toBe('inventory');
  });
});

describe('rendering', () => {
  const store = () => tradingStore({
    products: [{ id: 'p-out', name: 'Indomie', category: 'Food', costPrice: 100, sellingPrice: 150, quantity: 0 } as any],
  });

  it('never shows raw markdown', () => {
    const { container } = render(
      <FlowAdviceReport report={buildFlowReport(store())} onDismiss={() => {}} onAutoFix={() => {}} />
    );
    const text = container.textContent || '';
    expect(text).not.toContain('###');
    expect(text).not.toContain('**');
  });

  it('shows only the headline until you ask for the rest', () => {
    render(<FlowAdviceReport report={buildFlowReport(store())} onDismiss={() => {}} onAutoFix={() => {}} />);
    expect(screen.getByText('Stock')).toBeTruthy();
    // Four more blocks of prose used to sit open whether or not they said
    // anything; they are behind one tap now.
    expect(screen.queryByText('Expenses')).toBeNull();

    fireEvent.click(screen.getByText('See the full picture'));
    expect(screen.getByText('Expenses')).toBeTruthy();
  });

  it('hands the Auto Fix spec straight to the caller', () => {
    const onAutoFix = vi.fn();
    render(<FlowAdviceReport report={buildFlowReport(store())} onDismiss={() => {}} onAutoFix={onAutoFix} />);
    fireEvent.click(screen.getByText('Auto Fix'));
    expect(onAutoFix).toHaveBeenCalledWith(expect.objectContaining({ type: 'generate_purchase_order' }));
  });

  it('does not read the report aloud unless asked', () => {
    const { container } = render(
      <FlowAdviceReport report={buildFlowReport(store())} onDismiss={() => {}} onAutoFix={() => {}} />
    );
    expect(container.querySelector('[aria-label="Read this aloud"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Stop reading aloud"]')).toBeNull();
  });
});

describe('the advice screen itself', () => {
  const source = () => readSource('src/components/Manager.tsx');

  it('does not stall behind a delay for a synchronous report', () => {
    const s = source();
    const handler = s.slice(s.indexOf('const handleGetAdvice'), s.indexOf('const handleAutoFixConfirmed'));
    expect(handler).toContain('buildFlowReport(store)');
    expect(handler).not.toMatch(/setTimeout\([\s\S]*?,\s*1500\s*\)/);
  });

  it('keeps the notification archive at the bottom, not the top', () => {
    const s = source();
    const advice = s.slice(s.indexOf("{tab === 'advice' &&"));
    const getAdvice = advice.indexOf('handleGetAdvice');
    const archive = advice.indexOf('setShowArchive(true)');
    expect(archive).toBeGreaterThan(getAdvice);
    // It sat directly under the header card, above every piece of advice.
    expect(advice.indexOf('visibleAdvice.length > 0')).toBeLessThan(archive);
  });

  it('uses Flow, not a stock robot face', () => {
    expect(source()).not.toContain('<Bot ');
    expect(readSource('src/components/FlowAdviceReport.tsx')).not.toContain('<Bot ');
  });
});
