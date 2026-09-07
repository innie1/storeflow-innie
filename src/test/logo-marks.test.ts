import { describe, expect, it } from 'vitest';
import { logoMarkSvg, logoTagline, markForBusiness } from '@/lib/logo-marks';
import { getLogoSvgMarkup, LOGO_STYLES } from '@/components/StoreLogo';
import { readSource } from './helpers/source';

/**
 * A logo that matches the shop.
 *
 * Every one of the six styles drew the same shopping basket, and every one
 * carried a grocer's tagline. A laundry got a basket and "DAILY ESSENTIALS";
 * so did a barbershop, a cyber cafe and a car wash. The app asks what kind of
 * business it is — it is the second question in setup — and then ignored the
 * answer at the exact moment it draws the shop's identity.
 */

describe('the mark follows the trade', () => {
  it('knows the trades the setup flow offers', () => {
    expect(markForBusiness('laundry')).toBe('laundry');
    expect(markForBusiness('barber')).toBe('barber');
    expect(markForBusiness('pharmacy')).toBe('pharmacy');
    expect(markForBusiness('carwash')).toBe('carwash');
  });

  it('falls back on a keyword rather than a basket', () => {
    // Ids drift and trades get added; drawing groceries over someone's
    // barbershop is worse than a rough guess.
    expect(markForBusiness('barber_shop')).toBe('barber');
    expect(markForBusiness('dry_cleaning_laundry')).toBe('laundry');
  });

  it('only falls back to a shop when it truly has nothing', () => {
    expect(markForBusiness('')).toBe('shop');
    expect(markForBusiness(undefined)).toBe('shop');
    expect(markForBusiness('something-nobody-has-heard-of')).toBe('shop');
  });

  it('draws something different for each trade', () => {
    const laundry = logoMarkSvg('laundry', '#000');
    const barber = logoMarkSvg('barber', '#000');
    expect(laundry).not.toBe(barber);
    expect(laundry.length).toBeGreaterThan(40);
    expect(barber.length).toBeGreaterThan(40);
  });

  it('takes the style\'s colour, so it belongs to the look picked', () => {
    expect(logoMarkSvg('laundry', '#10B981')).toContain('#10B981');
    expect(logoMarkSvg('laundry', '#0F172A')).toContain('#0F172A');
  });

  it('gives every trade a line that suits it', () => {
    expect(logoTagline('laundry')).toBe('FRESH. CLEAN. PRESSED.');
    expect(logoTagline('barber')).toBe('LOOK YOUR BEST');
    expect(logoTagline('shop')).toBe('DAILY ESSENTIALS');
  });
});

describe('every style uses it', () => {
  it('renders the trade mark and tagline whichever look is chosen', () => {
    for (const style of LOGO_STYLES) {
      const svg = getLogoSvgMarkup('Shine Laundry', style.id, 'laundry');
      expect(svg, style.id).toContain('FRESH. CLEAN. PRESSED.');
      // Premium is a monogram by design — the shop's initial in a ring — so it
      // carries no pictorial mark to make trade-specific.
      if (style.id === 'premium') continue;
      // The hanger, which only the laundry mark draws.
      expect(svg, style.id).toContain('a 5,5 0 1 1 4,8');
    }
  });

  it('no style still hardcodes a grocer\'s line', () => {
    for (const style of LOGO_STYLES) {
      const svg = getLogoSvgMarkup('Sharp Cuts', style.id, 'barber');
      expect(svg, style.id).not.toContain('DAILY ESSENTIALS');
      expect(svg, style.id).not.toContain('SIMPLE. FRESH. ESSENTIAL.');
      expect(svg, style.id).not.toContain('MORE VALUE. EVERY DAY.');
      expect(svg, style.id).not.toContain('SMART CHOICE, BETTER LIVING');
      expect(svg, style.id).toContain('LOOK YOUR BEST');
    }
  });

  it('still draws a basket for a general shop', () => {
    // The original mark is right for a provision store; it was only ever
    // wrong as the answer for everybody.
    expect(getLogoSvgMarkup('Corner Store', 'modern', 'provision')).toContain('M 100,50 L 105,72');
  });

  it('keeps working when nothing is known about the business', () => {
    for (const style of LOGO_STYLES) {
      expect(getLogoSvgMarkup('Some Shop', style.id).length, style.id).toBeGreaterThan(200);
    }
  });

  it('puts the store name on every one', () => {
    for (const style of LOGO_STYLES) {
      const svg = getLogoSvgMarkup('Shine Laundry', style.id, 'laundry');
      expect(svg.toUpperCase(), style.id).toContain('SHINE LAUNDRY');
    }
  });
});

describe('the screens pass the business through', () => {
  it('offers the choice against the merchant\'s own trade during setup', () => {
    const access = readSource('src/components/StoreAccess.tsx');
    expect(access).toContain('businessType={businessType}');
  });

  it('draws the saved store with its own trade', () => {
    const settings = readSource('src/components/Settings.tsx');
    expect(settings).toContain('businessType={store.storeType}');
  });

  it('no longer passes props StoreLogo does not have', () => {
    // styleName and size were silently ignored, so that logo drew the default
    // style rather than the one the merchant chose.
    const settings = readSource('src/components/Settings.tsx');
    expect(settings).not.toContain('<StoreLogo styleName=');
  });
});
