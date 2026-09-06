import { describe, expect, it } from 'vitest';
import { describeBluetoothFailure } from '@/lib/print-engine';
import { readSource } from './helpers/source';

/**
 * Both pairing buttons showed "Bluetooth pairing failed: <raw browser error>"
 * in red for everything that came out of printBluetooth — including closing
 * the device chooser, which is a decision, not a failure. Backing out of the
 * printer list raised an alarming red message about a failure that had not
 * happened, which is the red notification merchants could not account for.
 */

/** jsdom has no navigator.bluetooth, and its absence explains every failure. */
function withBluetooth<T>(fn: () => T): T {
  const nav = navigator as any;
  const had = 'bluetooth' in nav;
  if (!had) nav.bluetooth = {};
  try { return fn(); } finally { if (!had) delete nav.bluetooth; }
}

describe('a device without Bluetooth is told so', () => {
  it('points at Wi-Fi printing instead', () => {
    expect(describeBluetoothFailure(new Error('anything')).message).toMatch(/Wi-Fi/);
  });
});

describe('backing out of the chooser is not a failure', () => {
  it('says nothing at all when the merchant cancels', () => {
    const err = Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' });
    const { cancelled, message } = withBluetooth(() => describeBluetoothFailure(err));
    expect(cancelled).toBe(true);
    expect(message).toBe('');
  });
});

describe('a real problem is described so it can be fixed', () => {
  it('tells the merchant to switch the printer on when none was found', () => {
    const err = Object.assign(new Error('No devices found.'), { name: 'NotFoundError' });
    const { cancelled, message } = withBluetooth(() => describeBluetoothFailure(err));
    expect(cancelled).toBe(false);
    expect(message).toMatch(/switch it on/i);
  });

  it('points at https when the page is not allowed to use Bluetooth', () => {
    const err = Object.assign(new Error('denied'), { name: 'SecurityError' });
    expect(withBluetooth(() => describeBluetoothFailure(err)).message).toMatch(/https/i);
  });

  it('does not repeat the raw browser wording when it has something better', () => {
    const err = Object.assign(new Error('NotFoundError: something internal'), { name: 'NotFoundError' });
    expect(withBluetooth(() => describeBluetoothFailure(err)).message).not.toContain('something internal');
  });

  it('falls back to the underlying message rather than saying nothing', () => {
    expect(withBluetooth(() => describeBluetoothFailure(new Error('GATT operation failed'))).message).toBe('GATT operation failed');
  });
});

describe('both pairing buttons use it', () => {
  it('neither shows the old red catch-all', () => {
    for (const file of ['src/components/Settings.tsx', 'src/components/SaleReceipt.tsx']) {
      const src = readSource(file);
      expect(src, file).not.toContain("'Bluetooth pairing failed: '");
      expect(src, file).toContain('describeBluetoothFailure');
      expect(src, file).toContain('if (!cancelled)');
    }
  });
});

describe('the printing methods are drawn with real icons', () => {
  it('does not label them with emoji any more', () => {
    for (const file of ['src/components/Settings.tsx', 'src/components/SaleReceipt.tsx']) {
      const src = readSource(file);
      expect(src, file).not.toContain('🔵 Bluetooth');
      expect(src, file).not.toContain('🖨️ System');
    }
  });

  it('uses the Bluetooth and Wi-Fi icons', () => {
    for (const file of ['src/components/Settings.tsx', 'src/components/SaleReceipt.tsx']) {
      const src = readSource(file);
      expect(src, file).toContain('<Bluetooth className=');
      expect(src, file).toContain('<Wifi className=');
    }
  });
});
