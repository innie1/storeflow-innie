interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

// Settings-aligned toggle row — every toggle aligns to the same right edge.
export default function ToggleRow({ checked, onChange, label, description }: ToggleProps) {
  return (
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
      {/* Track */}
      <div
        className={`shrink-0 relative w-12 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-success' : 'bg-border'
        }`}
      >
        {/* Thumb */}
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? 'translate-x-[26px]' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}
