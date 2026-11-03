/**
 * Liquidités et épargne : livrets, comptes courants, assurance-vie en fonds
 * euros... (fonctions pures).
 *
 * Pas d'opérations ici : on ne suit pas chaque virement. Un compte garde
 * l'historique des soldes que l'utilisateur a saisis ; entre deux saisies, le
 * solde est supposé constant. C'est ce qui permet de tracer le patrimoine dans
 * le temps sans relevé bancaire.
 */

import { officialRate } from './regulatedRates';
import { formatDateKey } from '../utils/formatters';

// `broker` : l'argent non investi qui attend sur un PEA ou un compte-titres.
export const CASH_KINDS = Object.freeze(['livretA', 'ldds', 'lep', 'current', 'broker', 'term', 'lifeInsurance', 'other']);

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
};

const toIsoDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Un solde par jour au plus : la dernière saisie du jour l'emporte. */
const normalizeHistory = (history) => {
  const byDay = new Map();
  (Array.isArray(history) ? history : []).forEach((h) => {
    const date = toIsoDate(h?.date);
    const balance = toNum(h?.balance);
    if (!date || balance === null) return;
    byDay.set(formatDateKey(date), { date, balance });
  });
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
};

/** Remet un compte au format interne, ou null s'il est inutilisable. */
export const normalizeCashAccount = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const history = normalizeHistory(raw.history);
  if (!name || !history.length) return null;
  const rate = toNum(raw.rate);
  return {
    id: String(raw.id || ''),
    name,
    kind: CASH_KINDS.includes(raw.kind) ? raw.kind : 'other',
    institution: raw.institution ? String(raw.institution).trim() : null,
    currency: String(raw.currency || 'EUR').toUpperCase(),
    rate: rate !== null && rate >= 0 ? rate : null,
    history,
    createdAt: raw.createdAt || history[0].date,
    updatedAt: raw.updatedAt || null,
  };
};

/** Ajoute (ou remplace, si même jour) un solde dans l'historique. */
export const withBalance = (account, balance, date = new Date()) => ({
  ...account,
  history: normalizeHistory([...(account.history || []), { date: new Date(date).toISOString(), balance }]),
});

/** Solde connu à une date : dernière saisie à ou avant ce jour, sinon 0. */
export const cashBalanceAt = (account, date) => {
  const key = formatDateKey(date);
  let balance = 0;
  for (const h of account.history || []) {
    if (formatDateKey(h.date) > key) break;
    balance = h.balance;
  }
  return balance;
};

export const currentBalance = (account) => {
  const h = account.history || [];
  return h.length ? h[h.length - 1].balance : 0;
};

/**
 * Valorisation dans la devise de référence.
 * @param {{accounts: object[], fx: {now: Function}}} params
 */
export const computeCash = ({ accounts = [], fx, today = new Date() }) => {
  const list = accounts.map((a) => {
    const balance = currentBalance(a);
    const value = balance * (fx.now(a.currency) || 0);
    // Livret A, LDDS, LEP : le taux officiel du moment, pas celui saisi.
    const official = officialRate(a.kind, today);
    const rate = official ? official.rate : a.rate;
    return {
      ...a,
      customRate: a.rate,
      rate,
      rateSince: official?.since || null,
      balance,
      value,
      lastUpdate: a.history[a.history.length - 1]?.date || null,
      // Intérêts annuels estimés au taux du compte, pour donner un ordre d'idée.
      yearlyInterest: rate > 0 ? (value * rate) / 100 : 0,
    };
  });
  return {
    accounts: list.sort((x, y) => y.value - x.value),
    total: list.reduce((s, a) => s + a.value, 0),
    yearlyInterest: list.reduce((s, a) => s + a.yearlyInterest, 0),
  };
};

/**
 * Valeur des liquidités à chaque date, pour le graphique.
 *
 * Un compte ajouté aujourd'hui existait déjà avant : avec `backfill`, son
 * premier solde connu vaut aussi pour les dates antérieures. Sinon, tout le
 * solde apparaîtrait d'un coup le jour de la saisie et la courbe ferait un
 * saut qui n'a jamais eu lieu.
 */
export const cashValueSeries = ({ accounts = [], dates = [], fx, backfill = true }) => dates.map((date) => accounts.reduce(
  (sum, a) => {
    const before = backfill && formatDateKey(date) < formatDateKey(a.history[0]?.date);
    const balance = before ? a.history[0].balance : cashBalanceAt(a, date);
    return sum + balance * (fx.at(a.currency, date) || 0);
  },
  0,
));
