import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * The list is ordered by what needs attention, not by what was just recorded.
 * That is right at the counter — a late bundle must not slide under everything
 * taken in today — but it means a new bundle lands wherever its due date puts
 * it, often far enough down that the person who recorded it cannot see it.
 *
 * So: urgency stays the default, 'newest' exists for that one moment, and the
 * bundle just recorded is scrolled to and marked either way.
 */
const source = readSource('src/components/laundry/LaundryWorkspace.tsx');

describe('finding the bundle you just recorded', () => {
  it('keeps urgency as the default order', () => {
    expect(source).toMatch(/localStorage\.getItem\(SORT_KEY\) === 'newest' \? 'newest' : 'urgent'/);
  });

  it('sorts newest by recency alone, not banded by urgency', () => {
    // Banding it would put the new bundle back down the list, which is the
    // whole thing this mode exists to avoid.
    expect(source).toMatch(/if \(sortMode === 'newest'\) return b\.createdAt - a\.createdAt;/);
  });

  it('re-sorts when the mode changes', () => {
    const deps = source.match(/\}, \[decorated, filter, debouncedSearch, recordedBy[^\]]*\]/);
    expect(deps?.[0]).toContain('sortMode');
  });

  it('marks the row so it can be scrolled to', () => {
    expect(source).toContain('data-client-ref={record.clientRef}');
    expect(source).toContain('scrollIntoView');
  });

  it('lets the highlight go rather than leaving it on screen', () => {
    expect(source).toMatch(/setTimeout\(\(\) => setJustRecorded\(null\), \d+\)/);
  });

  /**
   * Both of these were wrong when first written, and both were found by
   * recording a bundle and watching, not by reading the code.
   */
  it('does not restart its own countdown on every list refresh', () => {
    // The workspace re-reads local records on a timer, so depending on that
    // array re-ran the effect, cancelled the countdown and began a new one.
    // The mark stayed on screen for good.
    const effect = source.slice(source.indexOf('const findAndShow'), source.indexOf('const changeView'));
    expect(effect).not.toContain('visibleRecords');
    expect(source).toMatch(/\}, \[justRecorded, view\]\);/);
  });

  it('starts counting when the row is on screen, not when it was saved', () => {
    // The receipt sits between recording and the list. Counting from the save
    // meant the mark had expired before the list was ever opened.
    const effect = source.slice(source.indexOf('const findAndShow'), source.indexOf('const changeView'));
    const scrolled = effect.indexOf('scrollIntoView');
    const started = effect.indexOf('setTimeout');
    expect(scrolled).toBeGreaterThan(-1);
    expect(started).toBeGreaterThan(scrolled);
  });

  it('only looks for the row once the list is actually showing', () => {
    expect(source).toContain("if (!justRecorded || view !== 'records') return;");
  });

  it('costs no extra height — the toggle rides in the search row', () => {
    // A row of its own is the sort of furniture this screen has had removed
    // from it before.
    const searchRow = source.slice(source.indexOf('<RecordedByFilter'), source.indexOf('grid grid-cols-5'));
    expect(searchRow).toContain('setSortMode');
  });
});
