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

/**
 * A Nigerian number in the one shape, whichever way it was written.
 *
 * The contacts picker hands back +2348012345678; the counter types
 * 08012345678. As plain digits neither contains the other, so a customer whose
 * number came from the phone book could not be found by typing the number on
 * the card in front of you.
 */
function localNumber(value: string): string {
  const raw = digits(value);
  if (raw.startsWith('234') && raw.length >= 12) return `0${raw.slice(3)}`;
  return raw;
}

/** How many recent customers to offer before anything is typed. */
export const RECENT_SUGGESTIONS = 3;

export interface CustomerSuggestion {
  customer: Customer;
  /**
   * Why it matched, so the caller can say so: the phone when that was the hit,
   * and 'recent' for the handful offered before anything is typed at all.
   */
  matchedOn: 'name' | 'phone' | 'recent';
}

/**
 * Two words are the same word with a slip in it.
 *
 * Bounded on purpose. One wrong letter in "Adebayo" is a thumb on a phone
 * keyboard; three is a different person, and offering a different person to
 * somebody in a hurry is how the wrong customer's clothes get booked in.
 */
function withinOneSlip(a: string, b: string, tolerance: number): boolean {
  if (Math.abs(a.length - b.length) > tolerance) return false;
  if (a === b) return true;

  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      /*
       * Two letters the right way round in the wrong order counts as one
       * slip, not two. "Chdii" for "Chidi" is the commonest thing a thumb
       * does on a phone keyboard, and counting it twice put it out of reach
       * of any tolerance worth allowing.
       */
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], twoBack[j - 2] + 1);
      }
    }
    // Nothing on this row can be rescued, so stop rather than finish the grid.
    if (Math.min(...current) > tolerance) return false;
    twoBack = previous;
    previous = current;
  }
  return previous[b.length] <= tolerance;
}

/** A typo is worth forgiving only once there is enough word to be sure. */
function slipsAllowed(query: string): number {
  if (query.length >= 7) return 2;
  if (query.length >= 4) return 1;
  return 0;
}

/** One word of a name against one word of what was typed. */
function wordMatches(word: string, typed: string): boolean {
  // The plain case first: a word of the name that begins with this one.
  if (word.startsWith(typed)) return true;

  const tolerance = slipsAllowed(typed);
  if (tolerance === 0) return false;
  if (withinOneSlip(typed, word, tolerance)) return true;
  // A slip inside a name still being typed: "Adebyo" for "Adebayo Johnson".
  return word.length > typed.length && withinOneSlip(typed, word.slice(0, typed.length), tolerance);
}

/**
 * Whether a name is what somebody was reaching for, spelling aside.
 *
 * Word by word, in any order, because that is how names get typed. Half the
 * shops in the country write the surname first, a customer saved as "Chidi
 * Okeke" gets typed "Okeke Chidi", and a middle name in the book that nobody
 * says out loud should not stop the match. Every word typed has to find a home
 * in the name, so "Okeke Musa" still matches nobody.
 */
function looksLike(name: string, query: string): boolean {
  const nameWords = name.split(' ').filter(Boolean);
  const typedWords = query.split(' ').filter(Boolean);
  if (!nameWords.length || !typedWords.length) return false;

  if (typedWords.every(typed => nameWords.some(word => wordMatches(word, typed)))) return true;

  // A missing or extra space: "chidiokeke" for "chidi okeke".
  const tolerance = slipsAllowed(query);
  return tolerance > 0 && withinOneSlip(query, name.slice(0, query.length), tolerance);
}

/**
 * The few most recent customers, offered the moment the field is touched.
 *
 * A laundry's customers are overwhelmingly the same people every week, so the
 * name being typed is usually one of the last few served. Offering them before
 * a letter is typed saves the typing that creates second copies of people.
 */
export function recentCustomers(customers: Customer[], limit = RECENT_SUGGESTIONS): CustomerSuggestion[] {
  return (customers || [])
    .filter(customer => customer?.name)
    .slice(0, Math.max(0, limit))
    .map(customer => ({ customer, matchedOn: 'recent' as const }));
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
  /* Spelling forgiven, and always last: a literal hit is never pushed down by
     a guess. */
  const close: CustomerSuggestion[] = [];

  const qLocal = localNumber(query);

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
    if (byPhone) {
      const phone = digits(customer.phone);
      if (phone.includes(qDigits) || localNumber(phone).includes(qLocal)) {
        phones.push({ customer, matchedOn: 'phone' });
        continue;
      }
    }
    if (byName && looksLike(name, q)) {
      close.push({ customer, matchedOn: 'name' });
    }
  }

  // Someone typed in full is not a suggestion worth making — the field
  // already says it.
  const ordered = [...starts, ...contains, ...phones, ...close]
    .filter(entry => !(norm(entry.customer.name) === q && entry.matchedOn === 'name'));

  return ordered.slice(0, MAX_RESULTS);
}
