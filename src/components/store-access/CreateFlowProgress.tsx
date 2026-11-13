

/**
 * How far through creating a store the merchant is.
 *
 * It measured three steps because the whole of "tell us about your shop" was
 * one page. Now that page is three questions, so the bar counts five and moves
 * on every answer rather than sitting still through the longest part of the
 * flow. It also says the number: a bar alone tells you there is more, not how
 * much more.
 */
export default function CreateFlowProgress({ step, of = 3 }: { step: number; of?: number }) {
  const pct = Math.round((step / of) * 100);
  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
        <span>Step {step} of {of}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
