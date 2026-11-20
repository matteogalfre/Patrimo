import { nextPurchasesCost } from '../feeInsights';

const fx = { now: () => 1, at: () => 1 };
const today = new Date('2026-11-05T12:00:00Z');

describe('nextPurchasesCost', () => {
  it('achats programmés : un ordre par mois, le plan automatique quand il est moins cher', () => {
    const r = nextPurchasesCost({
      plans: [{ active: true, amount: 500, account: 'PEA', assetId: 'etf:CW8.PA', symbol: 'CW8.PA', assetType: 'etf' }],
      fx,
      today,
      rules: { PEA: { type: 'tariff', id: 'boursedirect' } },
    });
    expect(r.source).toBe('plans');
    const pea = r.accounts[0];
    expect(pea.account).toBe('PEA');
    expect(pea.monthly).toBe(500);
    const tr = pea.options.find((o) => o.tariff.id === 'traderepublic');
    expect(tr).toMatchObject({ total: 0, viaPlan: true });
    // Au moins une grille facture quelque chose, et le courtier actuel est chiffré.
    expect(pea.options[pea.options.length - 1].total).toBeGreaterThan(0);
    expect(pea.current).toBeGreaterThan(0);
    // Plafond légal du PEA : jamais plus de 0,5 % de 500 € par ordre.
    pea.options.forEach((o) => expect(o.total).toBeLessThanOrEqual(2.5 * 12 + 0.001));
  });

  it('sans achats programmés : le budget, réparti comme les achats de l’année', () => {
    const tx = (account, assetId, assetType, amount, date) => ({
      account, assetId, symbol: assetId.split(':')[1], assetType, side: 'buy', quantity: 1, unitPrice: amount, currency: 'EUR', date,
    });
    const r = nextPurchasesCost({
      transactions: [
        tx('PEA', 'etf:CW8.PA', 'etf', 3000, '2026-03-01'),
        tx('PEA', 'etf:CW8.PA', 'etf', 3000, '2026-06-01'),
        tx('CRYPTO', 'crypto:BTC', 'crypto', 4800, '2026-05-01'),
        tx('PEA', 'etf:OLD.PA', 'etf', 9000, '2024-01-01'), // trop ancien
      ],
      monthlyInvest: 900,
      fx,
      today,
    });
    expect(r.source).toBe('budget');
    const amounts = Object.fromEntries(r.accounts.map((a) => [a.account, a.monthly]));
    expect(amounts).toEqual({ PEA: 500, CRYPTO: 400 });
    expect(r.accounts.find((a) => a.account === 'CRYPTO').options.length).toBeGreaterThan(1);
  });

  it('rien à projeter', () => {
    expect(nextPurchasesCost({ fx, today })).toBeNull();
    expect(nextPurchasesCost({ monthlyInvest: 900, fx, today })).toBeNull();
  });
});
