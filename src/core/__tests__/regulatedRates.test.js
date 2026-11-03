import { isRegulated, officialRate } from '../regulatedRates';
import { computeCash } from '../cash';
import { createFxConverter } from '../fx';

const EUR = createFxConverter({ base: 'EUR' });

describe('épargne réglementée', () => {
  test('taux en vigueur à une date', () => {
    expect(officialRate('livretA', new Date('2026-11-03'))).toEqual({ rate: 1.7, since: '2026-08-01' });
    expect(officialRate('ldds', new Date('2026-03-15'))).toEqual({ rate: 1.5, since: '2026-02-01' });
    expect(officialRate('livretA', new Date('2023-06-01')).rate).toBe(3);
    expect(officialRate('lep', new Date('2026-11-03'))).toEqual({ rate: 2.5, since: '2026-02-01' });
    expect(officialRate('current', new Date())).toBeNull();
    expect(isRegulated('lep')).toBe(true);
    expect(isRegulated('lifeInsurance')).toBe(false);
  });

  test('le taux officiel remplace celui saisi, les autres comptes gardent le leur', () => {
    const accounts = [
      { id: 'a', name: 'Livret A', kind: 'livretA', currency: 'EUR', rate: 3, history: [{ date: '2025-01-01T12:00:00.000Z', balance: 10000 }] },
      { id: 'b', name: 'Assurance-vie', kind: 'lifeInsurance', currency: 'EUR', rate: 2.5, history: [{ date: '2025-01-01T12:00:00.000Z', balance: 4000 }] },
    ];
    const cash = computeCash({ accounts, fx: EUR, today: new Date('2026-11-03') });
    const livret = cash.accounts.find((x) => x.id === 'a');
    expect(livret.rate).toBe(1.7);
    expect(livret.customRate).toBe(3);
    expect(livret.rateSince).toBe('2026-08-01');
    expect(livret.yearlyInterest).toBeCloseTo(170, 6);
    expect(cash.accounts.find((x) => x.id === 'b').rate).toBe(2.5);
    expect(cash.yearlyInterest).toBeCloseTo(270, 6);
  });
});
