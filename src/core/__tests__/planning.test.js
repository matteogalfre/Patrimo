import { allocationPct, fullRebalance, splitContribution, targetsValid } from '../rebalance';
import { emergencyFund, goalStatus } from '../goals';
import { computeFees } from '../fees';
import { duePlans, markHandled, quantityForAmount } from '../plans';

describe('rééquilibrage', () => {
  const values = { stock: 60000, crypto: 30000, cash: 10000 };
  const targets = { stock: 70, crypto: 15, cash: 15 };

  test('répartition actuelle et cibles', () => {
    expect(allocationPct(values)).toEqual({ stock: 60, crypto: 30, cash: 10 });
    expect(targetsValid(targets)).toBe(true);
    expect(targetsValid({ stock: 70, crypto: 20, cash: 20 })).toBe(false);
  });

  test('le versement va d\'abord aux poches en retard, sans vendre', () => {
    const split = splitContribution({ values, targets, amount: 5000 });
    expect(split.crypto).toBe(0);
    expect(split.stock + split.cash).toBeCloseTo(5000);
    expect(split.stock).toBeGreaterThan(split.cash);
  });

  test('gros versement : retards comblés puis reste selon la cible', () => {
    const split = splitContribution({ values: { stock: 0, crypto: 0, cash: 0 }, targets, amount: 1000 });
    expect(split).toEqual({ stock: 700, crypto: 150, cash: 150 });
  });

  test('rééquilibrage complet : achats et ventes', () => {
    const d = fullRebalance({ values, targets });
    expect(d.stock).toBeCloseTo(10000);
    expect(d.crypto).toBeCloseTo(-15000);
    expect(d.cash).toBeCloseTo(5000);
  });
});

describe('objectifs', () => {
  const base = { invested: 50000, cash: 0, cashRate: 0, annualRate: 5, monthly: 500 };
  const today = new Date('2026-01-01T12:00:00Z');

  test('objectif atteignable : en bonne voie, rien de plus à verser', () => {
    const s = goalStatus({ goal: { target: 100000, date: '2036-01-01' }, base, today });
    expect(s.onTrack).toBe(true);
    expect(s.neededMonthly).toBe(0);
    expect(s.progress).toBeCloseTo(50);
  });

  test('objectif trop ambitieux : épargne mensuelle nécessaire', () => {
    const s = goalStatus({ goal: { target: 500000, date: '2036-01-01' }, base, today });
    expect(s.onTrack).toBe(false);
    expect(s.neededMonthly).toBeGreaterThan(500);
    const check = goalStatus({ goal: { target: 500000, date: '2036-01-01' }, base: { ...base, monthly: s.neededMonthly + 1 }, today });
    expect(check.onTrack).toBe(true);
  });

  test('épargne de précaution', () => {
    expect(emergencyFund({ cash: 6000, monthlyExpenses: 2000 })).toMatchObject({ months: 3, level: 'ok' });
    expect(emergencyFund({ cash: 3000, monthlyExpenses: 2000 })).toMatchObject({ level: 'low', shortfall: 3000 });
    expect(emergencyFund({ cash: 30000, monthlyExpenses: 2000 })).toMatchObject({ level: 'high', surplus: 18000 });
    expect(emergencyFund({ cash: 1000, monthlyExpenses: 0 })).toBeNull();
  });
});

describe('frais des ETF', () => {
  test('coût annuel et manque à gagner sur 20 ans', () => {
    const f = computeFees([{ assetId: 'stock:CW8.PA', value: 10000 }, { assetId: 'stock:AI.PA', value: 5000 }], { 'stock:CW8.PA': 0.38 });
    expect(f.yearly).toBeCloseTo(38);
    expect(f.lines).toHaveLength(1);
    expect(f.overYears).toBeGreaterThan(38 * 20);
    expect(f.averageTer).toBeCloseTo(0.38);
  });
});

describe('investissements programmés', () => {
  const plan = { id: 'p1', active: true, day: 5, amount: 100 };

  test('dû après le jour prévu, une fois par mois', () => {
    expect(duePlans([plan], new Date(2026, 10, 3))).toHaveLength(0);
    expect(duePlans([plan], new Date(2026, 10, 6))).toHaveLength(1);
    expect(duePlans([markHandled(plan, new Date(2026, 10, 6))], new Date(2026, 10, 20))).toHaveLength(0);
    expect(duePlans([{ ...plan, active: false }], new Date(2026, 10, 6))).toHaveLength(0);
  });

  test('quantité : unités entières pour un titre, décimales pour une crypto', () => {
    expect(quantityForAmount({ amount: 100, price: 33.4, assetType: 'stock' })).toBe(2);
    expect(quantityForAmount({ amount: 100, price: 400, assetType: 'stock' })).toBe(0.25);
    expect(quantityForAmount({ amount: 100, price: 80000, assetType: 'crypto' })).toBeCloseTo(0.00125, 8);
  });
});
