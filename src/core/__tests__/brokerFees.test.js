import { bourseDirectFee, estimateFees, isTtfStock, ttfRate } from '../brokerFees';

describe('frais de courtage estimés', () => {
  test('grille Bourse Direct : tes avis d’opéré', () => {
    expect(bourseDirectFee(1601.37)).toBe(2.9);
    expect(bourseDirectFee(1999.27)).toBe(2.9);
    expect(bourseDirectFee(2016.86)).toBe(3.8);
    expect(bourseDirectFee(87.6)).toBe(0.99);
    expect(bourseDirectFee(9923.1)).toBe(8.93);
  });

  test('TTF sur les grandes actions françaises, à l’achat seulement', () => {
    expect(isTtfStock('MC.PA')).toBe(true);
    expect(isTtfStock('ESE.PA')).toBe(false);
    expect(isTtfStock('ALVMG.PA')).toBe(false);
    expect(ttfRate('2023-10-30')).toBe(0.3);
    expect(ttfRate('2026-11-03')).toBe(0.4);
    const base = { rule: { type: 'bourseDirect' }, assetType: 'stock', currency: 'EUR' };
    // LVMH le 30/10/2023 : 1,90 € de courtage + 0,3 % de 668,80 € = 3,91 €, comme ton relevé.
    expect(estimateFees({ ...base, amount: 668.8, side: 'buy', symbol: 'MC.PA', date: new Date('2023-10-30') })).toEqual({ total: 3.91, brokerage: 1.9, ttf: 2.01 });
    expect(estimateFees({ ...base, amount: 668.8, side: 'sell', symbol: 'MC.PA', date: new Date('2026-10-30') }).ttf).toBe(0);
    expect(estimateFees({ ...base, amount: 2016.86, side: 'buy', symbol: 'ESE.PA' })).toEqual({ total: 3.8, brokerage: 3.8, ttf: 0 });
  });

  test('pourcentage avec minimum, montant fixe, aucune règle', () => {
    const q = { side: 'buy', symbol: 'BTC', assetType: 'crypto', currency: 'USD' };
    expect(estimateFees({ ...q, rule: { type: 'percent', pct: 0.1, min: 0 }, amount: 1000 }).total).toBe(1);
    expect(estimateFees({ ...q, rule: { type: 'percent', pct: 0.1, min: 2 }, amount: 1000 }).total).toBe(2);
    expect(estimateFees({ ...q, rule: { type: 'fixed', amount: 1 }, amount: 5000 }).total).toBe(1);
    expect(estimateFees({ ...q, rule: { type: 'none' }, amount: 1000 })).toBeNull();
    expect(estimateFees({ ...q, rule: { type: 'bourseDirect' }, amount: 1000 })).toBeNull();
  });
});

describe('grilles du catalogue', () => {
  const { BROKER_TARIFFS } = require('../../constants/brokerTariffs');
  const { normalizeRule, ruleForInstitution, scheduleFee, tariffsFor } = require('../brokerFees');
  const { institutionById } = require('../institutions');

  test('barème : paliers, fixe plus pourcentage, bornes', () => {
    const tiers = { tiers: [{ upTo: 500, fee: 1 }, { upTo: 1000, fee: 2 }], pct: 0.2, min: 2.5 };
    expect(scheduleFee(tiers, 500)).toBe(1);
    expect(scheduleFee(tiers, 800)).toBe(2);
    expect(scheduleFee(tiers, 1001)).toBe(2.5);
    expect(scheduleFee(tiers, 5000)).toBe(10);
    expect(scheduleFee({ fee: 2, pct: 0.05 }, 1000)).toBe(2.5);
    expect(scheduleFee({ pct: 0.5, min: 3, max: 10 }, 100)).toBe(3);
    expect(scheduleFee({ pct: 0.5, min: 3, max: 10 }, 10000)).toBe(10);
    expect(scheduleFee({ fee: 1 }, 0)).toBe(0);
  });

  test('l’ancienne règle Bourse Direct vaut la grille du catalogue', () => {
    expect(normalizeRule({ type: 'bourseDirect' })).toEqual({ type: 'tariff', id: 'boursedirect' });
    const legacy = estimateFees({ rule: { type: 'bourseDirect' }, amount: 1601.37, side: 'buy', assetType: 'etf', currency: 'EUR' });
    const tariff = estimateFees({ rule: { type: 'tariff', id: 'boursedirect' }, amount: 1601.37, side: 'buy', assetType: 'etf', currency: 'EUR' });
    expect(legacy).toEqual(tariff);
    expect(tariff.total).toBe(2.9);
  });

  test('plans d’investissement et grille inconnue', () => {
    const q = { amount: 200, side: 'buy', assetType: 'etf', currency: 'EUR' };
    expect(estimateFees({ ...q, rule: { type: 'tariff', id: 'traderepublic' } }).total).toBe(1);
    expect(estimateFees({ ...q, rule: { type: 'tariff', id: 'traderepublic' }, plan: true }).total).toBe(0);
    expect(estimateFees({ ...q, rule: { type: 'tariff', id: 'inconnu' } })).toBeNull();
    expect(estimateFees({ ...q, rule: { type: 'percent', pct: 1, min: 0, max: 1.5 } }).total).toBe(1.5);
  });

  test('règle posée avec l’établissement, selon l’enveloppe', () => {
    expect(ruleForInstitution('traderepublic', 'PEA')).toEqual({ type: 'tariff', id: 'traderepublic' });
    expect(ruleForInstitution('binance', 'PEA')).toBeNull();
    expect(ruleForInstitution('sg', 'CTO')).toBeNull();
    expect(tariffsFor('CRYPTO', 'binance')[0].id).toBe('binance');
  });

  test('catalogue cohérent', () => {
    const ids = new Set();
    BROKER_TARIFFS.forEach((x) => {
      expect(ids.has(x.id)).toBe(false);
      ids.add(x.id);
      expect(institutionById(x.institution)).toBeTruthy();
      expect(x.accounts.length).toBeGreaterThan(0);
      x.accounts.forEach((a) => expect(['PEA', 'CTO', 'CRYPTO']).toContain(a));
      expect(x.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(x.source).toMatch(/^https:\/\//);
      const schedules = [...Object.values(x.markets), ...(x.plan ? [x.plan] : [])];
      expect(schedules.length).toBeGreaterThan(0);
      const maps = [x.markets, x.funds, ...Object.values(x.symbols || {})].filter(Boolean);
      maps.forEach((m) => Object.keys(m).forEach((code) => expect(['EUR', 'USD', '*']).toContain(code)));
      schedules.forEach((s) => {
        // Des paliers croissants, et des frais plausibles (une grille peut baisser
        // au-delà d'un palier : 4,90 € jusqu'à 3 000 €, puis 0,15 % chez Fortuneo).
        (s.tiers || []).forEach((t, i) => i > 0 && expect(t.upTo).toBeGreaterThan(s.tiers[i - 1].upTo));
        [10, 100, 500, 1000, 2000, 5000, 20000, 100000].forEach((amount) => {
          const fee = scheduleFee(s, amount);
          expect(fee).toBeGreaterThanOrEqual(0);
          expect(fee).toBeLessThanOrEqual(Math.max(20, amount * 0.02));
        });
      });
    });
  });
});

describe('plafond du PEA et barèmes particuliers', () => {
  const { scheduleFee, tariffById, tariffSchedule } = require('../brokerFees');
  const bd = { rule: { type: 'tariff', id: 'boursedirect' }, side: 'buy', assetType: 'stock', currency: 'EUR' };

  test('tes avis d’opéré Bourse Direct sur PEA : courtage plafonné à 0,5 %', () => {
    // Teleperformance, 13/06/2023 : 0,77 € de courtage + 0,46 € de TTF = 1,23 €.
    expect(estimateFees({ ...bd, account: 'PEA', amount: 153.2, symbol: 'TEP.PA', date: new Date('2023-06-13') }))
      .toEqual({ total: 1.23, brokerage: 0.77, ttf: 0.46 });
    // Pernod Ricard, 11/12/2023 et 03/01/2024 : 1,25 € les deux fois.
    expect(estimateFees({ ...bd, account: 'PEA', amount: 156.5, symbol: 'RI.PA', date: new Date('2023-12-11') }).total).toBe(1.25);
    expect(estimateFees({ ...bd, account: 'PEA', amount: 155.45, symbol: 'RI.PA', date: new Date('2024-01-03') }).total).toBe(1.25);
    // Petite valeur, sans TTF : 0,07 € à l'achat, 0,03 € à la vente.
    expect(estimateFees({ ...bd, account: 'PEA', amount: 14.47, symbol: 'ALVMG.PA' }).total).toBe(0.07);
    expect(estimateFees({ ...bd, account: 'PEA', amount: 5.97, side: 'sell', symbol: 'ALVMG.PA' }).total).toBe(0.03);
    // Sur un compte-titres, pas de plafond.
    expect(estimateFees({ ...bd, account: 'CTO', amount: 87.6, symbol: 'ESE.PA' }).total).toBe(0.99);
    expect(estimateFees({ ...bd, account: 'PEA', amount: 87.6, symbol: 'ESE.PA' }).total).toBe(0.44);
  });

  test('ETF à part, titres à part', () => {
    const degiro = tariffById('degiro');
    expect(scheduleFee(tariffSchedule(degiro, 'EUR'), 1000)).toBe(2);
    expect(scheduleFee(tariffSchedule(degiro, 'EUR', { fund: true }), 1000)).toBe(3);
    expect(tariffSchedule(degiro, 'USD')).toBeNull();
    const q = { rule: { type: 'tariff', id: 'bitpanda' }, amount: 1000, side: 'buy', assetType: 'crypto', currency: 'EUR' };
    expect(estimateFees({ ...q, symbol: 'BTC' }).total).toBe(9.9);
    expect(estimateFees({ ...q, symbol: 'ETH' }).total).toBe(14.9);
  });

  test('grilles BoursoBank et Fortuneo : le pourcentage porte sur tout l’ordre', () => {
    expect(scheduleFee(tariffSchedule(tariffById('fortuneo-progress'), 'EUR'), 4000)).toBe(6);
    expect(scheduleFee(tariffSchedule(tariffById('bourso-decouverte'), 'EUR'), 400)).toBe(1.99);
    expect(scheduleFee(tariffSchedule(tariffById('bourso-decouverte'), 'EUR'), 2000)).toBe(12);
    expect(scheduleFee(tariffSchedule(tariffById('bourso-classic'), 'EUR'), 1200)).toBe(8.95);
    expect(scheduleFee(tariffSchedule(tariffById('scalable-prime'), 'EUR'), 300)).toBe(0);
  });
});
