/**
 * What the guide is actually showing, and what was actually done inside it.
 *
 * This exists because of a lost order. The laundry intake ran as a rehearsal -
 * nothing saved - whenever the guide's *next step* happened to be "record your
 * first job". That was inferred from the shop's data, not from the guide being
 * anywhere near the screen. So a merchant whose guide never displayed opened
 * Intake, counted a real customer's clothes into it, pressed save, and watched
 * the app tell him it was practice. He had to take the whole bundle in again.
 *
 * Inference was the mistake. A rehearsal is a thing the merchant is knowingly
 * doing, and the only component that knows whether they are knowingly doing it
 * is the guide, because it is the thing on the screen saying so. So the guide
 * publishes the step it is displaying, and nothing else is allowed to guess.
 *
 * The rule that follows is worth stating plainly, because it is the whole
 * point: if the guide is not on screen, the record is real and it is saved.
 * Not displayed, dismissed, skipped, never seen - all the same answer. The app
 * may fail to teach somebody. It may not eat their work.
 */

/** The step the guide is displaying right now, or null when it is not up. */
let showing: string | null = null;

export const GUIDE_STEP_SIGNAL = 'storeflow:guide-step';

function announce() {
  try {
    window.dispatchEvent(new CustomEvent(GUIDE_STEP_SIGNAL, { detail: showing }));
  } catch { /* no window, in tests */ }
}

/** Called by the guide as it renders a step, and with null as it goes away. */
export function setGuideStepOnScreen(stepId: string | null): void {
  if (showing === stepId) return;
  showing = stepId;
  announce();
}

export function guideStepOnScreen(): string | null {
  return showing;
}

/**
 * Whether the guide is, at this moment, showing the merchant how to do this.
 *
 * The only thing that may put a screen into rehearsal.
 */
export function guideIsShowing(stepId: string): boolean {
  return showing === stepId;
}

/* ── What was done inside the walk ──────────────────────────────────────── */

const LOG_KEY = 'storeflow_guide_log_';

export interface GuideEvent {
  /** The step that was on screen. */
  step: string;
  /** 'shown' when the guide displayed it, 'done' when it was completed. */
  what: 'shown' | 'done';
  at: string;
}

const key = (accessCode?: string) => `${LOG_KEY}${String(accessCode || '').toUpperCase()}`;

export function guideLog(accessCode?: string): GuideEvent[] {
  try {
    const raw = localStorage.getItem(key(accessCode));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record that a step was shown or finished.
 *
 * Kept because "did this shop ever actually see the walk?" was unanswerable,
 * and the answer mattered: the walk was completing itself off the shop's data
 * while the merchant sat there having been taught nothing. A step that was
 * never shown cannot honestly be called done.
 */
export function recordGuideEvent(accessCode: string | undefined, step: string, what: 'shown' | 'done'): void {
  try {
    const log = guideLog(accessCode);
    // Shown fires on every render of a step; only the first is worth keeping.
    if (log.some(entry => entry.step === step && entry.what === what)) return;
    const next = [...log, { step, what, at: new Date().toISOString() }].slice(-40);
    localStorage.setItem(key(accessCode), JSON.stringify(next));
  } catch { /* private mode */ }
}

/** Whether the merchant was ever actually shown this step. */
export function wasStepShown(accessCode: string | undefined, step: string): boolean {
  return guideLog(accessCode).some(entry => entry.step === step && entry.what === 'shown');
}

/** Every step the guide displayed to this shop, oldest first. */
export function stepsShown(accessCode?: string): string[] {
  return guideLog(accessCode).filter(entry => entry.what === 'shown').map(entry => entry.step);
}

/** Tests only. */
export function resetGuideActivity(): void {
  showing = null;
}
