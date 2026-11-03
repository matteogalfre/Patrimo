import { averageCashRate, averageMonthlySavings, projectPortfolio, projectWealth } from '../projection';

describe('projection du patrimoine', () => {
  test('sans rendement, la valeur est la somme des versements', () => {
    const r = projectWealth({ start: 1000, monthly: 100, years: 2, annualRate: 0 });
    expect(r.final).toBeCloseTo(1000 + 2400);
    expect(r.gains).toBeCloseTo(0);
    expect(r.points).toHaveLength(3);
  });

  test('capital seul : intérêts composés au taux annuel', () => {
    const r = projectWealth({ start: 10000, monthly: 0, years: 10, annualRate: 5 });
    expect(r.final).toBeCloseTo(10000 * 1.05 ** 10, 2);
  });

  test('versements mensuels : plus-values positives et croissantes', () => {
    const low = projectWealth({ start: 0, monthly: 250, years: 30, annualRate: 2 });
    const high = projectWealth({ start: 0, monthly: 250, years: 30, annualRate: 8 });
    expect(low.contributed).toBe(90000);
    expect(high.final).toBeGreaterThan(low.final);
    expect(high.gains).toBeGreaterThan(0);
  });

  test('épargne mensuelle moyenne arrondie, jamais négative', () => {
    expect(averageMonthlySavings(10000, 13050)).toBe(250);
    expect(averageMonthlySavings(10000, 9000)).toBe(0);
  });
});

describe('investir ses liquidités', () => {
  const base = { invested: 50000, cash: 20000, monthly: 200, years: 20, annualRate: 5, cashRate: 1.5 };

  test('sans rien changer : les liquidités restent au taux des livrets', () => {
    const keep = projectPortfolio(base);
    const inv = projectWealth({ start: 50000, monthly: 200, years: 20, annualRate: 5 }).final;
    expect(keep.final).toBeCloseTo(inv + 20000 * 1.015 ** 20, 0);
    expect(keep.moved).toBe(0);
  });

  test('investir la moitié en une fois : même argent versé, plus de valeur', () => {
    const keep = projectPortfolio(base);
    const half = projectPortfolio({ ...base, share: 0.5 });
    expect(half.moved).toBe(10000);
    expect(half.contributed).toBeCloseTo(keep.contributed);
    expect(half.final - keep.final).toBeCloseTo(10000 * (1.05 ** 20 - 1.015 ** 20), 0);
  });

  test('réparti sur 12 mois : un peu moins qu\'en une fois quand le marché monte', () => {
    const once = projectPortfolio({ ...base, share: 1 });
    const spread = projectPortfolio({ ...base, share: 1, spreadMonths: 12 });
    expect(spread.final).toBeLessThan(once.final);
    expect(spread.final).toBeGreaterThan(projectPortfolio(base).final);
  });

  test('taux moyen pondéré des liquidités', () => {
    expect(averageCashRate(20000, 300)).toBeCloseTo(1.5);
    expect(averageCashRate(0, 0)).toBe(0);
  });
});
