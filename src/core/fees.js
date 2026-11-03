/**
 * Frais annuels des ETF et fonds (TER), saisis par l'utilisateur (fonctions
 * pures). Les frais sont prélevés chaque jour dans le cours : on ne les voit
 * jamais passer, d'où l'intérêt de les chiffrer en euros.
 */

import { KNOWN_TERS } from '../constants/etfFees';

/**
 * TER d'un actif : celui saisi, sinon une valeur connue (milieu de sa
 * fourchette), sinon rien.
 * @returns {{value: number, min: number, max: number, source: 'manual'|'known'}|null}
 */
export const terInfo = (assetId, manual = {}) => {
  if (manual[assetId] > 0) return { value: manual[assetId], min: manual[assetId], max: manual[assetId], source: 'manual' };
  const known = KNOWN_TERS[assetId];
  return known ? { value: (known.min + known.max) / 2, min: known.min, max: known.max, source: 'known' } : null;
};

/** Tous les TER utilisables : valeurs connues, complétées et remplacées par ceux saisis. */
export const effectiveTers = (manual = {}) => ({
  ...Object.fromEntries(Object.entries(KNOWN_TERS).map(([id, k]) => [id, (k.min + k.max) / 2])),
  ...Object.fromEntries(Object.entries(manual).filter(([, v]) => v > 0)),
});

/**
 * @param {Array<{assetId: string, value: number}>} assets - actifs détenus
 * @param {Object<string, number>} fees - TER en % par actif
 * @param {{years?: number, annualRate?: number}} [opts]
 */
export const computeFees = (assets, fees = {}, { years = 20, annualRate = 5 } = {}) => {
  const lines = assets
    .filter((a) => fees[a.assetId] > 0 && a.value > 0)
    .map((a) => {
      const ter = fees[a.assetId];
      const r = annualRate / 100;
      // Manque à gagner sur la durée : croissance sans frais − avec frais.
      const overYears = a.value * ((1 + r) ** years - (1 + r - ter / 100) ** years);
      return { assetId: a.assetId, ter, yearly: (a.value * ter) / 100, overYears };
    })
    .sort((x, y) => y.yearly - x.yearly);
  const covered = lines.reduce((s, l) => s + (assets.find((a) => a.assetId === l.assetId)?.value || 0), 0);
  return {
    lines,
    yearly: lines.reduce((s, l) => s + l.yearly, 0),
    overYears: lines.reduce((s, l) => s + l.overYears, 0),
    averageTer: covered > 0 ? lines.reduce((s, l) => s + (l.ter * (assets.find((a) => a.assetId === l.assetId)?.value || 0)), 0) / covered : 0,
    years,
  };
};

const DAY = 24 * 60 * 60 * 1000;

// Fonds et ETF : d'après le type de cotation quand il est connu, sinon le nom.
const FUND_NAME = /\b(ETF|UCITS|OPCVM|FCP|SICAV)\b|^(AMUNDI|ISHARES|LYXOR|XTRACKERS|VANGUARD|SPDR|BNP PARIBAS EASY|INVESCO|WISDOMTREE)\b/i;

export const looksLikeFund = ({ name = '', quoteType = '' } = {}) =>
  ['ETF', 'MUTUALFUND'].includes(String(quoteType).toUpperCase()) || FUND_NAME.test(String(name));

/**
 * Frais de courtage payés, dans la devise de référence : sur les 12 derniers
 * mois, par année, par enveloppe, et les ordres où ils pèsent le plus.
 * @param {{transactions: object[], fx: object, today?: Date, threshold?: number}} params
 *   threshold : part des frais (en % du montant) au-delà de laquelle un ordre est signalé
 */
export const brokerageFees = ({ transactions = [], fx, today = new Date(), threshold = 1 }) => {
  const since = today.getTime() - 365 * DAY;
  const last12 = { fees: 0, amount: 0 };
  const byYear = {};
  const byAccount = {};
  const orders = [];
  transactions.forEach((tx) => {
    const price = Number(tx.unitPrice) || 0;
    const qty = Math.abs(Number(tx.quantity) || 0);
    const rate = fx.at(tx.currency, tx.date) || 0;
    const fees = Math.abs(Number(tx.fees) || 0) * rate;
    const amount = qty * price * rate;
    if (!(amount > 0)) return;
    const time = new Date(tx.date).getTime();
    const year = new Date(tx.date).getFullYear();
    byYear[year] = byYear[year] || { year, fees: 0, amount: 0 };
    byYear[year].fees += fees;
    byYear[year].amount += amount;
    if (time >= since) {
      last12.fees += fees;
      last12.amount += amount;
      byAccount[tx.account] = byAccount[tx.account] || { account: tx.account, fees: 0, amount: 0 };
      byAccount[tx.account].fees += fees;
      byAccount[tx.account].amount += amount;
    }
    const pct = (fees / amount) * 100;
    if (fees > 0 && pct > threshold) orders.push({ tx, fees, amount, pct });
  });
  const withPct = (x) => ({ ...x, pct: x.amount > 0 ? (x.fees / x.amount) * 100 : 0 });
  return {
    last12: withPct(last12),
    byYear: Object.values(byYear).sort((a, b) => a.year - b.year).map(withPct),
    byAccount: Object.values(byAccount).filter((a) => a.fees > 0).sort((a, b) => b.fees - a.fees).map(withPct),
    expensiveOrders: orders.sort((a, b) => b.pct - a.pct).slice(0, 10),
  };
};

/**
 * Tous les frais en un coup d'œil : TER des ETF et courtage, par an et en
 * manque à gagner sur `years` ans (ce que cet argent aurait rapporté placé).
 * @param {object} params
 * @param {Array<{assetId: string, name: string, value: number}>} params.assets - actifs détenus
 * @param {Object<string, number>} params.fees - TER saisis, en %
 */
export const scanFees = ({ assets = [], fees = {}, transactions = [], fx, totalValue = 0, years = 20, annualRate = 5, today = new Date() }) => {
  const ter = computeFees(assets, fees, { years, annualRate });
  const brokerage = brokerageFees({ transactions, fx, today });
  const r = annualRate / 100;
  const brokerageYearly = brokerage.last12.fees;
  // Chaque année de frais aurait pu être placée : valeur future d'une rente.
  const brokerageOverYears = brokerageYearly > 0 ? brokerageYearly * (((1 + r) ** years - 1) / r) : 0;
  const yearly = ter.yearly + brokerageYearly;
  return {
    ter,
    brokerage,
    yearly,
    overYears: ter.overYears + brokerageOverYears,
    pctOfWealth: totalValue > 0 ? (yearly / totalValue) * 100 : 0,
    missingTer: assets.filter((a) => a.value > 0 && looksLikeFund(a) && !(fees[a.assetId] > 0)),
    years,
  };
};
