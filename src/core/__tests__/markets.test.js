import {
  allTimeHigh, computeMarketStats, drawdownEvents, dropDayEvents, fearLevel, marketState, MARKETS, movingAverage,
  opportunity, ruleTriggered, spreadVersusLump, stepFor, summarize, toPoints,
} from '../markets';

// Un jour par point, à partir du 1er janvier 2000.
const day = (i) => new Date(Date.UTC(2000, 0, 1) + i * 86400000).toISOString().slice(0, 10);
const series = (values) => values.map((v, i) => [day(i), v]);

describe('marchés', () => {
  it('lit un historique et calcule les moyennes mobiles', () => {
    expect(toPoints({ '2000-01-02': 2, '2000-01-01': 1, '2000-01-03': 0 })).toEqual([['2000-01-01', 1], ['2000-01-02', 2]]);
    expect(movingAverage(series([1, 2, 3, 4]), 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(allTimeHigh(series([1, 5, 3]))).toEqual({ date: day(1), value: 5 });
  });

  it('situation : variations, plus haut, moyennes', () => {
    const pts = series([...Array(200).fill(100), 110, 104.5]);
    const s = marketState(pts);
    expect(s.change1d).toBeCloseTo(-0.05, 6);
    expect(s.drawdown).toBeCloseTo(-0.05, 6);
    expect(s.highDate).toBe(day(200));
    expect(s.distMa200).toBeGreaterThan(0);
    // Un plus haut plus ancien (hors de la fenêtre) compte aussi.
    expect(marketState(pts, { date: '1999-01-01', value: 209 }).drawdown).toBeCloseTo(-0.5, 6);
  });

  it('épisodes de baisse : une fois par cycle, plus bas atteint ensuite', () => {
    const pts = series([100, 94, 90, 95, 101, 96, 80, 70, 102]);
    const ev = drawdownEvents(pts, 0.05);
    // 96 face à 101, c'est −4,95 % : l'épisode commence au jour suivant (80).
    expect(ev.map((e) => e.date)).toEqual([day(1), day(6)]);
    expect(ev[0].trough).toBeCloseTo(-0.1, 6);
    expect(ev[1].trough).toBeCloseTo(70 / 101 - 1, 6);
    const sum = summarize(ev, 0.05);
    expect(sum).toMatchObject({ count: 2, deeper: 1 });
    expect(sum.troughWorst).toBeCloseTo(70 / 101 - 1, 6);
  });

  it('suite à 1 an, séances de forte baisse, étalement', () => {
    const values = [...Array(400)].map((_, i) => (i === 10 ? 90 : 100 + i * 0.1));
    const pts = series(values);
    const drops = dropDayEvents(pts, 0.04);
    expect(drops).toHaveLength(1);
    expect(drops[0].fwd1y).toBeGreaterThan(0.3);
    const ev = drawdownEvents(pts, 0.05);
    const spread = spreadVersusLump(pts, ev, 6);
    // Le marché remonte tout de suite : étaler a coûté plus cher.
    expect(spread).toMatchObject({ n: 1, better: 0 });
  });

  it('palier, peur, montant possible, règle', () => {
    expect(stepFor(-0.059, MARKETS.sp500.drawdownSteps)).toBe(5);
    expect(stepFor(-0.39, MARKETS.btc.drawdownSteps)).toBe(30);
    expect(stepFor(-0.02, MARKETS.sp500.drawdownSteps)).toBeNull();
    expect(fearLevel('vix', 28.2)).toBe('worry');
    expect(fearLevel('vix', 45)).toBe('panic');
    expect(fearLevel('crypto', 28)).toBe('fear');
    expect(opportunity({ available: 50000, reserve: 7000, targetPct: 80, current: 42000, total: 92000 })).toMatchObject({ surplus: 43000, amount: 31600, perMonth: 5267 });
    expect(opportunity({ available: 50000, reserve: 7000 }).amount).toBeNull();
    const state = { drawdown: -0.12, highDate: '2026-10-28' };
    expect(ruleTriggered({ threshold: 10 }, state)).toBe('2026-10-28:10');
    expect(ruleTriggered({ threshold: 10, notifiedFor: '2026-10-28:10' }, state)).toBeNull();
    expect(ruleTriggered({ threshold: 15 }, state)).toBeNull();
  });

  it('statistiques complètes par palier', () => {
    const pts = series([100, 94, 89, 95, 101, 96, 80, 70, 102]);
    const stats = computeMarketStats(pts, MARKETS.sp500);
    expect(stats.drawdown[5].count).toBe(2);
    expect(stats.drawdown[50].count).toBe(0);
    expect(stats.since).toBe(day(0));
  });
});
