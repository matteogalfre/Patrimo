/**
 * Performance réelle du portefeuille (fonctions pures).
 *
 *  - Rendement annualisé (TRI, « XIRR ») : le taux qui égalise l'argent versé
 *    et retiré, à ses dates, avec la valeur d'aujourd'hui. Contrairement au
 *    simple « plus-value ÷ investi », il tient compte du temps : 10 % gagnés en
 *    un an ne valent pas 10 % gagnés en cinq ans.
 *  - Performance par année : gain de l'année (valeur de fin − valeur de début
 *    − apports nets + dividendes) et rendement selon la méthode de Dietz
 *    modifiée, qui pondère chaque apport par le temps passé investi.
 */

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365.25 * DAY;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Flux vus de l'investisseur, dans la devise de référence : un achat est une
 * sortie d'argent (négatif), une vente ou un dividende une entrée (positif).
 */
export const investorFlows = ({ transactions = [], dividends = [], fx }) => {
  const flows = [];
  transactions.forEach((tx) => {
    const price = num(tx.unitPrice);
    if (!(price > 0)) return;
    const qty = Math.abs(num(tx.quantity));
    const fees = Math.abs(num(tx.fees));
    const rate = fx.at(tx.currency, tx.date) || 0;
    const amount = tx.side === 'sell' ? (qty * price - fees) * rate : -(qty * price + fees) * rate;
    flows.push({ time: new Date(tx.date).getTime(), amount });
  });
  dividends.forEach((d) => {
    flows.push({ time: new Date(d.date).getTime(), amount: num(d.amount) * (fx.at(d.currency, d.date) || 0) });
  });
  return flows.sort((a, b) => a.time - b.time);
};

/**
 * Taux annuel r tel que Σ flux / (1 + r)^années = 0. Newton, puis dichotomie
 * si Newton ne converge pas. Null si le taux n'a pas de sens (pas d'apport,
 * ou moins d'un mois d'historique).
 * @param {Array<{time: number, amount: number}>} flows
 */
export const xirr = (flows) => {
  const list = flows.filter((f) => f.amount !== 0);
  if (list.length < 2 || !list.some((f) => f.amount < 0) || !list.some((f) => f.amount > 0)) return null;
  const t0 = list[0].time;
  if (list[list.length - 1].time - t0 < 30 * DAY) return null;
  const years = list.map((f) => (f.time - t0) / YEAR);
  const npv = (r) => list.reduce((s, f, i) => s + f.amount / (1 + r) ** years[i], 0);
  const dnpv = (r) => list.reduce((s, f, i) => s - (years[i] * f.amount) / (1 + r) ** (years[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 50; i += 1) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (next <= -0.999) break;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }

  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
};

/**
 * Rendement annualisé du portefeuille, en %.
 *
 * Avec `toToday` (coefficient d'inflation d'une date à aujourd'hui), chaque
 * flux est d'abord converti en euros d'aujourd'hui : on obtient le rendement
 * réel, celui du pouvoir d'achat.
 * @param {{transactions: object[], dividends: object[], fx: object, value: number, today?: Date, toToday?: (time: number) => number}} params
 */
export const annualizedReturn = ({ transactions, dividends, fx, value, today = new Date(), toToday = null }) => {
  const flows = investorFlows({ transactions, dividends, fx })
    .map((f) => (toToday ? { ...f, amount: f.amount * toToday(f.time) } : f));
  if (value > 0) flows.push({ time: today.getTime(), amount: value });
  const r = xirr(flows);
  return r === null ? null : r * 100;
};

/**
 * Gain et rendement de chaque année civile.
 * @param {object} params
 * @param {(date: Date) => number} params.valueAt - valeur du périmètre à une date
 * @returns {Array<{year: number, gain: number, pct: number|null, partial: boolean}>}
 */
export const yearlyPerformance = ({ transactions = [], dividends = [], fx, valueAt, today = new Date() }) => {
  const flows = investorFlows({ transactions, dividends: [], fx });
  const divFlows = investorFlows({ transactions: [], dividends, fx });
  if (!flows.length) return [];
  const firstYear = new Date(flows[0].time).getFullYear();
  const out = [];
  for (let year = firstYear; year <= today.getFullYear(); year += 1) {
    const start = new Date(year - 1, 11, 31, 23, 59, 59);
    const end = year === today.getFullYear() ? today : new Date(year, 11, 31, 23, 59, 59);
    const span = end - start;
    const v0 = valueAt(start);
    const v1 = valueAt(end);
    let contributions = 0;
    let weighted = 0;
    flows.forEach((f) => {
      if (f.time <= start.getTime() || f.time > end.getTime()) return;
      const contribution = -f.amount; // un achat est un apport
      contributions += contribution;
      weighted += contribution * ((end.getTime() - f.time) / span);
    });
    const received = divFlows
      .filter((f) => f.time > start.getTime() && f.time <= end.getTime())
      .reduce((s, f) => s + f.amount, 0);
    const gain = v1 - v0 - contributions + received;
    const base = v0 + weighted;
    out.push({ year, gain, pct: base > 1 ? (gain / base) * 100 : null, partial: year === today.getFullYear() });
  }
  return out;
};

/**
 * Ce qu'a rapporté un achat précis depuis son jour : la quantité achetée
 * au cours d'aujourd'hui, face à ce qu'elle a coûté (frais compris), le tout
 * dans la devise de référence (le change compte, comme pour une position).
 * @param {{quantity: number, unitPrice: number, fees?: number, currency: string, date: any}} tx
 * @param {{price: number, currency: string, fx: {now: Function, at: Function}}} market
 * @returns {{gain: number, pct: number, value: number, cost: number}|null}
 */
export const sincePurchase = (tx, { price, currency, fx }) => {
  const qty = Number(tx?.quantity);
  const unit = Number(tx?.unitPrice);
  if (!(qty > 0) || !(unit > 0) || !(price > 0) || !fx) return null;
  const rateThen = fx.at(tx.currency, tx.date);
  const rateNow = fx.now(currency);
  if (!(rateThen > 0) || !(rateNow > 0)) return null;
  const cost = (qty * unit + Math.abs(Number(tx.fees) || 0)) * rateThen;
  const value = qty * price * rateNow;
  return { gain: value - cost, pct: ((value - cost) / cost) * 100, value, cost };
};
