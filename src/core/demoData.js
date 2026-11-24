/**
 * Données de démonstration (fonction pure) : un petit patrimoine d'environ
 * 5 000 € pour essayer l'app ou la montrer sans dévoiler le sien. Un ETF
 * monde acheté chaque mois sur PEA, deux actions françaises avec leurs
 * dividendes, une action américaine, du bitcoin et de l'ether, un Livret A.
 *
 * Les dates suivent le jour courant. Les prix d'achat sont les clôtures du
 * jour quand l'historique est fourni ; sinon le prix reste vide et l'app le
 * complète au chargement des cours.
 *
 * La planification d'exemple (profil, budget, objectif, achat programmé)
 * remplace aussi la vraie en mode démo : montrer l'app ne doit rien dévoiler.
 */

import { ASSET_TYPES, makeAssetId } from './assets';
import { estimateFees } from './brokerFees';
import { rateAt } from './fx';
import { formatDateKey } from '../utils/formatters';
import { budgetTotals, defaultBudget } from './budget';

const S = ASSET_TYPES.STOCK;
const C = ASSET_TYPES.CRYPTO;

export const DEMO_ASSETS = [
  { assetType: S, symbol: 'WPEA.PA', name: 'iShares MSCI World Swap PEA UCITS ETF', currency: 'EUR', fallback: 5.5 },
  { assetType: S, symbol: 'MC.PA', name: 'LVMH', currency: 'EUR', fallback: 600 },
  { assetType: S, symbol: 'TTE.PA', name: 'TotalEnergies', currency: 'EUR', fallback: 55 },
  { assetType: S, symbol: 'AAPL', name: 'Apple', currency: 'USD', fallback: 220 },
  { assetType: C, symbol: 'BTC', name: 'Bitcoin', currency: 'USD', fallback: 90000 },
  { assetType: C, symbol: 'ETH', name: 'Ethereum', currency: 'USD', fallback: 3000 },
].map((a) => ({ ...a, assetId: makeAssetId(a.assetType, a.symbol) }));

const RULES = { PEA: { type: 'tariff', id: 'boursedirect' }, CTO: { type: 'tariff', id: 'boursedirect' }, CRYPTO: { type: 'tariff', id: 'binance' } };
const INSTITUTIONS = { PEA: 'boursedirect', CTO: 'boursedirect', CRYPTO: 'binance' };

const monthsAgo = (today, months, day) => new Date(today.getFullYear(), today.getMonth() - months, day, 10);

/**
 * @param {{today?: Date, series?: Object<string, Object<string, number>>}} params
 *   series : clôtures par actif (assetId → { 'AAAA-MM-JJ': prix })
 * @returns {{transactions: object[], dividends: object[], cashAccounts: object[]}}
 */
export const buildDemoData = ({ today = new Date(), series = {} } = {}) => {
  const asset = Object.fromEntries(DEMO_ASSETS.map((a) => [a.symbol, a]));
  const priceAt = (a, date) => {
    const s = series[a.assetId];
    const keys = s ? Object.keys(s).sort() : [];
    const key = formatDateKey(date);
    return keys.length && key >= keys[0] ? rateAt(s, key, keys) : null;
  };

  const transactions = [];
  // `qty` : nombre fixe de titres ; `amount` : montant investi, en devise de cotation.
  const buy = (symbol, account, date, { qty, amount }) => {
    if (date > today) return;
    const a = asset[symbol];
    const price = priceAt(a, date);
    const ref = price || a.fallback;
    const quantity = qty || (a.assetType === C ? Math.round((amount / ref) * 1e6) / 1e6 : Math.max(1, Math.floor(amount / ref)));
    const fees = estimateFees({
      rule: RULES[account], amount: quantity * ref, side: 'buy', symbol, assetType: a.assetType, date, currency: a.currency, account,
    });
    transactions.push({
      id: `demo_tx_${symbol}_${formatDateKey(date)}`,
      assetType: a.assetType,
      symbol,
      name: a.name,
      account,
      side: 'buy',
      quantity,
      unitPrice: price,
      fees: price && fees ? fees.total : 0,
      currency: a.currency,
      date: date.toISOString(),
      priceSource: 'market',
    });
    return quantity;
  };

  // ETF monde : 100 € par mois depuis un an.
  for (let m = 12; m >= 1; m -= 1) buy('WPEA.PA', 'PEA', monthsAgo(today, m, 5), { amount: 100 });
  const lvmh = buy('MC.PA', 'PEA', monthsAgo(today, 20, 14), { qty: 2 });
  const total = buy('TTE.PA', 'PEA', monthsAgo(today, 16, 9), { qty: 10 });
  buy('AAPL', 'CTO', monthsAgo(today, 14, 20), { qty: 3 });
  buy('BTC', 'CRYPTO', monthsAgo(today, 18, 2), { amount: 300 });
  buy('BTC', 'CRYPTO', monthsAgo(today, 6, 2), { amount: 300 });
  buy('ETH', 'CRYPTO', monthsAgo(today, 10, 12), { amount: 250 });

  // Dividendes : LVMH (solde fin avril, acompte début décembre), TotalEnergies chaque trimestre.
  const dividends = [];
  const pay = (symbol, date, perShare, shares, bought) => {
    if (!shares || date <= bought || date > today) return;
    dividends.push({
      id: `demo_div_${symbol}_${formatDateKey(date)}`,
      symbol,
      name: asset[symbol].name,
      account: 'PEA',
      amount: Math.round(perShare * shares * 100) / 100,
      currency: 'EUR',
      date: date.toISOString(),
    });
  };
  const lvmhDate = monthsAgo(today, 20, 14);
  const totalDate = monthsAgo(today, 16, 9);
  for (let y = today.getFullYear() - 2; y <= today.getFullYear(); y += 1) {
    pay('MC.PA', new Date(y, 3, 28, 10), 7.5, lvmh, lvmhDate);
    pay('MC.PA', new Date(y, 11, 4, 10), 5.5, lvmh, lvmhDate);
    [0, 3, 6, 9].forEach((month) => pay('TTE.PA', new Date(y, month, 3, 10), 0.85, total, totalDate));
  }

  const cashAccounts = [{
    id: 'demo_cash_livreta',
    name: 'Livret A',
    kind: 'livretA',
    currency: 'EUR',
    history: [
      { date: monthsAgo(today, 12, 1).toISOString(), balance: 700 },
      { date: monthsAgo(today, 3, 1).toISOString(), balance: 1000 },
    ],
  }];

  return { transactions, dividends, cashAccounts };
};

/** Réponses au questionnaire de la personne fictive : la trentaine, salariée, un achat immobilier en vue. */
export const DEMO_PROFILE = Object.freeze({
  age: 32,
  work: 'stable',
  household: 'couple',
  income: 2200,
  expenses: 1650,
  debts: ['none'],
  projects: ['home'],
  homeWhen: 'later',
  goal: 'growth',
  drop: 'wait',
  blocker: 'none',
  experience: 'funds',
  crypto: 'little',
  tax: '11',
});

/**
 * Planification d'exemple, au format de PlanningContext. Les libellés viennent
 * des traductions, pour que le budget s'affiche dans la langue de l'app.
 * @param {{labels: object, goalName: string, today?: Date}} params
 *   labels : les libellés du budget par défaut (`budget.defaults`)
 */
export const buildDemoPlanning = ({ labels, goalName, today = new Date() }) => {
  const world = DEMO_ASSETS.find((a) => a.symbol === 'WPEA.PA');
  // Le même achat que l'exemple : 100 € le 5 du mois sur le PEA.
  const plans = [{
    id: 'demo_plan_world',
    assetId: world.assetId,
    assetType: world.assetType,
    symbol: world.symbol,
    name: world.name,
    account: 'PEA',
    amount: 100,
    day: 5,
    active: true,
    handled: [],
  }];
  const budget = defaultBudget({
    labels,
    income: DEMO_PROFILE.income,
    expenses: DEMO_PROFILE.expenses,
    plans: [{ name: labels.etf, amount: 100 }, { name: labels.savings, amount: 50 }],
  });
  const goalDate = new Date(today.getFullYear() + 5, today.getMonth(), 1, 10);
  return {
    goals: [{ id: 'demo_goal_home', name: goalName, target: 20000, date: goalDate.toISOString(), kind: 'home' }],
    monthlyExpenses: budgetTotals(budget).expenses,
    targets: null,
    plans,
    fees: {},
    exposure: {},
    dismissedDividends: [],
    brokerRules: { ...RULES },
    accountInstitutions: { ...INSTITUTIONS },
    ttf: true,
    reminders: { plans: true, cash: false },
    marketRules: {},
    profile: { answers: { ...DEMO_PROFILE }, completedAt: today.toISOString() },
    budget,
    onboarded: true,
  };
};
