import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import Mascot from '@/components/Mascot';

/**
 * Flow's shelf glance, which until now nothing could trigger.
 *
 * The animation, its shelf-peek keyframes and its pulsing warning badge were
 * all finished, but no code path anywhere could set the 'low-stock-peek' mood,
 * so the comparison that renders it was always false and no merchant ever saw
 * it. These tests hold the trigger in place: that it fires on real low stock,
 * and — the part that matters more — that it stays quiet the rest of the time.
 */

const PEEK_KEY = 'storeflow_low_stock_peek_at';

function storeWith(products: Array<{ name: string; quantity: number; discontinued?: boolean }>) {
  return {
    name: 'Test Store',
    managerSettings: { enabled: true, minStockThreshold: 5 },
    products: products.map((p, i) => ({
      id: String(i + 1), costPrice: 100, sellingPrice: 200, ...p,
    })),
    sales: [],
  } as any;
}

/** Run the mascot's one-minute ambient tick. */
async function tick() {
  await act(async () => { vi.advanceTimersByTime(61000); });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe('the shelf glance fires on real low stock', () => {
  it('names the product that is closest to running out', async () => {
    const view = render(
      <Mascot store={storeWith([
        { name: 'Peak Milk', quantity: 2 },
        { name: 'Coke 50cl', quantity: 40 },
      ])} />,
    );
    await tick();
    expect(view.container.textContent).toContain('Peak Milk is down to 2');
    // The part that was dormant: the shelf drawing itself, not just the line.
    expect(view.container.querySelector('[class*="shelf-peek"]')).not.toBeNull();
  });

  it('counts the others without listing them', async () => {
    const view = render(
      <Mascot store={storeWith([
        { name: 'Peak Milk', quantity: 1 },
        { name: 'Milo Sachet', quantity: 3 },
        { name: 'Sugar', quantity: 4 },
      ])} />,
    );
    await tick();
    expect(view.container.textContent).toContain('Peak Milk is down to 1');
    expect(view.container.textContent).toContain('2 others are low');
  });

  it('records the time so it will not repeat straight away', async () => {
    render(<Mascot store={storeWith([{ name: 'Peak Milk', quantity: 2 }])} />);
    await tick();
    expect(Number(localStorage.getItem(PEEK_KEY))).toBeGreaterThan(0);
  });
});

describe('and stays quiet otherwise', () => {
  it('says nothing when everything is well stocked', async () => {
    const view = render(<Mascot store={storeWith([{ name: 'Coke 50cl', quantity: 40 }])} />);
    await tick();
    expect(view.container.textContent).not.toContain('down to');
  });

  it('ignores a product that is already out of stock', async () => {
    // Zero is a louder problem handled elsewhere; this glance is for the
    // things still on the shelf but nearly gone.
    const view = render(<Mascot store={storeWith([{ name: 'Peak Milk', quantity: 0 }])} />);
    await tick();
    expect(view.container.textContent).not.toContain('down to');
  });

  it('ignores a discontinued product', async () => {
    const view = render(
      <Mascot store={storeWith([{ name: 'Old Stock', quantity: 1, discontinued: true }])} />,
    );
    await tick();
    expect(view.container.textContent).not.toContain('down to');
  });

  it('does not glance twice inside the cooldown', async () => {
    localStorage.setItem(PEEK_KEY, String(Date.now()));
    const view = render(<Mascot store={storeWith([{ name: 'Peak Milk', quantity: 2 }])} />);
    await tick();
    expect(view.container.textContent).not.toContain('down to');
  });

  it('glances again once the cooldown has passed', async () => {
    localStorage.setItem(PEEK_KEY, String(Date.now() - 5 * 60 * 60 * 1000));
    const view = render(<Mascot store={storeWith([{ name: 'Peak Milk', quantity: 2 }])} />);
    await tick();
    expect(view.container.textContent).toContain('Peak Milk is down to 2');
  });

  it('says nothing when the manager is switched off', async () => {
    const store = storeWith([{ name: 'Peak Milk', quantity: 2 }]);
    store.managerSettings.enabled = false;
    const view = render(<Mascot store={store} />);
    await tick();
    expect(view.container.textContent).not.toContain('down to');
  });
});
