/**
 * Whether somebody is in the middle of something they would hate to lose.
 *
 * The app updates itself by reloading, and a reload throws away whatever is
 * typed but not saved. Most of the time that costs nothing. During an intake
 * it costs a bundle: the customer is standing there, the counter has just
 * counted twelve shirts into the form, and the screen goes blank and empty.
 *
 * So screens that hold unsaved work say so, and the updater waits for a moment
 * when nothing is open. It is a count rather than a flag because two things
 * can be open at once and the first to close must not clear the second.
 */

let openCount = 0;
const listeners = new Set<() => void>();

function announce(): void {
  // A listener that throws must not stop the others hearing about it, nor
  // leave a form counted as open forever.
  listeners.forEach(listener => { try { listener(); } catch { /* not our problem */ } });
}

/**
 * Call when unsaved work appears on screen. Returns the function that says it
 * has gone - so the caller cannot forget to decrement, and a React effect can
 * return it directly.
 */
export function beginWork(): () => void {
  openCount += 1;
  announce();
  let released = false;
  return () => {
    // Guarded, because an effect cleanup that ran twice would otherwise let
    // the count drift below what is really open and reload over a live form.
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    announce();
  };
}

/**
 * Tell me when that changes.
 *
 * The updater asks the question at the moment it wants to reload, so a plain
 * count was enough for it. The app itself now needs to know as it happens:
 * only the screen you are looking at is mounted, and a screen holding a form
 * somebody is halfway through - twelve shirts counted into an intake - has to
 * be held on to until that form is done. Returns the unsubscribe function.
 */
export function subscribeWorkInProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function workInProgress(): boolean {
  return openCount > 0;
}

/** Tests only: forget everything, so one case cannot leak into the next. */
export function resetWorkInProgress(): void {
  openCount = 0;
  listeners.clear();
}
