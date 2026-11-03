import { computeIncome } from '../income';
import { createFxConverter } from '../fx';

const fx = createFxConverter({ base: 'EUR', latest: { USD: 0.9 }, history: { USD: { '2026-01-01': 0.8 } } });
const today = new Date('2026-11-03T12:00:00Z');
const div = (id, assetId, amount, date, currency = 'EUR') => ({ id, assetId, symbol: assetId.split(':')[1], amount, currency, date });

const dividends = [
  div('a', 'stock:MC.PA', 7.5, '2026-04-30T09:00:00Z'),
  div('b', 'stock:MC.PA', 5.5, '2025-12-04T09:00:00Z'),
  div('c', 'stock:RI.PA', 4.7, '2025-07-25T09:00:00Z'),
  div('d', 'stock:AAPL', 10, '2026-02-01T09:00:00Z', 'USD'),
];
const positions = [
  { assetId: 'stock:MC.PA', assetType: 'stock', isHeld: true, costBasis: 600, value: 500 },
  { assetId: 'stock:AAPL', assetType: 'stock', isHeld: false, costBasis: 0, value: 0 },
];

describe('revenus passifs', () => {
  const r = computeIncome({ dividends, fx, positions, cashYearlyInterest: 300, today });

  test('12 derniers mois, au taux de change du jour du versement', () => {
    expect(r.months).toHaveLength(12);
    expect(r.months[11].key).toBe('2026-11');
    expect(r.ttm).toBeCloseTo(7.5 + 5.5 + 8);
    expect(r.months.find((m) => m.key === '2026-04').total).toBe(7.5);
  });

  test('projection limitée aux actifs encore détenus, plus les intérêts', () => {
    expect(r.projectedDividends).toBeCloseTo(13);
    expect(r.projected).toBeCloseTo(313);
    expect(r.yieldOnCost).toBeCloseTo((13 / 600) * 100);
    expect(r.currentYield).toBeCloseTo((13 / 500) * 100);
  });

  test('totaux par année et par actif', () => {
    expect(r.years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(r.byAsset[0].symbol).toBe('MC.PA');
    expect(r.byAsset[0].count).toBe(2);
  });
});

describe('dividendes à venir', () => {
  const tx = (assetId, quantity, date, side = 'buy') => ({ assetId, account: 'PEA', side, quantity, date });
  const withAccount = (d) => ({ ...d, account: 'PEA', name: d.symbol });
  const list = [
    withAccount(div('a', 'stock:MC.PA', 7.5, '2026-04-30T09:00:00Z')), // 5 actions à l'époque
    withAccount(div('b', 'stock:MC.PA', 5.5, '2025-12-04T09:00:00Z')),
    withAccount(div('d', 'stock:AAPL', 10, '2026-02-01T09:00:00Z', 'USD')), // vendu depuis
    withAccount(div('e', 'stock:RI.PA', 4.7, '2025-07-25T09:00:00Z')), // il y a plus d'un an
  ];
  const transactions = [
    tx('stock:MC.PA', 5, '2025-01-10T12:00:00Z'),
    tx('stock:MC.PA', 5, '2026-06-01T12:00:00Z'), // doublé après le versement d'avril
    tx('stock:AAPL', 2, '2025-01-10T12:00:00Z'),
    tx('stock:AAPL', 2, '2026-03-01T12:00:00Z', 'sell'),
    tx('stock:RI.PA', 3, '2025-01-10T12:00:00Z'),
  ];

  test('un an après chaque versement, ajusté à la quantité détenue aujourd’hui', () => {
    const { items, months, total } = computeIncome({ dividends: list, transactions, fx, positions, today }).upcoming;
    expect(items.map((i) => [i.symbol, i.date.slice(0, 7)])).toEqual([['MC.PA', '2026-12'], ['MC.PA', '2027-04']]);
    expect(items[0].amount).toBeCloseTo(11, 6); // 5,5 pour 5 actions → 11 pour les 10 d'aujourd'hui
    expect(items[1].amount).toBeCloseTo(15, 6); // 7,5 pour 5 actions → 15 pour 10
    expect(total).toBeCloseTo(26, 6);
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe('2026-11');
    expect(months.find((m) => m.key === '2027-04').total).toBeCloseTo(15, 6);
  });
});
