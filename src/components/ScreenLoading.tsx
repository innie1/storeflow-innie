import { useEffect, useState } from 'react';

/**
 * What shows while a screen's code is still arriving - after a moment.
 *
 * It used to show at once, every time: a spinner and "Loading module..."
 * that flashed for a fraction of a second even when the screen was already
 * on the phone and only needed a moment to start. Moving between screens felt
 * like waiting even when nothing was being waited for.
 *
 * Tab changes now keep the screen you were on until the next one is ready
 * (see setTab in Index), so this is only seen on a genuinely slow first open,
 * and only once that has lasted long enough to be worth saying so.
 */
export default function ScreenLoading({ delayMs = 400 }: { delayMs?: number }) {
  const [show, setShow] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!show) return <div className="min-h-[50vh]" aria-busy="true" />;

  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-3" role="status" aria-busy="true">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-sm text-muted-foreground">Opening…</p>
    </div>
  );
}
