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
  /** Of `pieces`, how many were washed, and so used soap. */
  washedPieces: number;
  /** Powered work across `pieces`: one for each piece washed, one for each ironed. */
  steps: number;
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

/**
 * Whether a bundle is ironed, and so used the iron.
 *
 * The other half of the same question. "Wash Only" is named for the one thing
 * it is; "Full Service" and anything with iron or press in its name is ironed.
 * A service the shop named something else is taken to get the full treatment,
 * so it is never costed as cheaper than it might be.
 */
export function ironsClothes(record: { serviceId?: string; serviceName?: string }): boolean {
  const name = String(record.serviceName || '').toLowerCase();
  if (/iron|press|full|complete/.test(name)) return true;
  if (/only/.test(name)) return false;
  return record.serviceId !== 'wash-only';
}

/**
 * How much powered work a piece goes through: washing is one, ironing is one.
 *
 * One meter runs the machines and the irons, so a light bill cannot be read
 * off per service. Spread evenly over pieces, a shirt that was only ironed
 * carried as much light as one that was washed and ironed, and ironing looked
 * as though it barely paid. Spread over the work instead, a piece that is
 * washed and ironed carries twice the light of one that is only ironed.
 */
export function powerSteps(record: { serviceId?: string; serviceName?: string }): number {
  return (washesClothes(record) ? 1 : 0) + (ironsClothes(record) ? 1 : 0) || 1;
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
  return lotPaces(store, 'Consumables', expense => consumableKey(store, expense), washesClothes);
}

/**
 * Which bill a utility payment was: power, fuel for the generator, water.
 * A light bill is measured against the last light bill, never the diesel.
 */
export function utilityKey(expense: Pick<Expense, 'note' | 'supply'>): string {
  const text = String(expense.supply || expense.note || '').trim().toLowerCase();
  if (/light|nepa|phcn|electric|power|token|prepaid|meter/.test(text)) return 'electricity';
  if (/diesel|fuel|petrol|generator|gen\b/.test(text)) return 'fuel';
  if (/water|borehole/.test(text)) return 'water';
  return text.split(/ — | \(/)[0].trim() || 'utilities';
}

/**
 * How many pieces each bill paid for.
 *
 * The same reading as soap, for the same reason: a light bill or a load of
 * diesel lasts until the next one, so it is what it cost over the pieces done
 * until it was paid again - every piece this time, because the iron runs on
 * the same power as the machines.
 */
export function utilityPace(store: StoreData): SupplyPace[] {
  return lotPaces(store, 'Utilities', utilityKey, () => true);
}

function lotPaces(
  store: StoreData,
  category: ExpenseCategory,
  keyOf: (expense: Expense) => string,
  counts: (record: { serviceId?: string; serviceName?: string }) => boolean,
): SupplyPace[] {
  const groups = new Map<string, { at: number; amount: number; packs: number | null }[]>();
  for (const expense of store.expenses || []) {
    if (expense.category !== category) continue;
    const at = new Date(expense.date || '').getTime();
    const amount = Math.max(0, Number(expense.amount) || 0);
    if (!Number.isFinite(at) || amount <= 0) continue;
    const key = keyOf(expense);
    groups.set(key, [...(groups.get(key) || []), { at, amount, packs: packsIn(expense.note) }]);
  }

  const accessCode = String(store.accessCode || '');
  const washed = (accessCode ? shopLaundryRecords(accessCode) : [])
    .filter(counts)
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
export function estimateUnitCost(store: StoreData, days = 30, until?: number, from?: number): CostEstimate {
  /*
   * `until` ends the window somewhere other than now, and `from` starts it on
   * a set day instead of counting days back. The month's target reads its
   * costs from the whole of last month, the 1st to its last day, so that the
   * target holds still all month instead of moving with every bundle and
   * every bag of soap.
   */
  const end = until ?? Date.now();
  const since = from ?? end - days * DAY;
  if (from !== undefined) days = Math.round((end - from) / DAY);
  const within = (value: unknown) => {
    const time = new Date(String(value || '')).getTime();
    return Number.isFinite(time) && time >= since && (until === undefined || time < end);
  };

  const categories = variableCategories(store);
  const totals = new Map<ExpenseCategory, number>();
  let spend = 0;

  for (const expense of store.expenses || []) {
    if (!within(expense.date) || !categories.includes(expense.category)) continue;
    // Spread over the pieces it lasts for, below, not charged on the day it was bought.
    if (expense.category === 'Consumables') continue;
    if (expense.category === 'Utilities') continue;
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
  const labour = approvedLabourBetween(store, since, end);
  if (labour > 0) {
    spend += labour;
    totals.set(PIECE_WORK_CATEGORY as ExpenseCategory, labour);
  }

  const accessCode = String(store.accessCode || '');
  let pieces = 0;
  let washedPieces = 0;
  let steps = 0;
  for (const record of accessCode ? shopLaundryRecords(accessCode) : []) {
    if (!within(record.createdAt)) continue;
    pieces += Number(record.pieceCount) || 0;
    if (washesClothes(record)) washedPieces += Number(record.pieceCount) || 0;
    steps += (Number(record.pieceCount) || 0) * powerSteps(record);
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

  /*
   * Bills, the same way, once a second one shows how many pieces the first
   * paid for. Before that the bills in the window are spread over its pieces,
   * as they always were - a real cost the shop recorded, and the month's
   * target checks it cannot be most of the price of the work.
   */
  if (categories.includes('Utilities')) {
    let bills = 0;
    for (const pace of utilityPace(store)) {
      if (pace.perPiece !== null) {
        bills += pace.perPiece * pieces;
        continue;
      }
      bills += (store.expenses || [])
        .filter(expense => expense.category === 'Utilities' && within(expense.date) && utilityKey(expense) === pace.key)
        .reduce((total, expense) => total + Math.max(0, Number(expense.amount) || 0), 0);
    }
    if (bills > 0) {
      spend += bills;
      totals.set('Utilities', bills);
    }
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
    washedPieces,
    steps,
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

/** How far a light bill goes, once there have been two to measure between. */
export function powerPaceSentence(store: StoreData): string {
  const pace = utilityPace(store).find(entry => entry.key === 'electricity');
  if (!pace) return '';
  const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
  if (pace.perPiece === null) {
    return pace.buys > 1
      ? `Light: too few pieces were recorded between your bills to say what power costs a piece yet.`
      : `Light: once you record your next bill I will know how many pieces ${naira(pace.lastAmount)} of power covered.`;
  }
  const recent = Math.min(RECENT_LOTS, pace.lots.filter(lot => lot.finished).length);
  const which = recent === 1 ? 'your last bill' : `your last ${recent} bills`;
  return `Light costs about ${naira(pace.perPiece)} a piece: ${which} covered ${Math.round(pace.usedWashed).toLocaleString()} pieces.`;
}

export interface PieceCostPart {
  /** What it is, in the shop's words: "soap", "light", "ironing pay". */
  label: string;
  perPiece: number;
  /** A figure the app is still assuming rather than one the shop recorded. */
  assumed: boolean;
  /** What the money went on, for a part that depends on the service: "washing and ironing". */
  note?: string;
}

/** A cost category in the shop's own words: "detergent", "light", "piece-work pay". */
function costLabel(store: StoreData, category: ExpenseCategory): string {
  if (category === 'Consumables') return consumableAsk(store).noun.toLowerCase();
  if (category === PIECE_WORK_CATEGORY) return 'piece-work pay';
  if (category !== 'Utilities') return category.toLowerCase();
  const bills = new Set(
    (store.expenses || [])
      .filter(expense => expense.category === 'Utilities')
      .map(expense => utilityKey(expense)),
  );
  const names = [...bills].map(key => (key === 'electricity' ? 'light' : key));
  return names.length ? names.join(' and ') : 'light';
}

/**
 * The per-piece figure taken apart.
 *
 * One number for "soap and electricity" could not be checked: it also held
 * piece-work pay when the shop had any, and a single light bill spread over
 * the month's pieces looked like soap had gone up. Each part on its own says
 * where the money goes and which part to question.
 */
export function pieceCostParts(store: StoreData, estimate: CostEstimate): PieceCostPart[] {
  if (estimate.learning || estimate.pieces <= 0) return [];
  return estimate.breakdown
    .filter(entry => entry.amount > 0)
    .map(entry => ({
      label: costLabel(store, entry.category),
      perPiece: entry.amount / estimate.pieces,
      // Soap is assumed while it still runs on the starting figure, and only
      // when nothing measured was added to it.
      assumed: entry.category === 'Consumables' && estimate.soapGuessed && entry.amount <= estimate.guessedSpend + 0.5,
    }));
}

/** "₦49 a piece to do the work: soap ₦30, light ₦19." */
export function pieceCostSentence(store: StoreData, estimate: CostEstimate, from?: string): string {
  const parts = pieceCostParts(store, estimate);
  if (!parts.length || estimate.perPiece === null) return '';
  const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
  const list = parts.map(part => `${part.label} ${naira(part.perPiece)}${part.assumed ? ' (starting figure)' : ''}`).join(', ');
  return `${naira(estimate.perPiece)} a piece to do the work: ${list}. From ${from ?? `the last ${estimate.days} days`}, ${estimate.pieces.toLocaleString()} pieces.`;
}

/* ── What each service costs ────────────────────────────────────────────── */

export interface ServiceCost {
  /** The service's id, or its name where a bundle carries no id. */
  key: string;
  name: string;
  bundles: number;
  /** Pieces of it taken in during the window. */
  pieces: number;
  /** What those bundles were priced at. */
  value: number;
  washes: boolean;
  irons: boolean;
  /** What one piece costs to do, part by part. Empty while nothing is known. */
  parts: PieceCostPart[];
  /** The parts added up, or null while there is nothing to go on. */
  perPiece: number | null;
}

export interface ServiceCosting {
  estimate: CostEstimate;
  /** Every service with work in the window, the one that brought most first. */
  services: ServiceCost[];
  /** The same reckoning for any service, whether or not it had work in the window. */
  costFor(service: { serviceId?: string; serviceName?: string }): Pick<ServiceCost, 'parts' | 'perPiece' | 'washes' | 'irons'>;
}

/**
 * What a piece costs to do, service by service.
 *
 * One figure used to stand for every service. A shop was told its ironing left
 * ₦45 of every ₦300, when most of the ₦255 "cost" was soap that ironing never
 * touches and light for a washing machine the shirt never went in.
 *
 * Each cost goes only to the work that uses it:
 *
 *   Soap           - to pieces that were washed. Ironing carries none.
 *   Light          - by the powered work a piece goes through (see powerSteps).
 *   Piece-work pay - to the service of the bundle the work was done on, because
 *                    every claim names its bundle.
 *
 * Nothing is added or lost: each service's cost times its pieces comes back to
 * the same total the month's target is worked out from.
 */
export function serviceCosting(store: StoreData, days = 30): ServiceCosting {
  const estimate = estimateUnitCost(store, days);
  const now = Date.now();
  const since = now - days * DAY;
  const accessCode = String(store.accessCode || '');
  const records = accessCode ? shopLaundryRecords(accessCode) : [];
  const keyOf = (service: { serviceId?: string; serviceName?: string }) =>
    String(service.serviceId || '').trim() || String(service.serviceName || '').trim().toLowerCase() || 'other';

  const groups = new Map<string, { name: string; bundles: number; pieces: number; value: number; latest: number }>();
  const serviceOfBundle = new Map<string, string>();
  for (const record of records) {
    const key = keyOf(record);
    serviceOfBundle.set(String(record.clientRef || ''), key);
    const at = new Date(String(record.createdAt || '')).getTime();
    if (!Number.isFinite(at) || at < since) continue;
    const group = groups.get(key) || { name: '', bundles: 0, pieces: 0, value: 0, latest: 0 };
    group.bundles += 1;
    group.pieces += Number(record.pieceCount) || 0;
    group.value += Number(record.total) || 0;
    // A renamed service goes by the name on its latest bundle.
    if (at >= group.latest) { group.latest = at; group.name = String(record.serviceName || '').trim() || group.name; }
    groups.set(key, group);
  }

  const amount = (category: ExpenseCategory) => estimate.breakdown.find(entry => entry.category === category)?.amount || 0;
  const soap = amount('Consumables');
  const power = amount('Utilities');
  const soapPerWashed = estimate.washedPieces > 0 ? soap / estimate.washedPieces : 0;
  const powerPerStep = estimate.steps > 0 ? power / estimate.steps : 0;
  const soapAssumed = estimate.soapGuessed && soap <= estimate.guessedSpend + 0.5;

  // Approved work, on the service of the bundle it was done on.
  const labourBy = new Map<string, number>();
  let labourUnplaced = 0;
  for (const entry of store.pieceWork || []) {
    if (!entry.approved) continue;
    const at = new Date(entry.at).getTime();
    if (!Number.isFinite(at) || at < since || at >= now) continue;
    const key = serviceOfBundle.get(String(entry.clientRef || ''));
    const value = Number(entry.amount) || 0;
    if (key && (groups.get(key)?.pieces || 0) > 0) labourBy.set(key, (labourBy.get(key) || 0) + value);
    else labourUnplaced += value;
  }

  const costFor: ServiceCosting['costFor'] = service => {
    const washes = washesClothes(service);
    const irons = ironsClothes(service);
    if (estimate.learning) return { parts: [], perPiece: null, washes, irons };
    const parts: PieceCostPart[] = [];
    if (powerPerStep > 0) {
      parts.push({
        label: costLabel(store, 'Utilities'),
        perPiece: powerPerStep * powerSteps(service),
        assumed: false,
        note: washes && irons ? 'washing and ironing' : irons ? 'ironing' : 'washing',
      });
    }
    if (washes && soapPerWashed > 0) {
      parts.push({ label: costLabel(store, 'Consumables'), perPiece: soapPerWashed, assumed: soapAssumed });
    }
    const group = groups.get(keyOf(service));
    const labour = (group && group.pieces > 0 ? (labourBy.get(keyOf(service)) || 0) / group.pieces : 0)
      + (estimate.pieces > 0 ? labourUnplaced / estimate.pieces : 0);
    if (labour > 0) parts.push({ label: costLabel(store, PIECE_WORK_CATEGORY as ExpenseCategory), perPiece: labour, assumed: false });
    parts.sort((a, b) => b.perPiece - a.perPiece);
    return {
      parts,
      perPiece: parts.length ? parts.reduce((total, part) => total + part.perPiece, 0) : null,
      washes,
      irons,
    };
  };

  const services: ServiceCost[] = Array.from(groups, ([key, group]) => {
    const cost = costFor({ serviceId: key, serviceName: group.name });
    return { key, name: group.name || 'Other', bundles: group.bundles, pieces: group.pieces, value: group.value, ...cost };
  }).sort((a, b) => b.value - a.value);

  return { estimate, services, costFor };
}

/**
 * "Light ₦129 for ironing. No detergent: nothing is washed."
 *
 * Says what a service's cost is made of, and for ironing says the thing an
 * owner would otherwise have to wonder about - that no soap was charged to it.
 */
export function serviceCostSentence(store: StoreData, cost: Pick<ServiceCost, 'parts' | 'washes'>): string {
  if (!cost.parts.length) return '';
  const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
  const list = cost.parts
    .map(part => `${part.label} ${naira(part.perPiece)}${part.note ? ` for ${part.note}` : ''}${part.assumed ? ' (starting figure)' : ''}`)
    .join(', ');
  const noSoap = cost.washes ? '' : ` No ${consumableAsk(store).noun.toLowerCase()}: nothing is washed.`;
  return `${list[0].toUpperCase()}${list.slice(1)}.${noSoap}`;
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
