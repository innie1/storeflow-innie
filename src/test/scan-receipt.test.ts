import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  bareBase64,
  cleanReceipt,
  imageMediaType,
  RECEIPT_INSTRUCTIONS,
  RECEIPT_SCHEMA,
} from '../../supabase/functions/scan-receipt/receipt';

/*
 * The receipt scanner's function, as far as it can be checked without a key:
 * what it accepts, what it hands back to the app, and how it is wired.
 */

const fn = fs.readFileSync('supabase/functions/scan-receipt/index.ts', 'utf8');
const scanner = fs.readFileSync('src/components/ReceiptScanner.tsx', 'utf8');

describe('the picture', () => {
  it('is named for what it is, not assumed to be a JPEG', () => {
    expect(imageMediaType('/9j/4AAQSkZJRgABAQ')).toBe('image/jpeg');
    expect(imageMediaType('iVBORw0KGgoAAAANSUhEUg')).toBe('image/png');
    expect(imageMediaType('UklGRiIAAABXRUJQVlA4')).toBe('image/webp');
    expect(imageMediaType('R0lGODlhAQABAIAAAAUEBA')).toBe('image/gif');
  });

  it('is refused when it is not a picture', () => {
    expect(imageMediaType('JVBERi0xLjQK')).toBeNull(); // a PDF
    expect(imageMediaType('')).toBeNull();
  });

  it('is accepted with or without its data-URL prefix', () => {
    expect(bareBase64('data:image/webp;base64,UklGRg==')).toBe('UklGRg==');
    expect(bareBase64('  UklG\nRg==  ')).toBe('UklGRg==');
    expect(bareBase64(undefined)).toBe('');
  });
});

describe('what goes back to the app', () => {
  it('keeps the lines a shop can stock from', () => {
    const { items, error } = cleanReceipt({
      items: [{ name: ' Peak Milk 400g ', quantity: 4, costPrice: 12_000, sellingPrice: 12_000, category: 'Groceries' }],
    });
    expect(items).toEqual([{ name: 'Peak Milk 400g', quantity: 4, costPrice: 12_000, sellingPrice: 12_000, category: 'Groceries' }]);
    expect(error).toBeUndefined();
  });

  it('drops a line with no name, no quantity or no price rather than stock it', () => {
    const { items } = cleanReceipt({
      items: [
        { name: '', quantity: 2, costPrice: 500, sellingPrice: 500, category: 'General' },
        { name: 'Indomie', quantity: 0, costPrice: 500, sellingPrice: 500, category: 'General' },
        { name: 'Milo', quantity: 1, costPrice: 'unreadable', sellingPrice: 0, category: 'General' },
        { name: 'Sugar', quantity: 1, costPrice: -50, sellingPrice: 0, category: 'General' },
        { name: 'Rice 50kg', quantity: 1, costPrice: 78_000, sellingPrice: 78_000, category: 'Groceries' },
      ],
    });
    expect(items.map(item => item.name)).toEqual(['Rice 50kg']);
  });

  it('files an unknown category under General and a missing selling price at cost', () => {
    const { items } = cleanReceipt({ items: [{ name: 'Starch', quantity: 2, costPrice: 900, category: 'Laundry things' }] });
    expect(items[0]).toMatchObject({ category: 'General', sellingPrice: 900 });
  });

  it('passes on the reason only when nothing was read', () => {
    expect(cleanReceipt({ items: [], error: 'Too blurred to read' })).toEqual({ items: [], error: 'Too blurred to read' });
    expect(cleanReceipt({ items: [{ name: 'Rice', quantity: 1, costPrice: 1, sellingPrice: 1, category: 'General' }], error: 'partly torn' }).error).toBeUndefined();
    expect(cleanReceipt(null)).toEqual({ items: [] });
    expect(cleanReceipt('not an object')).toEqual({ items: [] });
  });
});

describe('how it is wired', () => {
  it('asks for an answer in the shape the app reads', () => {
    expect(RECEIPT_SCHEMA.required).toEqual(['items']);
    expect(RECEIPT_SCHEMA.properties.items.items.required).toEqual(['name', 'costPrice', 'sellingPrice', 'quantity', 'category']);
    // Structured outputs need every object closed.
    expect(RECEIPT_SCHEMA.additionalProperties).toBe(false);
    expect(RECEIPT_SCHEMA.properties.items.items.additionalProperties).toBe(false);
  });

  it('tells the model to leave out what it cannot read instead of guessing', () => {
    expect(RECEIPT_INSTRUCTIONS).toContain('leave that line out rather than guess it');
    // The old instruction invented a cost: "use 60-70% of selling price if not shown".
    expect(RECEIPT_INSTRUCTIONS).not.toMatch(/60-70%/);
  });

  it('only reads a receipt for a signed-in merchant, and before spending anything', () => {
    expect(fn).toContain('supabase.auth.getUser(token)');
    expect(fn.indexOf('supabase.auth.getUser(token)')).toBeLessThan(fn.indexOf('client.beta.messages.create'));
    expect(fn).toContain('Deno.env.get("ANTHROPIC_API_KEY")');
    // No key is written into the code.
    expect(fn).not.toMatch(/sk-ant-/);
    expect(fn).not.toContain('LOVABLE_API_KEY');
  });

  it('the app shrinks the photo and shows the scanner\'s own reason for a refusal', () => {
    expect(scanner).toContain("downscaleImageToDataUrl(file, { maxEdge: 1600, quality: 0.85 })");
    expect(scanner).toContain('await scanErrorMessage(fnError)');
  });
});
