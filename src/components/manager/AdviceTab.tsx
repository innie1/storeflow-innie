import { isServiceFirstBusiness } from '@/lib/business-runtime';
import {
  MessageCircle,
  Package,
  Star,
  ThumbsUp,
  ThumbsDown,
  ClipboardList,
  Hourglass,
  ShoppingCart,
  Sparkles,
  Archive,
  Zap,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
} from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import FlowAdviceReport from '@/components/FlowAdviceReport';
import MessageIcon from '@/components/MessageIcon';
import { getPendingSummary } from '@/lib/store-data';
import { expenseAnalysis, inventoryIntelligence } from '@/lib/manager-intel';
import { waitingToCollect } from '@/lib/money-figures';
import { breakEven, breakEvenSentence } from '@/lib/service-breakeven';
import { isServiceShop } from '@/lib/flow-service-brain';
import SupplierPanel from './SupplierPanel';
import type { ManagerState } from './useManager';

/** The icon's colour, by how much the advice matters. */
const PRIORITY_INK: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-warning',
  medium: 'text-primary',
  low: 'text-muted-foreground',
};

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/**
 * What the Advice tab shows when there is no advice.
 *
 * It was a party popper and "Looking good!", which read as an empty page: an
 * owner could not tell whether Flow had looked and found nothing or had not
 * looked at all. This is what it looked at, and what each came to, so a quiet
 * day reads as checked.
 */
function AllClear({ s }: { s: ManagerState }) {
  const { store, settings, onNavigate } = s;
  if (!settings.businessAdvice) {
    return (
      <div className="p-4 rounded-2xl bg-card shadow-card text-sm text-muted-foreground">
        Advice is turned off. Turn on Business advice in Settings, under Flow, and it will appear here.
      </div>
    );
  }
  const rows: { ok: boolean; text: string; goTo?: string }[] = [];
  const owed = getPendingSummary(store);
  rows.push(owed.totalOwed > 0
    ? { ok: owed.overdue.length === 0, text: `${naira(owed.totalOwed)} owed by ${owed.customerCount} ${owed.customerCount === 1 ? 'customer' : 'customers'}${owed.overdue.length ? `, ${owed.overdue.length} overdue` : ', none overdue'}.`, goTo: 'pending' }
    : { ok: true, text: 'Nobody owes you money.' });
  if (isServiceShop(store)) {
    const waiting = waitingToCollect(store);
    if (waiting.count > 0) {
      rows.push({ ok: waiting.unpaid === 0, text: `${waiting.count} ${waiting.count === 1 ? 'bundle is' : 'bundles are'} waiting to be collected${waiting.unpaid > 0 ? `, ${naira(waiting.unpaid)} not paid yet` : ''}.` });
    }
    const month = breakEven(store);
    if (month.target > 0) rows.push({ ok: month.reached || month.pace === 'ahead' || month.pace === 'on track', text: breakEvenSentence(month) });
  } else {
    const low = inventoryIntelligence(store).filter(item => item.urgency !== 'ok').length;
    rows.push(low > 0
      ? { ok: false, text: `${low} ${low === 1 ? 'product is' : 'products are'} running low.`, goTo: 'inventory' }
      : { ok: true, text: 'Nothing is running low.' });
  }
  const costs = expenseAnalysis(store);
  if (costs.totalLast30 > 0) {
    rows.push({
      ok: costs.trendPct <= 25,
      text: `${naira(costs.totalLast30)} spent in the last 30 days${costs.trendPct > 0 ? `, ${Math.round(costs.trendPct)}% more than the month before` : ''}.`,
      goTo: 'expenses',
    });
  }

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div>
        <h3 className="font-display font-bold text-base">No advice right now</h3>
        <p className="text-[11px] text-muted-foreground">What Flow checked</p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map(row => (
          <li key={row.text} className="py-2.5 flex items-start gap-2.5">
            {row.ok
              ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-px" />
              : <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-px" />}
            <p className="flex-1 text-sm leading-snug">{row.text}</p>
            {row.goTo && (
              <button type="button" onClick={() => onNavigate?.(row.goTo as never)} className="text-xs font-display font-bold text-primary shrink-0">Open</button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Tap Get Advice for a fuller look at the business.</p>
    </div>
  );
}

/**
 * Flow's Advice tab: what to do next, with the reasons.
 */
export default function AdviceTab({ s }: { s: ManagerState }) {
  const {
    store, onNavigate, adviceLoading, setChatOpen, setPoListOpen, setRatingsOpen, setAutoFixTarget,
    showArchive, setShowArchive, settings, recs, requests, adviceReport, adviceReportVisible,
    setAdviceReportVisible, showMoreInsights, setShowMoreInsights, handleGetAdvice, visibleAdvice,
    handleDismissAdvice, handleHelpfulAdvice, advicePriorityColor, adviceIconBg,
  } = s;
  const serviceShop = isServiceFirstBusiness(store);
  return (
    <div className="space-y-4 animate-fade-in">
      {/* The two things you came here to do. Purchase Orders, Ratings and
          the notification archive used to sit up here too, pushing the
          actual advice below the fold. */}
      <div className="flex gap-2">
        <button onClick={handleGetAdvice} disabled={adviceLoading}
          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
          {adviceLoading ? <><Hourglass className="w-4 h-4" /> Analysing...</> : <><Sparkles className="w-4 h-4" /> Get Advice</>}
        </button>
        <button onClick={() => setChatOpen(true)}
          className="flex-1 py-3 rounded-xl bg-surface-2/60 border border-primary/30 text-foreground font-display font-bold text-sm flex items-center justify-center gap-2">
          <MessageCircle className="w-4 h-4" />
          Message with Flow
        </button>
      </div>

      {/* Notification Archive Modal */}
      {showArchive && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowArchive(false)}><ScrollLock />
          <div className="w-full max-w-md bg-card border border-border/60 rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto space-y-4 animate-scale-in text-left flex flex-col no-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                  <Archive className="w-4 h-4" /> Notification Archive
                </h3>
                <p className="text-[10px] text-muted-foreground">Full history of alerts and insights from Flow.</p>
              </div>
              <button onClick={() => setShowArchive(false)} className="p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto max-h-[50vh] pr-1">
              {(store.flowNotifications || []).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  No notifications recorded in history yet.
                </div>
              ) : (
                (store.flowNotifications || []).map(n => (
                  <div key={n.id} className={`p-3 rounded-xl border flex gap-3 text-left bg-surface-2 border-border/40`}>
                    <span className="w-8 h-8 rounded-lg bg-surface-3 text-primary flex items-center justify-center shrink-0"><MessageIcon emoji={n.icon || '🔔'} /></span>
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-xs font-display font-bold text-foreground leading-normal">{n.title || 'Flow Alert'}</p>
                      <p className="text-[11px] text-muted-foreground leading-normal">{n.description || n.text}</p>
                      <p className="text-[9px] text-muted-foreground/60 font-mono pt-1">
                        {new Date(n.date).toLocaleDateString()} · {new Date(n.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                onClick={() => setShowArchive(false)}
                className="px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-border text-xs font-display font-bold rounded-xl transition cursor-pointer"
              >
                Close Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advice Report Card (Typewriter Analysis) */}
      {adviceReportVisible && adviceReport && (
        <FlowAdviceReport
          report={adviceReport}
          onDismiss={() => setAdviceReportVisible(false)}
          onNavigate={onNavigate}
          onAutoFix={setAutoFixTarget}
        />
      )}

      {/* Advice cards */}
      {visibleAdvice.length > 0 ? (
        <div className="space-y-2">
          {visibleAdvice.map(a => (
            <div key={a.id} className={`p-3.5 rounded-xl border shadow-card ${advicePriorityColor[a.priority]}`}>
              <div className="flex items-start gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${adviceIconBg[a.priority]} ${PRIORITY_INK[a.priority] || 'text-muted-foreground'}`}><MessageIcon emoji={a.icon} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-bold text-sm text-foreground">{a.title}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-display font-bold flex-shrink-0 ${a.priority === 'critical' ? 'bg-destructive text-white' : a.priority === 'high' ? 'bg-warning text-white' : a.priority === 'medium' ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-muted-foreground'}`}>{a.priority.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.detail}</p>
                  {a.items && a.items.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                      {a.items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-foreground truncate">{it.name}</span>
                          <span className="text-muted-foreground flex-shrink-0">{it.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* One row instead of three. Each card used to stack two
                      full-width buttons and then a bordered "Helpful / Not
                      relevant" strip, so the same chrome repeated down the
                      whole screen and buried the advice between it. Auto
                      Fix stays the one prominent control; going to the
                      screen is a text link, and the feedback is a pair of
                      icons pushed to the end. */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {a.autoFix && (
                      <button
                        onClick={() => setAutoFixTarget(a.autoFix!)}
                        className="px-3 py-1.5 rounded-lg text-xs font-display font-bold bg-foreground/90 text-background active:scale-[0.97] transition flex items-center gap-1 shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5" /> Auto Fix
                      </button>
                    )}
                    {a.goTo && (
                      <button
                        onClick={() => onNavigate?.(a.goTo!, a.focus)}
                        className="px-2 py-1.5 rounded-lg text-xs font-display font-bold text-current/80 hover:text-current active:scale-[0.97] transition shrink-0"
                      >
                        {a.autoFix ? 'Open' : 'Go to Action'}
                      </button>
                    )}
                    <span className="flex-1" />
                    <button
                      onClick={() => handleHelpfulAdvice(a.id)}
                      aria-label="This advice was helpful"
                      title="Helpful"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition shrink-0"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDismissAdvice(a.id)}
                      aria-label="Not relevant, hide this"
                      title="Not relevant"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <AllClear s={s} />
      )}

      {/* Recommendations, suppliers and customer requests are background
          reading. They used to sit open below the advice, so the page kept
          going long after it had said anything actionable. */}
      {(!serviceShop || recs.length > 0) && <div className="pt-1">
        <button
          onClick={() => setShowMoreInsights(v => !v)}
          aria-expanded={showMoreInsights}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface-2/30 text-left hover:bg-surface-2/60 transition-colors"
        >
          <span className="text-xs font-display font-bold">
            {showMoreInsights ? 'Hide extras' : serviceShop ? 'Recommendations' : 'Recommendations, suppliers & requests'}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${showMoreInsights ? 'rotate-180' : ''}`} />
        </button>
      </div>}

      {showMoreInsights && (
        <div className="space-y-4 animate-fade-in">
          {/* Recommendations */}
          {recs.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display font-bold text-sm px-1 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> Recommendations</h3>
              {recs.map(r => (
                <div key={r.id} className="p-3 rounded-xl bg-card shadow-card flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><MessageIcon emoji={r.icon} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supplier management */}
          {/* Suppliers are who a shop buys stock from. A laundry keeps none. */}
          {!serviceShop && <SupplierPanel />}

          {/* Customer requests */}
          {settings.customerRequests && !isServiceFirstBusiness(store) && requests.length > 0 && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><ShoppingCart className="w-4 h-4" /> Top Customer Requests</h3>
              <div className="space-y-1.5">
                {requests.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-2 border border-border text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="capitalize truncate">{r.text}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-primary font-display font-bold">{r.count}×</span>
                      {r.count >= 5 && <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded-full font-bold">Stock it</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Secondary destinations, out of the way at the end. The archive in
          particular was the second thing on the page. */}
      <div className="pt-2 mt-2 border-t border-border/60 flex flex-wrap gap-x-4 gap-y-2 justify-center">
        {!serviceShop && (
          <button
            onClick={() => setPoListOpen(true)}
            className="py-1.5 text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
          >
            <Package className="w-3.5 h-3.5" /> Purchase Orders
          </button>
        )}
        <button
          onClick={() => setRatingsOpen(true)}
          className="py-1.5 text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
        >
          <Star className="w-3.5 h-3.5" /> Ratings
        </button>
        <button
          onClick={() => setShowArchive(true)}
          className="py-1.5 text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
        >
          <Archive className="w-3.5 h-3.5" /> Archive ({store.flowNotifications?.length || 0})
        </button>
      </div>
    </div>
  );
}
