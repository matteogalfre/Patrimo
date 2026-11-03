import { annualizedReturn, xirr, yearlyPerformance } from '../performance';
import { createFxConverter } from '../fx';

const fx = createFxConverter({ base: 'EUR', latest: {}, history: {} });
const at = (d) => new Date(`${d}T12:00:00Z`).getTime();

describe('rendement annualisé', () => {
  test('1 000 € devenus 1 100 € en un an : 10 %/an', () => {
    const r = xirr([{ time: at('2025-01-01'), amount: -1000 }, { time: at('2026-01-01'), amount: 1100 }]);
    expect(r).toBeCloseTo(0.1, 3);
  });

  test('le même gain sur deux ans vaut moins par an', () => {
    const r = xirr([{ time: at('2024-01-01'), amount: -1000 }, { time: at('2026-01-01'), amount: 1100 }]);
    expect(r).toBeCloseTo(Math.sqrt(1.1) - 1, 3);
  });

  test('pertes : taux négatif', () => {
    const r = xirr([{ time: at('2025-01-01'), amount: -1000 }, { time: at('2026-01-01'), amount: 800 }]);
    expect(r).toBeCloseTo(-0.2, 3);
  });

  test('pas de sens sans apport ou sur moins d\'un mois', () => {
    expect(xirr([{ time: at('2025-01-01'), amount: 100 }])).toBeNull();
    expect(xirr([{ time: at('2025-01-01'), amount: -100 }, { time: at('2025-01-10'), amount: 110 }])).toBeNull();
  });

  test('à partir des opérations et de la valeur actuelle', () => {
    const transactions = [{ side: 'buy', quantity: 10, unitPrice: 100, fees: 0, currency: 'EUR', date: '2025-01-01T12:00:00Z' }];
    const r = annualizedReturn({ transactions, dividends: [], fx, value: 1100, today: new Date('2026-01-01T12:00:00Z') });
    expect(r).toBeCloseTo(10, 1);
  });
});

describe('performance par année', () => {
  test('gain de l\'année hors apports, dividendes compris', () => {
    const transactions = [
      { side: 'buy', quantity: 10, unitPrice: 100, fees: 0, currency: 'EUR', date: '2024-03-01T12:00:00Z' },
      { side: 'buy', quantity: 5, unitPrice: 120, fees: 0, currency: 'EUR', date: '2025-07-01T12:00:00Z' },
    ];
    const dividends = [{ amount: 20, currency: 'EUR', date: '2025-05-01T12:00:00Z' }];
    // Valeur fin 2024 : 1 100 ; fin 2025 : 2 000.
    const valueAt = (d) => (d.getFullYear() < 2024 ? 0 : d < new Date(2025, 0, 1) ? 1100 : 2000);
    const years = yearlyPerformance({ transactions, dividends, fx, valueAt, today: new Date('2025-12-31T23:59:59') });
    expect(years.map((y) => y.year)).toEqual([2024, 2025]);
    expect(years[0].gain).toBeCloseTo(100);
    // 2025 : 2 000 − 1 100 − 600 + 20 = 320.
    expect(years[1].gain).toBeCloseTo(320);
    expect(years[1].pct).toBeGreaterThan(20);
    expect(years[1].pct).toBeLessThan(30);
  });
});
