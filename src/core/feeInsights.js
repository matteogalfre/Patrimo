/**
 * Ce qu'on peut dire de ses frais (fonctions pures) : leur niveau face aux
 * repères du marché, et ce que les mêmes ordres auraient coûté chez les
 * autres courtiers du catalogue.
 */

import { estimateFees, tariffsFor } from './brokerFees';
import { looksLikeFund } from './fees';

/**
 * Niveaux de TER moyen (en % par an). Un ETF indiciel coûte en général
 * entre 0,05 et 0,50 %, un fonds actif bien plus.
 */
export const TER_LEVELS = Object.freeze([
  { max: 0.1, key: 'veryLow' },
  { max: 0.25, key: 'low' },
  { max: 0.5, key: 'average' },
  { max: Infinity, key: 'high' },
]);

/**
 * Niveaux de courtage, en % du montant des ordres. 0,1 % : 1 € pour 1 000 €
 * investis ; au-delà de 0,6 %, les petits ordres coûtent cher.
 */
export const BROKERAGE_LEVELS = Object.freeze([
  { max: 0.1, key: 'veryLow' },
  { max: 0.3, key: 'low' },
  { max: 0.6, key: 'average' },
  { max: Infinity, key: 'high' },
]);

export const levelOf = (value, levels) => levels.find((l) => value <= l.max).key;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Les ordres d'une enveloppe repassés à chaque grille du catalogue : ce
 * qu'ils ont coûté, et ce qu'ils auraient coûté ailleurs (TTF comprise
 * partout, pour comparer ce qui se compare). Une grille qui ne couvre pas
 * tous les ordres (marché américain, par exemple) est laissée de côté.
 * Les 12 derniers mois, ou tout l'historique s'il n'y a rien de récent.
 * @returns {{account: string, period: 'last12'|'all', orders: number, amount: number, paid: number, options: Array<{tariff: object, total: number}>}|null}
 */
export const compareBrokers = ({ transactions = [], fx, account, ttf = true, today = new Date() }) => {
  const all = transactions.filter((tx) => tx.account === account && tx.unitPrice > 0 && tx.quantity > 0);
  const since = today.getTime() - 365 * DAY;
  const recent = all.filter((tx) => new Date(tx.date).getTime() >= since);
  const orders = recent.length ? recent : all;
  if (!orders.length) return null;

  const rateOf = (tx) => fx.at(tx.currency, tx.date) || 0;
  const amount = orders.reduce((s, tx) => s + tx.quantity * tx.unitPrice * rateOf(tx), 0);
  const paid = orders.reduce((s, tx) => s + (Number(tx.fees) || 0) * rateOf(tx), 0);

  const options = tariffsFor(account, null).map((tariff) => {
    let total = 0;
    for (const tx of orders) {
      const est = estimateFees({
        rule: { type: 'tariff', id: tariff.id },
        amount: tx.quantity * tx.unitPrice,
        side: tx.side,
        symbol: tx.symbol,
        assetType: tx.assetType,
        date: new Date(tx.date),
        currency: tx.currency,
        account,
        ttf,
        fund: looksLikeFund(tx),
      });
      if (!est) return null;
      total += est.total * rateOf(tx);
    }
    return { tariff, total };
  }).filter(Boolean).sort((a, b) => a.total - b.total);

  return { account, period: recent.length ? 'last12' : 'all', orders: orders.length, amount, paid, options };
};

/**
 * Économie annuelle face à des fonds au TER `benchmarkTer` (un fonds actif
 * moyen, par exemple), pour les mêmes montants.
 * @param {{lines: Array<{assetId: string, ter: number, yearly: number}>}} ter - résultat de computeFees
 * @param {Array<{assetId: string, value: number}>} assets
 */
export const savingsVersus = (ter, assets, benchmarkTer) => {
  const value = ter.lines.reduce((s, l) => s + (assets.find((a) => a.assetId === l.assetId)?.value || 0), 0);
  const saving = (value * benchmarkTer) / 100 - ter.yearly;
  return saving > 0 ? { value, saving } : null;
};

/**
 * Où se situe un TER parmi les ETF de référence du même indice.
 * @param {number} ter - en %
 * @param {Array<{ter: number, pea: boolean, name: string}>} peers
 * @returns {{min: number, max: number, rank: 'cheapest'|'cheaper'|'pricier'|'priciest', cheapestPea: object|null}|null}
 */
export const peerComparison = (ter, peers = []) => {
  if (!(ter > 0) || !peers.length) return null;
  const sorted = peers.map((p) => p.ter).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const rank = ter <= min ? 'cheapest' : ter <= median ? 'cheaper' : ter <= max ? 'pricier' : 'priciest';
  const cheapestPea = peers.filter((p) => p.pea).sort((a, b) => a.ter - b.ter)[0] || null;
  return { min, max, rank, cheapestPea };
};

/**
 * Les achats des 12 prochains mois, chez chaque courtier : un ordre par mois
 * et par ligne. Les lignes viennent des achats programmés ; sans eux, de
 * l'investissement mensuel du budget, réparti comme les achats des 12
 * derniers mois. Chez un courtier qui propose un plan d'investissement
 * automatique, c'est le moins cher des deux qui compte.
 *
 * @param {{plans?: object[], transactions?: object[], monthlyInvest?: number, fx: object, ttf?: boolean, rules?: object, today?: Date}} params
 *   rules : règle de frais actuelle de chaque enveloppe (pour « ton courtier »)
 * @returns {{source: 'plans'|'budget', monthly: number, accounts: Array<{account: string, lines: object[], monthly: number, current: number|null, options: Array<{tariff: object, total: number, viaPlan: boolean}>}>}|null}
 */
export const nextPurchasesCost = ({ plans = [], transactions = [], monthlyInvest = 0, fx, ttf = true, rules = {}, today = new Date() }) => {
  const currencyOf = (assetId) => {
    const last = transactions.filter((tx) => tx.assetId === assetId).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return last?.currency || 'EUR';
  };
  const fundOf = (assetId) => {
    const last = transactions.find((tx) => tx.assetId === assetId);
    return last ? looksLikeFund(last) : false;
  };

  let source = 'plans';
  let lines = plans
    .filter((p) => p.active !== false && Number(p.amount) > 0 && p.account)
    .map((p) => ({ account: p.account, assetId: p.assetId, symbol: p.symbol, assetType: p.assetType, amount: Number(p.amount) }));

  if (!lines.length && monthlyInvest > 0) {
    // Comme tes achats des 12 derniers mois : mêmes lignes, mêmes proportions.
    source = 'budget';
    const since = today.getTime() - 365 * DAY;
    const byLine = new Map();
    transactions
      .filter((tx) => tx.side !== 'sell' && tx.unitPrice > 0 && tx.quantity > 0 && new Date(tx.date).getTime() >= since)
      .forEach((tx) => {
        const key = `${tx.account}|${tx.assetId}`;
        const prev = byLine.get(key) || { account: tx.account, assetId: tx.assetId, symbol: tx.symbol, assetType: tx.assetType, spent: 0 };
        // Sans taux de change connu, un achat compte quand même (1 pour 1) plutôt que pas du tout.
        prev.spent += tx.quantity * tx.unitPrice * (fx.at(tx.currency, tx.date) || 1);
        byLine.set(key, prev);
      });
    const top = [...byLine.values()].sort((a, b) => b.spent - a.spent).slice(0, 6);
    const spent = top.reduce((s, l) => s + l.spent, 0);
    lines = spent > 0
      ? top.map((l) => ({ ...l, amount: Math.round(((monthlyInvest * l.spent) / spent) / 10) * 10 })).filter((l) => l.amount >= 10)
      : [];
  }
  if (!lines.length) return null;

  // Une ligne au tarif d'une règle, en devise de référence, sur 12 mois.
  const yearlyFee = (rule, line, account, plan) => {
    let currency = currencyOf(line.assetId);
    let rate = fx.now(currency) || 0;
    // Sans taux de change (hors ligne), on estime dans la devise de référence.
    if (!(rate > 0)) {
      currency = fx.base || 'EUR';
      rate = 1;
    }
    const est = estimateFees({
      rule,
      amount: line.amount / rate,
      side: 'buy',
      symbol: line.symbol,
      assetType: line.assetType,
      date: today,
      currency,
      account,
      ttf,
      plan,
      fund: fundOf(line.assetId),
    });
    return est ? est.total * rate * 12 : null;
  };

  const accounts = [...new Set(lines.map((l) => l.account))].map((account) => {
    const mine = lines.filter((l) => l.account === account);
    const options = tariffsFor(account, null).map((tariff) => {
      const rule = { type: 'tariff', id: tariff.id };
      let total = 0;
      let viaPlan = false;
      for (const line of mine) {
        const manual = yearlyFee(rule, line, account, false);
        const auto = tariff.plan ? yearlyFee(rule, line, account, true) : null;
        if (manual == null && auto == null) return null;
        const best = Math.min(manual ?? Infinity, auto ?? Infinity);
        if (auto != null && auto < (manual ?? Infinity)) viaPlan = true;
        total += best;
      }
      return { tariff, total, viaPlan };
    }).filter(Boolean).sort((a, b) => a.total - b.total);
    let current = null;
    if (rules[account]) {
      current = 0;
      for (const line of mine) {
        const fee = yearlyFee(rules[account], line, account, false);
        if (fee == null) { current = null; break; }
        current += fee;
      }
    }
    return { account, lines: mine, monthly: mine.reduce((s, l) => s + l.amount, 0), current, options };
  }).filter((a) => a.options.length);

  return accounts.length ? { source, monthly: lines.reduce((s, l) => s + l.amount, 0), accounts } : null;
};
