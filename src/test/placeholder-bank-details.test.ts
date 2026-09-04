import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The bank details this app shipped as defaults ('Access Bank' / '1234567890')
 * are not any merchant's. Stored settings win over defaults, so blanking the
 * defaults alone does nothing for a store that already saved them — which is
 * every store whose owner has opened Marketplace Settings once.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, '../components/MarketplaceSettings.tsx'),
  'utf8',
);

describe('placeholder bank details', () => {
  it('are no longer the defaults', () => {
    expect(source).toMatch(/bankName: '',/);
    expect(source).toMatch(/bankAccountNumber: '',/);
  });

  it('are stripped from already-stored settings, not just from the defaults', () => {
    expect(source).toContain('clearPlaceholderBankDetails({');
    expect(source).toMatch(/PLACEHOLDER_ACCOUNT_NUMBER = '1234567890'/);
  });

  it('only clears the bank name alongside the dummy account number', () => {
    // A merchant may genuinely bank with Access Bank, so the name alone is not
    // evidence of an unedited placeholder.
    const fn = source.slice(source.indexOf('function clearPlaceholderBankDetails'));
    expect(fn).toMatch(/if \(String\(settings\.bankAccountNumber \|\| ''\)\.trim\(\) !== PLACEHOLDER_ACCOUNT_NUMBER\) return settings;/);
  });
});
