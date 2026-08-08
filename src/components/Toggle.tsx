import NotificationPreferences from '@/components/NotificationPreferences';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

// Settings-aligned toggle row — every toggle aligns to the same right edge.
// The Notifications page already uses this component. When its first
// "Insights" row renders, we attach the expanded background-notification
// controls without changing the existing Settings screen structure.
export default function ToggleRow({ checked, onChange, label, description }: ToggleProps) {
  const row = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 py-3 px-1 text-left group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold text-foreground leading-tight">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 pr-2">{description}</p>
        )}
      </div>
      <div
        className={`shrink-0 relative w-12 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-success' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? 'translate-x-[26px]' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );

  if (label === 'Insights') {
    return (
      <div>
        {row}
        <NotificationPreferences />
      </div>
    );
  }

  return row;
}
