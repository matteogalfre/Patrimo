import { budgetTotals, defaultBudget, linkPath, sankeyLayout } from '../budget';

const budget = {
  incomes: [{ id: 'i1', label: 'Salaire', amount: 2500 }],
  groups: [
    { id: 'g1', kind: 'invest', label: 'Investissements', items: [{ id: 'a', label: 'ETF', amount: 200 }, { id: 'b', label: 'Assurance-vie', amount: 200 }] },
    { id: 'g2', kind: 'expense', label: 'Logement', items: [{ id: 'c', label: 'Loyer', amount: 500 }, { id: 'd', label: 'Charges', amount: 120 }] },
    { id: 'g3', kind: 'expense', label: 'Vie quotidienne', items: [{ id: 'e', label: 'Courses', amount: 300 }, { id: 'f', label: 'Restaurants', amount: 100 }] },
    { id: 'g4', kind: 'expense', label: 'Abonnements', items: [{ id: 'g', label: 'Internet', amount: 50 }, { id: 'h', label: 'Sport', amount: 20 }] },
  ],
};
const colors = { palette: ['#p0', '#p1', '#p2', '#p3', '#p4', '#p5'], expenseFlow: '#cream' };

describe('budget', () => {
  test('taux d’épargne, taux possible et reste', () => {
    const t = budgetTotals(budget);
    expect(t).toMatchObject({ income: 2500, invest: 400, expenses: 1090, available: 1010, savingsRate: 16 });
    expect(t.possibleRate).toBeCloseTo(56.4, 5);
  });

  test('Sankey : chaque euro a la même épaisseur, les flux se raccordent', () => {
    const { nodes, links, height } = sankeyLayout(budget, { width: 340, colors });
    const root = nodes.find((n) => n.id === '__budget');
    expect(root.h).toBe(230);
    // Ce qui sort du budget couvre tout le nœud, reste compris.
    const out = links.filter((l) => l.source === '__budget').reduce((s, l) => s + l.h, 0);
    expect(out).toBeCloseTo(root.h, 5);
    expect(nodes.find((n) => n.id === '__available').h).toBeCloseTo((1010 / 2500) * 230, 5);
    // Le revenu remplit tout le budget.
    expect(links.find((l) => l.source === 'i1').h).toBeCloseTo(230, 5);
    // Les postes d'un groupe partent les uns sous les autres.
    const [loyer, charges] = links.filter((l) => l.source === 'g2');
    expect(charges.y0).toBeCloseTo(loyer.y0 + loyer.h, 5);
    nodes.forEach((n) => {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h).toBeLessThanOrEqual(height + 0.001);
    });
  });

  test('chaque poste a sa place : les étiquettes ne se chevauchent jamais', () => {
    const { nodes } = sankeyLayout(budget, { width: 700, colors, slot: 18, gap: 6 });
    const centers = nodes.filter((n) => n.column === 3).map((n) => n.y + n.h / 2).sort((a, b) => a - b);
    centers.slice(1).forEach((c, i) => expect(c - centers[i]).toBeGreaterThanOrEqual(18));
  });

  test('plusieurs revenus : chacun remplit sa part du budget', () => {
    const two = { ...budget, incomes: [...budget.incomes, { id: 'i2', label: 'Loyer perçu', amount: 500 }] };
    const { nodes, links } = sankeyLayout(two, { width: 700, colors });
    expect(nodes.filter((n) => n.column === 0)).toHaveLength(2);
    const [a, b] = links.filter((l) => l.target === '__budget');
    expect(b.y1).toBeCloseTo(a.y1 + a.h, 5);
    expect(a.h + b.h).toBeCloseTo(230, 5);
  });

  test('investissements en tête, teintes par colonne, crème vers les dépenses', () => {
    const expensesFirst = { ...budget, groups: [budget.groups[1], budget.groups[0], ...budget.groups.slice(2)] };
    const { nodes, links } = sankeyLayout(expensesFirst, { width: 700, colors });
    const mid = nodes.filter((n) => n.column === 2);
    expect(mid.map((n) => n.id)).toEqual(['g1', 'g2', 'g3', 'g4', '__available']);
    // Colonne c, n-ième nœud : teinte c + n.
    expect(nodes.find((n) => n.column === 0).color).toBe('#p0');
    expect(nodes.find((n) => n.id === '__budget').color).toBe('#p1');
    expect(mid.map((n) => n.color)).toEqual(['#p2', '#p3', '#p4', '#p5', '#p0']);
    expect(nodes.filter((n) => n.column === 3)[0].color).toBe('#p3');
    // Flux : la couleur du départ, crème du budget vers une dépense.
    expect(links.find((l) => l.target === 'g1').color).toBe('#p1');
    expect(links.find((l) => l.target === 'g2').color).toBe('#cream');
    expect(links.find((l) => l.target === 'c').color).toBe(mid[1].color);
    // Un vide entre chaque nœud et ses flux.
    const toBudget = links.find((l) => l.target === '__budget');
    expect(toBudget.x1).toBe(nodes.find((n) => n.id === '__budget').x - 6);
    expect(toBudget.x0).toBe(8 + 6);
  });

  test('chiffres partagés : ce qui reste et d’où viennent les montants', () => {
    const { householdNumbers } = require('../budget');
    const n = householdNumbers({ budget });
    expect(n).toMatchObject({ invest: 400, savings: 1410, kept: 1010, investFrom: 'budget', savingsFrom: 'budget' });
    expect(householdNumbers({ answers: { income: 3000, expenses: 2000 } })).toMatchObject({ savings: 1000, savingsFrom: 'answers', kept: null });
    expect(householdNumbers({ measured: 300 })).toMatchObject({ savings: 300, savingsFrom: 'measured' });
    expect(householdNumbers({ plans: [{ active: true, amount: 150 }] })).toMatchObject({ invest: 150, investFrom: 'plans' });
  });

  test('investi pour de vrai : moyenne mensuelle des derniers mois', () => {
    const { realInvesting } = require('../budget');
    const fx = { at: () => 1 };
    const today = new Date('2026-11-05T12:00:00');
    const buy = (date, amount) => ({ date, quantity: 1, unitPrice: amount, side: 'buy', currency: 'EUR' });
    const tx = [buy('2025-01-10', 5000), buy('2026-08-20', 900), buy('2026-09-20', 900), buy('2026-10-20', 450)];
    const r = realInvesting({ transactions: tx, fx, today });
    expect(r.months).toBe(3);
    expect(r.perMonth).toBeCloseTo(750, 0);
    // Une vente compte en moins.
    const withSell = [...tx, { date: '2026-10-25', quantity: 1, unitPrice: 300, side: 'sell', currency: 'EUR' }];
    expect(realInvesting({ transactions: withSell, fx, today }).perMonth).toBeCloseTo(650, 0);
    // Moins d'un mois d'historique : pas de rythme à en tirer.
    expect(realInvesting({ transactions: [buy('2026-10-25', 9000)], fx, today })).toBeNull();
    expect(realInvesting({ transactions: [], fx, today })).toBeNull();
  });

  test('budget vide : rien à dessiner', () => {
    expect(sankeyLayout({ incomes: [], groups: [] }, { width: 300, colors }).nodes).toEqual([]);
  });

  test('bande d’un flux : deux courbes reliées', () => {
    expect(linkPath({ x0: 0, y0: 0, x1: 10, y1: 5, h: 2 })).toMatch(/^M0,0 C5,0 5,5 10,5 L10,7/);
  });

  test('budget d’exemple ramené aux dépenses du profil, plans en investissements', () => {
    const L = new Proxy({}, { get: (_, k) => String(k) });
    const b = defaultBudget({ labels: L, income: 3200, expenses: 2000, plans: [{ name: 'ESE', amount: 300 }] });
    const t = budgetTotals(b);
    expect(t.income).toBe(3200);
    expect(t.invest).toBe(300);
    expect(Math.abs(t.expenses - 2000)).toBeLessThan(30);
  });
});

describe('tes chiffres, partagés entre les écrans', () => {
  const { householdNumbers } = require('../budget');

  test('le budget passe devant le questionnaire', () => {
    const n = householdNumbers({ budget, answers: { income: 9999, expenses: 9999, age: 31 } });
    expect(n).toMatchObject({ income: 2500, expenses: 1090, invest: 400, savings: 1410, age: 31, fromBudget: true });
  });

  test('sans budget : questionnaire, dépenses saisies, plans, mesure', () => {
    expect(householdNumbers({ answers: { income: 3000, expenses: 2000 }, monthlyExpenses: 1800 })).toMatchObject({ income: 3000, expenses: 1800, savings: 1200 });
    expect(householdNumbers({ plans: [{ active: true, amount: 300 }, { active: false, amount: 100 }], measured: 450 })).toMatchObject({ income: null, invest: 300, savings: 450 });
    expect(householdNumbers({})).toMatchObject({ income: null, expenses: null, savings: null, fromBudget: false });
  });
});
