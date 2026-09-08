/**
 * What each trade actually buys and uses up.
 *
 * The supplies list was written for the laundry and then shown to every
 * service shop, so a barber opened it and was offered starch and fabric
 * softener, and a cyber cafe was asked whether it had run out of bleach. The
 * mechanism was right and only the words were wrong, which is the easiest kind
 * of thing to leave broken while attention is somewhere else.
 *
 * These are seeds, not rules. The first thing a shop does is edit them, and
 * once it has its own list this file is never consulted again. The point is
 * only that the first screen should look like it was written for the trade
 * standing in front of it.
 *
 * Every list also names the thing that trade actually spends most on, because
 * that is the one the owner is least likely to have been recording. See
 * `consumableAsk` below, which is what the prompt on the expenses screen asks
 * about.
 */

import type { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-runtime';

export interface SupplySeed {
  name: string;
  unit: string;
}

/**
 * The generic list, for a trade with no entry of its own.
 *
 * Deliberately short. A shop that sees four plausible lines and adds its own
 * is better served than one that has to delete eleven wrong ones first.
 */
export const GENERIC_SUPPLIES: SupplySeed[] = [
  { name: 'Cleaning materials', unit: 'pack' },
  { name: 'Diesel', unit: 'litre' },
  { name: 'Packaging', unit: 'pack' },
];

const TRADE_SUPPLIES: Record<string, SupplySeed[]> = {
  laundry: [
    { name: 'Detergent', unit: 'bag' },
    { name: 'Bleach', unit: 'litre' },
    { name: 'Starch', unit: 'bag' },
    { name: 'Fabric softener', unit: 'litre' },
    { name: 'Diesel', unit: 'litre' },
    { name: 'Cooking gas', unit: 'kg' },
    { name: 'Nylon bags', unit: 'pack' },
  ],
  barber: [
    { name: 'Clipper oil', unit: 'bottle' },
    { name: 'Razor blades', unit: 'pack' },
    { name: 'Disinfectant spray', unit: 'bottle' },
    { name: 'Methylated spirit', unit: 'bottle' },
    { name: 'Powder', unit: 'tin' },
    { name: 'Diesel', unit: 'litre' },
  ],
  salon: [
    { name: 'Relaxer', unit: 'pack' },
    { name: 'Shampoo', unit: 'bottle' },
    { name: 'Hair treatment', unit: 'jar' },
    { name: 'Weaving thread', unit: 'roll' },
    { name: 'Gloves', unit: 'pack' },
    { name: 'Diesel', unit: 'litre' },
  ],
  tailoring: [
    { name: 'Thread', unit: 'roll' },
    { name: 'Lining', unit: 'yard' },
    { name: 'Zips', unit: 'pack' },
    { name: 'Buttons', unit: 'pack' },
    { name: 'Needles', unit: 'pack' },
    { name: 'Machine oil', unit: 'bottle' },
  ],
  repair: [
    { name: 'Soldering lead', unit: 'roll' },
    { name: 'Cleaning alcohol', unit: 'bottle' },
    { name: 'Adhesive / glue', unit: 'tube' },
    { name: 'Screws and clips', unit: 'pack' },
    { name: 'Diesel', unit: 'litre' },
  ],
  printing: [
    { name: 'A4 paper', unit: 'ream' },
    { name: 'Toner', unit: 'cartridge' },
    { name: 'Ink', unit: 'bottle' },
    { name: 'Binding covers', unit: 'pack' },
    { name: 'Lamination pouches', unit: 'pack' },
    { name: 'Diesel', unit: 'litre' },
  ],
  cyber_cafe: [
    { name: 'A4 paper', unit: 'ream' },
    { name: 'Toner', unit: 'cartridge' },
    { name: 'Data subscription', unit: 'month' },
    { name: 'Diesel', unit: 'litre' },
  ],
  car_wash: [
    { name: 'Car shampoo', unit: 'litre' },
    { name: 'Tyre shine', unit: 'bottle' },
    { name: 'Microfibre cloths', unit: 'pack' },
    { name: 'Wax / polish', unit: 'tin' },
    { name: 'Diesel', unit: 'litre' },
  ],
  photography: [
    { name: 'Memory cards', unit: 'piece' },
    { name: 'Batteries', unit: 'pack' },
    { name: 'Photo paper', unit: 'pack' },
    { name: 'Ink', unit: 'bottle' },
    { name: 'Diesel', unit: 'litre' },
  ],
  cleaning: [
    { name: 'Detergent', unit: 'bag' },
    { name: 'Disinfectant', unit: 'litre' },
    { name: 'Mop heads', unit: 'piece' },
    { name: 'Gloves', unit: 'pack' },
    { name: 'Refuse bags', unit: 'pack' },
  ],
  spa: [
    { name: 'Massage oil', unit: 'bottle' },
    { name: 'Towels', unit: 'piece' },
    { name: 'Disposable slippers', unit: 'pack' },
    { name: 'Scrub', unit: 'jar' },
    { name: 'Diesel', unit: 'litre' },
  ],
  restaurant: [
    { name: 'Cooking gas', unit: 'kg' },
    { name: 'Takeaway packs', unit: 'pack' },
    { name: 'Disposable cutlery', unit: 'pack' },
    { name: 'Nylon bags', unit: 'pack' },
    { name: 'Diesel', unit: 'litre' },
  ],
  food: [
    { name: 'Cooking gas', unit: 'kg' },
    { name: 'Takeaway packs', unit: 'pack' },
    { name: 'Nylon bags', unit: 'pack' },
    { name: 'Diesel', unit: 'litre' },
  ],
  games: [
    { name: 'Controllers', unit: 'piece' },
    { name: 'Diesel', unit: 'litre' },
    { name: 'Data subscription', unit: 'month' },
  ],
};

/** The starting supplies for whichever trade this shop is. */
export function tradeSupplies(store?: Partial<StoreData> | null): SupplySeed[] {
  return TRADE_SUPPLIES[getBusinessTemplate(store).type] || GENERIC_SUPPLIES;
}

/**
 * The one thing this trade spends most on and is least likely to be recording.
 *
 * A laundry buys soap with cash out of the drawer and never writes it down; a
 * barber does the same with blades and clipper oil, a printing shop with paper
 * and toner. Same blind spot, different word - and asking a barber about soap
 * is how a good question gets ignored.
 */
export interface ConsumableAsk {
  /** Named in the question, e.g. "Have you bought detergent lately?" */
  noun: string;
  /** The placeholder on the brand box, so the question is answerable. */
  brandHint: string;
}

const TRADE_ASK: Record<string, ConsumableAsk> = {
  laundry: { noun: 'detergent', brandHint: 'Which soap' },
  barber: { noun: 'blades or clipper oil', brandHint: 'Which brand' },
  salon: { noun: 'relaxer or shampoo', brandHint: 'Which brand' },
  tailoring: { noun: 'thread or lining', brandHint: 'Which brand' },
  repair: { noun: 'parts or soldering lead', brandHint: 'Which brand' },
  printing: { noun: 'paper or toner', brandHint: 'Which brand' },
  cyber_cafe: { noun: 'paper or toner', brandHint: 'Which brand' },
  car_wash: { noun: 'car shampoo', brandHint: 'Which brand' },
  photography: { noun: 'ink or photo paper', brandHint: 'Which brand' },
  cleaning: { noun: 'detergent or disinfectant', brandHint: 'Which brand' },
  spa: { noun: 'oil or scrub', brandHint: 'Which brand' },
  restaurant: { noun: 'gas or takeaway packs', brandHint: 'Which brand' },
  food: { noun: 'gas or takeaway packs', brandHint: 'Which brand' },
};

export function consumableAsk(store?: Partial<StoreData> | null): ConsumableAsk {
  return TRADE_ASK[getBusinessTemplate(store).type] || { noun: 'supplies', brandHint: 'Which brand' };
}
