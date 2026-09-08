import { useEffect, useState } from 'react';
import type { StoreData } from '@/types/store';
import { breakEven } from '@/lib/service-breakeven';
import { breakEvenCelebrated, markBreakEvenCelebrated } from '@/lib/service-month-report';
import BreakEvenReached from '@/components/BreakEvenReached';

/**
 * Notices the month covering itself, once.
 *
 * Kept apart from the card that shows the figure, because this fires on a
 * change rather than rendering a state - and it must fire exactly once a
 * month, not every time the screen is opened after the target was passed.
 */

interface Props {
  store: StoreData;
  canSeeMoney: boolean;
}

export default function BreakEvenWatcher({ store, canSeeMoney }: Props) {
  const [showing, setShowing] = useState(false);
  const [surplus, setSurplus] = useState(0);

  useEffect(() => {
    if (!canSeeMoney) return;
    const code = String(store.accessCode || '');
    if (!code || breakEvenCelebrated(code)) return;

    const state = breakEven(store);
    if (!state.reached) return;

    setSurplus(state.surplus);
    setShowing(true);
    // Marked on sight rather than on dismissal: a merchant who closes the app
    // mid-drop-off has still had the moment, and should not get it again.
    markBreakEvenCelebrated(code);
  }, [store, canSeeMoney]);

  if (!showing) return null;
  return <BreakEvenReached surplus={surplus} onDone={() => setShowing(false)} />;
}
