/**
 * « Et si j'avais tout mis sur un indice ? » (fonctions pures).
 *
 * On rejoue tes propres versements, aux mêmes dates et pour les mêmes
 * montants : chaque achat achète des parts d'un ETF indiciel au cours du
 * jour, chaque vente en revend pour le même montant. L'ETF de référence est
 * capitalisant (il réinvestit ses dividendes) ; en face, on ajoute à ta
 * valeur les dividendes que tu as touchés. Les deux se comparent donc à
 * argent égal et à dates égales.
 */

import { officialRate } from './regulatedRates';
import { xirr } from './performance';
import { formatDateKey } from '../utils/formatters';

const DAY = 24 * 60 * 60 * 1000;

/** ETF capitalisants en euros, cotés depuis longtemps, un par grand indice. */
export const BENCHMARKS = Object.freeze([
  { key: 'world', symbol: 'IWDA.AS', name: 'iShares Core MSCI World' },
  { key: 'sp500', symbol: 'SXR8.DE', name: 'iShares Core S&P 500' },
  { key: 'ndx', symbol: 'SXRV.DE', name: 'iShares Nasdaq 100' },
  { key: 'es50', symbol: 'SXRT.DE', name: 'iShares Core Euro Stoxx 50' },
  { key: 'france', symbol: 'CACC.PA', name: 'Amundi CAC 40' },
  { key: 'em', symbol: 'IS3N.DE', name: 'iShares Core MSCI EM IMI' },
  // Sans risque : le taux officiel du Livret A, jour après jour (plafond ignoré).
  { key: 'livretA', symbol: null, name: 'Livret A' },
]);

/**
 * Argent versé (positif) ou retiré (négatif) dans la devise de référence :
 * un achat coûte son montant plus les frais, une vente rapporte son montant
 * moins les frais.
 */
export const contributionFlows = ({ transactions = [], fx }) => transactions
  .filter((tx) => tx.unitPrice > 0 && tx.quantity > 0)
  .map((tx) => {
    const rate = fx.at(tx.currency, tx.date) || 0;
    const gross = tx.quantity * tx.unitPrice;
    const fees = Math.abs(Number(tx.fees) || 0);
    return {
      time: new Date(tx.date).getTime(),
      amount: (tx.side === 'sell' ? -(gross - fees) : gross + fees) * rate,
    };
  })
  .filter((f) => f.amount !== 0)
  .sort((a, b) => a.time - b.time);

/**
 * Valeur d'un euro placé au Livret A depuis `from`, pour chaque jour jusqu'à
 * `to` (intérêts comptés chaque jour au taux en vigueur).
 * @returns {Object<string, number>} 'AAAA-MM-JJ' → valeur de l'euro de départ
 */
export const livretAIndex = (from, to) => {
  const index = {};
  let value = 1;
  const end = new Date(to).getTime();
  for (let t = new Date(from).getTime(); t <= end + DAY / 2; t += DAY) {
    const day = new Date(t);
    index[formatDateKey(day)] = value;
    const rate = officialRate('livretA', day)?.rate || 0;
    value *= 1 + rate / 100 / 365;
  }
  return index;
};

/**
 * Les mêmes versements placés sur la référence.
 * @param {{flows: Array<{time: number, amount: number}>, dates: Date[], priceAt: (key: string) => number|null, today?: Date}} params
 *   priceAt : cours de la référence à une date, dans la devise de référence
 * @returns {{series: number[], value: number, xirr: number|null}|null} xirr en % par an ; null si la référence n'a pas de cours à la date d'un versement
 */
export const shadowPortfolio = ({ flows = [], dates = [], priceAt, today = new Date() }) => {
  if (!flows.length) return null;
  let units = 0;
  let next = 0;
  const step = (until) => {
    while (next < flows.length && flows[next].time <= until) {
      const f = flows[next];
      const price = priceAt(formatDateKey(f.time));
      if (!(price > 0)) return false;
      // Une vente ne peut pas revendre plus de parts qu'on n'en a.
      units = f.amount > 0 ? units + f.amount / price : Math.max(0, units + f.amount / price);
      next += 1;
    }
    return true;
  };
  const series = [];
  for (const d of dates) {
    if (!step(new Date(d).getTime())) return null;
    const price = priceAt(formatDateKey(d));
    series.push(price > 0 ? units * price : null);
  }
  if (!step(today.getTime())) return null;
  const price = priceAt(formatDateKey(today));
  if (!(price > 0)) return null;
  const value = units * price;
  const rate = xirr([...flows.map((f) => ({ time: f.time, amount: -f.amount })), { time: today.getTime(), amount: value }]);
  return { series, value, xirr: rate === null ? null : rate * 100 };
};
