import { createFxConverter, normalizeQuoteCurrency, rateAt } from '../fx';

describe('rateAt', () => {
  const series = { '2026-01-05': 0.9, '2026-01-06': 0.91, '2026-01-09': 0.95 };

  test('taux du jour quand il existe', () => {
    expect(rateAt(series, '2026-01-06')).toBe(0.91);
  });

  test('week-end ou férié : dernier jour ouvré précédent', () => {
    expect(rateAt(series, '2026-01-08')).toBe(0.91);
    expect(rateAt(series, '2026-01-11')).toBe(0.95);
  });

  test('avant le début de la série : premier taux connu', () => {
    expect(rateAt(series, '2025-12-01')).toBe(0.9);
  });

  test('série vide', () => {
    expect(rateAt({}, '2026-01-01')).toBeNull();
    expect(rateAt(null, '2026-01-01')).toBeNull();
  });
});

describe('createFxConverter', () => {
  test('la devise de référence vaut 1', () => {
    const fx = createFxConverter({ base: 'EUR' });
    expect(fx.now('EUR')).toBe(1);
    expect(fx.at('EUR', '2020-01-01')).toBe(1);
  });

  test('taux historique au jour de l\'opération, taux du jour sinon', () => {
    const fx = createFxConverter({ base: 'EUR', latest: { USD: 0.92 }, history: { USD: { '2024-01-02': 0.91 } } });
    expect(fx.now('USD')).toBe(0.92);
    expect(fx.at('USD', '2024-01-03')).toBe(0.91);
    expect(fx.at('USD', new Date(2024, 0, 3))).toBe(0.91);
    expect(fx.at('GBP', '2024-01-03')).toBeNull();
  });

  test('sans taux du jour, le dernier taux historique sert de repli', () => {
    const fx = createFxConverter({ base: 'EUR', history: { USD: { '2024-01-02': 0.91, '2024-01-05': 0.93 } } });
    expect(fx.now('USD')).toBe(0.93);
  });
});

describe('normalizeQuoteCurrency', () => {
  test('pence londoniens ramenés en livres', () => {
    expect(normalizeQuoteCurrency('GBp')).toEqual({ currency: 'GBP', divisor: 100 });
    expect(normalizeQuoteCurrency('GBX')).toEqual({ currency: 'GBP', divisor: 100 });
  });

  test('devise ordinaire inchangée, USD par défaut', () => {
    expect(normalizeQuoteCurrency('eur')).toEqual({ currency: 'EUR', divisor: 1 });
    expect(normalizeQuoteCurrency(undefined)).toEqual({ currency: 'USD', divisor: 1 });
  });
});
