import {
  cashBalanceAt,
  cashValueSeries,
  computeCash,
  normalizeCashAccount,
  withBalance,
} from '../cash';
import { createFxConverter } from '../fx';

const fx = createFxConverter({ base: 'EUR', latest: { USD: 0.9 }, history: { USD: { '2026-01-01': 0.95 } } });

const livret = normalizeCashAccount({
  id: 'c1',
  name: 'Livret A',
  kind: 'livretA',
  rate: '1,5',
  history: [
    { date: '2026-03-01T12:00:00Z', balance: 12000 },
    { date: '2026-01-01T12:00:00Z', balance: 10000 },
  ],
});

describe('comptes de liquidités', () => {
  test('historique trié, taux lu à la française', () => {
    expect(livret.history.map((h) => h.balance)).toEqual([10000, 12000]);
    expect(livret.rate).toBe(1.5);
  });

  test('compte sans nom ou sans solde rejeté', () => {
    expect(normalizeCashAccount({ name: '', history: [{ date: '2026-01-01', balance: 1 }] })).toBeNull();
    expect(normalizeCashAccount({ name: 'X', history: [] })).toBeNull();
  });

  test('solde constant entre deux saisies, nul avant la première', () => {
    expect(cashBalanceAt(livret, new Date('2025-12-31T12:00:00Z'))).toBe(0);
    expect(cashBalanceAt(livret, new Date('2026-02-15T12:00:00Z'))).toBe(10000);
    expect(cashBalanceAt(livret, new Date('2026-06-01T12:00:00Z'))).toBe(12000);
  });

  test('une nouvelle saisie le même jour remplace la précédente', () => {
    const a = withBalance(withBalance(livret, 13000, new Date('2026-04-01T09:00:00Z')), 13500, new Date('2026-04-01T18:00:00Z'));
    expect(a.history).toHaveLength(3);
    expect(a.history[2].balance).toBe(13500);
  });

  test('valorisation en devise de référence et intérêts estimés', () => {
    const usd = normalizeCashAccount({ id: 'c2', name: 'Revolut USD', currency: 'usd', history: [{ date: '2026-01-01', balance: 1000 }] });
    // Livret A : taux officiel en vigueur (1,5 % en mars 2026), pas celui saisi.
    const { total, accounts, yearlyInterest } = computeCash({ accounts: [livret, usd], fx, today: new Date('2026-03-01') });
    expect(total).toBeCloseTo(12000 + 900);
    expect(accounts[0].name).toBe('Livret A');
    expect(yearlyInterest).toBeCloseTo(180);
  });

  test('série temporelle au taux de change de chaque jour', () => {
    const usd = normalizeCashAccount({ id: 'c2', name: 'USD', currency: 'USD', history: [{ date: '2026-01-01T12:00:00Z', balance: 100 }] });
    const dates = [new Date('2025-12-01T12:00:00Z'), new Date('2026-01-02T12:00:00Z')];
    const strict = cashValueSeries({ accounts: [usd], dates, fx, backfill: false });
    expect(strict[0]).toBe(0);
    expect(strict[1]).toBeCloseTo(95);
  });

  test('un compte ajouté récemment ne fait pas sauter la courbe', () => {
    const dates = [new Date('2025-06-01T12:00:00Z'), new Date('2026-02-15T12:00:00Z'), new Date('2026-06-01T12:00:00Z')];
    expect(cashValueSeries({ accounts: [livret], dates, fx })).toEqual([10000, 10000, 12000]);
  });
});

describe('Livret Jeune, épargne salariale', () => {
  const today = new Date('2026-11-04T12:00:00Z');
  const make = (kind, extra = {}) => normalizeCashAccount({
    id: kind, name: kind, kind, history: [{ date: '2026-01-01T12:00:00Z', balance: 1000 }], ...extra,
  });

  test('Livret Jeune : au moins le taux du Livret A, plus si la banque paie plus', () => {
    const [plain] = computeCash({ accounts: [make('livretJeune')], fx, today }).accounts;
    expect(plain.rate).toBe(1.7);
    const [better] = computeCash({ accounts: [make('livretJeune', { rate: 3 })], fx, today }).accounts;
    expect(better.rate).toBe(3);
    const [lower] = computeCash({ accounts: [make('livretJeune', { rate: 1 })], fx, today }).accounts;
    expect(lower.rate).toBe(1.7);
  });

  test('PEE et PERCOL : placés en fonds, sans taux', () => {
    expect(make('pee', { rate: 2 }).rate).toBeNull();
    const [percol] = computeCash({ accounts: [make('percol')], fx, today }).accounts;
    expect(percol.yearlyInterest).toBe(0);
  });

  test('date d’ouverture gardée pour un PEL seulement', () => {
    expect(make('pel', { openedAt: '2024-03-15' }).openedAt).toBe(new Date('2024-03-15').toISOString());
    expect(make('pel').openedAt).toBeUndefined();
    expect(make('cel', { openedAt: '2024-03-15' }).openedAt).toBeUndefined();
  });
});
