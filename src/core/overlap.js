/**
 * Ce qu'on détient vraiment, à travers ses ETF (fonctions pures) : les
 * sociétés qui pèsent le plus dans le patrimoine, ETF et actions en direct
 * additionnés, et le chevauchement entre deux ETF.
 *
 * Seules les premières lignes de chaque indice sont connues : les poids
 * sont donc des minimums, exacts pour les plus grosses sociétés.
 */

import { INDEX_HOLDINGS, SAME_COMPANY } from '../constants/indexHoldings';
import { classify } from './exposure';

const companyOf = (ticker) => SAME_COMPANY[ticker] || ticker;

/** Poids par société dans un indice, les deux actions d'une société réunies. */
const weightsOf = (profile) => {
  const out = {};
  (INDEX_HOLDINGS[profile] || []).forEach(([ticker, name, weight]) => {
    const key = companyOf(ticker);
    out[key] = { name: out[key]?.name || name, weight: (out[key]?.weight || 0) + weight };
  });
  return out;
};

/**
 * @param {Array<{assetId: string, symbol: string, name: string, assetType: string, value: number}>} holdings
 * @param {{overrides?: object, total?: number, limit?: number}} [opts] - total : base des pourcentages (le patrimoine)
 * @returns {Array<{ticker: string, name: string, value: number, pct: number, sources: Array<{assetId: string, name: string, value: number, direct: boolean}>}>}
 */
export const underlyingCompanies = (holdings = [], { overrides = {}, total, limit = 10 } = {}) => {
  const companies = {};
  const add = (ticker, name, value, source) => {
    const key = companyOf(ticker);
    const c = companies[key] || (companies[key] = { ticker: key, name, value: 0, sources: [] });
    c.value += value;
    c.sources.push({ ...source, value });
  };
  holdings.forEach((h) => {
    if (!(h.value > 0) || h.assetType === 'crypto') return;
    const c = classify(h, overrides[h.assetId]);
    if (c.kind === 'etf') {
      Object.entries(weightsOf(c.profile)).forEach(([ticker, { name, weight }]) => {
        add(ticker, name, (h.value * weight) / 100, { assetId: h.assetId, name: h.name, direct: false });
      });
    } else {
      add(String(h.symbol).toUpperCase(), h.name, h.value, { assetId: h.assetId, name: h.name, direct: true });
    }
  });
  const base = total > 0 ? total : holdings.reduce((s, h) => s + (h.value > 0 ? h.value : 0), 0);
  return Object.values(companies)
    // Une action détenue en direct qu'aucun ETF ne contient n'est pas un chevauchement.
    .filter((c) => c.sources.some((s) => !s.direct) || c.sources.length > 1)
    .map((c) => ({ ...c, pct: base > 0 ? (c.value / base) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
};

/**
 * Chevauchement de deux indices, en % : la part commune (somme des plus
 * petits poids de chaque société). Calculé sur les premières lignes, c'est
 * un minimum.
 */
export const indexOverlap = (a, b) => {
  if (a === b) return 100;
  const wa = weightsOf(a);
  const wb = weightsOf(b);
  return Object.keys(wa).reduce((s, k) => s + (wb[k] ? Math.min(wa[k].weight, wb[k].weight) : 0), 0);
};

/**
 * Les paires d'ETF détenus qui se recoupent.
 * @returns {Array<{a: object, b: object, overlap: number}>}
 */
export const etfPairs = (holdings = [], overrides = {}) => {
  const etfs = holdings
    .filter((h) => h.value > 0 && h.assetType !== 'crypto')
    .map((h) => ({ ...h, profile: classify(h, overrides[h.assetId]).profile }))
    .filter((h) => h.profile && INDEX_HOLDINGS[h.profile]);
  const pairs = [];
  etfs.forEach((a, i) => etfs.slice(i + 1).forEach((b) => {
    const overlap = indexOverlap(a.profile, b.profile);
    if (overlap > 0) pairs.push({ a, b, overlap });
  }));
  return pairs.sort((x, y) => y.overlap - x.overlap);
};
