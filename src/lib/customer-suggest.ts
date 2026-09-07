import type { Customer } from '@/types/store';

/**
 * Finding a customer who has been in before, while their name is being typed.
 *
 * The only way to reuse a customer was a dropdown listing every one of them.
 * That is fine for a shop with six and useless for a shop with six hundred,
 * and an attendant with a queue in front of them will type the name again
 * rather than scroll — which quietly creates a second record for the same
 * person, splits their history, and loses whatever they still owe.
 */

/** Enough letters to be worth searching on. */
const MIN_QUERY = 2;

/** More than a few and the list stops being scannable at a counter. */
const MAX_RESULTS = 5;

const norm = (value: string) =>
  String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const digits = (value: string) => String(value || '').replace(/\D/g, '');

export interface CustomerSuggestion {
  customer: Customer;
  /** Why it matched, so the caller can show the phone when that is the hit. */
  matchedOn: 'name' | 'phone';
}

/**
 * Customers worth offering for what has been typed so far.
 *
 * Matching is deliberately literal — a name that starts with what was typed,
 * then a name that contains it, then a phone number. Someone typing "Ade"
 * expects Adebayo, not a fuzzy guess at Abed; being surprised by a wrong
 * customer at the counter is worse than typing the name out.
 */
export function suggestCustomers(customers: Customer[], query: string): CustomerSuggestion[] {
  const q = norm(query);
  const qDigits = digits(query);

  // A phone number is worth searching on from the third digit; a name needs
  // two letters.
  const byName = q.length >= MIN_QUERY;
  const byPhone = qDigits.length >= 3;
  if (!byName && !byPhone) return [];

  const starts: CustomerSuggestion[] = [];
  const contains: CustomerSuggestion[] = [];
  const phones: CustomerSuggestion[] = [];

  for (const customer of customers || []) {
    if (!customer?.name) continue;
    const name = norm(customer.name);

    if (byName && name.startsWith(q)) {
      starts.push({ customer, matchedOn: 'name' });
      continue;
    }
    if (byName && name.includes(q)) {
      contains.push({ customer, matchedOn: 'name' });
      continue;
    }
    if (byPhone && digits(customer.phone).includes(qDigits)) {
      phones.push({ customer, matchedOn: 'phone' });
    }
  }

  // Someone typed in full is not a suggestion worth making — the field
  // already says it.
  const ordered = [...starts, ...contains, ...phones]
    .filter(entry => !(norm(entry.customer.name) === q && entry.matchedOn === 'name'));

  return ordered.slice(0, MAX_RESULTS);
}
