import { contributionFlows, livretAIndex, shadowPortfolio } from '../benchmark';
import { portfolioAssumptions, simulateIndependence, targetCapital } from '../independence';

const fx = { at: (cur) => (cur === 'USD' ? 0.9 : 1) };

describe('comparer avec un indice', () => {
  test('versements : achat frais compris, vente nette de frais, en euros', () => {
    const flows = contributionFlows({
      fx,
      transactions: [
        { side: 'buy', quantity: 2, unitPrice: 100, fees: 1, currency: 'EUR', date: '2024-01-10' },
        { side: 'sell', quantity: 1, unitPrice: 200, fees: 2, currency: 'USD', date: '2024-06-10' },
      ],
    });
    expect(flows.map((f) => Math.round(f.amount * 100) / 100)).toEqual([201, -178.2]);
  });

  test('un indice qui double double l’argent versé', () => {
    const t0 = new Date('2024-01-01T12:00:00').getTime();
    const prices = { '2024-01-01': 10, '2024-07-01': 15, '2025-01-01': 20 };
    const priceAt = (k) => prices[k] || null;
    const flows = [{ time: t0, amount: 1000 }];
    const r = shadowPortfolio({ flows, dates: [new Date('2024-07-01T12:00:00')], priceAt, today: new Date('2025-01-01T12:00:00') });
    expect(r.series[0]).toBe(1500);
    expect(r.value).toBe(2000);
    expect(r.xirr).toBeCloseTo(100, 0);
  });

  test('pas de cours le jour d’un versement : pas de comparaison inventée', () => {
    const r = shadowPortfolio({ flows: [{ time: new Date('2015-01-01').getTime(), amount: 100 }], dates: [], priceAt: () => null });
    expect(r).toBeNull();
  });

  test('Livret A : 3 % en 2023-2024', () => {
    const idx = livretAIndex('2023-02-01T12:00:00', '2024-02-01T12:00:00');
    expect(idx['2024-02-01']).toBeCloseTo(1.0305, 3);
  });
});

describe('indépendance financière', () => {
  test('capital visé : règle des 4 %', () => {
    expect(targetCapital(2000, 4)).toBe(600000);
    expect(targetCapital(2000, 3.5)).toBeCloseTo(685714.29, 1);
  });

  test('hypothèses selon la répartition', () => {
    expect(portfolioAssumptions({ stock: 100 })).toEqual({ mu: 5, sigma: 16 });
    const mix = portfolioAssumptions({ stock: 50, cash: 50 });
    expect(mix.mu).toBe(2.5);
    expect(mix.sigma).toBeCloseTo(8, 0);
  });

  test('sans volatilité, la simulation suit le calcul exact', () => {
    const sim = simulateIndependence({ start: 100000, monthly: 0, target: 200000, mu: 7.2, sigma: 0.0001, years: 15, paths: 50 });
    // 1,072^10 ≈ 2 : le double en 10 ans.
    expect(sim.medianYears).toBe(10);
    expect(sim.reachedBy[9]).toBe(0);
    expect(sim.reachedBy[10]).toBe(1);
  });

  test('plus d’épargne : plus tôt ; résultat stable d’un calcul à l’autre', () => {
    const base = { start: 50000, target: 600000, mu: 5, sigma: 16 };
    const a = simulateIndependence({ ...base, monthly: 1000 });
    const b = simulateIndependence({ ...base, monthly: 1500 });
    expect(b.medianYears).toBeLessThan(a.medianYears);
    expect(simulateIndependence({ ...base, monthly: 1000 }).medianYears).toBe(a.medianYears);
    expect(a.p10[20]).toBeLessThan(a.p50[20]);
    expect(a.p50[20]).toBeLessThan(a.p90[20]);
  });
});
