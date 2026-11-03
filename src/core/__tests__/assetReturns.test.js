import { historicalReturns } from '../assetReturns';

// Un cours par jour qui progresse de 10 % par an, du 1er janvier 2020 au 1er juillet 2026.
const DAY = 24 * 60 * 60 * 1000;
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const series = () => {
  const out = [];
  const start = new Date(2020, 0, 1, 12).getTime();
  for (let t = start; t <= new Date(2026, 6, 1, 12).getTime(); t += DAY) {
    out.push({ key: key(new Date(t)), price: 100 * 1.1 ** ((t - start) / (365.25 * DAY)) });
  }
  return out;
};

describe('rendement historique', () => {
  test('rendement moyen par an sur 1, 3 et 5 ans, depuis le début', () => {
    const r = historicalReturns(series(), { today: new Date(2026, 6, 2) });
    expect(r.horizons.map((h) => h.years)).toEqual([1, 3, 5]);
    r.horizons.forEach((h) => expect(h.pct).toBeCloseTo(10, 0));
    expect(r.since.year).toBe(2020);
    expect(r.since.pct).toBeCloseTo(10, 0);
  });

  test('année par année, année en cours partielle', () => {
    const r = historicalReturns(series(), { today: new Date(2026, 6, 2) });
    // L'historique commence le 1er janvier 2020 : 2020 compte comme une année pleine.
    expect(r.calendar.map((c) => c.year)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(r.calendar[1].pct).toBeCloseTo(10, 0);
    expect(r.calendar[6].partial).toBe(true);
    expect(r.calendar[6].pct).toBeCloseTo((1.1 ** (6 / 12) - 1) * 100, 0);
  });

  test('historique qui commence en cours d’année : l’année n’est pas comptée', () => {
    const r = historicalReturns([{ key: '2024-06-03', price: 100 }, { key: '2024-12-31', price: 110 }, { key: '2025-12-31', price: 121 }], { today: new Date(2026, 0, 5) });
    expect(r.calendar.map((c) => c.year)).toEqual([2025]);
    expect(r.calendar[0].pct).toBeCloseTo(10, 0);
  });

  test('une baisse donne un rendement négatif ; trop peu de points : rien', () => {
    const down = [{ key: '2024-01-02', price: 100 }, { key: '2024-12-31', price: 80 }, { key: '2026-01-02', price: 64 }];
    const r = historicalReturns(down, { today: new Date(2026, 0, 2) });
    expect(r.horizons.find((h) => h.years === 1).pct).toBeCloseTo(-20, 0);
    expect(historicalReturns([{ key: '2026-01-02', price: 1 }])).toBeNull();
  });
});
