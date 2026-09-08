import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_DUE_CHIPS, describeDueHours, orderedDueChips, readDueUsage, recordDueChoice } from '@/lib/laundry-due-usage';

const PRESETS = [
  { label: '12 hours', hours: 12 },
  { label: '1 day', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];

const CODE = 'DUE001';
const use = (hours: number, times: number) => { for (let i = 0; i < times; i += 1) recordDueChoice(CODE, hours); };
const labels = (chips: { label: string }[]) => chips.map(chip => chip.label);

describe('the row learns what the shop actually says', () => {
  beforeEach(() => localStorage.clear());

  /**
   * A shop that promises tomorrow to nearly everyone had to reach past twelve
   * hours every single time, because the order never changed.
   */
  it('puts the most-used turnaround first', () => {
    use(24, 8);
    use(48, 2);
    expect(labels(orderedDueChips(CODE, PRESETS))[0]).toBe('1 day');
  });

  it('keeps the familiar order until there is something to learn from', () => {
    expect(labels(orderedDueChips(CODE, PRESETS, { limit: 5 }))).toEqual(
      ['12 hours', '1 day', '2 days', '3 days', '1 week'],
    );
  });

  /** Unused presets give up their place so the row stays short. */
  it('drops what is never used to make room', () => {
    use(24, 5); use(48, 4); use(72, 3); use(168, 2);
    const shown = labels(orderedDueChips(CODE, PRESETS));
    expect(shown).toHaveLength(MAX_DUE_CHIPS);
    expect(shown).not.toContain('12 hours');
  });

  it('never shows more than the row can hold', () => {
    use(24, 5); use(48, 4); use(72, 3); use(168, 2); use(12, 1);
    expect(orderedDueChips(CODE, PRESETS).length).toBeLessThanOrEqual(MAX_DUE_CHIPS);
  });
});

describe('what must not disappear', () => {
  beforeEach(() => localStorage.clear());

  /** A chip vanishing from under the choice you just made is alarming. */
  it('keeps the selected turnaround even when it is never used', () => {
    use(24, 5); use(48, 4); use(72, 3); use(168, 2);
    expect(labels(orderedDueChips(CODE, PRESETS, { selected: 12 }))).toContain('12 hours');
  });

  it('keeps the shop’s saved custom one, which was typed in deliberately', () => {
    use(24, 5); use(48, 4); use(72, 3); use(168, 2);
    expect(labels(orderedDueChips(CODE, PRESETS, { custom: 36 }))).toContain('36 hours');
  });

  it('does not duplicate a custom that matches a preset', () => {
    const shown = labels(orderedDueChips(CODE, PRESETS, { custom: 24, limit: 5 }));
    expect(shown.filter(label => label === '1 day')).toHaveLength(1);
  });
});

describe('counting, carefully', () => {
  beforeEach(() => localStorage.clear());

  it('counts each choice once', () => {
    use(24, 3);
    expect(readDueUsage(CODE)['24']).toBe(3);
  });

  it('ignores a nonsense turnaround rather than storing it', () => {
    recordDueChoice(CODE, 0);
    recordDueChoice(CODE, -5);
    recordDueChoice(CODE, Number.NaN);
    expect(Object.keys(readDueUsage(CODE))).toHaveLength(0);
  });

  it('keeps each shop’s habit to itself', () => {
    use(24, 5);
    expect(readDueUsage('OTHER99')['24']).toBeUndefined();
  });

  it('says the interval the way the presets do', () => {
    expect(describeDueHours(24)).toBe('1 day');
    expect(describeDueHours(48)).toBe('2 days');
    expect(describeDueHours(168)).toBe('1 week');
    expect(describeDueHours(36)).toBe('36 hours');
  });
});
