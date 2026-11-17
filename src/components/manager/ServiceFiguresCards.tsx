import { useMemo } from 'react';
import { CalendarDays, Clock, Crown, Users } from 'lucide-react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import {
  agoInWords,
  busiestDays,
  customerWeeks,
  hoursInWords,
  serviceSpeed,
  topCustomers,
  type ServiceBundle,
} from '@/lib/manager-intel';
import type { StoreData } from '@/types/store';

/*
 * The four figures a laundry's money cards could not give: ready on time,
 * new and returning customers, the busiest day, and the top customers. Each
 * reads the bundles as they stand, so a move to Ready shows at once.
 */

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const card = (bare: boolean) => (bare ? 'space-y-3' : 'p-4 rounded-2xl bg-card shadow-card space-y-3');

function useBundles(store: StoreData): ServiceBundle[] {
  const version = useShopLaundryVersion();
  return useMemo(() => {
    try { return shopLaundryRecords(String(store.accessCode || '')) as ServiceBundle[]; } catch { return []; }
  }, [store, version]);
}

function Head({ icon: Icon, title, note }: { icon: typeof Clock; title: string; note: string }) {
  return (
    <div>
      <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Icon className="w-4 h-4" /> {title}</h3>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

/** "Up 6 points", "2 hours quicker" - or nothing when there is nothing to set it against. */
function Moved({ text, good }: { text: string | null; good: boolean | null }) {
  if (!text) return null;
  const tone = good === null ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive';
  return <p className={`text-[11px] font-display font-semibold ${tone}`}>{text}</p>;
}

// ─── Ready on time ────────────────────────────────────────────────────────────

export function ServiceSpeedCard({ store, bare = false }: { store: StoreData; bare?: boolean }) {
  const bundles = useBundles(store);
  const speed = useMemo(() => serviceSpeed(bundles, 30), [bundles]);
  const { now, before } = speed;

  const shareMove = now.onTimeShare !== null && before.onTimeShare !== null
    ? now.onTimeShare - before.onTimeShare
    : null;
  const readyMove = now.hoursToReady !== null && before.hoursToReady !== null
    ? now.hoursToReady - before.hoursToReady
    : null;

  return (
    <div className={card(bare)} data-service-speed>
      <Head icon={Clock} title="Ready on time" note="Bundles finished in the last 30 days, against the 30 days before" />
      {now.finished === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No bundles were finished in the last 30 days.</p>
      ) : (
        <>
          {now.promised > 0 ? (
            <div>
              <p className="font-display font-black text-3xl leading-none">{now.onTimeShare}%</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {now.onTime} of {now.promised} promised {now.promised === 1 ? 'bundle was' : 'bundles were'} ready by the time you gave the customer.
              </p>
              <Moved
                text={shareMove === null ? null : Math.abs(shareMove) < 2 ? 'About the same as the 30 days before' : `${shareMove > 0 ? 'Up' : 'Down'} ${Math.abs(shareMove)} points on the 30 days before (${before.onTimeShare}%)`}
                good={shareMove === null || Math.abs(shareMove) < 2 ? null : shareMove > 0}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              None of these had a ready time. Pick one when taking clothes in and I can tell you how many are ready when promised.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface-2 p-2.5">
              <p className="font-display font-bold text-sm">{hoursInWords(now.hoursToReady)}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Drop-off to ready</p>
              <Moved
                text={readyMove === null || Math.abs(readyMove) < 1 ? null : `${hoursInWords(Math.abs(readyMove))} ${readyMove < 0 ? 'quicker' : 'slower'}`}
                good={readyMove === null ? null : readyMove < 0}
              />
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <p className="font-display font-bold text-sm">{hoursInWords(now.hoursOnShelf)}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Ready to collected</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <p className="font-display font-bold text-sm">{now.late}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                Late{now.lateBy !== null ? `, by about ${hoursInWords(now.lateBy)}` : ''}
              </p>
            </div>
          </div>
        </>
      )}

      {speed.lateNow.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1.5" data-late-now>
          <p className="text-xs font-display font-bold text-destructive">
            {speed.lateNow.length} {speed.lateNow.length === 1 ? 'bundle is' : 'bundles are'} past the promised time and not ready
          </p>
          {speed.lateNow.slice(0, 3).map(item => (
            <p key={item.clientRef} className="text-xs flex justify-between gap-2">
              <span className="truncate">{item.customerName}</span>
              <span className="text-muted-foreground shrink-0">{hoursInWords(item.hoursLate)} late</span>
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Times are the middle bundle, so one bundle left for a week does not make every job look slow. Ready means the time it was moved to Ready.
      </p>
    </div>
  );
}

// ─── New and returning customers ──────────────────────────────────────────────

export function CustomersCard({ store, bare = false }: { store: StoreData; bare?: boolean }) {
  const bundles = useBundles(store);
  const data = useMemo(() => customerWeeks(bundles, 8), [bundles]);
  const top = Math.max(1, ...data.weeks.map(week => week.customers));
  const { soFar, sameDaysLastWeek: last } = data;

  return (
    <div className={card(bare)} data-customer-weeks>
      <Head icon={Users} title="New and returning customers" note="People who brought clothes, week by week (Monday to Sunday)" />
      {data.weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No customers recorded yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 p-2.5">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">This week so far</p>
              <p className="text-sm mt-1"><b className="font-display">{soFar.newCustomers}</b> new · <b className="font-display">{soFar.returning}</b> returning</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">Same days last week</p>
              <p className="text-sm mt-1"><b className="font-display">{last.newCustomers}</b> new · <b className="font-display">{last.returning}</b> returning</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> New</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary" /> Returning</span>
          </div>
          <div className="space-y-2">
            {[...data.weeks].reverse().map(week => (
              <div key={week.key} data-customer-week>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-display font-semibold">
                    {week.label}{week.current && <span className="font-normal text-muted-foreground"> · so far</span>}
                  </span>
                  <span className="text-muted-foreground">
                    <b className="text-foreground">{week.newCustomers}</b> new · <b className="text-foreground">{week.returning}</b> returning
                  </span>
                </div>
                <div className="h-2 mt-1 flex gap-[2px]" style={{ width: `${(week.customers / top) * 100}%` }}>
                  {week.newCustomers > 0 && <div className="h-full rounded-l-full bg-sky-400 last:rounded-r-full" style={{ flex: week.newCustomers }} />}
                  {week.returning > 0 && <div className="h-full rounded-r-full bg-primary first:rounded-l-full" style={{ flex: week.returning }} />}
                </div>
              </div>
            ))}
          </div>

          {data.cameBackShare !== null && (
            <p className="text-xs">
              <b className="font-display">{data.cameBackShare}%</b> of your {data.everyone} customers have come back at least once.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            New means their first bundle ever came in that week. This week is set against the same days of last week, up to the same time, never against a whole week.
          </p>
        </>
      )}
    </div>
  );
}

// ─── The busiest day of the week ──────────────────────────────────────────────

export function BusiestDaysCard({ store, bare = false }: { store: StoreData; bare?: boolean }) {
  const bundles = useBundles(store);
  const data = useMemo(() => busiestDays(bundles, 8), [bundles]);
  const top = Math.max(1, ...data.rows.map(row => row.averageValue));
  const busiest = data.busiest !== null ? data.rows[data.busiest] : null;
  const quietest = data.quietest !== null && data.quietest !== data.busiest ? data.rows[data.quietest] : null;

  return (
    <div className={card(bare)} data-busiest-days>
      <Head icon={CalendarDays} title="Busiest day of the week" note={`An average day of each kind, over the last ${data.weeks} weeks`} />
      {!busiest ? (
        <p className="text-sm text-muted-foreground py-2">A week or two more of bundles and I can say which day is busiest.</p>
      ) : (
        <>
          <p className="text-sm leading-snug">
            <b className="font-display">{busiest.name}</b> is your busiest day: about {busiest.averageBundles.toFixed(1)} bundles and {naira(busiest.averageValue)} of work on an average {busiest.name}.
            {quietest && <> {quietest.name} is the quietest, at {naira(quietest.averageValue)}.</>}
          </p>
          <div className="space-y-1.5">
            {data.rows.map((row, index) => (
              <div key={row.name} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 text-xs" data-weekday-row>
                <span className={index === data.busiest ? 'font-display font-bold' : 'text-muted-foreground'}>{row.name.slice(0, 3)}</span>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className={`h-full rounded-full ${index === data.busiest ? 'bg-primary' : 'bg-primary/45'}`} style={{ width: `${(row.averageValue / top) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">
                  {naira(row.averageValue)} <span className="text-muted-foreground">· {row.averageBundles.toFixed(1)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Work taken in and bundles on an average day, so a day that came round one more time in the stretch does not look busier for it. Today is counted once it is over.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Top customers ────────────────────────────────────────────────────────────

export function TopCustomersCard({ store, bare = false }: { store: StoreData; bare?: boolean }) {
  const bundles = useBundles(store);
  const data = useMemo(() => topCustomers(store, bundles, 90, 5), [store, bundles]);

  return (
    <div className={card(bare)} data-top-customers>
      <Head icon={Crown} title="Top customers" note="By the work they brought in the last 90 days" />
      {data.list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No customers in the last 90 days.</p>
      ) : (
        <>
          <div className="divide-y divide-border">
            {data.list.map((row, index) => (
              <div key={row.key} className="py-2 flex items-center gap-3" data-top-customer>
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-display font-black flex items-center justify-center shrink-0">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-display font-semibold truncate">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {row.visits} {row.visits === 1 ? 'visit' : 'visits'} · last {agoInWords(row.lastAt)}
                    {row.owed > 0 && <span className="text-destructive"> · {naira(row.owed)} not paid</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-display font-bold">{naira(row.value)}</p>
                  <p className="text-[10px] text-muted-foreground">{row.share}% of the work</p>
                </div>
              </div>
            ))}
          </div>
          {data.topShare !== null && data.everyone > data.list.length && (
            <p className="text-xs">
              These {data.list.length} brought <b className="font-display">{data.topShare}%</b> of the work from {data.everyone} customers.
              {data.topShare >= 50 ? ' Keep them happy: losing one would be felt.' : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}
