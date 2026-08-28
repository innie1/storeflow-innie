import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { patchFloatingFlowSetting } from '../../vite-plugin-floating-flow-setting';

describe('floating Flow shortcut setting', () => {
  it('adds the toggle inside Flow Settings tools and defaults it on', () => {
    const source = fs.readFileSync('src/components/Settings.tsx', 'utf8');
    const transformed = patchFloatingFlowSetting(source);
    expect(transformed).toContain('label="Floating Flow Shortcut"');
    expect(transformed).toContain('Tap to message Flow or hold for 3 seconds to speak.');
    expect(transformed).toContain('floatingFlowShortcutEnabled !== false');
    expect(transformed.indexOf('label="Floating Flow Shortcut"')).toBeLessThan(transformed.indexOf('label="Voice Notes"'));
  });
});
