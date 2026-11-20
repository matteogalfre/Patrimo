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

describe('dividendes à confirmer', () => {
  const { dueDividends } = require('../income');
  const tx = (assetId, quantity, date) => ({ assetId, account: 'PEA', side: 'buy', quantity, date });
  const d = (id, assetId, amount, date) => ({ id, assetId, symbol: assetId.split(':')[1], name: assetId.split(':')[1], account: 'PEA', amount, currency: 'EUR', date });
  const transactions = [tx('stock:RI.PA', 2, '2024-01-03T12:00:00Z'), tx('stock:MC.PA', 1, '2023-10-30T12:00:00Z')];

  test('le solde Pernod de juillet 2026 manque : proposé, au même montant pour 2 actions', () => {
    const dividends = [d('a', 'stock:RI.PA', 4.7, '2025-07-25T12:00:00Z'), d('b', 'stock:MC.PA', 7.5, '2025-04-28T12:00:00Z'), d('c', 'stock:MC.PA', 7.5, '2026-04-30T12:00:00Z')];
    const due = dueDividends({ dividends, transactions, fx, today: new Date('2026-08-10T12:00:00Z') });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ symbol: 'RI.PA', amount: 4.7, key: 'stock:RI.PA:2026-07' });
  });

  test('déjà saisi, écarté par l’utilisateur ou trop ancien : rien', () => {
    const base = [d('a', 'stock:RI.PA', 4.7, '2025-07-25T12:00:00Z')];
    const today = new Date('2026-08-10T12:00:00Z');
    expect(dueDividends({ dividends: [...base, d('x', 'stock:RI.PA', 4.7, '2026-07-24T12:00:00Z')], transactions, fx, today })).toEqual([]);
    expect(dueDividends({ dividends: base, transactions, fx, today, dismissed: ['stock:RI.PA:2026-07'] })).toEqual([]);
    expect(dueDividends({ dividends: base, transactions, fx, today: new Date('2026-12-20T12:00:00Z') })).toEqual([]);
    // Ton cas : le solde Pernod de juillet, toujours proposé début novembre.
    expect(dueDividends({ dividends: base, transactions, fx, today: new Date('2026-11-04T12:00:00Z') })).toHaveLength(1);
  });
});

describe('expectedDividend', () => {
  const { expectedDividend } = require('../income');
  const events = [{ date: '2025-05-26', amount: 4.2 }, { date: '2026-05-26', amount: 4.5 }];
  const sharesAt = (key) => (key >= '2026-01-01' ? 10 : 6);

  it('PEA : parts détenues la veille du détachement, net = brut', () => {
    const r = expectedDividend({ events, date: '2026-06-02', sharesAt, account: 'PEA', symbol: 'TEP.PA' });
    expect(r).toEqual({ exDate: '2026-05-26', perShare: 4.5, shares: 10, gross: 45, net: 45 });
  });

  it('compte-titres, société française : net après 31,4 % en 2026', () => {
    expect(expectedDividend({ events, date: '2026-06-02', sharesAt, account: 'CTO', symbol: 'TEP.PA' }).net).toBeCloseTo(30.87, 2);
    // Société étrangère : la retenue du pays n'est pas connue.
    expect(expectedDividend({ events, date: '2026-06-02', sharesAt, account: 'CTO', symbol: 'AAPL' }).net).toBeNull();
  });

  it('rien sans détachement récent ni parts', () => {
    expect(expectedDividend({ events, date: '2026-11-05', sharesAt, account: 'PEA', symbol: 'TEP.PA' })).toBeNull();
    expect(expectedDividend({ events, date: '2026-06-02', sharesAt: () => 0, account: 'PEA', symbol: 'TEP.PA' })).toBeNull();
  });
});
