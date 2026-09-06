import { describe, expect, it } from 'vitest';
import { generateEscPosBytes, generatePlainTextReceipt } from '@/lib/print-engine';
import { readSource } from './helpers/source';
import type { PrintReceiptData } from '@/lib/print-engine';

/**
 * Bluetooth printing could not have worked on any device.
 *
 * The service was written as '000018f0'. Web Bluetooth requires either a
 * numeric 16-bit alias or a full 128-bit UUID string, and rejects that with
 * "Invalid Service name". Because it was passed in `optionalServices`,
 * requestDevice threw before the device picker even appeared — so every
 * Bluetooth print failed instantly and fell through to the system dialog,
 * whatever printer the merchant had paired.
 *
 * System printing had its own problem: the iframe holding the receipt was
 * removed one second after calling print(). On desktop print() blocks until
 * the dialog closes, so that survived; on Android it returns immediately and
 * the preview renders afterwards, so the document was pulled out from under
 * the preview.
 */

const receipt: PrintReceiptData = {
  storeName: 'Flow Test Store',
  receiptNumber: 'sf-0001',
  date: new Date('2026-01-01T10:00:00Z').toISOString(),
  items: [{ productName: 'Rice 50kg', quantity: 2, unitPrice: 87500, total: 175000 }],
  subtotal: 175000,
  discount: 0,
  total: 175000,
  paid: 175000,
  balance: 0,
  paymentMethod: 'cash',
  receiptCurrency: '₦',
};

const engine = () => readSource('src/lib/print-engine.ts');

describe('the Bluetooth service identifiers are ones the browser accepts', () => {
  it('uses full 128-bit UUIDs, not the 8-character form that throws', () => {
    const code = engine().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain("'000018f0'");
    expect(code).not.toContain("'00002af1'");
    expect(code).toContain('000018f0-0000-1000-8000-00805f9b34fb');
  });

  it('every UUID it offers is well formed', () => {
    const uuids = engine().match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) || [];
    expect(uuids.length).toBeGreaterThanOrEqual(6);
    for (const u of uuids) {
      expect(u.replace(/'/g, '')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('tries the profiles cheap thermal printers actually present', () => {
    const code = engine();
    // The ISSC/Microchip transparent UART is what most 58mm printers expose,
    // and was not tried at all before.
    expect(code).toContain('49535343-fe7d-4ae5-8fa9-9fafd205e455');
    expect(code).toContain('0000ff00-0000-1000-8000-00805f9b34fb');
  });

  it('does not hang up before the printer has taken the bytes', () => {
    const code = engine();
    // A resolved write means the bytes left the phone, not that they reached
    // paper. Disconnecting immediately truncated the receipt.
    expect(code).toMatch(/setTimeout\(r, 600\)/);
  });
});

describe('system printing keeps the receipt alive until the dialog closes', () => {
  it('tears down on afterprint rather than a one-second timer', () => {
    const code = engine();
    expect(code).toContain("addEventListener('afterprint'");
    expect(code).not.toMatch(/removeChild\(iframe\);\s*\n\s*resolve\('System Printer \/ PDF'\);\s*\n\s*\}, 1000\)/);
  });

  it('does not hide the iframe in a way that prints blank', () => {
    const code = engine().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain("iframe.style.visibility = 'hidden'");
  });
});

describe('cancelling the printer picker is not a failure', () => {
  it('does not fall through to a system dialog the merchant did not ask for', () => {
    const code = engine();
    expect(code).toContain("err?.name === 'NotFoundError'");
    expect(code).toContain('cancelled: true');
  });

  it('says why it fell back, so the cause can be fixed', () => {
    expect(engine()).toContain('reason: err?.message');
    for (const file of ['src/components/SaleReceipt.tsx', 'src/components/OrderReceipt.tsx']) {
      expect(readSource(file), file).toContain('if (cancelled) return;');
    }
  });
});

describe('the receipt itself is still built correctly', () => {
  it('encodes ESC/POS bytes starting with the initialise command', () => {
    const bytes = generateEscPosBytes(receipt, '58mm');
    expect(bytes.length).toBeGreaterThan(50);
    // ESC @ — initialise printer.
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it('puts the store, the item and the total on the paper', () => {
    const text = generatePlainTextReceipt(receipt, '58mm');
    expect(text).toContain('FLOW TEST STORE');
    expect(text).toContain('Rice 50kg');
    expect(text).toContain('175,000');
    expect(text.toUpperCase()).toContain('CASH');
  });

  it('fits the paper width it was given', () => {
    const narrow = generatePlainTextReceipt(receipt, '58mm').split('\n');
    const wide = generatePlainTextReceipt(receipt, '80mm').split('\n');
    expect(Math.max(...narrow.map(l => l.length))).toBeLessThanOrEqual(32);
    expect(Math.max(...wide.map(l => l.length))).toBeLessThanOrEqual(48);
  });
});
