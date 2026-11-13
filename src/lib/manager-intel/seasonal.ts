import { StoreData } from '@/types/store';
import { productMarkup } from '@/lib/pricing-math';
import { daysAgo } from './dates';

// ─── Seasonal Predictions ─────────────────────────────────────────────────────
export interface SeasonalPrediction {
  periodName: string;
  expectedTrend: 'increase' | 'decrease' | 'stable';
  details: string;
  suggestedItems: string[];
  itemsFromYourCatalog: boolean; // true if these are real products you sell; false if they're generic regional examples because nothing in your catalog matched
}

// Find products this store actually sells that match a season's typical
// demand categories, instead of always suggesting the same hardcoded product
// names regardless of what this merchant actually stocks.
export function matchStoreProducts(store: StoreData, keywords: string[], limit = 3): string[] {
  const active = store.products.filter(p => !p.discontinued);
  const matches = active.filter(p => {
    const haystack = `${p.name} ${p.category || ''}`.toLowerCase();
    return keywords.some(k => haystack.includes(k));
  });
  // Prefer the store's own fast movers among the matches, when we have sales history
  const salesQty = new Map<string, number>();
  store.sales.filter(s => new Date(s.date) >= daysAgo(30)).forEach(s => {
    salesQty.set(s.productId, (salesQty.get(s.productId) || 0) + s.quantity);
  });
  matches.sort((a, b) => (salesQty.get(b.id) || 0) - (salesQty.get(a.id) || 0));
  return matches.slice(0, limit).map(p => p.name);
}

/**
 * What a laundry's year actually looks like.
 *
 * The retail calendar told a laundry to stock stationery for back-to-school
 * and offered it "Milk Sachet Roll, Biscuit Packs, Sugar Packet" as suggested
 * items. The seasons are real; the goods are not its business.
 */
export function serviceSeasonalPredictions(store: StoreData, month: number): SeasonalPrediction[] | null {
  const trade = String(store.storeType || '').toLowerCase();
  if (trade !== 'laundry') return null;

  if (month === 7 || month === 8) {
    return [{
      periodName: 'Back-to-School Season',
      expectedTrend: 'increase',
      details: 'School uniforms come in together, often several sets per family.',
      suggestedItems: ['Offer a per-uniform bundle price', 'Ask for phone numbers at drop-off'],
      itemsFromYourCatalog: false,
    }];
  }
  if (month === 10 || month === 11) {
    return [{
      periodName: 'Christmas Festive Period',
      expectedTrend: 'increase',
      details: 'Native wear, lace and party clothes arrive in the last two weeks, often at once.',
      suggestedItems: ['Set a realistic collection date early', 'Take a deposit on big bundles'],
      itemsFromYourCatalog: false,
    }];
  }
  if (month === 2 || month === 3) {
    return [{
      periodName: 'Easter Festive Season',
      expectedTrend: 'increase',
      details: 'A smaller rush than Christmas, on the same kind of clothes.',
      suggestedItems: ['Confirm collection times before the holiday'],
      itemsFromYourCatalog: false,
    }];
  }
  return [{
    periodName: 'No Specific Seasonal Pattern Right Now',
    expectedTrend: 'stable',
    details: 'A steady stretch. Good time to settle uncollected bundles and chase old balances.',
    suggestedItems: [],
    itemsFromYourCatalog: false,
  }];
}

export function getSeasonalPredictions(store: StoreData): SeasonalPrediction[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11

  const service = serviceSeasonalPredictions(store, currentMonth);
  if (service) return service;

  const predictions: SeasonalPrediction[] = [];

  // 1. Back to School (August - September)
  if (currentMonth === 7 || currentMonth === 8) {
    const genericFallback = ['Milk Sachet Roll', 'Biscuit Packs', 'Sugar Packet'];
    const fromCatalog = matchStoreProducts(store, ['book', 'pen', 'pencil', 'biscuit', 'milk', 'sugar', 'snack', 'sweet']);
    predictions.push({
      periodName: 'Back-to-School Season',
      expectedTrend: 'increase',
      details: fromCatalog.length
        ? 'Stationery, snacks & drinks in your catalog typically see higher demand as school resumes.'
        : 'Stationery, snacks & drinks typically see higher demand as school resumes.',
      suggestedItems: fromCatalog.length ? fromCatalog : genericFallback,
      itemsFromYourCatalog: fromCatalog.length > 0,
    });
  }

  // 2. Holiday Festive (November - December)
  if (currentMonth === 10 || currentMonth === 11) {
    const genericFallback = ['Macaroni', 'Soft Drinks', 'Stout/Malt Drinks'];
    const fromCatalog = matchStoreProducts(store, ['macaroni', 'rice', 'stout', 'malt', 'wine', 'pepsi', 'drink', 'provision', 'spaghetti']);
    predictions.push({
      periodName: 'Christmas Festive Period',
      expectedTrend: 'increase',
      details: fromCatalog.length
        ? 'Provisions & drinks in your catalog typically see heavy demand for celebrations.'
        : 'Provisions & drinks typically see heavy demand for celebrations.',
      suggestedItems: fromCatalog.length ? fromCatalog : genericFallback,
      itemsFromYourCatalog: fromCatalog.length > 0,
    });
  }

  // 3. Easter/Spring (March - April)
  if (currentMonth === 2 || currentMonth === 3) {
    const genericFallback = ['Bottled/Sachet Water', 'Soft Drinks', 'Packaged Snacks'];
    const fromCatalog = matchStoreProducts(store, ['mineral', 'water', 'juice', 'pack', 'drink', 'snack']);
    predictions.push({
      periodName: 'Easter Festive Season',
      expectedTrend: 'increase',
      details: fromCatalog.length
        ? 'Groceries & drinks in your catalog typically see higher traffic this holiday weekend.'
        : 'Groceries & drinks typically see higher traffic this holiday weekend.',
      suggestedItems: fromCatalog.length ? fromCatalog : genericFallback,
      itemsFromYourCatalog: fromCatalog.length > 0,
    });
  }

  // Fallback default predictions — outside of any specific season window
  if (predictions.length === 0) {
    predictions.push({
      periodName: 'No Specific Seasonal Pattern Right Now',
      expectedTrend: 'stable',
      details: 'Focus on locked-in supplier contracts for stable margins.',
      suggestedItems: [],
      itemsFromYourCatalog: false,
    });
  }

  return predictions;
}

// ─── Seasonal Climate Insights ─────────────────────────────────────────────
// NOTE: There is no live weather API integrated into StoreFlow. This used to
// take a manually-picked "hot/rainy/cold" condition and return fabricated
// precise percentages (e.g. "25-30% increase") that were never actually
// measured from any data. Instead, this now derives a general seasonal
// expectation from Nigeria's known climate calendar (dry/Harmattan roughly
// Nov-Feb, hot dry season Mar-Apr, rainy season May-Oct) and is honest about
// being a general seasonal pattern rather than a live weather reading.
export interface WeatherInsight {
  weatherCondition: string;
  effect: string;
  suggestedAction: string;
}

/**
 * The same seasons, for a shop that sells work rather than goods.
 *
 * A laundry was being told that "rain can reduce foot traffic; pantry staples
 * tend to hold steady" and to keep its coolers stocked. Weather matters
 * enormously to a laundry — it decides how long clothes take to dry — so the
 * season was the right thing to raise and entirely the wrong thing to say
 * about it.
 */
export function serviceWeatherInsight(store: StoreData, month: number): WeatherInsight | null {
  const trade = String(store.storeType || '').toLowerCase();
  if (trade !== 'laundry') return null;

  if (month === 10 || month === 11 || month === 0 || month === 1) {
    return {
      weatherCondition: 'Harmattan Season (Nov–Feb)',
      effect: 'Clothes dry fast, but dust means more of them come back dirty sooner.',
      suggestedAction: 'Promise quicker turnaround while drying is easy, and expect repeat customers.',
    };
  }
  if (month === 2 || month === 3) {
    return {
      weatherCondition: 'Hot Dry Season (Mar–Apr)',
      effect: 'Drying is quickest now. Same-day work is realistic.',
      suggestedAction: 'Offer a same-day or express price while the weather allows it.',
    };
  }
  return {
    weatherCondition: 'Rainy Season (May–Oct)',
    effect: 'Clothes take much longer to dry, and promised days slip.',
    suggestedAction: 'Promise later collection times than usual, and lean on machine drying.',
  };
}

export function getWeatherInsights(store: StoreData): WeatherInsight {
  const month = new Date().getMonth(); // 0-11
  const service = serviceWeatherInsight(store, month);
  if (service) return service;

  if (month === 10 || month === 11 || month === 0 || month === 1) {
    // Nov–Feb: Harmattan / cool dry season
    return {
      weatherCondition: 'Harmattan Season (Nov–Feb)',
      effect: 'Cold, dusty air typically increases demand for hot drinks & skincare.',
      suggestedAction: 'Stock more Milo/Nescafé, tea & moisturizers.'
    };
  } else if (month === 2 || month === 3) {
    // Mar–Apr: hot dry season
    return {
      weatherCondition: 'Hot Dry Season (Mar–Apr)',
      effect: 'Rising heat typically increases demand for cold drinks.',
      suggestedAction: 'Keep coolers stocked and ice supply reliable.'
    };
  } else {
    // May–Oct: rainy season
    return {
      weatherCondition: 'Rainy Season (May–Oct)',
      effect: 'Rain can reduce foot traffic; pantry staples tend to hold steady.',
      suggestedAction: 'Offer WhatsApp/phone ordering with delivery.'
    };
  }
}

// ─── Smart Discounts ──────────────────────────────────────────────────────────
export interface DiscountRecommendation {
  productName: string;
  productId: string;
  stockQty: number;
  costPrice: number;
  sellingPrice: number;
  suggestedDiscountPct: number;
  daysDeadStock: number;
  marginImpact: string;
}

export function getSmartDiscounts(store: StoreData): DiscountRecommendation[] {
  const recs: DiscountRecommendation[] = [];
  const now = new Date();

  // Find products that have been in stock for over 14 days with no sales and have quantity > 5
  const last14DaysSales = store.sales.filter(s => (now.getTime() - new Date(s.date).getTime()) < 14 * 86400000);
  const soldIds = new Set(last14DaysSales.map(s => s.productId));

  store.products.filter(p => !p.discontinued).forEach(p => {
    if (!soldIds.has(p.id) && p.quantity > 5 && p.costPrice > 0) {
      const markup = productMarkup(p);
      if (markup > 0.15) {
        // Discount depth scales with how much room is actually available — never
        // suggest cutting into cost price, and never a token 10% regardless of
        // the product. Half the markup, taken off the selling price, always
        // lands above cost.
        const maxSafeDiscountPct = Math.floor(markup * 100 * 0.5);
        const suggestedDiscountPct = Math.max(5, Math.min(25, maxSafeDiscountPct));
        const daysDeadStock = p.addedAt ? Math.floor((now.getTime() - new Date(p.addedAt).getTime()) / 86400000) : 14;
        recs.push({
          productName: p.name,
          productId: p.id,
          stockQty: p.quantity,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          suggestedDiscountPct,
          daysDeadStock,
          marginImpact: `Reduces markup from ${Math.round(markup * 100)}% to ${Math.round((markup * 100) - suggestedDiscountPct)}%, while staying above cost price.`
        });
      }
    }
  });

  return recs.slice(0, 3);
}
