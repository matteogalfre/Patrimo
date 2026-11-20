import { buildDemoData, DEMO_ASSETS } from '../demoData';
import { normalizeDividend, normalizeTransaction } from '../importers';
import { normalizeCashAccount, currentBalance } from '../cash';

describe('données de démonstration', () => {
  const today = new Date('2026-11-04T12:00:00');
  // Cours constants : le prix de repli de chaque actif, tous les jours.
  const series = Object.fromEntries(DEMO_ASSETS.map((a) => {
    const s = {};
    for (let d = new Date('2024-01-01'); d <= today; d.setDate(d.getDate() + 1)) s[d.toISOString().slice(0, 10)] = a.fallback;
    return [a.assetId, s];
  }));
  const data = buildDemoData({ today, series });

  test('environ 5 000 € au total', () => {
    const usd = 0.9;
    const fallback = Object.fromEntries(DEMO_ASSETS.map((a) => [a.symbol, a.fallback * (a.currency === 'USD' ? usd : 1)]));
    const invested = data.transactions.reduce((s, t) => s + t.quantity * fallback[t.symbol], 0);
    const cash = data.cashAccounts.reduce((s, a) => s + currentBalance(a), 0);
    expect(invested + cash).toBeGreaterThan(4000);
    expect(invested + cash).toBeLessThan(6500);
  });

  test('tout passe la validation de l’app, sans doublon', () => {
    expect(data.transactions.map(normalizeTransaction).every(Boolean)).toBe(true);
    expect(data.dividends.map(normalizeDividend).every(Boolean)).toBe(true);
    expect(data.cashAccounts.map(normalizeCashAccount).every(Boolean)).toBe(true);
    const ids = [...data.transactions, ...data.dividends].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.transactions.every((t) => new Date(t.date) <= today && t.unitPrice > 0)).toBe(true);
  });

  test('des dividendes LVMH et TotalEnergies, après l’achat', () => {
    const symbols = new Set(data.dividends.map((d) => d.symbol));
    expect(symbols).toEqual(new Set(['MC.PA', 'TTE.PA']));
    data.dividends.forEach((d) => {
      const bought = data.transactions.find((t) => t.symbol === d.symbol).date;
      expect(d.date > bought).toBe(true);
      expect(new Date(d.date) <= today).toBe(true);
    });
  });

  test('sans historique, les prix restent à compléter', () => {
    const bare = buildDemoData({ today });
    expect(bare.transactions.every((t) => t.unitPrice === null && t.fees === 0)).toBe(true);
    expect(bare.transactions.length).toBe(data.transactions.length);
  });
});
