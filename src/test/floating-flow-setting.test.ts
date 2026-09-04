import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

describe('floating Flow shortcut setting', () => {
  it('adds the toggle inside Flow Settings tools and defaults it on', () => {
    const source = readSource('src/components/Settings.tsx');
    expect(source).toContain('label="Floating Flow Shortcut"');
    expect(source).toContain('Tap to message Flow or hold for 3 seconds to speak.');
    expect(source).toContain('floatingFlowShortcutEnabled !== false');
    expect(source.indexOf('label="Floating Flow Shortcut"')).toBeLessThan(source.indexOf('label="Voice Notes"'));
  });
});
