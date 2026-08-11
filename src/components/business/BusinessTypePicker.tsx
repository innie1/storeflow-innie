import { getBusinessTemplateOptions } from '@/lib/business-templates';
import type { StoreType } from '@/types/store';

interface Props {
  value?: StoreType;
  onChange: (type: StoreType) => void;
}

/**
 * Deliberately simple owner-facing business picker. The complexity of the
 * business engine stays behind the scenes; owners only choose what they run.
 */
export default function BusinessTypePicker({ value, onChange }: Props) {
  const options = getBusinessTemplateOptions();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display font-bold text-xl">What business do you run?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manchant will prepare the tools you need. You can change your prices and offerings later.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map(option => {
          const selected = value === option.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => onChange(option.type)}
              aria-pressed={selected}
              className={`text-left rounded-2xl border p-4 transition-all ${
                selected
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="text-3xl mb-2">{option.icon}</div>
              <div className="font-display font-bold text-sm">{option.name}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-snug">
                {option.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
