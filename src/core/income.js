/**
 * Revenus passifs : dividendes reçus et intérêts estimés des livrets
 * (fonctions pures).
 *
 * La projection sur 12 mois suppose que les actifs encore détenus versent les
 * mêmes dividendes que sur les 12 derniers mois : c'est une estimation, pas
 * une promesse, et l'écran le dit.
 */

import { ASSET_TYPES } from './assets';
import { netFrenchDividend } from './taxRates';
import { formatDateKey } from '../utils/formatters';

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

/**
 * Dividendes probablement reçus mais pas encore saisis. Règle : un titre
 * encore détenu qui a versé un dividende il y a environ un an en reverse un à
 * la même période ; si la date anniversaire est passée (depuis moins de
 * 4 mois) et qu'aucun dividende de ce titre n'est saisi autour de cette
 * date, on le propose, montant ajusté à la quantité détenue. La fenêtre de
 * 4 mois rattrape aussi un oubli de l'été sans ressortir les vieux versements.
 *
 * @param {{dividends: object[], transactions: object[], today?: Date, dismissed?: string[]}} params
 * @returns {Array<{key: string, assetId: string, symbol: string, name: string, account: string, date: string, amount: number, currency: string}>}
 */
export const dueDividends = ({ dividends = [], transactions = [], today = new Date(), dismissed = [] }) => {
  const now = today.getTime();
  const MATCH = 45 * DAY;
  const out = [];
  dividends.forEach((d) => {
    if (!d.assetId) return;
    const next = new Date(d.date);
    next.setFullYear(next.getFullYear() + 1);
    const due = next.getTime();
    if (due > now || now - due > 120 * DAY) return;
    const key = `${d.assetId}:${monthKey(next)}`;
    if (dismissed.includes(key) || out.some((x) => x.key === key)) return;
    const already = dividends.some((x) => x.assetId === d.assetId && Math.abs(new Date(x.date).getTime() - due) <= MATCH);
    if (already) return;
    const current = quantityAt(transactions, d.assetId, d.account, now);
    if (current <= DUST) return;
    const then = quantityAt(transactions, d.assetId, d.account, new Date(d.date).getTime());
    const ratio = then > DUST ? current / then : 1;
    out.push({
      key,
      assetId: d.assetId,
      symbol: d.symbol,
      name: d.name || d.symbol,
      account: d.account,
      date: next.toISOString(),
      amount: Math.round(d.amount * ratio * 100) / 100,
      currency: d.currency,
    });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Le dividende attendu pour un versement saisi à une date : le dernier
 * détachement des 120 jours précédents, multiplié par les parts détenues la
 * veille (il faut les avoir avant le détachement). Sur un PEA, le net est le
 * brut ; sur un compte-titres, pour une société française, la banque retient
 * l'acompte d'impôt et les prélèvements sociaux. Ailleurs, la retenue du
 * pays d'origine n'est pas connue : seul le brut est donné.
 * @param {{events: Array<{date: string, amount: number}>, date: any, sharesAt: (dateKey: string) => number, account: string, symbol: string}} params
 * @returns {{exDate: string, perShare: number, shares: number, gross: number, net: number|null}|null}
 */
export const expectedDividend = ({ events = [], date, sharesAt, account, symbol }) => {
  const day = formatDateKey(date);
  const limit = new Date(`${day}T12:00:00`).getTime() - 120 * DAY_MS;
  const event = [...events]
    .filter((e) => e.date <= day && new Date(`${e.date}T12:00:00`).getTime() >= limit)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!event) return null;
  const before = formatDateKey(new Date(new Date(`${event.date}T12:00:00`).getTime() - DAY_MS));
  const shares = Number(sharesAt(before)) || 0;
  if (!(shares > 0)) return null;
  const gross = Math.round(shares * event.amount * 100) / 100;
  const year = new Date(`${day}T12:00:00`).getFullYear();
  let net = null;
  if (account === 'PEA') net = gross;
  else if (/\.PA$/i.test(symbol || '')) net = Math.round(netFrenchDividend(gross, year) * 100) / 100;
  return { exDate: event.date, perShare: event.amount, shares, gross, net };
};
