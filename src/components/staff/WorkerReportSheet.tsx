import { useMemo, useState } from 'react';
import { Copy, FileText, MessageCircle, X } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { normalizeWhatsAppPhone } from '@/lib/laundry-whatsapp';
import { reportTotals, reportWindow, workerReport, workerReportMessage, type ReportDetail, type ReportPerson, type ReportRange } from '@/lib/worker-report';
import { dayKey } from '@/lib/day-records';
import DateField from '@/components/DateField';
import ScrollLock from '@/components/ScrollLock';
import { showToast } from '@/components/Toast';

const RANGES: [ReportRange, string][] = [
  ['this-week', 'This week'],
  ['last-week', 'Last week'],
  ['this-month', 'This month'],
  ['custom', 'Pick dates'],
];

/** Past this a WhatsApp link can be cut off on some phones, so the phone's own share sheet is used. */
const LONG_FOR_A_LINK = 1800;

/**
 * One person's report for a stretch they choose, ready to send on WhatsApp.
 *
 * The worker opens it from her home screen and sends it to the shop; the owner
 * opens it from the staff list and can send it to the worker. Summary sends
 * the totals; Full breakdown sends the same totals with every line under them.
 */
export default function WorkerReportSheet({ store, person, sendTo, onClose }: {
  store: StoreData;
  person: ReportPerson;
  /** Whose WhatsApp it opens, and what the button says. No phone opens the contact picker. */
  sendTo: { phone?: string; label: string };
  onClose: () => void;
}) {
  const version = useShopLaundryVersion();
  const [range, setRange] = useState<ReportRange>('this-week');
  const [detail, setDetail] = useState<ReportDetail>('summary');
  const today = dayKey(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const report = useMemo(() => {
    let bundles: ReturnType<typeof shopLaundryRecords> = [];
    try { bundles = shopLaundryRecords(String(store.accessCode || '')); } catch { /* none readable */ }
    return workerReport(store, bundles, person, reportWindow(range, Date.now(), { from, to }));
  }, [store, version, person, range, from, to]);
  const totals = reportTotals(report);
  const message = workerReportMessage(store, report, detail);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      showToast('Report copied. Paste it anywhere.');
    } catch {
      showToast('Could not copy on this phone', 'error');
    }
  };

  const send = async () => {
    if (message.length > LONG_FOR_A_LINK && typeof navigator.share === 'function') {
      try { await navigator.share({ text: message }); return; } catch { /* closed the share sheet, or it failed: fall back to the link */ }
    }
    const phone = normalizeWhatsAppPhone(sendTo.phone || '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-display font-semibold border transition-colors ${active ? 'bg-primary/15 text-primary border-primary/40' : 'bg-surface-2 text-muted-foreground border-transparent'}`;

  return (
    <div className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <ScrollLock />
      <div
        role="dialog"
        aria-label={`Report for ${person.name}`}
        data-worker-report
        className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-card border border-border rounded-t-3xl sm:rounded-3xl p-4 pb-8 space-y-4 animate-slide-up"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-black text-lg flex items-center gap-1.5"><FileText className="w-5 h-5 text-primary" /> Work report</h3>
            <p className="text-xs text-muted-foreground">{person.name} · {report.window.label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">Time</p>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setRange(id)} aria-pressed={range === id} className={chip(range === id)}>{label}</button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="grid grid-cols-2 gap-2" data-report-dates>
              <DateField value={from} onChange={value => setFrom(value || today)} max={today} placeholder="From" ariaLabel="From" />
              <DateField value={to} onChange={value => setTo(value || today)} max={today} placeholder="To" ariaLabel="To" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">What to send</p>
          <div className="grid grid-cols-2 gap-2">
            {([['summary', 'Summary', 'The totals only'], ['full', 'Full breakdown', 'Every line, with date and time']] as [ReportDetail, string, string][]).map(([id, label, note]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDetail(id)}
                aria-pressed={detail === id}
                className={`rounded-xl border p-2.5 text-left transition-colors ${detail === id ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}
              >
                <span className={`block text-sm font-display font-bold ${detail === id ? 'text-primary' : ''}`}>{label}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">{note}</span>
              </button>
            ))}
          </div>
        </div>

        {report.empty ? (
          <p className="text-sm text-muted-foreground rounded-xl bg-surface-2 p-3">
            Nothing recorded under {person.name}'s name in this time. Only what was put in under their own sign-in shows here.
          </p>
        ) : (
          <div className="space-y-2" data-report-totals>
            {totals.map(total => (
              <div key={total.key} className="rounded-xl bg-surface-2 p-3">
                <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">{total.heading}</p>
                <p className="text-sm font-display font-semibold mt-0.5">{total.line}</p>
                {total.extra && <p className="text-xs text-muted-foreground mt-0.5">{total.extra}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wide">The message</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed rounded-xl border border-border bg-background p-3 max-h-64 overflow-y-auto" data-report-message>{message}</pre>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={() => void send()} className="h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
            <MessageCircle className="w-4 h-4" /> {sendTo.label}
          </button>
          <button type="button" onClick={() => void copy()} aria-label="Copy the report" className="h-12 px-4 rounded-xl bg-surface-2 border border-border font-display font-bold text-sm flex items-center gap-1.5">
            <Copy className="w-4 h-4" /> Copy
          </button>
        </div>
      </div>
    </div>
  );
}
