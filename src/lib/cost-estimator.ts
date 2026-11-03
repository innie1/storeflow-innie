/**
 * What one piece actually costs the shop to do.
 *
 * Nobody is asked. A per-item cost typed in once and never revisited is worse
 * than none, because it looks like fact long after it stopped being true - and
 * no laundry owner is going to weigh the detergent that went on one shirt.
 *
 * So it is worked backwards from what the shop really spent and really did:
 * the money that goes out because washing happened, spread across the pieces
 * that were washed.
 *
 * Which costs count is the whole judgement here. Detergent, bleach, starch and
 * nylon bags are used up doing the work. So, for a laundry, is the electricity
 * - the machines are the bill.
 *
 * Water is not, and this is worth saying because the obvious model is wrong
 * here: a Nigerian laundry pumps its own, so the water itself costs nothing
 * and what it does cost is the power to pump it, which is already counted as
 * electricity. Charging for water as well would count the same pump twice.
 *
 * Rent and salaries are neither: they are owed whether or not a single bundle
 * arrives, which is what makes them the thing break-even has to clear rather
 * than part of the cost of a piece.
 *
 * Counted in pieces, never in drop-offs. One shirt is one piece; a bundle of
 * twenty is twenty. Spreading a month of detergent across "jobs" would make a
 * shop doing many small jobs look far more expensive per unit than one doing
 * few large ones, when it is the pieces that consume the soap.
 */

import type { Expense, ExpenseCategory, StoreData } from '@/types/store';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { consumableAsk } from '@/lib/trade-supplies';

import { getBusinessTemplate, isServiceFirstBusiness } from '@/lib/business-runtime';
import { approvedLabourBetween, PIECE_WORK_CATEGORY } from '@/lib/piece-work';

/**
 * Costs that rise and fall with the amount of work done.
 *
 * Consumables always. Utilities only for a shop that sells work: a laundry's
 * electricity and water are the machines running, while a provision store's
 * are the lights, which burn whether or not anybody buys anything.
 */
export const ALWAYS_VARIABLE: ExpenseCategory[] = ['Consumables'];
/*
 * Piece work is variable by definition: a shop that irons nothing pays nobody
 * to iron. It belongs here so that paying a per-piece worker never lands in
 * the month's fixed costs beside the rent, where it would make the break-even
 * target lurch on payday and sit too low the rest of the month.
 */
export const VARIABLE_FOR_SERVICES = ['Consumables', 'Utilities', PIECE_WORK_CATEGORY] as ExpenseCategory[];

export function variableCategories(store: StoreData): ExpenseCategory[] {
  return isServiceFirstBusiness(store) ? VARIABLE_FOR_SERVICES : ALWAYS_VARIABLE;
}

export function isVariableCost(store: StoreData, expense: Pick<Expense, 'category'>): boolean {
  return variableCategories(store).includes(expense.category);
}

/**
 * Enough pieces that dividing by them means something.
 *
 * A drum of detergent divided by three shirts produces a confident figure
 * built on nothing, and a shop could reprice off it.
 */
export const MIN_PIECES_TO_ESTIMATE = 10;

export interface CostEstimate {
  /** True until there is enough work recorded to divide by. */
  learning: boolean;
  pieces: number;
  needed: number;
  /** What went out on things used up doing the work, in the window. */
  spend: number;
  /** spend ÷ pieces, or null while learning. */
  perPiece: number | null;
  /** What made it up, largest first, for saying where the money went. */
  breakdown: { category: ExpenseCategory; amount: number }[];
  /** How many days of trade this was worked out from. */
  days: number;
  /** Things bought once so far, left out until a second buy shows how long they last. */
  waitingOn: string[];
  /** A laundry whose soap is still the starting figure, not its own. */
  soapGuessed: boolean;
  /** How much of `spend` is that starting figure rather than anything recorded. */
  guessedSpend: number;
}

const DAY = 86400000;

/**
 * What a laundry's soap costs a piece before the shop's own buys can say.
 *
 * Soap is a small part of washing a shirt - tens of naira, not hundreds - so
 * a laundry starts here instead of at nothing, and moves to its own figure
 * once it has bought soap twice and the first lot is known to have run out.
 */
export const DEFAULT_SOAP_PER_PIECE = 30;

/** More than this share of a piece's price is not what its soap cost. */
export const MAX_SHARE_OF_PRICE = 0.5;

/** Buys this close together are one trip to the market, not two lots. */
export const SAME_LOT_DAYS = 2;

/**
 * Which thing a consumable bought.
 *
 * Soap bought on the 1st and starch on the 3rd are not one lot lasting two
 * days, so buys are only measured against buys of the same thing. Older
 * expenses carry no name, so it is read from the note: the soap question
 * writes "Ariel × 3", the supplies screen "Detergent (bag)".
 */
export function consumableKey(store: StoreData, expense: Pick<Expense, 'note' | 'supply'>): string {
  const noun = consumableAsk(store).noun.toLowerCase();
  const named = String(expense.supply || '').trim().toLowerCase();
  const note = String(expense.note || '').trim();
  let key = named;
  if (!key) {
    if (!note || note.includes(' × ') || note.toLowerCase() === noun) return noun;
    key = note.split(/ — | \(/)[0].trim().toLowerCase();
  }
  // Soap by any of its names is the one thing.
  return /soap|detergent/.test(key) ? noun : key;
}

/**
 * Whether a bundle was washed, and so used soap.
 *
 * Ironing uses power and no soap. Spreading the soap across ironed shirts as
 * well would make each washed piece look cheaper than it is, and a shop doing
 * mostly ironing one month would seem to have found cheaper soap. Read from
 * the service's name first, because shops rename them - "Wash Only & iron" is
 * washed, "Iron only" is not.
 */
export function washesClothes(record: { serviceId?: string; serviceName?: string }): boolean {
  const name = String(record.serviceName || '').toLowerCase();
  if (/wash|full|clean|laund|express/.test(name)) return true;
  if (/iron|press/.test(name)) return false;
  return record.serviceId !== 'iron-only';
}

/** "Ariel × 3" is three packs. Only the soap question writes the count. */
function packsIn(note: unknown): number | null {
  const match = /×\s*(\d+)\s*$/.exec(String(note || ''));
  return match ? Number(match[1]) : null;
}

/** The figure follows the most recent finished lots, so better habits show quickly. */
export const RECENT_LOTS = 3;

/** A lot that cost this much more a piece than the shop's usual is worth asking about. */
export const HIGH_LOT_SHARE = 1.25;

export interface SupplyLot {
  boughtAt: number;
  amount: number;
  packs: number | null;
  /** False for the lot still being used. */
  finished: boolean;
  /** Pieces washed from the day it was bought until the next buy (or so far). */
  washed: number;
  /** What it cost to wash a piece, once finished with enough washing recorded. */
  perPiece: number | null;
  /** Who moved the bundles to Washing while it lasted, most pieces first. */
  washers: { name: string; pieces: number }[];
  /** Used noticeably more a piece than the other finished lots. */
  high: boolean;
}

export interface SupplyPace {
  key: string;
  /** Separate trips, with buys a day or two apart counted as one. */
  buys: number;
  /** Every lot, oldest first; the last is the one in use. */
  lots: SupplyLot[];
  /** What the latest lot cost, how many packs, and when it was bought. */
  lastAmount: number;
  lastPacks: number | null;
  lastBoughtAt: number;
  /** The recent finished lots the figure comes from: what they cost, their packs, and what they washed. */
  usedSpend: number;
  usedPacks: number | null;
  usedWashed: number;
  /** What it costs to wash one piece, once a finished lot has washed enough to say. */
  perPiece: number | null;
  /** The finished lots gave a figure too high to be soap, so it was set aside. */
  doubtful: boolean;
  /** Pieces washed since the latest lot was bought, and about how many it has left. */
  washedSinceLast: number;
  piecesLeft: number | null;
}

/**
 * How many clothes each thing the shop buys actually washes.
 *
 * A ₦17,000 lot of soap washes for a month or two. Counted in full against the
 * pieces washed in the month it was bought, it read as most of the price of
 * every piece, and the month's target came out at many times the shop's real
 * costs. So a buy is not counted the day it is made. Once the shop buys the
 * same thing again, the first lot is known to be finished, and what it cost
 * over the clothes washed with it - counted from the day it was bought, never
 * before - is what washing a piece costs.
 *
 * It keeps adjusting. The figure comes from the last few finished lots rather
 * than all of them, so a shop that starts using its soap more carefully sees
 * it within a lot or two instead of having it averaged away by a year of old
 * habits. Each lot is kept on its own as well, with who did the washing while
 * it lasted, so a lot that went much faster than usual can be asked about.
 *
 * Clothes washed, not days. A slow fortnight and a busy one use different
 * amounts of soap; the pieces are what consume it.
 *
 * And money as well as packs. Seven big packs cost more than seven small ones
 * and wash more by about as much, so the price already says how much soap it
 * was whichever size was bought, and packs are only used to say how many
 * pieces one pack washes.
 */
export function consumablePace(store: StoreData): SupplyPace[] {
  const groups = new Map<string, { at: number; amount: number; packs: number | null }[]>();
  for (const expense of store.expenses || []) {
    if (expense.category !== 'Consumables') continue;
    const at = new Date(expense.date || '').getTime();
    const amount = Math.max(0, Number(expense.amount) || 0);
    if (!Number.isFinite(at) || amount <= 0) continue;
    const key = consumableKey(store, expense);
    groups.set(key, [...(groups.get(key) || []), { at, amount, packs: packsIn(expense.note) }]);
  }

  const accessCode = String(store.accessCode || '');
  const washed = (accessCode ? shopLaundryRecords(accessCode) : [])
    .filter(washesClothes)
    .map(record => ({
      at: new Date(String(record.createdAt || '')).getTime(),
      pieces: Number(record.pieceCount) || 0,
      total: Number(record.total) || 0,
      // Who put it in to wash; the person who took it in when nobody did.
      by: String(
        (record.stageHistory || []).find(step => step.stage === 'washing')?.by
          || record.recordedByName
          || '',
      ).trim(),
    }));
  const between = (from: number, to: number) => washed.filter(record => record.at >= from && record.at < to);
  const sum = (records: typeof washed, field: 'pieces' | 'total') => records.reduce((total, record) => total + record[field], 0);

  const paces: SupplyPace[] = [];
  for (const [key, buys] of groups) {
    buys.sort((a, b) => a.at - b.at);
    const trips: { at: number; amount: number; packs: number | null }[] = [];
    for (const buy of buys) {
      const last = trips[trips.length - 1];
      if (last && buy.at - last.at < SAME_LOT_DAYS * DAY) {
        last.amount += buy.amount;
        last.packs = last.packs !== null && buy.packs !== null ? last.packs + buy.packs : null;
      } else {
        trips.push({ ...buy });
      }
    }

    const lots: SupplyLot[] = trips.map((trip, index) => {
      const finished = index < trips.length - 1;
      const during = between(trip.at, finished ? trips[index + 1].at : Infinity);
      const pieces = sum(during, 'pieces');
      const byName = new Map<string, number>();
      for (const record of during) {
        const name = record.by || 'Not recorded';
        byName.set(name, (byName.get(name) || 0) + record.pieces);
      }
      return {
        boughtAt: trip.at,
        amount: trip.amount,
        packs: trip.packs,
        finished,
        washed: pieces,
        perPiece: finished && pieces >= MIN_PIECES_TO_ESTIMATE ? trip.amount / pieces : null,
        washers: Array.from(byName, ([name, count]) => ({ name, pieces: count })).sort((a, b) => b.pieces - a.pieces),
        high: false,
      };
    });

    // Against the shop's own usual: the middle of its other finished lots.
    const measuredLots = lots.filter(lot => lot.perPiece !== null);
    for (const lot of measuredLots) {
      const others = measuredLots.filter(other => other !== lot).map(other => other.perPiece!).sort((a, b) => a - b);
      if (!others.length) continue;
      const middle = others.length % 2 ? others[(others.length - 1) / 2] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2;
      lot.high = lot.perPiece! > middle * HIGH_LOT_SHARE;
    }

    const latest = lots[lots.length - 1];
    const recent = lots.filter(lot => lot.finished).slice(-RECENT_LOTS);
    const usedSpend = recent.reduce((total, lot) => total + lot.amount, 0);
    const usedPacks = recent.length && recent.every(lot => lot.packs !== null)
      ? recent.reduce((total, lot) => total + (lot.packs || 0), 0)
      : null;
    const usedWashed = recent.reduce((total, lot) => total + lot.washed, 0);
    const measured = usedWashed >= MIN_PIECES_TO_ESTIMATE ? usedSpend / usedWashed : null;

    /*
     * A figure that cannot be true is not used.
     *
     * Bundles washed but never put in the app, or a buy recorded twice, make a
     * lot look as though it washed far fewer clothes than it did. Soap costing
     * more than half of what the shop charges to wash a piece is that, not soap,
     * and acting on it would put the month's target in the millions again.
     */
    const charged = recent.length ? sum(between(recent[0].boughtAt, latest.boughtAt), 'total') : 0;
    const doubtful = measured !== null && charged > 0 && measured > MAX_SHARE_OF_PRICE * (charged / usedWashed);
    const perPiece = doubtful ? null : measured;

    paces.push({
      key,
      buys: lots.length,
      lots,
      lastAmount: latest.amount,
      lastPacks: latest.packs,
      lastBoughtAt: latest.boughtAt,
      usedSpend,
      usedPacks,
      usedWashed,
      perPiece,
      doubtful,
      washedSinceLast: latest.washed,
      piecesLeft: perPiece ? Math.max(0, latest.amount / perPiece - latest.washed) : null,
    });
  }
  return paces;
}

/**
 * Worked out over a rolling window rather than the calendar month.
 *
 * A shop looking on the 2nd would otherwise be told its costs from two days of
 * trade, and a drum of detergent bought on the 1st would land on whatever few
 * pieces happened to follow it.
 */
export function estimateUnitCost(store: StoreData, days = 30): CostEstimate {
  const since = Date.now() - days * DAY;
  const within = (value: unknown) => {
    const time = new Date(String(value || '')).getTime();
    return Number.isFinite(time) && time >= since;
  };

  const categories = variableCategories(store);
  const totals = new Map<ExpenseCategory, number>();
  let spend = 0;

  for (const expense of store.expenses || []) {
    if (!within(expense.date) || !categories.includes(expense.category)) continue;
    // Spread over how long it lasts, below, not charged on the day it was bought.
    if (expense.category === 'Consumables') continue;
    /*
     * Paying a worker is not when the work cost something - approving it was.
     * The payment is still an expense, because the cash really left, but
     * counting it here as well as the approved work below would charge the
     * shop twice for the same shirts.
     */
    if (expense.category === PIECE_WORK_CATEGORY) continue;
    const amount = Math.max(0, Number(expense.amount) || 0);
    spend += amount;
    totals.set(expense.category, (totals.get(expense.category) || 0) + amount);
  }

  /*
   * The labour that actually went into these pieces.
   *
   * Read from approved work rather than from payments, because that is when
   * the money became owed. Reading payments would tell a shop that ironing
   * costs nothing all month and everything on payday, and it would price the
   * work wrong on both days.
   */
  const labour = approvedLabourBetween(store, since, Date.now());
  if (labour > 0) {
    spend += labour;
    totals.set(PIECE_WORK_CATEGORY as ExpenseCategory, labour);
  }

  const accessCode = String(store.accessCode || '');
  let pieces = 0;
  let washedPieces = 0;
  for (const record of accessCode ? shopLaundryRecords(accessCode) : []) {
    if (!within(record.createdAt)) continue;
    pieces += Number(record.pieceCount) || 0;
    if (washesClothes(record)) washedPieces += Number(record.pieceCount) || 0;
  }

  /*
   * What the consumables in these pieces cost: each thing's own cost to wash
   * a piece, from the lots already finished, across the pieces washed here.
   * Ironed pieces carry none of it.
   */
  const waitingOn: string[] = [];
  let consumed = 0;
  const paces = consumablePace(store);
  const noun = consumableAsk(store).noun.toLowerCase();
  // Until its soap has a figure of its own, a laundry's is the starting one.
  const soapGuessed = getBusinessTemplate(store).type === 'laundry'
    && !paces.some(pace => pace.key === noun && pace.perPiece !== null);
  const guessedSpend = soapGuessed ? DEFAULT_SOAP_PER_PIECE * washedPieces : 0;
  consumed += guessedSpend;
  for (const pace of paces) {
    if (pace.perPiece === null) waitingOn.push(pace.key);
    else consumed += pace.perPiece * washedPieces;
  }
  if (consumed > 0) {
    spend += consumed;
    totals.set('Consumables', consumed);
  }

  const breakdown = Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const learning = pieces < MIN_PIECES_TO_ESTIMATE || spend <= 0;

  return {
    learning,
    pieces,
    needed: MIN_PIECES_TO_ESTIMATE,
    spend,
    perPiece: learning ? null : spend / pieces,
    breakdown,
    days,
    waitingOn,
    soapGuessed,
    guessedSpend,
  };
}

/**
 * How long the shop's soap lasts, said plainly - or that it is still waiting
 * for a second buy to find out. Empty when none has been recorded.
 */
export function soapPaceSentence(store: StoreData): string {
  const noun = consumableAsk(store).noun;
  const pace = consumablePace(store).find(entry => entry.key === noun.toLowerCase());
  if (!pace) return '';
  const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
  const count = (value: number) => Math.round(value).toLocaleString();
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;

  if (pace.perPiece === null) {
    // Bought again, but too few washed bundles were recorded to divide by.
    const why = pace.doubtful
      ? `the last lot came to more than half of what a piece is charged, so some washing may not be in the app`
      : pace.buys > 1
      ? `only ${count(pace.usedWashed)} washed pieces were recorded with the last lot`
      : `when you buy it again I will know how many pieces your ${naira(pace.lastAmount)} washed`;
    return `${Noun} is counted at ${naira(DEFAULT_SOAP_PER_PIECE)} a piece for now - ${why}.`;
  }

  const perPack = pace.usedPacks ? `, about ${count(pace.usedWashed / pace.usedPacks)} a pack` : '';
  const recent = Math.min(RECENT_LOTS, pace.lots.filter(lot => lot.finished).length);
  const which = recent === 1 ? 'the last lot' : `the last ${recent} lots`;
  return `${Noun} costs about ${naira(pace.perPiece)} a piece washed: ${which} washed ${count(pace.usedWashed)} pieces${perPack}. `
    + `The ${naira(pace.lastAmount)} you have now should wash about ${count(pace.piecesLeft || 0)} more.`;
}

/** "₦38 a piece — soap and electricity over the last 30 days, across 214 pieces." */
export function explainUnitCost(estimate: CostEstimate): string {
  if (estimate.learning) {
    const short = Math.max(0, estimate.needed - estimate.pieces);
    if (estimate.spend <= 0 && !estimate.soapGuessed && estimate.waitingOn.length) {
      return `Your ${estimate.waitingOn[0]} is counted once you buy it again, so I can see how long one lot lasts.`;
    }
    if (estimate.spend <= 0 && !estimate.soapGuessed) {
      return 'Record what you spend on soap and electricity and I can work out what a piece costs you.';
    }
    return `Still working out what a piece costs you — ${short} more ${short === 1 ? 'piece' : 'pieces'} and I will know.`;
  }

  const parts = estimate.breakdown.map(entry => entry.category.toLowerCase()).join(' and ');
  const guess = estimate.soapGuessed
    ? ` Soap is a starting ₦${DEFAULT_SOAP_PER_PIECE} a piece until you have bought it twice.`
    : '';
  return `₦${Math.round(estimate.perPiece!).toLocaleString()} a piece — ${parts} over the last ${estimate.days} days, across ${estimate.pieces} pieces.${guess}`;
}
