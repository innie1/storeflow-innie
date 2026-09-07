import type { Customer } from '@/types/store';
import { suggestCustomers } from '@/lib/customer-suggest';

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

  const matches = suggestCustomers(customers, query);
  if (matches.length === 0) return null;

  return (
    <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
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
