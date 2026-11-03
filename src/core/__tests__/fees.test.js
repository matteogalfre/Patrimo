import { brokerageFees, computeFees, effectiveTers, looksLikeFund, scanFees, terInfo } from '../fees';
import { createFxConverter } from '../fx';

const EUR = createFxConverter({ base: 'EUR' });
const today = new Date('2026-11-03T12:00:00.000Z');
const tx = (over) => ({ id: Math.random().toString(36), side: 'buy', quantity: 1, unitPrice: 100, fees: 0, currency: 'EUR', account: 'PEA', date: '2026-06-01T12:00:00.000Z', ...over });

describe('frais', () => {
  test('fonds repérés par le type ou le nom', () => {
    expect(looksLikeFund({ name: 'BNP Paribas Easy S&P 500 UCITS ETF EUR C' })).toBe(true);
    expect(looksLikeFund({ name: 'Amundi MSCI World' })).toBe(true);
    expect(looksLikeFund({ name: 'LVMH', quoteType: 'EQUITY' })).toBe(false);
    expect(looksLikeFund({ name: 'X', quoteType: 'ETF' })).toBe(true);
  });

  test('courtage : 12 derniers mois, par enveloppe, ordres trop chers', () => {
    const list = [
      tx({ quantity: 10, unitPrice: 100, fees: 2, account: 'PEA' }), // 0,2 %
      tx({ quantity: 1, unitPrice: 50, fees: 1.99, account: 'CTO' }), // 3,98 %
      tx({ quantity: 5, unitPrice: 100, fees: 5, date: '2024-03-01T12:00:00.000Z' }), // il y a plus d'un an
    ];
    const b = brokerageFees({ transactions: list, fx: EUR, today });
    expect(b.last12.fees).toBeCloseTo(3.99, 6);
    expect(b.last12.amount).toBe(1050);
    expect(b.byAccount.map((a) => a.account)).toEqual(['PEA', 'CTO']);
    expect(b.byYear.map((y) => [y.year, y.fees])).toEqual([[2024, 5], [2026, 3.99]]);
    expect(b.expensiveOrders).toHaveLength(1);
    expect(b.expensiveOrders[0].pct).toBeCloseTo(3.98, 2);
  });

  test('bilan : TER et courtage, ETF sans TER signalés', () => {
    const assets = [
      { assetId: 'stock:ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', value: 10000 },
      { assetId: 'stock:CW8.PA', name: 'Amundi MSCI World', value: 5000 },
      { assetId: 'stock:MC.PA', name: 'LVMH', value: 4000 },
    ];
    const scan = scanFees({ assets, fees: { 'stock:ESE.PA': 0.15 }, transactions: [tx({ quantity: 10, unitPrice: 100, fees: 2 })], fx: EUR, totalValue: 20000, today });
    expect(scan.ter.yearly).toBeCloseTo(15, 6);
    expect(scan.yearly).toBeCloseTo(17, 6);
    expect(scan.pctOfWealth).toBeCloseTo(0.085, 6);
    expect(scan.missingTer.map((a) => a.assetId)).toEqual(['stock:CW8.PA']);
    const r = 0.05;
    expect(scan.overYears).toBeCloseTo(computeFees(assets, { 'stock:ESE.PA': 0.15 }).overYears + 2 * (((1 + r) ** 20 - 1) / r), 6);
  });
});

describe('TER connus', () => {
  test('ESE : fourchette 0,12–0,14 %, calcul au milieu, le TER saisi passe devant', () => {
    expect(terInfo('stock:ESE.PA')).toEqual({ value: 0.13, min: 0.12, max: 0.14, source: 'known' });
    expect(terInfo('stock:ESE.PA', { 'stock:ESE.PA': 0.15 })).toMatchObject({ value: 0.15, source: 'manual' });
    expect(terInfo('stock:MC.PA')).toBeNull();
    expect(effectiveTers({ 'stock:CW8.PA': 0.38 })).toEqual({ 'stock:ESE.PA': 0.13, 'stock:CW8.PA': 0.38 });
  });
});
