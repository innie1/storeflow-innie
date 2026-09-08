import { describe, expect, it } from 'vitest';
import {
  attribution,
  byContributor,
  contributors,
  recordedByLabel,
  unattributedCount,
  UNATTRIBUTED,
} from '@/lib/recorded-by';
import { readSource } from './helpers/source';

/**
 * Telling one person's work from another's.
 *
 * The actor's name and role were already handed to recordSale — and spent on a
 * line in the activity log. Nothing was kept on the sale itself, so once a
 * shop had two people working there was no way to say who took which order,
 * and no way to count what anyone had done.
 */

const rows = [
  { id: '1', recordedByName: 'hanna', recordedByRole: 'attendant' },
  { id: '2', recordedByName: 'hanna', recordedByRole: 'attendant' },
  { id: '3', recordedByName: 'Musa', recordedByRole: 'manager' },
  { id: '4' },
];

describe('stamping a record', () => {
  it('takes the name and the role of whoever is signed in', () => {
    expect(attribution({ name: 'hanna', role: 'attendant' })).toEqual({
      recordedByName: 'hanna',
      recordedByRole: 'attendant',
    });
  });

  it('keeps the role held at the time, so a promotion cannot rewrite history', () => {
    // Stored on the record rather than looked up from the staff list later.
    const stamped = attribution({ name: 'hanna', role: 'attendant' });
    expect(stamped.recordedByRole).toBe('attendant');
  });

  it('stamps nothing when there is nobody to stamp', () => {
    expect(attribution(null)).toEqual({});
    expect(attribution(undefined)).toEqual({});
    expect(attribution({ role: 'attendant' })).toEqual({});
    expect(attribution({ name: '   ' })).toEqual({});
  });

  it('does not invent a role that was not given', () => {
    expect(attribution({ name: 'hanna' })).toEqual({ recordedByName: 'hanna', recordedByRole: undefined });
  });
});

describe('who worked on these', () => {
  it('lists each person once, busiest first', () => {
    expect(contributors(rows)).toEqual([
      { name: 'hanna', count: 2 },
      { name: 'Musa', count: 1 },
    ]);
  });

  it('counts what nobody is on', () => {
    expect(unattributedCount(rows)).toBe(1);
  });

  it('copes with an empty shop', () => {
    expect(contributors([])).toEqual([]);
    expect(unattributedCount([])).toBe(0);
  });
});

describe('filtering to one person', () => {
  it('returns only their records', () => {
    expect(byContributor(rows, 'hanna').map(r => r.id)).toEqual(['1', '2']);
    expect(byContributor(rows, 'Musa').map(r => r.id)).toEqual(['3']);
  });

  it('returns everything when nobody is chosen', () => {
    expect(byContributor(rows, null)).toHaveLength(4);
  });

  it('can show the ones saved before any of this existed', () => {
    // A filter that silently drops old work is worse than no filter.
    expect(byContributor(rows, UNATTRIBUTED).map(r => r.id)).toEqual(['4']);
  });

  it('shows nothing for somebody who recorded nothing', () => {
    expect(byContributor(rows, 'Nobody')).toEqual([]);
  });
});

describe('the label', () => {
  it('is the name, or nothing at all', () => {
    expect(recordedByLabel({ recordedByName: 'hanna' })).toBe('hanna');
    expect(recordedByLabel({})).toBeNull();
    expect(recordedByLabel({ recordedByName: '  ' })).toBeNull();
    expect(recordedByLabel(null)).toBeNull();
  });
});

describe('the record types actually carry it', () => {
  it('a sale keeps who made it', () => {
    const types = readSource('src/types/store.ts');
    expect(types).toContain('recordedByName?: string;');
    expect(readSource('src/lib/store-data.ts')).toContain('...attribution({ name: actorName, role: actorRole })');
  });

  it('a laundry record keeps who took it in', () => {
    const offline = readSource('src/lib/laundry-offline.ts');
    expect(offline).toContain('recordedByName: input.recordedByName');
    expect(readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx')).toContain('...attribution(currentUser)');
  });

  it('no sale path drops the actor on the floor', () => {
    // A scanned receipt was the only sale nobody owned.
    const scanner = readSource('src/components/ReceiptScanner.tsx');
    expect(scanner).toContain('recordSale(updated, existing.id, item.quantity, currentUser?.name, currentUser?.role)');
  });
});

describe('the filter stays out of the way', () => {
  const filter = readSource('src/components/RecordedByFilter.tsx');

  it('is one control, not a labelled row of chips', () => {
    // The first version cost two lines of a phone screen to say something a
    // shop needs about once a week.
    expect(filter).toContain('<select');
    expect(filter).not.toContain('Recorded by</div>');
  });

  it('keeps the counts, inside the options', () => {
    expect(filter).toContain('{person.name} · {person.count}');
    expect(filter).toContain('Everyone · {records.length}');
  });

  it('shows nothing at all in a one-person shop', () => {
    expect(filter).toContain('if (people.length + (missing > 0 ? 1 : 0) < 2) return null;');
  });

  it('rides in a row that already exists rather than adding one', () => {
    expect(readSource('src/components/SalesHistory.tsx'))
      .toContain('<RecordedByFilter records={periodEntries} selected={recordedBy} onSelect={setRecordedBy} />');
    expect(readSource('src/components/laundry/LaundryWorkspace.tsx'))
      .toContain('<RecordedByFilter records={decorated} selected={recordedBy} onSelect={setRecordedBy} />');
  });

  it('carries attribution through the order shape the workspace rebuilds from', () => {
    // Every laundry row is rebuilt from an order, so the fields have to
    // survive that round trip or the label and the filter see nothing.
    expect(readSource('src/lib/laundry-offline.ts')).toContain('recorded_by_name: record.recordedByName');
    expect(readSource('src/lib/laundry-records.ts')).toContain('recordedByName: meta.recorded_by_name');
  });
});
