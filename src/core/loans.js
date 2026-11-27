/**
 * Crédits (fonctions pures) : prêt immobilier, prêt auto, prêt étudiant,
 * crédit conso… Un crédit à mensualités constantes : le montant emprunté,
 * le taux nominal, la durée et la date de la première échéance suffisent à
 * connaître la mensualité, le capital restant dû à une date, les intérêts
 * payés et à venir. L'assurance est une somme fixe par mois, à part du
 * capital. `share` : la part du crédit qui te revient (50 % d'un crédit à
 * deux), pour le patrimoine net.
 */

import { normalizeNumber } from '../utils/parseNumber';

export const LOAN_KINDS = Object.freeze(['mortgage', 'consumer', 'car', 'student', 'works', 'zeroRate', 'other']);

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? normalizeNumber(v, 'fr-FR') : v);
  return Number.isFinite(n) ? n : null;
};
const toIso = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Remet un crédit au format interne, ou null s'il est inutilisable. */
export const normalizeLoan = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const amount = toNum(raw.amount);
  const months = Math.round(toNum(raw.months) || 0);
  const rate = toNum(raw.rate);
  const startDate = toIso(raw.startDate);
  if (!name || !(amount > 0) || !(months > 0) || rate === null || rate < 0 || !startDate) return null;
  const monthly = toNum(raw.monthly);
  const share = toNum(raw.share);
  return {
    id: String(raw.id || ''),
    name,
    kind: LOAN_KINDS.includes(raw.kind) ? raw.kind : 'other',
    institution: raw.institution ? String(raw.institution).trim() : null,
    amount,
    rate,
    months,
    startDate,
    insurance: Math.max(0, toNum(raw.insurance) || 0),
    monthly: monthly > 0 ? monthly : null,
    share: share > 0 && share <= 100 ? share : 100,
    propertyId: raw.propertyId ? String(raw.propertyId) : null,
    createdAt: raw.createdAt || startDate,
    updatedAt: raw.updatedAt || null,
  };
};

/** Mensualité hors assurance d'un prêt à mensualités constantes. */
export const monthlyPayment = ({ amount, rate, months }) => {
  if (!(amount > 0) || !(months > 0)) return 0;
  const r = rate / 100 / 12;
  if (r === 0) return amount / months;
  return (amount * r) / (1 - (1 + r) ** -months);
};

/** Capital restant dû après k échéances. */
const remainingAfter = ({ amount, rate }, payment, k) => {
  const r = rate / 100 / 12;
  if (r === 0) return Math.max(0, amount - payment * k);
  const growth = (1 + r) ** k;
  return Math.max(0, amount * growth - (payment * (growth - 1)) / r);
};

/** Échéances payées à une date : la première tombe à `startDate`. */
export const paymentsMade = (loan, today = new Date()) => {
  const start = new Date(loan.startDate);
  const now = new Date(today);
  if (now < start) return 0;
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
    + (now.getDate() >= start.getDate() ? 1 : 0);
  return Math.max(0, Math.min(loan.months, months));
};

const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

/**
 * Où en est un crédit à une date.
 * @returns {{payment: number, monthlyTotal: number, paid: number, left: number, remaining: number, interestPaid: number, interestLeft: number, totalInterest: number, totalInsurance: number, totalCost: number, endDate: string, progress: number, done: boolean}}
 */
export const loanStatus = (loan, today = new Date()) => {
  const payment = loan.monthly || monthlyPayment(loan);
  const paid = paymentsMade(loan, today);
  const remaining = paid >= loan.months ? 0 : remainingAfter(loan, payment, paid);
  const totalPaid = payment * loan.months;
  const totalInterest = Math.max(0, totalPaid - loan.amount);
  const principalPaid = loan.amount - remaining;
  const interestPaid = Math.max(0, payment * paid - principalPaid);
  return {
    payment,
    monthlyTotal: payment + loan.insurance,
    paid,
    left: loan.months - paid,
    remaining,
    interestPaid,
    interestLeft: Math.max(0, totalInterest - interestPaid),
    totalInterest,
    totalInsurance: loan.insurance * loan.months,
    totalCost: totalInterest + loan.insurance * loan.months,
    endDate: addMonths(loan.startDate, loan.months - 1).toISOString(),
    progress: loan.amount > 0 ? principalPaid / loan.amount : 1,
    done: paid >= loan.months,
  };
};

/**
 * Remboursement anticipé d'une somme aujourd'hui : soit on garde la
 * mensualité et le crédit finit plus tôt, soit on garde la durée et la
 * mensualité baisse. Hors indemnités de remboursement anticipé (souvent
 * 3 % du capital remboursé, plafonnées à 6 mois d'intérêts).
 * @returns {{shorter: {months: number, interestSaved: number}, lower: {payment: number, interestSaved: number}}|null}
 */
export const earlyRepayment = (loan, extra, today = new Date()) => {
  const s = loanStatus(loan, today);
  if (!(extra > 0) || s.done || s.remaining <= 0) return null;
  const capital = Math.max(0, s.remaining - extra);
  const r = loan.rate / 100 / 12;
  const interestBefore = s.payment * s.left - s.remaining;
  if (capital <= 0) return { shorter: { months: s.left, interestSaved: interestBefore }, lower: { payment: 0, interestSaved: interestBefore } };
  // Même mensualité : combien d'échéances restent ?
  const monthsLeft = r === 0
    ? Math.ceil(capital / s.payment)
    : Math.ceil(-Math.log(1 - (capital * r) / s.payment) / Math.log(1 + r));
  const lastMonths = Math.max(1, monthsLeft);
  const interestShorter = s.payment * lastMonths - capital;
  // Même durée : nouvelle mensualité.
  const newPayment = monthlyPayment({ amount: capital, rate: loan.rate, months: s.left });
  const interestLower = newPayment * s.left - capital;
  return {
    shorter: { months: Math.max(0, s.left - lastMonths), interestSaved: Math.max(0, interestBefore - interestShorter) },
    lower: { payment: newPayment, interestSaved: Math.max(0, interestBefore - interestLower) },
  };
};

/** Capital restant dû de tous les crédits (ta part), et mensualités. */
export const computeDebts = (loans = [], today = new Date()) => {
  const items = loans.map((loan) => ({ ...loan, status: loanStatus(loan, today) }));
  const mine = (x) => x.share / 100;
  return {
    items,
    remaining: items.reduce((s, x) => s + x.status.remaining * mine(x), 0),
    monthly: items.filter((x) => !x.status.done).reduce((s, x) => s + x.status.monthlyTotal * mine(x), 0),
  };
};
