import { etfPairs, indexOverlap, underlyingCompanies } from '../overlap';
import { compareBrokers, levelOf, peerComparison, TER_LEVELS } from '../feeInsights';
import { REFERENCE_ETFS } from '../../constants/etfBenchmarks';
import { KNOWN_TERS } from '../../constants/etfFees';

const etf = (symbol, name, value) => ({ assetId: `stock:${symbol}`, symbol, name, assetType: 'stock', value });

describe('ce qu’on détient vraiment', () => {
  test('Apple à travers un ETF S&P 500 ; les deux actions d’Alphabet réunies', () => {
    const list = underlyingCompanies([etf('ESE.PA', 'BNP Paribas Easy S&P 500 UCITS ETF', 10000)], { total: 20000 });
    expect(list[0]).toMatchObject({ ticker: 'AAPL', name: 'Apple' });
    expect(list[0].value).toBeCloseTo(759, 0);
    expect(list[0].pct).toBeCloseTo(3.8, 1);
    const alphabet = list.find((c) => c.ticker === 'GOOGL');
    expect(alphabet.value).toBeCloseTo((2.52 + 2.03) * 100, 0);
  });

  test('LVMH en direct et dans un ETF CAC 40 : additionnés', () => {
    const list = underlyingCompanies([
      etf('CAC.PA', 'Amundi CAC 40 UCITS ETF Dist', 1000),
      { assetId: 'stock:MC.PA', symbol: 'MC.PA', name: 'LVMH', assetType: 'stock', value: 500 },
      { assetId: 'stock:TEP.PA', symbol: 'TEP.PA', name: 'Teleperformance', assetType: 'stock', value: 300 },
    ], { limit: 30 });
    const lvmh = list.find((c) => c.ticker === 'MC.PA');
    expect(lvmh.value).toBeCloseTo(554.1, 1);
    expect(lvmh.sources.map((s) => s.direct)).toEqual([false, true]);
    // Une action qu'aucun ETF ne contient n'est pas un doublon.
    expect(list.some((c) => c.ticker === 'TEP.PA')).toBe(false);
  });

  test('chevauchement : monde et S&P 500 se recoupent beaucoup, S&P 500 et émergents pas', () => {
    expect(indexOverlap('sp500', 'sp500')).toBe(100);
    expect(indexOverlap('world', 'sp500')).toBeGreaterThan(30);
    expect(indexOverlap('sp500', 'em')).toBe(0);
    const pairs = etfPairs([etf('CW8.PA', 'Amundi MSCI World', 1), etf('ESE.PA', 'BNP S&P 500', 1), etf('PAEEM.PA', 'Amundi PEA Emergent', 1)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.symbol).toBe('CW8.PA');
  });
});

describe('repères de frais', () => {
  test('TER connus repris des ETF de référence, toutes cotations', () => {
    expect(KNOWN_TERS['stock:ESE.PA']).toEqual({ min: 0.14, max: 0.14 });
    expect(KNOWN_TERS['stock:SXR8.DE']).toEqual({ min: 0.07, max: 0.07 });
  });

  test('ESE face aux grands ETF S&P 500 : dans la moitié la plus chère', () => {
    const cmp = peerComparison(0.14, REFERENCE_ETFS.sp500);
    expect(cmp).toMatchObject({ min: 0.07, max: 0.15, rank: 'pricier' });
    expect(cmp.cheapestPea.ticker).toBe('PSP5.PA');
    expect(peerComparison(0.6, REFERENCE_ETFS.sp500).rank).toBe('priciest');
    expect(levelOf(0.14, TER_LEVELS)).toBe('low');
  });

  test('mêmes ordres, autres courtiers : plafond PEA et TTF compris', () => {
    const fx = { at: () => 1 };
    const transactions = [
      { account: 'PEA', side: 'buy', symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', assetType: 'stock', quantity: 60, unitPrice: 33.32, fees: 2.9, currency: 'EUR', date: '2026-07-06' },
      { account: 'PEA', side: 'buy', symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', assetType: 'stock', quantity: 5, unitPrice: 33, fees: 0.83, currency: 'EUR', date: '2026-08-01' },
    ];
    const c = compareBrokers({ transactions, fx, account: 'PEA', today: new Date('2026-11-04') });
    expect(c.orders).toBe(2);
    expect(c.paid).toBeCloseTo(3.73, 2);
    const bd = c.options.find((o) => o.tariff.id === 'boursedirect');
    expect(bd.total).toBeCloseTo(2.9 + 0.83, 2);
    const tr = c.options.find((o) => o.tariff.id === 'traderepublic');
    // 1 € par ordre, plafonné à 0,5 % pour le petit : 1 + 0,83.
    expect(tr.total).toBeCloseTo(1.83, 2);
    expect(c.options[0].total).toBeLessThanOrEqual(c.options[c.options.length - 1].total);
  });
});
