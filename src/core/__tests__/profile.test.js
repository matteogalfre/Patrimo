import { buildPlan, cryptoCap, emergencyMonths, profileTargets, scoreProfile, visibleQuestions } from '../profile';

const keys = (plan) => plan.map((p) => p.key);

describe('profil d’investisseur', () => {
  test('le plus prudent des deux : capacité et tolérance', () => {
    // Long terme à 30 ans, mais vend tout à la première baisse.
    expect(scoreProfile({ age: 30, work: 'stable', goal: 'growth', drop: 'sellAll' })).toMatchObject({ capacity: 5, tolerance: 1, profile: 'prudent' });
    // Tient bon dans les baisses, mais épargne pour un projet.
    expect(scoreProfile({ age: 30, work: 'stable', goal: 'project', drop: 'buyMore' })).toMatchObject({ level: 2, profile: 'moderate' });
    expect(scoreProfile({ age: 28, work: 'stable', goal: 'growth', drop: 'buyMore', experience: 'funds' }).profile).toBe('bold');
    // À 66 ans, l'horizon se raccourcit.
    expect(scoreProfile({ age: 66, work: 'retired', goal: 'growth', drop: 'buyMore' }).level).toBeLessThanOrEqual(3);
  });

  test('épargne de précaution : 3 mois en CDI, 6 en indépendant, plus avec des enfants', () => {
    expect(emergencyMonths({ work: 'stable', household: 'single' })).toBe(3);
    expect(emergencyMonths({ work: 'stable', household: 'coupleKids' })).toBe(4);
    expect(emergencyMonths({ work: 'freelance', household: 'singleKids' })).toBe(6);
  });

  test('questions conditionnelles', () => {
    expect(visibleQuestions({}).some((q) => q.id === 'debtRate')).toBe(false);
    expect(visibleQuestions({ debts: ['consumer'] }).some((q) => q.id === 'debtRate')).toBe(true);
    expect(visibleQuestions({ projects: ['home'] }).some((q) => q.id === 'homeWhen')).toBe(true);
  });

  test('crypto : jamais plus que ce qu’on peut perdre', () => {
    expect(cryptoCap({ crypto: 'no' }, 5)).toBe(0);
    expect(cryptoCap({ crypto: 'believer' }, 1)).toBe(5);
    expect(cryptoCap({ crypto: 'believer' }, 5)).toBe(10);
  });
});

describe('plans d’action selon la situation', () => {
  test('étudiant sans épargne : d’abord l’épargne de précaution, pas d’investissement', () => {
    const a = { age: 20, work: 'student', household: 'single', income: 800, expenses: 700, debts: ['none'], projects: ['none'], goal: 'growth', drop: 'wait', blocker: 'lost', experience: 'never', crypto: 'little', tax: '0' };
    const plan = buildPlan(a, { cashAccounts: [{ kind: 'current', value: 300 }] });
    expect(keys(plan)[0]).toBe('emergency');
    expect(plan[0].params.missing).toBe(1800);
    expect(keys(plan)).toContain('lep');
    expect(keys(plan)).not.toContain('investSurplus');
    expect(keys(plan)).not.toContain('investGradually');
  });

  test('crédit renouvelable et crédit conso cher : rembourser avant tout', () => {
    const a = { age: 35, work: 'stable', household: 'coupleKids', income: 4000, expenses: 2500, debts: ['revolving', 'consumer'], debtRate: 'high', projects: ['none'], goal: 'growth', drop: 'wait', blocker: 'none', experience: 'savings', crypto: 'no', tax: '11' };
    const plan = buildPlan(a, { cashAccounts: [{ kind: 'livretA', value: 30000 }] });
    expect(keys(plan).slice(0, 2)).toEqual(['revolving', 'expensiveDebt']);
    // Tant que les dettes chères courent, on n'investit pas le surplus.
    expect(keys(plan)).not.toContain('investSurplus');
  });

  test('jeune actif bien installé, trop de cash et beaucoup de crypto', () => {
    const a = { age: 27, work: 'stable', household: 'single', income: 3000, expenses: 1500, debts: ['none'], projects: ['none'], goal: 'growth', drop: 'wait', blocker: 'fear', experience: 'funds', crypto: 'believer', tax: '30' };
    const plan = buildPlan(a, {
      cashAccounts: [{ kind: 'livretA', value: 15000 }],
      stockValue: 20000,
      cryptoValue: 15000,
      hasPea: true,
      topCountryPct: 98,
      averageTer: 0.14,
    });
    expect(keys(plan)).toEqual(expect.arrayContaining(['emergencyDone', 'peaDone', 'investGradually', 'cryptoHigh', 'concentrationCountry']));
    expect(plan.find((p) => p.key === 'investGradually').params.amount).toBe(10500);
    expect(plan.find((p) => p.key === 'investGradually').route).toBe('Plans');
    expect(keys(plan)).not.toContain('fees');
    expect(keys(plan)).not.toContain('lep');
  });

  test('achat immobilier proche : l’apport reste à l’abri', () => {
    const a = { age: 31, work: 'stable', household: 'couple', income: 5000, expenses: 2500, debts: ['none'], projects: ['home'], homeWhen: 'soon', goal: 'project', drop: 'wait', blocker: 'none', experience: 'savings', crypto: 'no', tax: '30' };
    const plan = buildPlan(a, { cashAccounts: [{ kind: 'livretA', value: 40000 }] });
    const home = plan.find((p) => p.key === 'homeSoon');
    expect(home.params.maxPayment).toBe(1750);
    expect(keys(plan)).not.toContain('investSurplus');
    expect(keys(plan)).not.toContain('pea');
  });

  test('58 ans, tranche à 41 % : le PER a du sens', () => {
    const a = { age: 58, work: 'stable', household: 'couple', income: 7000, expenses: 3500, debts: ['mortgage'], projects: ['none'], goal: 'retirement', drop: 'wait', blocker: 'none', experience: 'funds', crypto: 'no', tax: '41' };
    const plan = buildPlan(a, { cashAccounts: [{ kind: 'livretA', value: 12000 }], stockValue: 100000, hasPea: true });
    expect(keys(plan)).toContain('per');
    expect(keys(plan)).toContain('independence');
    // Un prêt immobilier n'est pas une dette à rembourser en urgence.
    expect(keys(plan)).not.toContain('expensiveDebt');
  });

  test('répartition cible : la réserve en liquidités, le reste selon le profil', () => {
    const a = { age: 30, work: 'stable', household: 'single', expenses: 2000, goal: 'growth', drop: 'wait', crypto: 'little' };
    const tg = profileTargets(a, { total: 60000 });
    expect(tg.stock + tg.crypto + tg.cash).toBe(100);
    expect(tg.cash).toBeGreaterThanOrEqual(10);
    expect(tg.crypto).toBe(5);
  });
});
