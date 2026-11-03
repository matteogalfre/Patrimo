import { computePortfolio, computePeaStats, computeValueSeries } from '../engine';
import { createFxConverter } from '../fx';
import { makeAssetId } from '../assets';

const EUR = createFxConverter({ base: 'EUR' });

let n = 0;
const tx = (over) => {
  n += 1;
  const assetType = over.assetType || 'stock';
  const symbol = over.symbol || 'CW8.PA';
  return {
    id: `t${n}`,
    assetType,
    symbol,
    assetId: makeAssetId(assetType, symbol),
    account: over.account || (assetType === 'crypto' ? 'CRYPTO' : 'CTO'),
    side: 'buy',
    quantity: 1,
    unitPrice: 100,
    fees: 0,
    currency: 'EUR',
    date: '2026-01-10',
    ...over,
  };
};

const quote = (price, currency = 'EUR', changePct = 0) => ({ price, currency, changePct });

describe('prix de revient et plus-values', () => {
  test('achat simple en euros', () => {
    const t = tx({ quantity: 10, unitPrice: 100 });
    const { totals, positions } = computePortfolio({
      transactions: [t], quotes: { [t.assetId]: quote(120) }, fx: EUR,
    });
    expect(positions[0].value).toBe(1200);
    expect(positions[0].costBasis).toBe(1000);
    expect(totals.unrealized).toBe(200);
    expect(totals.totalPnL).toBe(200);
    expect(totals.roi).toBeCloseTo(20);
  });

  test('les frais d\'achat entrent dans le prix de revient, ceux de vente réduisent le produit', () => {
    const buy = tx({ quantity: 10, unitPrice: 10, fees: 5 });
    const sell = tx({ side: 'sell', quantity: 10, unitPrice: 12, fees: 2, date: '2026-02-10' });
    const { positions, totals } = computePortfolio({
      transactions: [buy, sell], quotes: { [buy.assetId]: quote(12) }, fx: EUR,
    });
    expect(positions[0].grossInvested).toBe(105);
    expect(positions[0].proceeds).toBe(118);
    expect(totals.realized).toBeCloseTo(13);
    expect(totals.feesPaid).toBeCloseTo(7);
  });

  test('vente partielle au coût moyen pondéré', () => {
    const a = tx({ quantity: 10, unitPrice: 10 });
    const b = tx({ quantity: 10, unitPrice: 20, date: '2026-01-20' });
    const s = tx({ side: 'sell', quantity: 5, unitPrice: 30, date: '2026-02-01' });
    const { positions } = computePortfolio({
      transactions: [a, b, s], quotes: { [a.assetId]: quote(30) }, fx: EUR,
    });
    const p = positions[0];
    expect(p.avgCost).toBeCloseTo(15);
    expect(p.realized).toBeCloseTo(75);
    expect(p.costBasis).toBeCloseTo(225);
    expect(p.quantity).toBe(15);
  });

  test('une position soldée garde son gain réalisé dans le total', () => {
    const aapl = { assetType: 'stock', symbol: 'AAPL' };
    const buy = tx({ ...aapl, quantity: 10, unitPrice: 100 });
    const sell = tx({ ...aapl, side: 'sell', quantity: 10, unitPrice: 150, date: '2026-03-10' });
    const msft = tx({ symbol: 'MSFT', quantity: 5, unitPrice: 200, date: '2026-02-10' });
    const { totals, assets } = computePortfolio({
      transactions: [buy, sell, msft],
      quotes: { [buy.assetId]: quote(160), [msft.assetId]: quote(200) },
      fx: EUR,
    });
    expect(totals.realized).toBe(500);
    expect(totals.totalPnL).toBe(500);
    expect(totals.value).toBe(1000);
    expect(assets.find((a) => a.symbol === 'AAPL').isHeld).toBe(false);
  });

  test('un aller-retour ne compte pas deux fois le capital investi', () => {
    const a = tx({ quantity: 10, unitPrice: 100 });
    const s = tx({ side: 'sell', quantity: 10, unitPrice: 100, date: '2026-02-10' });
    const b = tx({ quantity: 10, unitPrice: 100, date: '2026-03-10' });
    const { totals } = computePortfolio({
      transactions: [a, s, b], quotes: { [a.assetId]: quote(100) }, fx: EUR,
    });
    expect(totals.grossInvested).toBe(2000);
    expect(totals.netInvested).toBe(1000);
    expect(totals.costBasis).toBe(1000);
    expect(totals.value).toBe(1000);
  });
});

describe('effet de change', () => {
  test('action US inchangée en dollars : le gain vient du change', () => {
    const fx = createFxConverter({
      base: 'EUR',
      latest: { USD: 1.0 },
      history: { USD: { '2026-01-09': 0.9, '2026-01-12': 0.95 } },
    });
    const t = tx({ symbol: 'AAPL', quantity: 10, unitPrice: 100, currency: 'USD', date: '2026-01-10' });
    const { positions, totals } = computePortfolio({
      transactions: [t], quotes: { [t.assetId]: quote(100, 'USD') }, fx,
    });
    // Le 10/01 (samedi) prend le taux du vendredi 09/01.
    expect(positions[0].costBasis).toBeCloseTo(900);
    expect(positions[0].value).toBeCloseTo(1000);
    expect(totals.fxEffect).toBeCloseTo(100);
    expect(totals.priceEffect).toBeCloseTo(0);
  });

  test('un prix saisi en euros pour une action US n\'a pas d\'effet de change propre', () => {
    const fx = createFxConverter({ base: 'EUR', latest: { USD: 1.0 }, history: { USD: { '2026-01-09': 0.9 } } });
    const t = tx({ symbol: 'AAPL', quantity: 10, unitPrice: 90, currency: 'EUR' });
    const { totals } = computePortfolio({ transactions: [t], quotes: { [t.assetId]: quote(100, 'USD') }, fx });
    expect(totals.costBasis).toBeCloseTo(900);
    expect(totals.value).toBeCloseTo(1000);
    expect(totals.fxEffect).toBeCloseTo(0);
    expect(totals.priceEffect).toBeCloseTo(100);
  });
});

describe('enveloppes et regroupements', () => {
  test('le même ETF en PEA et en CTO forme deux positions et un seul actif', () => {
    const pea = tx({ account: 'PEA', quantity: 10, unitPrice: 100 });
    const cto = tx({ account: 'CTO', quantity: 5, unitPrice: 120 });
    const btc = tx({ assetType: 'crypto', symbol: 'BTC', quantity: 0.1, unitPrice: 50000, currency: 'EUR' });
    const { positions, assets, totals } = computePortfolio({
      transactions: [pea, cto, btc],
      quotes: { [pea.assetId]: quote(110), [btc.assetId]: quote(60000) },
      fx: EUR,
    });
    expect(positions).toHaveLength(3);
    const etf = assets.find((a) => a.symbol === 'CW8.PA');
    expect(etf.quantity).toBe(15);
    expect(etf.accounts.sort()).toEqual(['CTO', 'PEA']);
    expect(totals.byAccount.PEA.value).toBe(1100);
    expect(totals.byAccount.CTO.value).toBe(550);
    expect(totals.byAccount.CRYPTO.value).toBe(6000);
    expect(totals.byClass.crypto.value).toBe(6000);
    expect(totals.byClass.stock.value).toBe(1650);
    expect(assets[0].symbol).toBe('BTC');
    expect(assets[0].allocation).toBeCloseTo((6000 / 7650) * 100);
  });
});

describe('dividendes', () => {
  test('ils s\'ajoutent au gain total, même sans position correspondante', () => {
    const t = tx({ account: 'PEA', quantity: 10, unitPrice: 100 });
    const { totals, positions } = computePortfolio({
      transactions: [t],
      dividends: [
        { id: 'd1', assetId: t.assetId, account: 'PEA', amount: 30, currency: 'EUR', date: '2026-03-01' },
        { id: 'd2', assetId: 'stock:OLD', account: 'CTO', amount: 10, currency: 'EUR', date: '2026-03-01' },
      ],
      quotes: { [t.assetId]: quote(100) },
      fx: EUR,
    });
    expect(positions[0].dividends).toBe(30);
    expect(totals.dividends).toBe(40);
    expect(totals.totalPnL).toBe(40);
    expect(totals.byAccount.CTO.dividends).toBe(10);
  });
});

describe('données incomplètes', () => {
  test('un prix d\'achat inconnu est signalé et ne crée ni gain ni perte', () => {
    const t = tx({ unitPrice: null, quantity: 2 });
    const { totals, warnings } = computePortfolio({ transactions: [t], quotes: { [t.assetId]: quote(50) }, fx: EUR });
    expect(warnings.pendingPrices).toEqual([t.id]);
    expect(totals.value).toBe(100);
    expect(totals.unrealized).toBe(0);
  });

  test('sans cours, la position est valorisée à son prix de revient', () => {
    const t = tx({ quantity: 2, unitPrice: 40 });
    const { totals, warnings } = computePortfolio({ transactions: [t], quotes: {}, fx: EUR });
    expect(warnings.missingQuotes).toEqual([t.assetId]);
    expect(totals.value).toBe(80);
    expect(totals.unrealized).toBe(0);
  });

  test('vendre plus que détenu est signalé, sans produit fantôme', () => {
    const b = tx({ quantity: 1, unitPrice: 100 });
    const s = tx({ side: 'sell', quantity: 3, unitPrice: 100, date: '2026-02-01' });
    const { totals, warnings } = computePortfolio({ transactions: [b, s], quotes: { [b.assetId]: quote(100) }, fx: EUR });
    expect(warnings.oversold).toEqual([s.id]);
    expect(totals.proceeds).toBe(100);
    expect(totals.realized).toBe(0);
  });

  test('variation du jour', () => {
    const t = tx({ quantity: 10, unitPrice: 100 });
    const { totals } = computePortfolio({ transactions: [t], quotes: { [t.assetId]: quote(110, 'EUR', 10) }, fx: EUR });
    expect(totals.dailyChange).toBeCloseTo(100);
    expect(totals.dailyChangePct).toBeCloseTo(10);
  });
});

describe('suivi du PEA', () => {
  test('versements estimés au pic du capital net engagé', () => {
    const a = tx({ account: 'PEA', quantity: 10, unitPrice: 1000, date: '2020-03-01' });
    const s = tx({ account: 'PEA', side: 'sell', quantity: 5, unitPrice: 1200, date: '2021-01-01' });
    const b = tx({ account: 'PEA', quantity: 2, unitPrice: 1000, date: '2022-01-01' });
    const pea = computePeaStats({ transactions: [a, s, b], fx: EUR, today: new Date('2026-01-01') });
    expect(pea.deposits).toBe(10000);
    expect(pea.depositsEstimated).toBe(true);
    expect(pea.remaining).toBe(140000);
    expect(pea.isMature).toBe(true);
    expect(pea.maturityDate.slice(0, 4)).toBe('2025');
  });

  test('les versements saisis à la main priment', () => {
    const a = tx({ account: 'PEA', quantity: 1, unitPrice: 100 });
    const pea = computePeaStats({
      transactions: [a], fx: EUR, settings: { depositsOverride: 42000, openDate: '2024-06-01' }, today: new Date('2026-01-01'),
    });
    expect(pea.deposits).toBe(42000);
    expect(pea.depositsEstimated).toBe(false);
    expect(pea.isMature).toBe(false);
  });

  test('aucun PEA : pas de carte', () => {
    expect(computePeaStats({ transactions: [tx({ account: 'CTO' })], fx: EUR })).toBeNull();
  });
});

describe('série de valeurs', () => {
  test('quantité détenue à chaque date × cours du jour', () => {
    const a = tx({ quantity: 10, unitPrice: 100, date: '2026-01-10' });
    const s = tx({ side: 'sell', quantity: 4, unitPrice: 100, date: '2026-03-01' });
    const prices = { '2026-01-31': 110, '2026-02-28': 120, '2026-03-31': 130 };
    const values = computeValueSeries({
      transactions: [a, s],
      dates: [new Date('2026-01-01'), new Date('2026-01-31'), new Date('2026-02-28'), new Date('2026-03-31')],
      priceAt: (id, key) => prices[key] || null,
      currencyOf: () => 'EUR',
      fx: EUR,
    });
    expect(values).toEqual([0, 1100, 1200, 780]);
  });

  test('sans cours connu : prix de la dernière opération, pas zéro', () => {
    const a = tx({ symbol: 'ALVMG.PA', quantity: 10, unitPrice: 5, date: '2026-01-10' });
    const b = tx({ symbol: 'ALVMG.PA', quantity: 10, unitPrice: 3, date: '2026-02-10' });
    const values = computeValueSeries({
      transactions: [a, b],
      dates: [new Date('2026-01-31'), new Date('2026-02-28')],
      priceAt: () => null,
      currencyOf: () => undefined,
      fx: EUR,
    });
    expect(values).toEqual([50, 60]);
  });
});

describe('argent investi dans le temps', () => {
  test('achats moins ventes, frais compris, au taux du jour', () => {
    const { computeInvestedSeries } = require('../engine');
    const { createFxConverter } = require('../fx');
    const fx = createFxConverter({ base: 'EUR', latest: { USD: 0.9 }, history: { USD: { '2026-01-01': 0.8 } } });
    const transactions = [
      { id: 'a', side: 'buy', quantity: 2, unitPrice: 100, fees: 1, currency: 'EUR', date: '2026-01-02T12:00:00Z' },
      { id: 'b', side: 'buy', quantity: 1, unitPrice: 100, fees: 0, currency: 'USD', date: '2026-01-03T12:00:00Z' },
      { id: 'c', side: 'sell', quantity: 1, unitPrice: 150, fees: 2, currency: 'EUR', date: '2026-01-05T12:00:00Z' },
    ];
    const dates = ['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-06'].map((d) => new Date(`${d}T12:00:00Z`));
    const series = computeInvestedSeries({ transactions, dates, fx });
    expect(series[0]).toBe(0);
    expect(series[1]).toBe(201);
    expect(series[2]).toBeCloseTo(281);
    expect(series[3]).toBeCloseTo(133);
  });
});
