import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import type { ManagerSettings, StoreData } from '@/types/store';

/**
 * A yellow box around the message box, a yellow bar down every panel, and a
 * switch that turned nothing off.
 *
 * The focus rule applied a hard outline to every textarea on :focus-visible.
 * A text field matches that on any focus, a tap included — not only keyboard
 * navigation — so tapping the composer drew a rectangle around the inner
 * textarea, sitting inside the composer's own rounded pill.
 *
 * The scrollbar thumb was painted in the brand yellow, so anything scrollable
 * showed a bright bar down its edge.
 *
 * And "Order Alert Sound Notifications" in Settings wrote
 * managerSettings.orderAlertSoundsEnabled, while the code that decides whether
 * to play the chime read marketplaceSettings.alertSound. Turning it off in
 * Settings did nothing; the sound kept playing.
 */

const overhaul = readSource('src/storeflow-ui-overhaul.css');
const base = readSource('src/index.css');
const composer = readSource('src/components/FlowComposer.tsx');
const index = readSource('src/pages/Index.tsx');

describe('tapping the composer does not draw a box round it', () => {
  it('drops the outline on the composer textarea', () => {
    expect(overhaul).toContain('.flow-composer textarea:focus-visible');
    const rule = overhaul.slice(overhaul.indexOf('.flow-composer textarea:focus-visible'));
    expect(rule.slice(0, 120)).toContain('outline: none');
  });

  it('keeps the outline everywhere else, for keyboard users', () => {
    // Removing it globally would leave someone tabbing through with no idea
    // where they are.
    expect(overhaul).toContain('body.storeflow-ui-overhaul button:focus-visible');
    expect(overhaul).toContain('outline: 2px solid hsl(var(--ring))');
  });

  it('shows focus on the rounded edge instead of the brand colour', () => {
    expect(composer).not.toContain("focused ? 'border-primary/50'");
    expect(composer).toContain("focused ? 'border-foreground/25'");
  });
});

describe('no scrollbar is drawn anywhere', () => {
  it('is not painted in the brand colour any more', () => {
    expect(base).not.toContain('background: hsl(var(--primary) / 0.4)');
  });

  it('gives the bar no width or height', () => {
    const rule = base.slice(base.indexOf('::-webkit-scrollbar {'), base.indexOf('::-webkit-scrollbar {') + 80);
    expect(rule).toContain('width: 0');
    expect(rule).toContain('height: 0');
  });

  it('hides it in browsers that do not use the webkit rule', () => {
    expect(base).toContain('scrollbar-width: none');
    expect(base).toContain('-ms-overflow-style: none');
  });

  it('does not stop anything scrolling', () => {
    // Hiding the indicator is not the same as disabling overflow.
    expect(base).not.toContain('overflow: hidden !important');
  });
});

describe('turning the order chime off turns it off', () => {
  it('honours the Settings switch, not only the Marketplace one', () => {
    const gate = index.slice(index.indexOf('const isSoundEnabled'), index.indexOf('const isSoundEnabled') + 400);
    expect(gate).toContain('marketplaceSettings?.alertSound !== false');
    expect(gate).toContain('managerSettings?.orderAlertSoundsEnabled !== false');
  });

  it('keeps the two screens showing the same answer', () => {
    const settings = readSource('src/components/Settings.tsx');
    const toggle = settings.slice(settings.indexOf('Order Alert Sound Notifications'));
    expect(toggle.slice(0, 700)).toContain('alertSound: v');
  });

  it('treats an untouched store as sound-on', () => {
    // Both keys absent must mean on, or every existing shop goes silent.
    const store = { managerSettings: {}, marketplaceSettings: {} } as any as StoreData;
    const on =
      (store.marketplaceSettings as any)?.alertSound !== false &&
      store.managerSettings?.orderAlertSoundsEnabled !== false;
    expect(on).toBe(true);
  });
});

describe('the settings that had no type now have one', () => {
  it('declares them, so a misspelling is caught', () => {
    const types = readSource('src/types/store.ts');
    for (const field of ['retailPricingEnabled', 'orderAlertSoundsEnabled', 'businessTemplate']) {
      expect(types, field).toContain(field);
    }
  });

  it('accepts them on a value', () => {
    const settings: ManagerSettings = {
      enabled: true, retailPricingEnabled: false, orderAlertSoundsEnabled: false,
    } as ManagerSettings;
    expect(settings.retailPricingEnabled).toBe(false);
    expect(settings.orderAlertSoundsEnabled).toBe(false);
  });

  it('says plainly that the pricing switches are not wired to anything', () => {
    // They persist and change no price. Better to have that written down than
    // to have someone assume it works.
    const types = readSource('src/types/store.ts');
    const note = types.slice(types.indexOf('retailPricingEnabled') - 300, types.indexOf('retailPricingEnabled'));
    expect(note).toContain('Nothing reads either one');
  });
});
