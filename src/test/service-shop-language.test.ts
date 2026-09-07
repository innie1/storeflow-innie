import { describe, expect, it } from 'vitest';
import { healthScore } from '@/lib/manager-intel';
import { readSource } from './helpers/source';

/**
 * A sweep of everything a laundry could open that talked to it like a grocer.
 *
 * Store Health gave it a 15% "Inventory Health" factor decided by stock it
 * does not keep, and told it "All 0 products well-stocked". Achievements
 * offered a badge for cataloguing 15 products, permanently locked. Goals
 * offered "Inventory Growth" and suggested saving for a warehouse lease. The
 * Academy taught it inventory turnover and how to reconcile a cash drawer it
 * has never opened.
 *
 * None of it was broken code. All of it told the owner the app was built for
 * somebody else's shop.
 */

const laundry = {
  storeName: 'Shine Laundry',
  storeType: 'laundry',
  category: 'retail',
  accessCode: 'TEST01',
  products: [],
  sales: [],
  customers: [],
  expenses: [],
} as any;

const shop = {
  storeName: 'Corner Store',
  storeType: 'provision',
  category: 'retail',
  products: [],
  sales: [],
  customers: [],
  expenses: [],
} as any;

describe('store health measures something the shop controls', () => {
  it('scores a service shop on work going back on time', () => {
    const health = healthScore(laundry);
    expect(health.details.inventory).not.toMatch(/product|stock/i);
    expect(health.details.inventory).toBe('Nothing taken in yet');
  });

  it('still scores a product shop on its stock', () => {
    expect(healthScore(shop).details.inventory).toMatch(/product|catalog/i);
  });

  it('is labelled for the trade on the Flow page', () => {
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).toContain("isServiceFirstBusiness(store) ? 'Work On Time' : 'Inventory Health'");
  });
});

describe('badges can actually be earned here', () => {
  const badges = readSource('src/components/Achievements.tsx');

  it('hides the stock badge from a shop that keeps none', () => {
    expect(badges).toContain('productShopOnly: true');
    expect(badges).toContain('badge.productShopOnly && isService');
  });

  it('offers service shops something of their own instead', () => {
    expect(badges).toContain("id: 'service-menu'");
    expect(badges).toContain("id: 'on-time'");
    expect(badges).toContain('serviceShopOnly: true');
  });
});

describe('goals fit the shop', () => {
  const goals = readSource('src/components/Goals.tsx');

  it('does not offer inventory growth to a shop with no inventory', () => {
    expect(goals).toContain('{!isServiceFirstBusiness(store) && <option value="inventory">');
  });

  it('suggests something a laundry might actually save for', () => {
    expect(goals).toContain('Buy a second washing machine');
  });
});

describe('the academy teaches the right trade', () => {
  const academy = readSource('src/components/Academy.tsx');

  it('keeps turnover and cash-drawer lessons to shops that have them', () => {
    expect(academy).toContain('productShopOnly?: boolean;');
    expect(academy).toContain('lesson.productShopOnly && isService');
  });

  it('teaches a service shop pricing and turnaround instead', () => {
    expect(academy).toContain("id: 'service-pricing'");
    expect(academy).toContain("id: 'turnaround'");
  });

  it('counts progress against the lessons actually offered', () => {
    // "3 of 3" while showing one lesson would be its own small lie.
    expect(academy).toContain('{completedLessons.length} of {lessons.length}');
  });
});

describe('the Flow page speaks the trade', () => {
  const manager = readSource('src/components/Manager.tsx');

  it('does not offer a cash drawer to a shop without a till', () => {
    expect(manager).toContain('{runsATill(store) && (');
  });

  it('does not talk about things being out of stock', () => {
    expect(manager).toContain('a customer asks for something you do not offer');
  });
});
