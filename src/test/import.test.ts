import { describe, it, expect } from 'vitest';
import { interpretProductName } from '../lib/import-intel';

describe('Smart Import - Nigerian Product Dictionary & Fractions', () => {
  it('should interpret common Nigerian aliases', () => {
    const res1 = interpretProductName('Big Coke');
    expect(res1.officialName).toBe('Coca-Cola PET 50cl');
    expect(res1.qtyMultiplier).toBe(1.0);

    const res2 = interpretProductName('small coke');
    expect(res2.officialName).toBe('Coca-Cola PET 35cl');

    const res3 = interpretProductName('Hollandia Ctn');
    expect(res3.officialName).toBe('Hollandia Carton');
  });

  it('should detect carton and sachet terms', () => {
    const res = interpretProductName('Peak milk sachet');
    expect(res.officialName).toBe('Peak Milk Sachet');
  });

  it('should parse fractions and clean the name', () => {
    const res1 = interpretProductName('½ Carton of Big Coke');
    expect(res1.officialName).toBe('Coca-Cola PET 50cl');
    expect(res1.qtyMultiplier).toBe(0.5);
    expect(res1.parsedFraction).toBe('half_carton');

    const res2 = interpretProductName('½ pack indomie');
    expect(res2.officialName).toBe('Indomie Noodles Pack');
    expect(res2.qtyMultiplier).toBe(0.5);
    expect(res2.parsedFraction).toBe('half_pack');
  });
});
