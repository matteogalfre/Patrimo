/**
 * Immobilier (fonctions pures) : tes biens, leur valeur et ce qu'il reste à
 * rembourser dessus, et un simulateur d'achat.
 *
 * Un bien garde l'historique des estimations que tu saisis (comme le solde
 * d'un livret) ; sans estimation, il vaut son prix d'achat. `share` : ta part
 * du bien (50 % à deux).
 *
 * Repères du simulateur (France, fin 2026) :
 *  - frais de notaire : environ 7 à 8 % dans l'ancien, 2 à 3 % dans le neuf ;
 *  - règle du HCSF : mensualités de crédit, assurance comprise, au plus 35 %
 *    des revenus nets, sur 25 ans au plus ;
 *  - taux moyens relevés par les courtiers en novembre 2026 : environ 3,7 %
 *    sur 20 ans, 3,8 % sur 25 ans, hors assurance.
 */

import { loanStatus, monthlyPayment } from './loans';
import { normalizeNumber } from '../utils/parseNumber';

export const PROPERTY_KINDS = Object.freeze(['main', 'rental', 'secondary', 'parking', 'other']);
export const NOTARY_RATES = Object.freeze({ old: 7.5, new: 2.5 });
export const MAX_DEBT_RATIO = 35;
export const MAX_YEARS = 25;
export const DEFAULT_RATES = Object.freeze({ 15: 3.6, 20: 3.7, 25: 3.8 });
export const DEFAULT_INSURANCE = 0.3; // % du capital emprunté par an

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? normalizeNumber(v, 'fr-FR') : v);
  return Number.isFinite(n) ? n : null;
};
const toIso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Remet un bien au format interne, ou null s'il est inutilisable. */
export const normalizeProperty = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const purchasePrice = toNum(raw.purchasePrice);
  if (!name || !(purchasePrice > 0)) return null;
  const share = toNum(raw.share);
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .map((h) => ({ date: toIso(h?.date), value: toNum(h?.value) }))
    .filter((h) => h.date && h.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    id: String(raw.id || ''),
    name,
    kind: PROPERTY_KINDS.includes(raw.kind) ? raw.kind : 'other',
    city: raw.city ? String(raw.city).trim() : null,
    purchasePrice,
    purchaseDate: toIso(raw.purchaseDate),
    fees: Math.max(0, toNum(raw.fees) || 0),
    works: Math.max(0, toNum(raw.works) || 0),
    share: share > 0 && share <= 100 ? share : 100,
    rent: Math.max(0, toNum(raw.rent) || 0),
    charges: Math.max(0, toNum(raw.charges) || 0),
    history,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

/** Valeur estimée du bien entier : la dernière estimation, sinon le prix d'achat. */
export const propertyValue = (p) => (p.history.length ? p.history[p.history.length - 1].value : p.purchasePrice);

/** Ajoute (ou remplace, si même jour) une estimation. */
export const withEstimate = (p, value, date = new Date()) => {
  const day = new Date(date).toISOString().slice(0, 10);
  const history = p.history.filter((h) => h.date.slice(0, 10) !== day);
  history.push({ date: new Date(date).toISOString(), value });
  return { ...p, history: history.sort((a, b) => (a.date < b.date ? -1 : 1)) };
};

/**
 * Tes biens et ce qu'il reste à rembourser dessus.
 * @returns {{value: number, debt: number, equity: number, rentMonthly: number, items: object[]}}
 *   value : ta part de la valeur ; debt : ta part des crédits liés ; equity : la différence
 */
export const computeRealEstate = ({ properties = [], loans = [], today = new Date() }) => {
  const items = properties.map((p) => {
    const full = propertyValue(p);
    const value = (full * p.share) / 100;
    const linked = loans.filter((l) => l.propertyId === p.id);
    const debt = linked.reduce((s, l) => s + (loanStatus(l, today).remaining * l.share) / 100, 0);
    const cost = ((p.purchasePrice + p.fees + p.works) * p.share) / 100;
    return { ...p, fullValue: full, value, debt, equity: value - debt, cost, gain: value - cost, loans: linked };
  });
  return {
    items,
    value: items.reduce((s, x) => s + x.value, 0),
    debt: items.reduce((s, x) => s + x.debt, 0),
    equity: items.reduce((s, x) => s + x.equity, 0),
    rentMonthly: items.reduce((s, x) => s + (x.rent * x.share) / 100, 0),
  };
};

/**
 * Simulation d'un achat : frais, montant à emprunter, mensualité, taux
 * d'endettement et coût du crédit.
 * @param {{price: number, kind?: 'old'|'new', works?: number, contribution?: number, rate: number, years: number, insuranceRate?: number, income?: number, otherLoans?: number}} p
 *   income : revenus nets mensuels du foyer ; otherLoans : autres mensualités en cours
 */
export const simulatePurchase = ({ price, kind = 'old', works = 0, contribution = 0, rate, years, insuranceRate = DEFAULT_INSURANCE, income = 0, otherLoans = 0 }) => {
  const notary = (Math.max(0, price) * (NOTARY_RATES[kind] ?? NOTARY_RATES.old)) / 100;
  const total = Math.max(0, price) + notary + Math.max(0, works);
  const loan = Math.max(0, total - Math.max(0, contribution));
  const months = Math.round(years * 12);
  const payment = monthlyPayment({ amount: loan, rate, months });
  const insurance = (loan * insuranceRate) / 100 / 12;
  const monthlyTotal = payment + insurance;
  const debtRatio = income > 0 ? ((monthlyTotal + Math.max(0, otherLoans)) / income) * 100 : null;
  const totalInterest = Math.max(0, payment * months - loan);
  const totalInsurance = insurance * months;
  return {
    notary,
    total,
    loan,
    payment,
    insurance,
    monthlyTotal,
    debtRatio,
    withinRules: debtRatio != null && debtRatio <= MAX_DEBT_RATIO && years <= MAX_YEARS,
    totalInterest,
    totalInsurance,
    totalCost: totalInterest + totalInsurance,
    contributionPct: total > 0 ? (Math.max(0, contribution) / total) * 100 : 0,
    // Les banques demandent souvent que l'apport couvre au moins les frais.
    coversFees: Math.max(0, contribution) >= notary,
    leftToLive: income > 0 ? income - monthlyTotal - Math.max(0, otherLoans) : null,
  };
};

/**
 * Le prix le plus élevé finançable en restant à 35 % d'endettement.
 * @returns {{price: number, loan: number, monthlyTotal: number}|null}
 */
export const maxPurchase = ({ income, otherLoans = 0, contribution = 0, rate, years, insuranceRate = DEFAULT_INSURANCE, kind = 'old', works = 0 }) => {
  const budget = (income * MAX_DEBT_RATIO) / 100 - Math.max(0, otherLoans);
  if (!(income > 0) || !(budget > 0)) return null;
  const months = Math.round(Math.min(years, MAX_YEARS) * 12);
  // Mensualité + assurance pour 1 € emprunté.
  const perEuro = monthlyPayment({ amount: 1, rate, months }) + insuranceRate / 100 / 12;
  const loan = budget / perEuro;
  const notaryRate = (NOTARY_RATES[kind] ?? NOTARY_RATES.old) / 100;
  const price = Math.max(0, (loan + Math.max(0, contribution) - Math.max(0, works)) / (1 + notaryRate));
  return { price, loan, monthlyTotal: budget };
};
