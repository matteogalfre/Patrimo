/**
 * Revenus passifs : dividendes reçus et intérêts estimés des livrets
 * (fonctions pures).
 *
 * La projection sur 12 mois suppose que les actifs encore détenus versent les
 * mêmes dividendes que sur les 12 derniers mois : c'est une estimation, pas
 * une promesse, et l'écran le dit.
 */

import { ASSET_TYPES } from './assets';

const DAY = 24 * 60 * 60 * 1000;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const DUST = 1e-9;

/** Quantité détenue d'un actif dans une enveloppe à une date. */
const quantityAt = (transactions, assetId, account, time) => transactions.reduce((q, tx) => {
  if (tx.assetId !== assetId || tx.account !== account || new Date(tx.date).getTime() > time) return q;
  const n = Math.abs(Number(tx.quantity) || 0);
  return q + (tx.side === 'sell' ? -n : n);
}, 0);

/**
 * Dividendes attendus sur les 12 prochains mois. Chaque versement des 12
 * derniers mois d'un titre encore détenu revient un an plus tard, ajusté à la
 * quantité détenue aujourd'hui (montant par action × quantité actuelle).
 * Les sociétés versent en général aux mêmes périodes d'une année sur l'autre ;
 * le montant, lui, peut changer : c'est une estimation.
 *
 * @returns {{items: object[], months: Array<{key: string, month: number, year: number, total: number}>, total: number}}
 */
export const upcomingDividends = ({ dividends = [], transactions = [], fx, today = new Date() }) => {
  const now = today.getTime();
  const yearAgo = now - 365 * DAY;
  const items = [];
  dividends.forEach((d) => {
    const time = new Date(d.date).getTime();
    if (!d.assetId || time <= yearAgo || time > now) return;
    const current = quantityAt(transactions, d.assetId, d.account, now);
    if (current <= DUST) return;
    const then = quantityAt(transactions, d.assetId, d.account, time);
    const ratio = then > DUST ? current / then : 1;
    const next = new Date(time);
    next.setFullYear(next.getFullYear() + 1);
    const rate = fx.now(d.currency) || 0;
    items.push({
      assetId: d.assetId,
      symbol: d.symbol,
      name: d.name || d.symbol,
      account: d.account,
      date: next.toISOString(),
      amount: d.amount * ratio * rate,
      basedOn: d.date,
    });
  });
  items.sort((a, b) => (a.date < b.date ? -1 : 1));

  // Les 12 prochains mois, mois en cours compris, même vides.
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push({ key: monthKey(d), month: d.getMonth(), year: d.getFullYear(), total: 0 });
  }
  const index = new Map(months.map((m, i) => [m.key, i]));
  items.forEach((it) => {
    const i = index.get(monthKey(new Date(it.date)));
    if (i !== undefined) months[i].total += it.amount;
  });
  return { items, months, total: items.reduce((s, it) => s + it.amount, 0) };
};

/**
 * @param {object} params
 * @param {object[]} params.dividends
 * @param {{at: Function}} params.fx
 * @param {object[]} params.positions - positions calculées par le moteur
 * @param {number} [params.cashYearlyInterest] - intérêts annuels estimés des livrets
 * @param {Date} [params.today]
 */
export const computeIncome = ({ dividends = [], transactions = null, fx, positions = [], cashYearlyInterest = 0, today = new Date() }) => {
  const yearAgo = today.getTime() - 365 * DAY;
  const held = new Set(positions.filter((p) => p.isHeld).map((p) => p.assetId));

  const list = dividends
    .map((d) => ({ ...d, value: d.amount * (fx.at(d.currency, d.date) || 0), time: new Date(d.date).getTime() }))
    .sort((a, b) => a.time - b.time);

  // Douze derniers mois, mois en cours compris, même vides.
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ key: monthKey(d), month: d.getMonth(), year: d.getFullYear(), total: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  const years = new Map();
  const assets = new Map();
  let ttm = 0;
  let ttmHeld = 0;
  let total = 0;

  list.forEach((d) => {
    const date = new Date(d.time);
    total += d.value;
    const mi = monthIndex.get(monthKey(date));
    if (mi !== undefined) months[mi].total += d.value;
    years.set(date.getFullYear(), (years.get(date.getFullYear()) || 0) + d.value);
    if (d.time > yearAgo) {
      ttm += d.value;
      if (held.has(d.assetId)) ttmHeld += d.value;
    }
    const key = d.assetId || `orphan:${d.symbol || '?'}`;
    if (!assets.has(key)) {
      assets.set(key, { assetId: d.assetId, symbol: d.symbol, name: d.name || d.symbol, total: 0, count: 0, last: null });
    }
    const a = assets.get(key);
    a.total += d.value;
    a.count += 1;
    a.last = d.date;
  });

  // Avec les opérations, la projection suit les quantités détenues aujourd'hui.
  const upcoming = transactions ? upcomingDividends({ dividends, transactions, fx, today }) : null;
  const projectedDividends = upcoming ? upcoming.total : ttmHeld;

  const stocks = positions.filter((p) => p.isHeld && p.assetType === ASSET_TYPES.STOCK);
  const stockCost = stocks.reduce((s, p) => s + p.costBasis, 0);
  const stockValue = stocks.reduce((s, p) => s + p.value, 0);

  return {
    total,
    ttm,
    months,
    years: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, value]) => ({ year, total: value })),
    byAsset: [...assets.values()].sort((a, b) => b.total - a.total),
    yieldOnCost: stockCost > 0 ? (ttmHeld / stockCost) * 100 : 0,
    currentYield: stockValue > 0 ? (ttmHeld / stockValue) * 100 : 0,
    upcoming,
    projectedDividends,
    projectedInterest: cashYearlyInterest,
    projected: projectedDividends + cashYearlyInterest,
  };
};
