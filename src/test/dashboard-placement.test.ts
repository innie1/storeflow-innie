import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import { listBusinessTypes } from '@/lib/business-templates';

const home = readSource('src/components/simple/BusinessSimpleHome.tsx');
const flow = readSource('src/components/Manager.tsx');
const fab = readSource('src/components/FlowShirtFab.tsx');
const wizard = readSource('src/components/StoreAccess.tsx');

describe('where the month’s figures live', () => {
  /**
   * A figure that size, every time the app opens, for something an owner
   * checks now and then rather than every visit.
   */
  it('is not a card on the home screen any more', () => {
    expect(home).not.toContain('<BreakEvenCard');
    expect(home).not.toContain('<MonthReportCard');
  });

  it('is on the Flow page, where somebody came to think about the business', () => {
    expect(flow).toContain('<BreakEvenCard');
    expect(flow).toContain('<MonthReportCard');
  });

  it('leaves a percentage in the corner, beside the settings icon', () => {
    expect(home).toContain('<BreakEvenPip');
    // Both in the same row, so the pip sits where the settings icon already is.
    const corner = home.slice(home.indexOf('<BreakEvenPip'), home.indexOf('<Settings2') + 20);
    expect(corner).toContain('<Settings2');
    expect(corner.length).toBeLessThan(700);
  });

  /** The moment the month covers itself is still worth catching at home. */
  it('still catches the moment it is covered', () => {
    expect(home).toContain('<BreakEvenWatcher');
  });
});

describe('the chat button getting out of the way', () => {
  /**
   * It floats over whatever is underneath, and on a phone that is the
   * bottom-right of every screen. It covered a price, a total and a question
   * in turn while this was being built. Dragging it is the merchant's answer,
   * but nobody drags something they have not yet been annoyed by.
   */
  it('fades and shrinks while the page is moving', () => {
    expect(fab).toContain("scrolling && !holding ? 'opacity-25 scale-75'");
  });

  it('listens passively, since this runs on every scroll of every screen', () => {
    expect(fab).toContain("window.addEventListener('scroll', onScroll, { passive: true })");
  });

  it('comes back on its own', () => {
    expect(fab).toContain('setTimeout(() => setScrolling(false)');
  });
});

describe('what the trades are called', () => {
  /**
   * The name described one kind of shop while the template serves every shop
   * that buys goods and sells them. A merchant selling phone chargers read the
   * list, saw nothing that was them, and picked Other - the emptiest template.
   */
  it('names both halves of buying and selling on', () => {
    const retail = listBusinessTypes().find(entry => entry.type === 'provision')!;
    // "Retail" alone strictly means selling to the person using the thing, so
    // somebody selling by the carton to other shops would have picked Other
    // for exactly the reason this rename exists.
    expect(retail.name).toBe('Retail / Wholesale');
    expect(retail.description).toMatch(/electronics/i);
    expect(retail.description).toMatch(/carton/i);
  });

  /** The type is unchanged, so no existing shop shifts under its owner. */
  it('does not change the type behind it', () => {
    expect(listBusinessTypes().some(entry => entry.type === 'provision')).toBe(true);
  });

  it('gives the setup wizard the same list as everywhere else', () => {
    expect(wizard).toContain('listBusinessTypes().map');
    expect(wizard).not.toContain("['provision','Provision / Supermarket'");
  });
});
