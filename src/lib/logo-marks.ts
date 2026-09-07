/**
 * The picture on a store's logo, chosen to match what the shop actually does.
 *
 * Every logo style drew the same shopping basket. A laundry got a basket of
 * groceries; so did a barber, a cyber cafe and a car wash. The app knows the
 * business type — it is the second thing it asks for — and then ignored it at
 * the moment it draws the shop's identity.
 *
 * Each mark is a fragment of SVG drawn inside the same 240x180 canvas the
 * styles use, centred around (120, 60), so a style only has to supply its own
 * colour and the mark drops into the space the basket used to occupy.
 */

export type LogoMarkId =
  | 'laundry' | 'barber' | 'salon' | 'tailor' | 'pharmacy' | 'food' | 'restaurant'
  | 'electronics' | 'clothing' | 'repair' | 'printing' | 'cyber' | 'carwash'
  | 'photography' | 'cleaning' | 'spa' | 'gas' | 'gaming' | 'shop';

/** Business type ids, as the setup flow stores them, to the mark that suits. */
const BY_BUSINESS: Record<string, LogoMarkId> = {
  laundry: 'laundry',
  barber: 'barber',
  salon: 'salon',
  tailoring: 'tailor',
  pharmacy: 'pharmacy',
  food: 'food',
  restaurant: 'restaurant',
  electronics: 'electronics',
  clothing: 'clothing',
  repair: 'repair',
  printing: 'printing',
  cyber: 'cyber',
  carwash: 'carwash',
  photography: 'photography',
  cleaning: 'cleaning',
  spa: 'spa',
  gas: 'gas',
  gaming: 'gaming',
  provision: 'shop',
};

export function markForBusiness(businessType?: string): LogoMarkId {
  const key = String(businessType || '').toLowerCase();
  if (BY_BUSINESS[key]) return BY_BUSINESS[key];
  // Ids drift and new trades get added; fall back on a keyword rather than
  // silently drawing a grocery basket over someone's barbershop.
  for (const [needle, mark] of Object.entries(BY_BUSINESS)) {
    if (key.includes(needle)) return mark;
  }
  return 'shop';
}

/**
 * The mark itself. `accent` is the style's own colour, so a mark looks like it
 * belongs to whichever of the six looks the merchant picked.
 */
export function logoMarkSvg(mark: LogoMarkId, accent: string, secondary = accent): string {
  const s = (width: number) => `stroke="${accent}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;

  switch (mark) {
    case 'laundry':
      // A shirt on a hanger — what a laundry hands back.
      return `
        <path d="M 120,30 a 5,5 0 1 1 4,8 L 120,44" ${s(2.5)} />
        <path d="M 104,52 L 120,44 L 136,52 L 132,58 L 128,55 V 82 H 112 V 55 L 108,58 Z" ${s(3)} />
        <path d="M 96,72 H 144" stroke="${secondary}" stroke-width="2" fill="none" opacity="0.55" />`;

    case 'barber':
      // Scissors.
      return `
        <circle cx="106" cy="80" r="6" ${s(3)} />
        <circle cx="134" cy="80" r="6" ${s(3)} />
        <path d="M 110,75 L 136,40 M 130,75 L 104,40" ${s(3)} />`;

    case 'salon':
      return `
        <path d="M 106,40 q 14,18 0,42 M 120,36 q 16,22 0,46 M 134,40 q -14,18 0,42" ${s(3)} />
        <circle cx="120" cy="30" r="5" fill="${secondary}" />`;

    case 'tailor':
      // Needle and thread.
      return `
        <path d="M 100,84 L 138,40" ${s(3)} />
        <path d="M 138,40 l -3,7 l 7,-3 Z" fill="${accent}" />
        <path d="M 104,80 q -10,-8 -2,-16 q 8,-8 14,2" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linecap="round" />`;

    case 'pharmacy':
      return `
        <rect x="98" y="38" width="44" height="44" rx="10" ${s(3)} />
        <path d="M 120,50 V 70 M 110,60 H 130" ${s(4)} />`;

    case 'food':
    case 'restaurant':
      // Fork and knife.
      return `
        <path d="M 106,36 V 58 q 0,6 6,6 V 84" ${s(3)} />
        <path d="M 100,36 V 52 M 112,36 V 52" ${s(2.5)} />
        <path d="M 134,36 q 8,10 0,22 V 84" ${s(3)} />`;

    case 'electronics':
      return `
        <rect x="98" y="40" width="44" height="32" rx="4" ${s(3)} />
        <path d="M 108,82 H 132" ${s(3)} />
        <path d="M 120,72 V 82" ${s(2.5)} />
        <path d="M 112,50 l 8,0 l -5,8 l 8,0" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;

    case 'clothing':
      return `
        <path d="M 104,46 L 120,38 L 136,46 L 132,54 L 128,51 V 82 H 112 V 51 L 108,54 Z" ${s(3)} />
        <path d="M 112,38 q 8,10 16,0" ${s(2.5)} />`;

    case 'repair':
      // Spanner.
      return `
        <path d="M 132,40 a 12,12 0 1 0 -14,20 L 100,78 l 8,8 l 18,-18 a 12,12 0 0 0 14,-20 l -9,9 l -8,-8 Z" ${s(3)} />`;

    case 'printing':
      return `
        <rect x="100" y="52" width="40" height="22" rx="4" ${s(3)} />
        <path d="M 110,52 V 38 H 130 V 52" ${s(3)} />
        <path d="M 110,74 H 130 V 86 H 110 Z" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linejoin="round" />`;

    case 'cyber':
      return `
        <rect x="96" y="40" width="48" height="32" rx="4" ${s(3)} />
        <path d="M 88,80 H 152" ${s(3)} />
        <path d="M 112,54 l -6,6 l 6,6 M 128,54 l 6,6 l -6,6" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;

    case 'carwash':
      return `
        <path d="M 98,72 l 6,-18 h 32 l 6,18" ${s(3)} />
        <path d="M 94,72 h 52 v 10 h -52 Z" ${s(3)} />
        <circle cx="106" cy="82" r="4" fill="${accent}" />
        <circle cx="134" cy="82" r="4" fill="${accent}" />
        <path d="M 104,42 v -6 M 120,38 v -8 M 136,42 v -6" stroke="${secondary}" stroke-width="2.5" stroke-linecap="round" fill="none" />`;

    case 'photography':
      return `
        <rect x="96" y="46" width="48" height="34" rx="5" ${s(3)} />
        <circle cx="120" cy="63" r="10" ${s(3)} />
        <path d="M 110,46 l 4,-6 h 12 l 4,6" ${s(2.5)} />`;

    case 'cleaning':
      // Brush.
      return `
        <path d="M 132,34 L 108,58" ${s(3)} />
        <path d="M 100,66 l 8,-8 l 14,14 l -8,8 Z" ${s(3)} />
        <path d="M 106,82 q 6,8 14,0 q 6,8 14,0" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linecap="round" />`;

    case 'spa':
      // Lotus.
      return `
        <path d="M 120,36 q 10,14 0,30 q -10,-16 0,-30" ${s(2.8)} />
        <path d="M 120,66 q -18,-4 -24,-18 q 18,-2 24,18" ${s(2.8)} />
        <path d="M 120,66 q 18,-4 24,-18 q -18,-2 -24,18" ${s(2.8)} />
        <path d="M 98,76 q 22,10 44,0" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linecap="round" />`;

    case 'gas':
      return `
        <path d="M 100,84 V 42 a 6,6 0 0 1 6,-6 h 18 a 6,6 0 0 1 6,6 v 42" ${s(3)} />
        <path d="M 100,58 h 30" ${s(2.5)} />
        <path d="M 130,50 h 8 a 4,4 0 0 1 4,4 v 18 a 5,5 0 0 1 -10,0" stroke="${secondary}" stroke-width="2.5" fill="none" stroke-linecap="round" />`;

    case 'gaming':
      return `
        <rect x="94" y="50" width="52" height="30" rx="12" ${s(3)} />
        <path d="M 108,60 v 10 M 103,65 h 10" ${s(2.5)} />
        <circle cx="132" cy="62" r="3" fill="${secondary}" />
        <circle cx="139" cy="69" r="3" fill="${secondary}" />`;

    case 'shop':
    default:
      // The original basket, kept for a general shop.
      return `
        <path d="M 100,50 L 105,72 L 132,72 L 138,50 Z" ${s(3)} />
        <path d="M 92,42 H 100" ${s(3)} />
        <circle cx="110" cy="79" r="4" fill="${accent}" />
        <circle cx="128" cy="79" r="4" fill="${accent}" />`;
  }
}

/** A line under the name that suits the trade, rather than "DAILY ESSENTIALS". */
export function logoTagline(mark: LogoMarkId): string {
  switch (mark) {
    case 'laundry': return 'FRESH. CLEAN. PRESSED.';
    case 'barber':
    case 'salon': return 'LOOK YOUR BEST';
    case 'tailor': return 'MADE TO FIT';
    case 'pharmacy': return 'CARE YOU CAN TRUST';
    case 'food':
    case 'restaurant': return 'MADE FRESH DAILY';
    case 'electronics': return 'TESTED. TRUSTED.';
    case 'clothing': return 'WEAR IT WELL';
    case 'repair': return 'FIXED PROPERLY';
    case 'printing': return 'PRINTED SHARP';
    case 'cyber': return 'ONLINE IN MINUTES';
    case 'carwash': return 'SHINE EVERY TIME';
    case 'photography': return 'MOMENTS THAT LAST';
    case 'cleaning': return 'SPOTLESS, EVERY TIME';
    case 'spa': return 'REST AND RESTORE';
    case 'gas': return 'FILL UP AND GO';
    case 'gaming': return 'PLAY ALL DAY';
    default: return 'DAILY ESSENTIALS';
  }
}
