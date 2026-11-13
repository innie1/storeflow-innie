import { CalendarDays, X } from 'lucide-react';

/**
 * A date box that looks like one.
 *
 * The phone's own date input shows an empty square with a small arrow until a
 * date is picked, so it read as broken. This shows a calendar and the date in
 * words - or what to do - and keeps the phone's own picker underneath, so a
 * tap still opens the calendar every phone already knows.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  /** Show a cross to empty it again. */
  clearable?: boolean;
  ariaLabel?: string;
  className?: string;
}

function describe(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DateField({ value, onChange, placeholder = 'Pick a date', min, max, clearable, ariaLabel, className = '' }: Props) {
  return (
    <div className={`relative flex items-center gap-2 h-10 px-3 rounded-lg bg-surface-2 border border-border text-sm focus-within:border-primary ${className}`}>
      <CalendarDays className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className={`flex-1 min-w-0 truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value ? describe(value) : placeholder}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        aria-label={ariaLabel || placeholder}
        onChange={event => onChange(event.target.value)}
        // Some browsers open the picker only from its own little icon.
        onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* opens on its own */ } }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear the date"
          className="relative z-10 -mr-1 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
