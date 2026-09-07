import { User } from 'lucide-react';
import { contributors, UNATTRIBUTED, unattributedCount, type RecordedBy } from '@/lib/recorded-by';

/**
 * Whose work to show, in one control.
 *
 * This began as a labelled row of chips and took two lines of a phone screen
 * to say something most shops need once a week. It is a single short select
 * now, sitting in a row that already exists — the counts live inside the
 * options, so "how many did each of them do" is one tap away rather than
 * permanently on screen.
 *
 * It renders nothing until more than one person has actually recorded
 * something: a one-person shop needs no filter with one name in it.
 */

interface Props<T extends RecordedBy> {
  records: T[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}

export default function RecordedByFilter<T extends RecordedBy>({
  records, selected, onSelect,
}: Props<T>) {
  const people = contributors(records);
  const missing = unattributedCount(records);

  if (people.length + (missing > 0 ? 1 : 0) < 2) return null;

  return (
    <div className={`relative shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" />
      <select
        value={selected ?? ''}
        onChange={event => onSelect(event.target.value || null)}
        aria-label="Show work recorded by"
        className={`h-11 pl-8 pr-2 rounded-lg bg-surface-2 border text-xs font-display font-bold outline-none appearance-none cursor-pointer max-w-[9.5rem] truncate ${
          selected ? 'border-primary text-primary' : 'border-border text-foreground'
        }`}
      >
        <option value="">Everyone · {records.length}</option>
        {people.map(person => (
          <option key={person.name} value={person.name}>
            {person.name} · {person.count}
          </option>
        ))}
        {missing > 0 && (
          <option value={UNATTRIBUTED}>Not recorded · {missing}</option>
        )}
      </select>
    </div>
  );
}
