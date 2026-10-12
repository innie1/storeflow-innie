import { useEffect, useReducer, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { StoreData } from '@/types/store';
import {
  dismissGuide,
  guideProgress,
  guideSteps,
  nextStep,
  CHECKLIST_SIGNAL,
  PRACTISED_SIGNAL,
  shouldRunGuide,
  type GuideStep,
} from '@/lib/setup-guide';
import { recordGuideEvent, startPractice } from '@/lib/guide-activity';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';
import { glowGuideTarget } from '@/lib/guide-glow';
import ConfirmModal from '@/components/ConfirmModal';

/**
 * "Get your shop ready": the setup checklist, in one place on Home.
 *
 * This replaced a walk that dimmed the whole app, followed the merchant from
 * tab to tab and pulled them onto pages while they were busy elsewhere. Here
 * nothing moves unless they tap: each row's button opens the right screen
 * and briefly lights the control to press. A row is ticked by what the shop
 * has actually done, so it never comes undone. Hidden, it stays hidden on
 * this phone until "Show setup checklist" in Settings brings it back; done,
 * the shop gets its ready-for-business moment and the card goes for good.
 */

interface Props {
  store: StoreData;
  onNavigate: (tab: string) => void;
}

export default function SetupChecklist({ store, onNavigate }: Props) {
  const [askHide, setAskHide] = useState(false);
  // A practice run writes nothing to the shop, and hiding or bringing the
  // checklist back (from Settings) changes only this phone's flag - so
  // nothing would re-render this. The signals do.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(PRACTISED_SIGNAL, refresh);
    window.addEventListener(CHECKLIST_SIGNAL, refresh);
    return () => {
      window.removeEventListener(PRACTISED_SIGNAL, refresh);
      window.removeEventListener(CHECKLIST_SIGNAL, refresh);
    };
  }, []);

  const showing = shouldRunGuide(store);
  const next = nextStep(store);
  // Kept so "did this shop ever actually see it?" stays answerable.
  useEffect(() => {
    if (next && showing) recordGuideEvent(store.accessCode, next.id, 'shown');
  }, [next?.id, showing, store.accessCode]);

  if (!showing) return null;

  const steps = guideSteps(store);
  const progress = guideProgress(store);

  const go = (step: GuideStep) => {
    if (step.practice) {
      startPractice();
      requestLaundryWorkspace('record');
    }
    if (step.tab) onNavigate(step.tab);
    if (step.target) glowGuideTarget(step.target);
  };

  return (
    <section aria-label="Get your shop ready" className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-black text-base leading-tight">Get your shop ready</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{progress.done} of {progress.total} done</p>
        </div>
        <button
          type="button"
          onClick={() => setAskHide(true)}
          aria-label="Hide the setup checklist"
          className="w-8 h-8 shrink-0 -mr-1 -mt-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
      </div>

      <ol className="mt-3 divide-y divide-border">
        {steps.map((step, index) => {
          const done = step.done(store);
          const current = step.id === next?.id;
          return (
            <li key={step.id} className="flex items-center gap-3 py-2.5">
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${
                  done ? 'bg-primary text-primary-foreground' : current ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground'
                }`}
                aria-hidden="true"
              >
                {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-display font-bold leading-tight ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {step.title}
                  {done && <span className="sr-only"> (done)</span>}
                </p>
                {current && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{step.body}</p>}
              </div>
              {!done && (
                <button
                  type="button"
                  onClick={() => go(step)}
                  className={`shrink-0 h-8 px-3 rounded-lg text-xs font-display font-black transition active:scale-95 ${
                    current ? 'bg-primary text-primary-foreground' : 'bg-surface-2 border border-border text-foreground'
                  }`}
                >
                  {step.action}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {askHide && (
        <ConfirmModal
          isOpen
          title="Hide the setup checklist?"
          description="You can bring it back any time from Settings, under Show setup checklist."
          confirmText="Hide"
          variant="primary"
          icon="✅"
          onConfirm={() => { setAskHide(false); dismissGuide(store.accessCode); }}
          onCancel={() => setAskHide(false)}
        />
      )}
    </section>
  );
}
