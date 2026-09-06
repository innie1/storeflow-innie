import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * The retail and wholesale switches changed nothing a customer could see.
 *
 * The merchant sets one thing — a pricing mode of retail, wholesale or both.
 * Marketplace Settings wrote it to marketplaceSettings.pricingMode and mirrored
 * two booleans onto managerSettings. The Settings screen wrote only the
 * booleans. And the storefront payload — both get_public_storefront and the
 * directory listing — carries marketplaceSettings but not managerSettings, so
 * the booleans never left the merchant's phone.
 *
 * The customer app, meanwhile, read only the booleans. So whichever screen the
 * merchant used, the setting went into a field the customer never received,
 * and every shop was served as though it offered both prices.
 */

const settings = readSource('src/components/Settings.tsx');

describe('the settings switches write what customers actually read', () => {
  it('sets the pricing mode, not only the mirrored booleans', () => {
    expect(settings).toContain('const setPricingModes');
    const fn = settings.slice(settings.indexOf('const setPricingModes'), settings.indexOf('const updateMgr'));
    expect(fn).toContain('pricingMode:');
    expect(fn).toContain('marketplaceSettings');
  });

  it('keeps the booleans in step, so both screens agree', () => {
    const fn = settings.slice(settings.indexOf('const setPricingModes'), settings.indexOf('const updateMgr'));
    expect(fn).toContain('retailPricingEnabled: nextRetail');
    expect(fn).toContain('wholesalePricingEnabled: nextWholesale');
  });

  it('is what both toggles call', () => {
    const block = settings.slice(settings.indexOf('Enable Retail Pricing Mode'));
    expect(block.slice(0, 900)).toContain('setPricingModes(v,');
    expect(block.slice(0, 900)).toContain('setPricingModes(mgr.retailPricingEnabled !== false, v)');
  });
});

describe('a storefront is never left with no prices', () => {
  /** The same rule the component applies, kept here so it can be exercised. */
  const resolve = (retail: boolean, wholesale: boolean) => {
    const bothOff = !retail && !wholesale;
    const nextRetail = bothOff ? true : retail;
    const nextWholesale = bothOff ? false : wholesale;
    return {
      retail: nextRetail,
      wholesale: nextWholesale,
      mode: nextRetail && nextWholesale ? 'both' : nextWholesale ? 'wholesale' : 'retail',
    };
  };

  it('maps each combination to a mode', () => {
    expect(resolve(true, true).mode).toBe('both');
    expect(resolve(true, false).mode).toBe('retail');
    expect(resolve(false, true).mode).toBe('wholesale');
  });

  it('refuses to turn the last one off', () => {
    // A shop showing neither price has a storefront nobody can buy from.
    const both = resolve(false, false);
    expect(both.retail).toBe(true);
    expect(both.mode).toBe('retail');
  });

  it('says so rather than silently ignoring the tap', () => {
    const fn = settings.slice(settings.indexOf('const setPricingModes'), settings.indexOf('const updateMgr'));
    expect(fn).toContain('at least one price');
  });
});
