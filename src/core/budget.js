/**
 * Budget du mois (fonctions pures) : revenus, investissements, dépenses, le
 * taux d'épargne qui en découle, et la mise en page d'un diagramme de
 * Sankey (les flux de chaque euro, de gauche à droite).
 *
 *  - taux d'épargne : ce qui est investi chaque mois ÷ revenus ;
 *  - taux d'épargne possible : ce qui reste une fois les dépenses payées ÷
 *    revenus (investi ou pas encore) ;
 *  - reste : revenus − dépenses − investissements.
 */

import { computeInvestedSeries } from './engine';

const sum = (list) => list.reduce((s, x) => s + (Number(x.amount) > 0 ? Number(x.amount) : 0), 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30.44 * DAY_MS;

/**
 * Ce qui a vraiment été investi par mois sur les derniers mois (achats moins
 * ventes, frais compris), à comparer avec l'investissement prévu au budget.
 * Avec moins d'un mois d'opérations, rien : la saisie de départ d'un
 * portefeuille existant n'est pas un rythme d'investissement.
 * @returns {{perMonth: number, months: number}|null}
 */
export const realInvesting = ({ transactions = [], fx, today = new Date(), months = 3 }) => {
  const dated = transactions.filter((tx) => Number(tx.quantity) > 0 && Number(tx.unitPrice) > 0);
  if (!dated.length || !fx) return null;
  const first = Math.min(...dated.map((tx) => new Date(tx.date).getTime()));
  const end = new Date(today).getTime();
  if (end - first < MONTH_MS) return null;
  // La veille du début : les opérations du premier jour comptent dans la période.
  const from = Math.max(end - months * MONTH_MS, first - DAY_MS);
  const span = Math.max(1, (end - from) / MONTH_MS);
  const [start, now] = computeInvestedSeries({ transactions: dated, dates: [new Date(from), new Date(end)], fx });
  return { perMonth: (now - start) / span, months: Math.round(span) };
};

export const groupTotal = (group) => sum(group.items || []);

export const budgetTotals = (budget) => {
  const income = sum(budget?.incomes || []);
  const groups = budget?.groups || [];
  const invest = groups.filter((g) => g.kind === 'invest').reduce((s, g) => s + groupTotal(g), 0);
  const expenses = groups.filter((g) => g.kind === 'expense').reduce((s, g) => s + groupTotal(g), 0);
  return {
    income,
    invest,
    expenses,
    available: income - expenses - invest,
    savingsRate: income > 0 ? (invest / income) * 100 : 0,
    possibleRate: income > 0 ? ((income - expenses) / income) * 100 : 0,
  };
};

// Des nœuds de 8 px aux bouts arrondis, et 6 px de vide entre un nœud et ses flux.
const NODE_WIDTH = 8;
const LINK_GAP = 6;

/**
 * Mise en page du Sankey, en quatre colonnes : les revenus, le budget, les
 * catégories (investissements, dépenses, reste), les postes. Le diagramme
 * garde une largeur confortable (on le fait glisser sur un téléphone), pour
 * des courbes longues et des étiquettes qui ne se marchent pas dessus.
 *
 * Chaque catégorie et chaque poste a sa place réservée, au moins la hauteur
 * de son étiquette : l'étiquette reste en face de son nœud. L'épaisseur des
 * flux reste proportionnelle : un euro a la même épaisseur partout.
 *
 * Les flux partent collés de leur nœud et se séparent
 * d'eux-mêmes vers des nœuds espacés ; les investissements passent avant
 * les dépenses. Couleurs : une palette parcourue colonne par colonne (le
 * n-ième nœud de la colonne c prend la teinte c + n) ; un flux prend la
 * couleur de son départ, sauf du budget vers une dépense (teinte crème).
 * @param {object} budget
 * @param {{width: number, colors: {palette: string[], expenseFlow: string}, flowHeight?: number, slot?: number, gap?: number, minFirstSpan?: number}} size
 *   minFirstSpan : largeur minimale entre revenus et budget (leurs étiquettes s'y font face)
 *   flowHeight : hauteur du budget ; slot : place minimale d'une étiquette
 * @returns {{nodes: object[], links: object[], height: number}}
 *   nodes : { id, column, x, y, h, value, label, color, parent, kind }
 *   links : { id, source, target, x0, y0, x1, y1, h, color }, y = haut de la bande
 */
export const sankeyLayout = (budget, { width, colors, flowHeight = 230, slot = 18, gap = 6, minFirstSpan = 0 }) => {
  const totals = budgetTotals(budget);
  const incomes = (budget?.incomes || []).filter((x) => Number(x.amount) > 0);
  const groups = (budget?.groups || []).map((g) => ({ ...g, total: groupTotal(g) })).filter((g) => g.total > 0);
  const flow = Math.max(totals.income, totals.invest + totals.expenses);
  if (!(flow > 0)) return { nodes: [], links: [], height: 0 };

  const scale = flowHeight / flow;
  const span = width - NODE_WIDTH;
  // Trois intervalles égaux ; le premier s'élargit si les
  // étiquettes du revenu et du budget, face à face, ne tiennent pas.
  const first = Math.min(Math.round(span * 0.45), Math.max(Math.round(span * 0.33), Math.round(minFirstSpan)));
  const xs = [0, first, Math.round(first + (span - first) / 2), span];

  const tint = (column, index) => colors.palette[(column + index) % colors.palette.length];
  const sources = incomes.map((x, i) => ({ id: x.id, label: x.label, value: Number(x.amount), color: tint(0, i) }));
  // Catégories : investissements d'abord, puis dépenses, puis ce qui reste.
  const ordered = [...groups.filter((g) => g.kind === 'invest'), ...groups.filter((g) => g.kind !== 'invest')];
  const mid = ordered.map((g) => ({ id: g.id, label: g.label, value: g.total, kind: g.kind }));
  if (totals.available > 0) mid.push({ id: '__available', label: null, value: totals.available, kind: 'available' });
  mid.forEach((m, i) => { m.color = tint(2, i); });
  const colorOf = Object.fromEntries(mid.map((m) => [m.id, m.color]));
  // Chaque poste a sa teinte ; le flux qui y mène garde celle de sa catégorie.
  const leaves = ordered.flatMap((g) => g.items
    .filter((it) => Number(it.amount) > 0)
    .map((it) => ({ id: it.id, label: it.label, value: Number(it.amount), parent: g.id, flow: colorOf[g.id] })));
  leaves.forEach((l, i) => { l.color = tint(3, i); });

  const slotsHeight = (list) => list.reduce((s, n) => s + Math.max(n.value * scale, slot), 0) + gap * Math.max(0, list.length - 1);
  const height = Math.ceil(Math.max(flowHeight, slotsHeight(sources), slotsHeight(mid), slotsHeight(leaves)));

  // Chaque nœud au milieu de sa place ; chaque colonne centrée.
  const stack = (list, column) => {
    let top = (height - slotsHeight(list)) / 2;
    return list.map((n) => {
      const h = Math.max(1.5, n.value * scale);
      const room = Math.max(h, slot);
      const node = { ...n, column, x: xs[column], y: top + (room - h) / 2, h };
      top += room + gap;
      return node;
    });
  };

  const budgetNode = { id: '__budget', label: null, value: flow, color: tint(1, 0), column: 1, x: xs[1], y: (height - flowHeight) / 2, h: flowHeight };
  const nodes = [...stack(sources, 0), budgetNode, ...stack(mid, 2), ...stack(leaves, 3)];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const links = [];
  const link = (source, target, sy, ty, h, color) => links.push({
    id: `${source.id}>${target.id}`,
    source: source.id,
    target: target.id,
    x0: source.x + NODE_WIDTH + LINK_GAP,
    y0: sy,
    x1: target.x - LINK_GAP,
    y1: ty,
    h,
    color,
  });

  // Revenus → budget : chaque revenu remplit sa part du budget.
  let into = budgetNode.y;
  nodes.filter((n) => n.column === 0).forEach((n) => {
    link(n, budgetNode, n.y, into, n.h, n.color);
    into += n.h;
  });
  // Budget → catégories : la couleur du budget vers l'investissement, crème vers le reste.
  let out = budgetNode.y;
  nodes.filter((n) => n.column === 2).forEach((n) => {
    link(budgetNode, n, out, n.y, n.h, n.kind === 'invest' ? budgetNode.color : colors.expenseFlow);
    out += n.h;
  });
  // Catégories → postes, dans la couleur de la catégorie.
  const offsets = {};
  nodes.filter((n) => n.column === 3).forEach((n) => {
    const sy = offsets[n.parent] ?? byId[n.parent].y;
    link(byId[n.parent], n, sy, n.y, n.h, n.flow);
    offsets[n.parent] = sy + n.h;
  });

  return { nodes, links, height };
};

export const SANKEY_NODE_WIDTH = NODE_WIDTH;
export const SANKEY_LINK_GAP = LINK_GAP;

/** Bande d'un flux : deux courbes de Bézier reliées, prêtes pour un tracé SVG ou Skia. */
export const linkPath = ({ x0, y0, x1, y1, h }) => {
  const xm = (x0 + x1) / 2;
  return `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h} Z`;
};

let seq = 0;
const newId = (p) => {
  seq += 1;
  return `${p}_${Date.now().toString(36)}${seq}`;
};

/**
 * Budget d'exemple pour démarrer : le revenu du profil, les achats
 * programmés comme investissements, des dépenses types ramenées aux
 * dépenses du profil quand on les connaît.
 * @param {{labels: object, income?: number, expenses?: number, plans?: Array<{name: string, amount: number}>}} params
 */
export const defaultBudget = ({ labels: L, income, expenses, plans = [] }) => {
  const examples = [
    { label: L.housing, items: [[L.rent, 650], [L.utilities, 120]] },
    { label: L.daily, items: [[L.groceries, 300], [L.restaurants, 120]] },
    { label: L.transport, items: [[L.transportItem, 80]] },
    { label: L.subscriptions, items: [[L.phone, 40], [L.leisure, 35]] },
  ];
  const exampleTotal = examples.reduce((s, g) => s + g.items.reduce((a, [, v]) => a + v, 0), 0);
  const ratio = expenses > 0 ? expenses / exampleTotal : 1;
  const round = (v) => Math.max(5, Math.round((v * ratio) / 5) * 5);
  const invest = plans.length
    ? plans.map((p) => ({ id: newId('it'), label: p.name, amount: Math.round(p.amount) }))
    : [{ id: newId('it'), label: L.etf, amount: 200 }, { id: newId('it'), label: L.savings, amount: 100 }];
  return {
    incomes: [{ id: newId('in'), label: L.salary, amount: income > 0 ? income : 2500 }],
    groups: [
      { id: newId('grp'), kind: 'invest', label: L.invest, items: invest },
      ...examples.map((g) => ({
        id: newId('grp'),
        kind: 'expense',
        label: g.label,
        items: g.items.map(([label, v]) => ({ id: newId('it'), label, amount: round(v) })),
      })),
    ],
  };
};

export const newBudgetId = newId;

/**
 * Tes chiffres du mois, une seule fois pour toute l'app : le budget s'il
 * existe (le plus détaillé), sinon les dépenses saisies dans Objectifs,
 * sinon les réponses du questionnaire, sinon ce que l'app mesure.
 * @param {{budget?: object, answers?: object, monthlyExpenses?: number, plans?: object[], measured?: number}} sources
 *   measured : épargne mensuelle mesurée sur 12 mois (opérations et livrets)
 * @returns {{income: number|null, expenses: number|null, invest: number|null, savings: number|null, age: number|null, fromBudget: boolean}}
 *   savings : ce qui peut être mis de côté chaque mois (revenus − dépenses)
 */
export const householdNumbers = ({ budget, answers = {}, monthlyExpenses, plans = [], measured } = {}) => {
  const t = budget ? budgetTotals(budget) : null;
  const pick = (...values) => values.find((v) => Number(v) > 0) ?? null;
  const income = pick(t?.income, answers.income);
  const expenses = pick(t?.expenses, monthlyExpenses, answers.expenses);
  const planned = plans.filter((p) => p.active && p.amount > 0).reduce((s, p) => s + p.amount, 0);
  const invest = t ? t.invest : pick(planned);
  const savings = income && expenses ? Math.max(0, income - expenses) : pick(measured);
  // D'où viennent les montants, pour le dire à l'écran.
  let savingsFrom = null;
  if (t && income && expenses) savingsFrom = 'budget';
  else if (income && expenses) savingsFrom = 'answers';
  else if (savings) savingsFrom = 'measured';
  return {
    income,
    expenses,
    invest,
    savings,
    // Ce qui reste chaque mois sans être ni dépensé ni investi (budget seulement).
    kept: t ? Math.max(0, t.available) : null,
    investFrom: t ? 'budget' : invest ? 'plans' : null,
    savingsFrom,
    age: pick(answers.age),
    fromBudget: !!t,
  };
};
