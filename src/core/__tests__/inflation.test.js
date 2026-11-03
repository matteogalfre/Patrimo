import { createInflation, monthOf, parseEurostatIndex, realRate } from '../inflation';
import { annualizedReturn } from '../performance';
import { createFxConverter } from '../fx';

const EUR = createFxConverter({ base: 'EUR' });

// Réponse JSON-stat réduite : deux unités, trois mois.
const stat = {
  id: ['freq', 'unit', 'geo', 'time'],
  size: [1, 2, 1, 3],
  dimension: {
    freq: { category: { index: { M: 0 } } },
    unit: { category: { index: { I15: 0, I25: 1 } } },
    geo: { category: { index: { FR: 0 } } },
    time: { category: { index: { '2025-11': 0, '2025-12': 1, '2026-01': 2 } } },
  },
  value: { 0: 124.33, 1: 124.43, 2: 124.0, 3: 99.9, 4: 100.0, 5: 99.7 },
};

describe('indice Eurostat', () => {
  test('lecture du JSON-stat, base 2025 préférée', () => {
    expect(parseEurostatIndex(stat)).toEqual({ '2025-11': 99.9, '2025-12': 100.0, '2026-01': 99.7 });
  });

  test('réponse vide ou inattendue : null', () => {
    expect(parseEurostatIndex({})).toBeNull();
    expect(parseEurostatIndex(null)).toBeNull();
  });
});

describe('calculs', () => {
  const series = { '2023-12': 100, '2024-06': 101, '2024-12': 102, '2025-12': 104.04, '2026-09': 105 };
  const inf = createInflation(series);

  test('indice du mois, mois manquant comblé, bornes', () => {
    expect(monthOf(new Date(2024, 5, 20))).toBe('2024-06');
    expect(inf.at(new Date(2024, 5, 20))).toBe(101);
    expect(inf.at(new Date(2024, 8, 1))).toBe(101); // septembre absent : juin
    expect(inf.at(new Date(2020, 0, 1))).toBe(100);
    expect(inf.at(new Date(2026, 10, 3))).toBe(105); // pas encore publié
  });

  test('inflation par année, année en cours depuis janvier', () => {
    expect(inf.ofYear(2024)).toBeCloseTo(2, 6);
    expect(inf.ofYear(2025)).toBeCloseTo(2, 6);
    expect(inf.ofYear(2026, new Date(2026, 10, 3))).toBeCloseTo((105 / 104.04 - 1) * 100, 6);
    expect(inf.ofYear(2023)).toBeNull();
  });

  test('inflation sur les 12 derniers mois publiés', () => {
    const yoy = createInflation({ '2025-09': 100, '2026-03': 101, '2026-09': 103.4 }).lastTwelveMonths();
    expect(yoy.month).toBe('2026-09');
    expect(yoy.pct).toBeCloseTo(3.4, 6);
    expect(createInflation({ '2026-01': 100, '2026-09': 101 }).lastTwelveMonths()).toBeNull();
  });

  test('rendement réel', () => {
    expect(realRate(7.1, 2)).toBeCloseTo(5, 1);
  });

  test('rendement annualisé réel : flux convertis en euros d’aujourd’hui', () => {
    // 1 000 € placés fin 2023, 1 100 € fin 2024 : +10 % nominal, +7,8 % réel.
    const tx = [{ id: 'a', assetType: 'stock', symbol: 'X', assetId: 'stock:X', side: 'buy', quantity: 10, unitPrice: 100, fees: 0, currency: 'EUR', date: '2023-12-15T12:00:00.000Z' }];
    const today = new Date('2024-12-15T12:00:00.000Z');
    const params = { transactions: tx, dividends: [], fx: EUR, value: 1100, today };
    expect(annualizedReturn(params)).toBeCloseTo(10, 1);
    const real = annualizedReturn({ ...params, toToday: (time) => inf.toToday(time, today) });
    expect(real).toBeCloseTo(realRate(10, 2), 1);
  });
});
