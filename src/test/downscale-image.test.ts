import { describe, expect, it } from 'vitest';
import { fitWithin, dataUrlBytes, downscaleImageToDataUrl } from '@/lib/downscale-image';
import { readSource } from './helpers/source';

/**
 * Store photos were stored as the raw picked file, base64-encoded, inside the
 * store record — a record the customer app downloads for every store in the
 * marketplace directory. Settings accepted up to 2 MB and base64 adds about a
 * third, so one logo could occupy 2.7 MB.
 *
 * Two merchants did exactly that. Measured on production, their two photos were
 * 5,034 kB of a 5,305 kB directory response — 95% of it — and that is what
 * exhausted the project's egress quota and suspended the backend.
 *
 * The photo renders at 96px in Settings and 48px on a receipt, so none of those
 * bytes were ever visible.
 */

describe('fitting an image inside a box', () => {
  it('scales a large image down, keeping its shape', () => {
    expect(fitWithin(4000, 3000, 256)).toEqual({ width: 256, height: 192 });
    expect(fitWithin(3000, 4000, 256)).toEqual({ width: 192, height: 256 });
    expect(fitWithin(1000, 1000, 256)).toEqual({ width: 256, height: 256 });
  });

  it('leaves an already-small image alone rather than blowing it up', () => {
    expect(fitWithin(64, 48, 256)).toEqual({ width: 64, height: 48 });
  });

  it('never produces a zero dimension for an extreme aspect ratio', () => {
    const out = fitWithin(5000, 3, 256);
    expect(out.width).toBe(256);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it('handles a degenerate size without throwing', () => {
    expect(fitWithin(0, 0, 256)).toEqual({ width: 0, height: 0 });
  });
});

describe('measuring what will actually be stored', () => {
  it('reports the decoded size of a data URL, not its character count', () => {
    // 4 base64 characters carry 3 bytes.
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('data:image/png;base64,' + 'A'.repeat(4000))).toBe(3000);
  });

  it('does not fall over on a string that is not a data URL', () => {
    expect(dataUrlBytes('nonsense')).toBe(8);
  });
});

describe('downscaling a picked file', () => {
  it('returns the original bytes rather than losing the image when it cannot re-encode', async () => {
    // jsdom never fires onload or onerror for an image, which is the same
    // situation as a browser that will not decode a file: without the timeout
    // this await never settles and the upload hangs with no feedback at all.
    const file = new Blob(['not really an image'], { type: 'image/png' });
    const out = await downscaleImageToDataUrl(file);
    expect(out.startsWith('data:')).toBe(true);
  }, 10000);
});

describe('both upload paths shrink before storing', () => {
  it('Settings no longer writes the raw FileReader result', () => {
    const source = readSource('src/components/Settings.tsx');
    const handler = source.slice(source.indexOf('const handlePhotoPick'), source.indexOf('const removePhoto'));
    expect(handler).toContain('downscaleImageToDataUrl(file)');
    expect(handler).not.toContain('reader.result as string');
  });

  it('the receipt logo picker shrinks too', () => {
    const source = readSource('src/components/SaleReceipt.tsx');
    const handler = source.slice(source.indexOf('const handleFileChange'), source.indexOf('const handleGenerateBrandedQR'));
    expect(handler).toContain('downscaleImageToDataUrl(file)');
    expect(handler).not.toContain('event.target?.result as string');
  });
});
