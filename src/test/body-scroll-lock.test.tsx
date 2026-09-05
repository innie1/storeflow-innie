import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ScrollLock from '@/components/ScrollLock';
import { forceUnlockBodyScroll } from '@/hooks/use-body-scroll-lock';
import { readSource } from './helpers/source';

/**
 * Overlays cover the screen, but the page underneath stayed scrollable: opening
 * the Flow chat and swiping moved the page behind it, so closing the overlay
 * left you somewhere else entirely.
 */

describe('body scroll lock', () => {
  beforeEach(() => {
    forceUnlockBodyScroll();
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  it('locks while an overlay is mounted and releases when it unmounts', () => {
    expect(document.body.style.overflow).toBe('');

    const view = render(<ScrollLock />);
    expect(document.body.style.overflow).toBe('hidden');
    // Which element scrolls depends on the page, so both are held.
    expect(document.documentElement.style.overflow).toBe('hidden');
    // A scroll reaching the end of the overlay must not chain to the page.
    expect(document.body.style.overscrollBehavior).toBe('contain');

    view.unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('stays locked until the last of several stacked overlays closes', () => {
    const outer = render(<ScrollLock />);
    const inner = render(<ScrollLock />);
    expect(document.body.style.overflow).toBe('hidden');

    // A sheet that opened a confirm dialog: closing the dialog must not hand
    // scrolling back while the sheet is still covering the screen.
    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    outer.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('gives the page back on a forced unlock', () => {
    render(<ScrollLock />);
    expect(document.body.style.overflow).toBe('hidden');

    forceUnlockBodyScroll();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('overlays opt into the lock', () => {
  it('covers the full-screen overlays a merchant opens most', () => {
    for (const file of [
      'src/components/FlowChat.tsx',
      'src/components/ReceiptScanner.tsx',
      'src/components/BarcodeScanner.tsx',
      'src/components/SaleReceipt.tsx',
      'src/components/OrderReceipt.tsx',
      'src/components/qr/QRScannerPage.tsx',
    ]) {
      expect(readSource(file), file).toContain('useBodyScrollLock');
    }

    // Inline modals inside big screens declare their open state far below where
    // a hook call could sit, so they mount <ScrollLock /> instead.
    for (const file of ['src/components/Settings.tsx', 'src/pages/Index.tsx']) {
      expect(readSource(file), file).toContain('<ScrollLock />');
    }
  });
});
