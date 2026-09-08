import { describe, expect, it } from 'vitest';
import { consumableAsk, tradeSupplies, GENERIC_SUPPLIES } from '@/lib/trade-supplies';
import { supplyList } from '@/lib/consumables';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { BUSINESS_TEMPLATES } from '@/lib/business-templates';
import { readSource } from './helpers/source';

/**
 * Things built for the laundry that belong to every trade.
 *
 * Work on this app has run trade by trade, and the laundry has had most of the
 * attention because it is the shop that is live. The cost of that is a steady
 * drift: something gets built on a laundry screen, works, and stays there -
 * while a barber with the same problem opens a screen that never got it.
 *
 * These tests are the guard. They do not check that the laundry works; they
 * check that what is not laundry-specific has not been left behind in the
 * laundry.
 */

const services = readSource('src/components/Services.tsx');

/** Every trade whose work is services rather than stock on a shelf. */
const serviceTrades = Object.values(BUSINESS_TEMPLATES)
  .filter(template => isServiceFirstBusiness({ businessType: template.type }))
  .map(template => template.type);

describe('the trades that are not the laundry', () => {
  it('there are several of them, so this is worth guarding', () => {
    // If this ever drops to one, the sharing below stops meaning anything.
    expect(serviceTrades.length).toBeGreaterThan(5);
    expect(serviceTrades).toContain('laundry');
    expect(serviceTrades).toContain('barber');
  });
});

describe('supplies are the trade\'s own', () => {
  /*
   * The supplies list was the laundry's and was shown to everybody, so a
   * barber was offered starch and fabric softener and a cyber cafe was asked
   * about bleach. The mechanism was right; only the words were somebody
   * else's.
   */
  it('does not offer laundry chemicals to trades that have no washing machine', () => {
    for (const trade of ['barber', 'printing', 'cyber_cafe', 'photography', 'tailoring']) {
      const names = tradeSupplies({ businessType: trade }).map(s => s.name.toLowerCase());
      expect(names).not.toContain('starch');
      expect(names).not.toContain('fabric softener');
      expect(names).not.toContain('bleach');
    }
  });

  it('still gives the laundry its own', () => {
    const names = tradeSupplies({ businessType: 'laundry' }).map(s => s.name);
    expect(names).toContain('Detergent');
    expect(names).toContain('Starch');
  });

  it('gives every service trade something plausible to start from', () => {
    for (const trade of serviceTrades) {
      const seeds = tradeSupplies({ businessType: trade });
      expect(seeds.length).toBeGreaterThan(2);
      for (const seed of seeds) {
        expect(seed.name.trim()).not.toBe('');
        expect(seed.unit.trim()).not.toBe('');
      }
    }
  });

  it('falls back rather than showing an empty screen for a trade with no list', () => {
    expect(tradeSupplies({ businessType: 'something_new' })).toEqual(GENERIC_SUPPLIES);
  });

  it('is what the supplies screen actually seeds from', () => {
    // supplyList used to hand back DEFAULT_SUPPLIES whoever asked.
    const barber = supplyList({ businessType: 'barber' }).map(s => s.name);
    const laundry = supplyList({ businessType: 'laundry' }).map(s => s.name);
    expect(barber).not.toEqual(laundry);
    expect(barber.join(' ').toLowerCase()).toContain('clipper');
  });

  it('leaves a shop that has its own list alone', () => {
    const own = [{ id: 'a', name: 'My own thing', unit: 'bag' }];
    expect(supplyList({ businessType: 'barber', supplies: own })).toEqual(own);
  });
});

describe('the consumable question asks in the trade\'s words', () => {
  /*
   * "Have you bought soap lately?" is the right question for a laundry and a
   * reason to dismiss the card for a barber, whose equivalent blind spot is
   * blades and clipper oil.
   */
  it('does not ask a barber about detergent', () => {
    expect(consumableAsk({ businessType: 'barber' }).noun).not.toContain('detergent');
  });

  it('asks the laundry about detergent', () => {
    expect(consumableAsk({ businessType: 'laundry' }).noun).toContain('detergent');
  });

  it('has a noun and a brand hint for every service trade', () => {
    for (const trade of serviceTrades) {
      const ask = consumableAsk({ businessType: trade });
      expect(ask.noun.trim()).not.toBe('');
      expect(ask.brandHint.trim()).not.toBe('');
    }
  });

  it('still answers for a trade it has never heard of', () => {
    const ask = consumableAsk({ businessType: 'something_new' });
    expect(ask.noun).toBe('supplies');
  });
});

describe('the pricing help is not locked to one screen', () => {
  /*
   * The advisor reads sales, which every trade has, and the price run is a way
   * through a long list. Both were built on the laundry's pricing screen -
   * which no other trade opens - so a barber with fourteen cuts to price had
   * the same problem and none of the help.
   */
  it('the advisor is on the screen every other service trade uses', () => {
    expect(services).toContain('PricingAdvisor');
  });

  it('so is the run through every price', () => {
    expect(services).toContain('PriceRun');
  });

  it('the shared run is not built out of laundry pricing', () => {
    // What it imports, not what its comments mention: the note at the top
    // explains where this came from and should not fail the test.
    const run = readSource('src/components/PriceRun.tsx');
    const imports = run.split('\n').filter(line => line.startsWith('import'));
    expect(imports.join('\n')).not.toContain('laundry');
    expect(run).not.toContain('getLaundry');
    expect(run).not.toContain('garmentTypes');
  });
});

describe('the shared screens are not filed under laundry', () => {
  /*
   * Where a file sits is what decides whether it gets remembered. Everything
   * here is shown to every service trade already - the break-even card and the
   * month report are mounted in Manager, the pip and its watcher on the shared
   * home screen - but all of them sat in components/laundry, where a session
   * working on the barber shop would never look.
   */
  it('the consumable prompt sits with the shared components', () => {
    expect(() => readSource('src/components/ConsumableAsk.tsx')).not.toThrow();
    expect(() => readSource('src/components/laundry/SoapAsk.tsx')).toThrow();
  });

  it('so does everything mounted on a screen every trade opens', () => {
    for (const shared of ['BreakEvenCard', 'BreakEvenPip', 'BreakEvenReached', 'BreakEvenWatcher', 'MonthReportCard']) {
      expect(() => readSource(`src/components/${shared}.tsx`)).not.toThrow();
      expect(() => readSource(`src/components/laundry/${shared}.tsx`)).toThrow();
    }
  });

  it('and the libraries behind them are not named for one trade', () => {
    expect(() => readSource('src/lib/service-breakeven.ts')).not.toThrow();
    expect(() => readSource('src/lib/service-month-report.ts')).not.toThrow();
  });

  it("leaves what really is the laundry's where it is", () => {
    // The intake camera, the workspace, the garment pricing: these are the
    // laundry's own and moving them would be the opposite mistake.
    expect(() => readSource('src/components/laundry/LaundryWorkspace.tsx')).not.toThrow();
    expect(() => readSource('src/components/laundry/IntakeCamera.tsx')).not.toThrow();
  });
});
