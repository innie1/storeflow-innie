import { useMemo, useState } from 'react';
import { Banknote, CalendarCheck, Landmark } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { answerPayday, paydaysDue, recordSalaryPaid } from '@/lib/payday';
import { showToast } from '@/components/Toast';
import ScrollLock from '@/components/ScrollLock';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dayInWords(at: number): string {
  const date = new Date(at);
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/**
 * "Did you pay Ada for November?" on payday, to the owner.
 *
 * Built from the staff settings - who is on a wage, how much, and the day it
 * is paid - so on the day nothing has to be typed: Paid in cash or Paid by
 * transfer records the salary, Not yet asks again tomorrow. One person at a
 * time, oldest payday first. Tapping outside only puts it away until the app
 * is opened again; it does not answer for the owner.
 */
export default function PaydayPrompt({ store, onUpdate }: { store: StoreData; onUpdate: (store: StoreData) => void }) {
  const [put, setPut] = useState<Set<string>>(() => new Set());
  const [answered, setAnswered] = useState(0);
  const [other, setOther] = useState<string | null>(null);
  const due = useMemo(() => paydaysDue(store).filter(item => !put.has(item.key)), [store, put, answered]);
  const current = due[0];
  if (!current) return null;

  const close = () => setPut(previous => new Set(previous).add(current.key));
  const amount = other !== null ? Math.max(0, Number(other) || 0) : current.amount;

  const paid = (paidFrom: 'cash' | 'bank') => {
    if (amount <= 0) {
      showToast('Type what was paid first', 'info');
      return;
    }
    const next = recordSalaryPaid(store, current, { amount, paidFrom });
    setOther(null);
    onUpdate(next);
    showToast(`Recorded: ${current.name}'s ${current.monthName} salary, ${naira(amount)}`);
  };
  const later = (answer: 'later' | 'skip') => {
    answerPayday(String(store.accessCode || ''), current.key, answer);
    setOther(null);
    setAnswered(count => count + 1);
    if (answer === 'later') showToast(`I'll ask about ${current.name} again tomorrow`, 'info');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 bg-background/85 backdrop-blur-sm" onClick={close}>
      <ScrollLock />
      <div
        role="dialog"
        aria-label={`Payday for ${current.name}`}
        data-payday-prompt
        className="w-full max-w-sm rounded-3xl bg-card border border-border p-5 space-y-4 shadow-2xl animate-slide-up"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-primary uppercase tracking-wider">
            <CalendarCheck className="w-4 h-4" /> Payday
          </span>
          {due.length > 1 && <span className="text-[11px] text-muted-foreground">{due.length} people to pay</span>}
        </div>

        <div className="space-y-1">
          <h3 className="font-display font-black text-lg leading-snug">Did you pay {current.name} for {current.monthName}?</h3>
          <p className="text-xs text-muted-foreground">
            {current.daysSince === 0 ? 'Payday is today' : `Payday was ${dayInWords(current.payday)}`}, from your staff settings.
          </p>
        </div>

        <div className="rounded-2xl bg-surface-2 border border-border p-3">
          {other === null ? (
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display font-black text-2xl">{naira(current.amount)}</span>
              <button type="button" onClick={() => setOther(String(current.amount))} className="text-xs font-bold text-primary">
                Paid a different amount
              </button>
            </div>
          ) : (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">What you paid {current.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">₦</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={other}
                  onChange={event => setOther(event.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-transparent font-display font-black text-2xl focus:outline-none"
                  aria-label="Amount paid"
                />
              </span>
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => paid('cash')} className="h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
            <Banknote className="w-4 h-4" /> Paid in cash
          </button>
          <button type="button" onClick={() => paid('bank')} className="h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
            <Landmark className="w-4 h-4" /> Paid by transfer
          </button>
        </div>
        <button type="button" onClick={() => later('later')} className="w-full h-11 rounded-xl bg-surface-2 border border-border font-display font-bold text-sm">
          Not yet, ask me tomorrow
        </button>
        <button type="button" onClick={() => later('skip')} className="w-full text-[11px] text-muted-foreground underline underline-offset-2">
          {current.name} is not being paid for {current.monthName}
        </button>
      </div>
    </div>
  );
}
