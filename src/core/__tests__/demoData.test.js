import { buildDemoData, buildDemoPlanning, DEMO_ASSETS, DEMO_PROFILE } from '../demoData';
import { budgetTotals } from '../budget';
import { visibleQuestions, scoreProfile } from '../profile';
import { tariffOf } from '../brokerFees';
import { institutionById } from '../institutions';
import { duePlans } from '../plans';
import en from '../../i18n/translations/en';
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

describe('planification de démonstration', () => {
  const today = new Date('2026-11-24T12:00:00');
  const labels = en.budget.defaults;
  const planning = buildDemoPlanning({ labels, goalName: 'Home deposit', today });

  test('toutes les clés de PlanningContext, rien de vide qui ferait rouvrir l’accueil', () => {
    expect(Object.keys(planning).sort()).toEqual([
      'accountInstitutions', 'brokerRules', 'budget', 'dismissedDividends', 'exposure', 'fees', 'goals',
      'marketRules', 'monthlyExpenses', 'onboarded', 'plans', 'profile', 'reminders', 'targets', 'ttf',
    ]);
    expect(planning.onboarded).toBe(true);
  });

  test('un questionnaire complet, qui donne un profil', () => {
    const answers = planning.profile.answers;
    visibleQuestions(answers).forEach((q) => expect(answers[q.id]).toBeDefined());
    expect(scoreProfile(answers).profile).toBeTruthy();
    expect(answers).toEqual({ ...DEMO_PROFILE });
  });

  test('un budget dans la langue de l’app, cohérent avec le profil', () => {
    const totals = budgetTotals(planning.budget);
    expect(totals.income).toBe(DEMO_PROFILE.income);
    expect(totals.invest).toBe(150);
    expect(Math.abs(totals.expenses - DEMO_PROFILE.expenses)).toBeLessThanOrEqual(40);
    expect(totals.available).toBeGreaterThan(0);
    expect(planning.monthlyExpenses).toBe(totals.expenses);
    const names = planning.budget.groups.flatMap((g) => [g.label, ...g.items.map((i) => i.label)]);
    expect(names).toEqual(expect.arrayContaining([labels.invest, labels.etf, labels.savings, labels.housing, labels.rent]));
  });

  test('l’achat programmé est celui des opérations d’exemple', () => {
    const data = buildDemoData({ today });
    const world = DEMO_ASSETS.find((a) => a.symbol === 'WPEA.PA');
    const [plan] = planning.plans;
    expect(plan).toMatchObject({ assetId: world.assetId, account: 'PEA', amount: 100, day: 5, active: true });
    const buys = data.transactions.filter((t) => t.symbol === 'WPEA.PA');
    expect(buys.every((t) => t.account === 'PEA' && new Date(t.date).getDate() === 5)).toBe(true);
    // Le mois en cours n'est pas encore acheté dans l'exemple : le rappel le propose.
    expect(duePlans(planning.plans, today)).toHaveLength(1);
  });

  test('courtiers connus et objectif dans le futur', () => {
    Object.values(planning.accountInstitutions).forEach((id) => expect(institutionById(id)).toBeTruthy());
    Object.values(planning.brokerRules).forEach((rule) => expect(tariffOf(rule)).toBeTruthy());
    const [goal] = planning.goals;
    expect(goal.name).toBe('Home deposit');
    expect(new Date(goal.date) > today).toBe(true);
    expect(goal.target).toBeGreaterThan(0);
  });
});
