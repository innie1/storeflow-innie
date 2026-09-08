/**
 * How a particular item is to be treated.
 *
 * The instruction most often lost between the counter and the machine. A
 * customer says "heavy starch on the two shirts, and don't bleach the white
 * one", the attendant remembers it for as long as they are standing there, and
 * nothing in the app could hold it — notes were one free-text box for the
 * whole bundle, which is no use when the instruction belongs to one garment.
 *
 * Getting it wrong means a rewash: the shop's soap, the shop's time, and a
 * customer who now has to be argued with. So it lives on the item, travels to
 * the receipt, and is searchable.
 */

/** Offered first because they are what a laundry is actually asked for. */
export const LAUNDRY_MODIFIERS: string[] = [
  'Heavy starch',
  'Light starch',
  'No starch',
  'No bleach',
  'Fold',
  'Hang',
  'Delicate',
  'Separate wash',
  'Stain treat',
];

/**
 * Choices that contradict each other.
 *
 * Starch is one decision, not three, and a ticket reading "heavy starch, no
 * starch" is worse than one reading neither — it will be guessed at. Picking
 * one clears the others in its group rather than refusing the tap, because the
 * second tap is a correction, not a mistake.
 */
const EXCLUSIVE_GROUPS: string[][] = [
  ['Heavy starch', 'Light starch', 'No starch'],
  ['Fold', 'Hang'],
];

export function toggleModifier(current: string[] | undefined, modifier: string): string[] {
  const list = Array.isArray(current) ? current : [];
  if (list.includes(modifier)) return list.filter(item => item !== modifier);

  const group = EXCLUSIVE_GROUPS.find(entry => entry.includes(modifier));
  const kept = group ? list.filter(item => !group.includes(item)) : list;
  return [...kept, modifier];
}

/** For a receipt line or a record row: "Shirt ×2 (heavy starch, no bleach)". */
export function describeModifiers(modifiers?: string[]): string {
  if (!modifiers || modifiers.length === 0) return '';
  return modifiers.join(', ').toLowerCase();
}

/**
 * Every instruction in a bundle, said once.
 *
 * What the person at the machine needs is the set of things to do, not a
 * per-item table they have to read twice.
 */
export function bundleModifiers(garments: { modifiers?: string[] }[]): string[] {
  const seen = new Set<string>();
  for (const garment of garments || []) {
    for (const modifier of garment.modifiers || []) seen.add(modifier);
  }
  return Array.from(seen);
}
