import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Where Flow's speech bubble lands.
 *
 * On setup step 1 the bubble sat on top of the StoreFlow wordmark and the
 * tagline under it. The placement code had two constants doing the damage:
 *
 *   const safeSpaceAbove = rect.top - 90;   // an app header that isn't there
 *   const bubbleHeightEstimate = 76;        // the same for every message
 *
 * On the setup screen there is no app header, so 90px of imaginary chrome came
 * off the space above Flow. Measured on a 554px-tall viewport: rect.top was
 * 58.3, so safeSpaceAbove came out at -31.7. The gap below him to the wordmark
 * is 12px. Neither cleared 76, and the tie-break (`safeSpaceAbove >=
 * spaceBelow`) compared -31.7 against 12 and chose *below* — straight onto the
 * brand.
 *
 * These are source assertions rather than DOM ones on purpose: the whole bug
 * lives in getBoundingClientRect and elementFromPoint, which jsdom stubs to
 * zero, so a rendered test would pass no matter which way this went.
 */

const mascot = readSource('src/components/Mascot.tsx');

describe('the bubble measures instead of assuming', () => {
  it('no longer subtracts a header that may not exist', () => {
    expect(mascot).not.toContain('rect.top - 90');
    expect(mascot).toContain('obstructedTop(centerX, container)');
  });

  it('finds the real header by its own bottom edge', () => {
    // Stepping the probe in 12px increments and returning the step would come
    // up short by up to a step and tuck the bubble under the header.
    expect(mascot).toContain('blocked = Math.max(blocked, el.getBoundingClientRect().bottom)');
    expect(mascot).toContain("pos === 'fixed' || pos === 'sticky'");
  });

  it('will not let a full-screen fixed overlay push it off the page', () => {
    expect(mascot).toContain('Math.min(blocked, window.innerHeight * 0.4)');
  });

  it('measures the bubble rather than averaging its min and max width', () => {
    expect(mascot).not.toContain('bubbleHeightEstimate');
    expect(mascot).toContain('bubbleRef.current');
    expect(mascot).toContain('bubbleEl?.offsetHeight');
    expect(mascot).toContain('bubbleEl?.offsetWidth');
  });
});

describe('it never covers the heading beneath it', () => {
  it('drops to "above" when neither side fits, rather than picking the bigger gap', () => {
    // The old tie-break chose whichever number was larger, which is how a
    // negative space-above lost to a 12px space-below.
    expect(mascot).not.toContain("setBubblePosition(safeSpaceAbove >= spaceBelow ? 'above' : 'below')");
    expect(mascot).toContain('setBubbleShiftY(Math.max(0, Math.ceil(bubbleHeight - spaceAbove)))');
  });

  it('still measures what sits directly below before going there', () => {
    expect(mascot).toContain('container.nextElementSibling');
    expect(mascot).toContain('Math.min(spaceBelow, nextTop - rect.bottom)');
  });

  it('applies the vertical slide it calculated', () => {
    // The shift is useless if the transform only carries X.
    expect(mascot).toContain('translate(calc(-50% + ${bubbleShiftX}px), ${bubbleShiftY}px)');
  });
});

describe('the tail stays on the bubble', () => {
  it('clamps the connector inside the bubble when it is shifted', () => {
    // The connector tracked shiftX unbounded, so a bubble pushed against a
    // screen edge left its own tail behind.
    expect(mascot).toContain('clamp(10px, calc(50% - ${bubbleShiftX}px), calc(100% - 10px))');
    expect(mascot).not.toContain('left: `calc(50% - ${bubbleShiftX}px)`');
  });
});

describe('it does not thrash on scroll', () => {
  it('coalesces layout work into a frame', () => {
    expect(mascot).toContain('requestAnimationFrame(handleLayout)');
    expect(mascot).toContain('cancelAnimationFrame(frame)');
  });

  it('removes the same listener it added', () => {
    // Adding `schedule` and removing `handleLayout` would leak a scroll
    // listener per message.
    expect(mascot).toContain("window.addEventListener('scroll', schedule");
    expect(mascot).toContain("window.removeEventListener('scroll', schedule)");
  });
});
