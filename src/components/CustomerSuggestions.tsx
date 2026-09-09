import type { Customer } from '@/types/store';
import { recentCustomers, suggestCustomers } from '@/lib/customer-suggest';

/**
 * Matching customers, offered under whatever field is being typed into.
 *
 * The markup lived inside the laundry intake screen. Every other place a
 * customer name is typed — a credit sale, the customer book — had the same
 * problem and no answer to it, and copying a floating list into each of them
 * is how three of them end up behaving differently.
 *
 * The caller owns the input; this only draws the list, so it can sit under a
 * field of any size or styling.
 */

interface Props {
  customers: Customer[];
  /** What has been typed so far. */
  query: string;
  /** Hidden once the caller has settled on someone. */
  enabled?: boolean;
  onPick: (customer: Customer) => void;
}

export default function CustomerSuggestions({ customers, query, enabled = true, onPick }: Props) {
  if (!enabled) return null;

  /*
   * Before a letter is typed, the last few people served.
   *
   * A laundry serves overwhelmingly the same people every week, so the name
   * about to be typed is usually one of the last few - and every name typed
   * out again is a second copy of somebody, with their history and their debt
   * split across the two. This replaced a dropdown of every customer in the
   * shop, which nobody scrolled.
   */
  const typed = suggestCustomers(customers, query);
  const matches = typed.length > 0 ? typed : (query.trim() ? [] : recentCustomers(customers));
  if (matches.length === 0) return null;
  const showingRecent = matches[0].matchedOn === 'recent';

  return (
    <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      {/* Said, so three names appearing unasked reads as help rather than as
          the app having decided something. */}
      {showingRecent && (
        <p className="px-3 pt-2 pb-1 text-[10px] uppercase font-black text-muted-foreground">Recent customers</p>
      )}
      {matches.map(({ customer, matchedOn }) => (
        <button
          key={customer.id}
          type="button"
          onClick={() => onPick(customer)}
          className="w-full px-3 py-2.5 text-left hover:bg-surface-2 border-b last:border-b-0 border-border/60"
        >
          <p className="text-sm font-bold">{customer.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {customer.phone}
            {matchedOn === 'phone' ? ' · matched on phone' : ''}
            {/* Worth knowing before taking in more of their work. */}
            {customer.outstandingDebt > 0 ? ` · owes ₦${Math.round(customer.outstandingDebt).toLocaleString()}` : ''}
          </p>
        </button>
      ))}
    </div>
  );
}
