import { flatTaxOrScale, flatTaxRate, grossFromNetDividend, netFrenchDividend, socialRate } from '../taxRates';

describe('taux de la fiscalité', () => {
  it('flat tax à 31,4 % depuis 2026', () => {
    expect(socialRate(2025)).toBe(17.2);
    expect(socialRate(2026)).toBe(18.6);
    expect(flatTaxRate(2026)).toBeCloseTo(31.4, 6);
    expect(netFrenchDividend(2000, 2026)).toBeCloseTo(1372, 6);
    expect(grossFromNetDividend(1372, 2026)).toBeCloseTo(2000, 6);
  });

  it('barème plus doux à 11 %, flat tax meilleure à 30 %', () => {
    const low = flatTaxOrScale({ gains: 1000, dividends: 1000, tmi: 11, year: 2026 });
    expect(low.pfu).toBeCloseTo(256, 6);
    // 11 % × (1000 + 600) − 11 % × 6,8 % × 2000 = 176 − 14,96
    expect(low.scale).toBeCloseTo(161.04, 2);
    expect(low.better).toBe('scale');
    expect(flatTaxOrScale({ gains: 1000, dividends: 1000, tmi: 30, year: 2026 }).better).toBe('pfu');
    expect(flatTaxOrScale({ gains: 0, dividends: 500, tmi: 0, year: 2026 })).toMatchObject({ scale: 0, better: 'scale' });
    expect(flatTaxOrScale({ gains: 0, dividends: 0, tmi: 11, year: 2026 })).toBeNull();
    expect(flatTaxOrScale({ gains: 100, tmi: null, year: 2026 })).toBeNull();
  });
});
