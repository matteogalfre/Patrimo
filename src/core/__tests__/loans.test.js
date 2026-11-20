import { computeDebts, earlyRepayment, loanStatus, monthlyPayment, normalizeLoan, paymentsMade } from '../loans';
import { computeRealEstate, maxPurchase, normalizeProperty, propertyValue, simulatePurchase, withEstimate } from '../realEstate';

const mortgage = normalizeLoan({ name: 'Prêt résidence principale', kind: 'mortgage', amount: 200000, rate: 3.7, months: 300, startDate: '2024-11-05T12:00:00Z', insurance: 50, propertyId: 'p1' });

describe('crédits', () => {
  it('normalise et refuse ce qui est inutilisable', () => {
    expect(mortgage).toMatchObject({ kind: 'mortgage', share: 100, insurance: 50, monthly: null });
    expect(normalizeLoan({ name: 'x', amount: 0, rate: 3, months: 12, startDate: '2024-01-01' })).toBeNull();
    expect(normalizeLoan({ name: 'x', amount: 1000, rate: 3, months: 12 })).toBeNull();
    expect(normalizeLoan({ name: 'PTZ', amount: 1000, rate: '0', months: 10, startDate: '2024-01-01', share: 50 })).toMatchObject({ rate: 0, share: 50 });
  });

  it('mensualité, capital restant et coût', () => {
    expect(monthlyPayment(mortgage)).toBeCloseTo(1022.83, 2);
    expect(monthlyPayment({ amount: 1000, rate: 0, months: 10 })).toBe(100);
    const today = new Date('2026-11-05T15:00:00Z');
    expect(paymentsMade(mortgage, today)).toBe(25);
    const s = loanStatus(mortgage, new Date('2026-11-04T12:00:00Z'));
    expect(s.paid).toBe(24);
    expect(s.remaining).toBeCloseTo(189898.55, 0);
    expect(s.totalInterest).toBeCloseTo(106848.26, 0);
    expect(s.monthlyTotal).toBeCloseTo(1072.83, 2);
    expect(s.endDate.slice(0, 7)).toBe('2049-10');
    expect(loanStatus(mortgage, new Date('2060-01-01')).remaining).toBe(0);
  });

  it('remboursement anticipé : durée raccourcie ou mensualité allégée', () => {
    const r = earlyRepayment(mortgage, 20000, new Date('2026-11-04T12:00:00Z'));
    expect(r.shorter.months).toBe(42);
    expect(r.shorter.interestSaved).toBeGreaterThan(r.lower.interestSaved);
    expect(r.lower.payment).toBeLessThan(1022.83);
  });

  it('ta part des crédits', () => {
    const joint = { ...mortgage, share: 50 };
    const d = computeDebts([joint], new Date('2026-11-04T12:00:00Z'));
    expect(d.remaining).toBeCloseTo(189898.55 / 2, 0);
    expect(d.monthly).toBeCloseTo(1072.83 / 2, 2);
  });
});

describe('immobilier', () => {
  const flat = normalizeProperty({ id: 'p1', name: 'Appartement', kind: 'main', purchasePrice: 210000, fees: 15750, purchaseDate: '2024-10-15' });

  it('valeur : dernière estimation, sinon prix d’achat', () => {
    expect(propertyValue(flat)).toBe(210000);
    const later = withEstimate(flat, 225000, new Date('2026-06-01'));
    expect(propertyValue(later)).toBe(225000);
    expect(normalizeProperty({ name: 'x' })).toBeNull();
  });

  it('valeur, crédit restant et patrimoine net du bien', () => {
    const r = computeRealEstate({ properties: [flat], loans: [mortgage], today: new Date('2026-11-04T12:00:00Z') });
    expect(r.value).toBe(210000);
    expect(r.debt).toBeCloseTo(189898.55, 0);
    expect(r.equity).toBeCloseTo(20101.45, 0);
    expect(r.items[0].gain).toBeCloseTo(-15750, 6);
  });

  it('simulateur : frais, emprunt, mensualité, règle des 35 %', () => {
    const s = simulatePurchase({ price: 200000, kind: 'old', contribution: 25000, rate: 3.7, years: 25, insuranceRate: 0.3, income: 3500 });
    expect(s.notary).toBe(15000);
    expect(s.loan).toBe(190000);
    expect(s.coversFees).toBe(true);
    // 971,72 € de mensualité + 47,50 € d'assurance, pour 3 500 € de revenus.
    expect(s.monthlyTotal).toBeCloseTo(1019.22, 1);
    expect(s.debtRatio).toBeCloseTo(29.12, 1);
    expect(s.withinRules).toBe(true);
    expect(simulatePurchase({ price: 200000, rate: 3.7, years: 25, income: 2000 }).withinRules).toBe(false);
  });

  it('prix maximal à 35 % d’endettement', () => {
    const m = maxPurchase({ income: 3000, contribution: 30000, rate: 3.8, years: 25, insuranceRate: 0.3 });
    expect(m.loan).toBeCloseTo(193778, -1);
    expect(m.price).toBeCloseTo(208166, -1);
    expect(maxPurchase({ income: 0, rate: 3.8, years: 25 })).toBeNull();
  });
});
