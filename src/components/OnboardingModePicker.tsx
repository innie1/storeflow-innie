interface OnboardingModePickerProps {
  onSelect: (mode: 'simple' | 'full') => void;
}

// Drop this in as its own step in the signup wizard, after the store name/
// category step and before the final createStore() call. Call
// createStore(..., mode) with whatever this reports.
export default function OnboardingModePicker({ onSelect }: OnboardingModePickerProps) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="text-center mb-2">
        <h2 className="text-lg font-display font-bold">How do you want to start?</h2>
        <p className="text-sm text-muted-foreground mt-1">You can switch this later in Settings.</p>
      </div>

      <button
        onClick={() => onSelect('simple')}
        className="w-full text-left p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 active:scale-[0.98] transition"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🎯</span>
          <h3 className="font-display font-bold text-base">Simple Mode</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Just track what you sell and what's in stock. One big button to log a sale, nothing extra to learn. Best if you're new to using an app to run your store.
        </p>
      </button>

      <button
        onClick={() => onSelect('full')}
        className="w-full text-left p-4 rounded-2xl border-2 border-border active:scale-[0.98] transition"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🚀</span>
          <h3 className="font-display font-bold text-base">Full Mode</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          The complete StoreFlow experience — Flow's advice engine, forecasts, pricing insights, and every tool unlocked from day one. Best if you want the full picture right away.
        </p>
      </button>
    </div>
  );
}
