import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * An installed PWA keeps showing the icon it was installed with, so the icon
 * URLs carry a hash of the icon bytes: a new icon is a new URL, which makes
 * the manifest different, which is what Chrome's periodic update check looks
 * for before it will rebuild an installed app's icon.
 *
 * The hash was taken from icon-512 alone, so replacing only icon-192 left the
 * version unchanged and that icon stayed stale on every device that already
 * had the app. Every icon feeds it now.
 */

const config = readSource('vite.config.ts');

describe('a replaced app icon reaches people who already installed the app', () => {
  it('derives the version from the icon files rather than a number to bump', () => {
    expect(config).toContain('const iconVersion');
    expect(config).toContain('createHash');
    expect(config).not.toMatch(/iconVersion\s*=\s*['"`]/);
  });

  it('hashes every icon, not just the largest', () => {
    const list = config.slice(config.indexOf('const ICON_FILES'), config.indexOf('const iconVersion'));
    expect(list).toContain('icon-192.png');
    expect(list).toContain('icon-512.png');
  });

  it('puts the version on every manifest icon', () => {
    const icons = config.slice(config.indexOf('icons: ['), config.indexOf('injectManifest: {'));
    const entries = icons.match(/src: `[^`]+`/g) || [];
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of entries) expect(entry, entry).toContain('?v=${iconVersion}');
  });

  it('keeps the HTML icon links on the same version', () => {
    expect(config).toContain('transformIndexHtml');
    expect(config).toContain('/icons/icon-192.png');
  });

  it('still writes the manifest where existing installs look for it', () => {
    // Already-installed apps recorded /manifest.json as their manifest URL and
    // re-fetch exactly that when checking for updates.
    expect(config).toContain('manifestFilename: "manifest.json"');
    // Pinned so a changing icon is never read as a different app.
    expect(config).toContain('id: "/"');
  });
});
