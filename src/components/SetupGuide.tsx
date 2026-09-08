import { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { StoreData } from '@/types/store';
import {
  dismissGuide,
  guideProgress,
  nextStep,
  shouldRunGuide,
  type GuideStep,
} from '@/lib/setup-guide';

/**
 * The spotlight that walks a new shop through opening.
 *
 * The app dims, one control stays lit, and an arrow points at it. The lit part
 * is genuinely clickable — the overlay never swallows the tap — so the
 * merchant is doing the real thing, not watching a demo of it.
 *
 * It follows the store rather than counting clicks: each step decides for
 * itself whether it is done, so wandering off, doing a step early, or coming
 * back tomorrow all work.
 */

interface Props {
  store: StoreData;
  /** The tab currently open, so a step can ask to be somewhere first. */
  tab: string;
  onNavigate: (tab: string) => void;
}

interface Hole {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;

export default function SetupGuide({ store, tab, onNavigate }: Props) {
  const [hole, setHole] = useState<Hole | null>(null);
  const [hidden, setHidden] = useState(false);

  const running = shouldRunGuide(store, tab) && !hidden;
  const step: GuideStep | null = running ? nextStep(store, tab) : null;
  const progress = guideProgress(store, tab);

  // Find and follow the target. Layout effect so the hole is placed before
  // paint rather than flashing over the whole screen first.
  useLayoutEffect(() => {
    if (!step) { setHole(null); return; }

    const measure = () => {
      // The same anchor exists on the desktop sidebar and the mobile bottom
      // bar, and only one of them is on screen. querySelector returns the
      // first in the DOM - the hidden sidebar button, measuring 0x0 - so pick
      // the one that is actually visible instead.
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-guide="${step.target}"]`),
      );
      const element = candidates.find(node => {
        const box = node.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return false;

        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;

        /*
         * Scrolled out of view is not the same as covered - but it is not
         * usable either. A gaming centre's first session button sits below a
         * panel of customer requests, so the hole was drawn 837px down a 554px
         * screen: the merchant saw the app dim and nothing else, with the card
         * off the bottom too. Bring it into view and let the next measure find
         * it where it can be seen.
         */
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return false;
        }

        /*
         * An element behind an open sheet still measures perfectly well.
         * The intake opens as a full-screen sheet over the workspace, and the
         * button this step points at stayed in the document underneath it - so
         * the spotlight lit whatever the sheet happened to be showing at those
         * coordinates. On a phone that was the Service field, with the card
         * sitting across the clothes list.
         *
         * So ask the document what is actually at that point rather than
         * trusting the rectangle.
         */
        const atPoint = document.elementFromPoint(x, y);
        return !!atPoint && (node === atPoint || node.contains(atPoint) || atPoint.contains(node));
      });
      if (!element) { setHole(null); return; }
      const rect = element.getBoundingClientRect();
      setHole({
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      });
    };

    measure();
    // The target can arrive late (a tab switch, a lazy chunk) or move.
    const timer = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [step?.id, step?.target, tab]);

  // A step that lives on another tab takes the merchant there first.
  useEffect(() => {
    if (step?.tab && step.tab !== tab) onNavigate(step.tab);
  }, [step?.id, step?.tab, tab, onNavigate]);

  if (!step) return null;

  /*
   * Nothing to point at means nothing to say.
   *
   * The fallback used to dim the entire screen and float the card in the
   * middle, which is how a step whose target was covered ended up lying across
   * the form the merchant was filling in. If the guide cannot find its target
   * it stands down until it can.
   */
  if (!hole) return null;

  // Put the card on whichever side of the hole has more room.
  const below = hole ? hole.top + hole.height : 0;
  const roomBelow = window.innerHeight - below;
  const cardBelow = !hole || roomBelow > 220;

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" role="dialog" aria-label="Setup guide">
      {/* The dim, with a hole cut in it. The ring is the whole overlay's
          shadow, so the lit area stays genuinely clickable underneath. */}
      {hole ? (
        <div
          className="absolute rounded-2xl transition-all duration-300 ease-out"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.82)',
            outline: '2px solid rgb(250 204 21)',
            outlineOffset: '-1px',
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(2,6,23,0.82)' }} />
      )}

      {/* The arrow, pointing at the lit control. */}
      {hole && (
        <div
          className="absolute text-primary animate-bounce"
          style={{
            left: Math.min(Math.max(hole.left + hole.width / 2 - 12, 8), window.innerWidth - 32),
            top: cardBelow ? hole.top + hole.height + 2 : hole.top - 30,
          }}
        >
          {cardBelow ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
        </div>
      )}

      {/* What to do. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[min(24rem,calc(100vw-2rem))] pointer-events-auto"
        style={hole
          ? (cardBelow
            ? { top: Math.min(hole.top + hole.height + 34, window.innerHeight - 200) }
            : { top: Math.max(hole.top - 190, 16) })
          : { top: '30%' }}
      >
        <div className="rounded-2xl border border-primary/40 bg-card p-4 shadow-2xl space-y-2.5 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-black tracking-wider text-primary">
                Step {progress.index + 1} of {progress.total}
              </p>
              <h3 className="font-display font-black text-base text-foreground leading-tight">{step.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => { dismissGuide(store?.accessCode); setHidden(true); }}
              aria-label="Close the setup guide"
              className="w-8 h-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>

          <div className="flex items-center gap-1.5 pt-0.5">
            {Array.from({ length: progress.total }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i < progress.index ? 'w-6 bg-primary' : i === progress.index ? 'w-6 bg-primary/40' : 'w-3 bg-border'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
