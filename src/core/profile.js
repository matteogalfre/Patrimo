/**
 * Profil d'investisseur et plan d'action (fonctions pures).
 *
 * Le questionnaire mesure deux choses, comme le font les conseillers :
 *  - la capacité à prendre des risques (horizon, objectif, stabilité des
 *    revenus) : ce que la situation permet ;
 *  - la tolérance au risque (réaction à une baisse, peur, expérience) : ce
 *    qu'on supporte vraiment.
 * Le profil retenu est le plus prudent des deux : on ne prend pas plus de
 * risque qu'on ne peut en porter, ni plus qu'on ne peut en supporter.
 *
 * Le plan d'action applique des règles générales, dans l'ordre où on les
 * conseille d'habitude (dettes chères, épargne de précaution, projets
 * proches, enveloppes, investissement), aux chiffres réels de l'app. Ce sont
 * des repères pédagogiques : aucun produit n'est recommandé.
 */

import { officialRate } from './regulatedRates';
import { availableCash } from './cash';

export const PROFILES = Object.freeze(['prudent', 'moderate', 'balanced', 'dynamic', 'bold']);

/** Part en actions visée pour l'argent placé à long terme, par niveau (1 à 5). */
export const STOCK_SHARE = Object.freeze([20, 40, 60, 80, 95]);

/**
 * Les questions, dans l'ordre. `when` : affichée seulement si la condition
 * est remplie ; `amount` : saisie au curseur, `choice` : un choix,
 * `multi` : plusieurs.
 */
export const QUESTIONS = Object.freeze([
  { id: 'age', type: 'amount', min: 18, max: 80, step: 1, initial: 30, icon: 'person-outline' },
  { id: 'work', type: 'choice', options: ['stable', 'contract', 'freelance', 'student', 'retired', 'jobless'], icon: 'briefcase-outline' },
  { id: 'household', type: 'choice', options: ['single', 'couple', 'coupleKids', 'singleKids'], icon: 'home-outline' },
  { id: 'income', type: 'amount', min: 0, max: 12000, step: 100, initial: 2500, money: true, icon: 'cash-outline' },
  { id: 'expenses', type: 'amount', min: 300, max: 10000, step: 50, initial: 1500, money: true, icon: 'cart-outline' },
  { id: 'debts', type: 'multi', options: ['none', 'mortgage', 'consumer', 'revolving', 'student'], exclusive: 'none', icon: 'card-outline' },
  { id: 'debtRate', type: 'choice', options: ['low', 'mid', 'high', 'unknown'], when: (a) => a.debts?.includes('consumer'), icon: 'trending-up-outline' },
  { id: 'projects', type: 'multi', options: ['none', 'home', 'car', 'bigSpend'], exclusive: 'none', icon: 'flag-outline' },
  { id: 'homeWhen', type: 'choice', options: ['soon', 'later'], when: (a) => a.projects?.includes('home'), icon: 'key-outline' },
  { id: 'goal', type: 'choice', options: ['safety', 'project', 'growth', 'retirement', 'income'], icon: 'compass-outline' },
  { id: 'drop', type: 'choice', options: ['sellAll', 'sellSome', 'wait', 'buyMore'], icon: 'pulse-outline' },
  { id: 'blocker', type: 'choice', options: ['fear', 'lost', 'time', 'none'], icon: 'help-circle-outline' },
  { id: 'experience', type: 'choice', options: ['never', 'savings', 'funds', 'expert'], icon: 'school-outline' },
  { id: 'crypto', type: 'choice', options: ['no', 'little', 'believer'], icon: 'logo-bitcoin' },
  { id: 'tax', type: 'choice', options: ['0', '11', '30', '41', 'unknown'], icon: 'document-text-outline' },
]);

/** Les questions à poser pour ces réponses (les conditionnelles comprises). */
export const visibleQuestions = (answers = {}) => QUESTIONS.filter((q) => !q.when || q.when(answers));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @returns {{capacity: number, tolerance: number, level: number, profile: string}} niveaux de 1 à 5
 */
export const scoreProfile = (a = {}) => {
  const age = Number(a.age) || 30;
  const goalScore = {
    safety: 1,
    project: 2,
    income: 3,
    growth: 5,
    // Préparer sa retraite à 30 ans laisse 30 ans devant soi ; à 60, presque plus.
    retirement: age < 45 ? 5 : age < 55 ? 4 : age < 62 ? 3 : 2,
  }[a.goal] ?? 3;
  const stability = { stable: 0, student: 0, contract: -1, freelance: -1, jobless: -2, retired: -1 }[a.work] ?? 0;
  // Après 60 ans, l'horizon raccourcit quel que soit l'objectif.
  const ageCap = age >= 70 ? 2 : age >= 60 ? 3 : 5;
  const capacity = clamp(Math.min(goalScore + stability, ageCap), 1, 5);

  const reaction = { sellAll: 1, sellSome: 2, wait: 4, buyMore: 5 }[a.drop] ?? 3;
  const fear = a.blocker === 'fear' ? -1 : 0;
  const novice = a.experience === 'never' ? -1 : 0;
  const tolerance = clamp(reaction + fear + novice, 1, 5);

  const level = Math.min(capacity, tolerance);
  return { capacity, tolerance, level, profile: PROFILES[level - 1] };
};

/** Mois de dépenses à garder de côté : plus quand les revenus sont incertains ou qu'une famille en dépend. */
export const emergencyMonths = (a = {}) => {
  let months = { stable: 3, retired: 3, student: 3, contract: 6, freelance: 6, jobless: 6 }[a.work] ?? 3;
  if (a.household === 'singleKids' || (a.household === 'coupleKids' && months < 6)) months += 1;
  return Math.min(6, months);
};

/** Part de crypto à ne pas dépasser, en % du patrimoine : seulement ce qu'on peut perdre en entier. */
export const cryptoCap = (a = {}, level = 3) => {
  if (a.crypto === 'no') return 0;
  if (a.crypto === 'little') return level <= 2 ? 2 : 5;
  return level <= 2 ? 5 : level === 3 ? 7 : 10;
};

/**
 * Plan d'action, du plus urgent au moins urgent. Chaque étape dit si elle
 * est faite, à faire, ou à surveiller, avec les chiffres qui vont avec.
 * @param {object} answers - réponses au questionnaire
 * @param {{
 *   cashAccounts?: Array<{kind: string, value: number}>,
 *   stockValue?: number, cryptoValue?: number, totalValue?: number,
 *   hasPea?: boolean, averageTer?: number, brokeragePct?: number,
 *   topCountryPct?: number, topStockPct?: number,
 * }} data - patrimoine réel
 * @returns {Array<{key: string, status: 'todo'|'warning'|'done'|'info', params?: object, route?: string}>}
 */
export const buildPlan = (a = {}, data = {}) => {
  const { level } = scoreProfile(a);
  const plan = [];
  const push = (key, status, params = {}, route = null) => plan.push({ key, status, params, route });
  const debts = a.debts || [];
  const projects = a.projects || [];
  const expenses = Number(a.expenses) || 0;
  const income = Number(a.income) || 0;
  const cashAccounts = data.cashAccounts || [];
  const liquid = availableCash(cashAccounts);
  const stock = data.stockValue || 0;
  const crypto = data.cryptoValue || 0;
  const total = data.totalValue || liquid + stock + crypto;

  // 1. Les dettes chères coûtent plus qu'un placement ne rapporte.
  if (debts.includes('revolving')) push('revolving', 'todo');
  if (debts.includes('consumer') && (a.debtRate === 'high' || a.debtRate === 'unknown')) push('expensiveDebt', 'todo', { unknown: a.debtRate === 'unknown' });

  // 2. Épargne de précaution, sur des livrets disponibles tout de suite.
  const months = emergencyMonths(a);
  const target = expenses * months;
  const homeSoon = projects.includes('home') && a.homeWhen === 'soon';
  if (expenses > 0) {
    if (liquid < target) push('emergency', 'todo', { months, target, missing: target - liquid });
    else push('emergencyDone', 'done', { months, covered: liquid / expenses });
  }

  // 3. L'argent des projets proches ne va pas en bourse.
  if (homeSoon) push('homeSoon', 'todo', { maxPayment: Math.max(0, income * 0.35) });
  else if (projects.includes('home')) push('homeLater', 'info');
  if (projects.includes('car') || projects.includes('bigSpend')) push('shortProject', 'info');

  // 4. Le LEP, le meilleur livret, si les revenus le permettent.
  const hasLep = cashAccounts.some((c) => c.kind === 'lep');
  const lepIncome = { single: 2000, singleKids: 2800, couple: 3000, coupleKids: 3800 }[a.household] ?? 2000;
  if (!hasLep && income > 0 && income <= lepIncome) push('lep', 'todo', { rate: officialRate('lep', data.today || new Date())?.rate });

  // Le reste suppose de pouvoir investir à long terme.
  const longTerm = ['growth', 'retirement', 'income'].includes(a.goal) && level >= 2;
  const fundamentalsOk = !debts.includes('revolving') && !(debts.includes('consumer') && a.debtRate === 'high');

  // 5. Les enveloppes : le PEA prend date dès l'ouverture, le PER sert surtout aux tranches hautes.
  if (longTerm) {
    if (data.hasPea) push('peaDone', 'done');
    else push('pea', 'todo');
    if ((a.tax === '30' || a.tax === '41') && (a.goal === 'retirement' || Number(a.age) >= 35)) push('per', 'info', { tmi: Number(a.tax) });
  }

  // 6. Investir le surplus, petit à petit si l'idée fait peur.
  const surplus = liquid - target;
  if (longTerm && fundamentalsOk && !homeSoon && expenses > 0 && surplus > expenses) {
    push(a.blocker === 'fear' || a.blocker === 'lost' ? 'investGradually' : 'investSurplus', 'todo', { amount: surplus }, a.blocker === 'fear' ? 'Plans' : 'Projection');
  }

  // 7. Répartition : actions face au profil, crypto face à sa limite.
  const invested = stock + crypto;
  const investable = Math.max(0, total - Math.min(liquid, target));
  if (investable > 0 && invested > 0) {
    const stockShare = (stock / investable) * 100;
    const wanted = STOCK_SHARE[level - 1];
    if (stockShare > wanted + 15) push('tooRisky', 'warning', { current: stockShare, wanted }, 'Rebalance');
    else if (stockShare < wanted - 25 && longTerm) push('tooSafe', 'info', { current: stockShare, wanted }, 'Rebalance');
  }
  const cap = cryptoCap(a, level);
  const cryptoPct = total > 0 ? (crypto / total) * 100 : 0;
  if (crypto > 0 && cryptoPct > cap) push('cryptoHigh', 'warning', { current: cryptoPct, cap }, 'Rebalance');

  // 8. Diversification et frais, sur ce qui est déjà investi.
  if (stock > 0 && data.topCountryPct > 70) push('concentrationCountry', 'warning', { pct: data.topCountryPct }, 'Diversification');
  if (stock > 0 && data.topStockPct > 15) push('concentrationStock', 'warning', { pct: data.topStockPct }, 'Diversification');
  if (data.averageTer > 0.5 || data.brokeragePct > 0.6) push('fees', 'warning', { ter: data.averageTer || 0 }, 'Fees');

  // 9. Les outils du long terme.
  if (a.goal === 'retirement' || a.goal === 'growth') push('independence', 'info', {}, 'Independence');
  if (a.goal === 'income') push('passiveIncome', 'info', {}, 'PassiveIncome');

  return plan;
};

/**
 * Répartition cible du patrimoine entier pour le rééquilibrage : l'épargne
 * de précaution en liquidités, puis le reste selon le profil.
 * @returns {{stock: number, crypto: number, cash: number}} en %, total 100
 */
export const profileTargets = (a = {}, { total = 0 } = {}) => {
  const { level } = scoreProfile(a);
  const reserve = (Number(a.expenses) || 0) * emergencyMonths(a);
  const rest = Math.max(0, total - reserve);
  const reservePct = total > 0 ? Math.min(100, (reserve / total) * 100) : 0;
  const crypto = Math.min(cryptoCap(a, level), rest > 0 ? 100 - reservePct : 0);
  const stock = ((100 - reservePct) * STOCK_SHARE[level - 1]) / 100;
  const round = (v) => Math.round(v);
  const s = round(Math.max(0, stock - crypto));
  const c = round(crypto);
  return { stock: s, crypto: c, cash: 100 - s - c };
};
