/**
 * Conversion de devises vers la devise de référence (fonctions pures).
 *
 * Tous les montants du moteur sont exprimés dans UNE devise de référence
 * (l'euro par défaut). Un coût d'achat est converti au taux du JOUR de
 * l'opération, une valeur actuelle au taux du jour : la différence est l'effet
 * de change, que l'investisseur subit réellement. Convertir les deux au taux
 * du jour, comme le faisait l'ancien StockTrackr, l'effaçait.
 *
 * Convention des taux : `rate` = combien vaut 1 unité de la devise en devise
 * de référence (1 USD = 0,92 EUR → USD: 0.92 quand la référence est l'EUR).
 */

import { formatDateKey } from '../utils/formatters';

/**
 * Certaines places cotent en sous-unité : Londres en pence (GBp / GBX),
 * Johannesburg en cents (ZAc), Tel-Aviv en agorot (ILA). On ramène tout à la
 * devise principale, sinon une action londonienne vaut 100 fois trop.
 */
const SUB_UNITS = {
  GBp: { currency: 'GBP', divisor: 100 },
  GBX: { currency: 'GBP', divisor: 100 },
  ZAc: { currency: 'ZAR', divisor: 100 },
  ZAC: { currency: 'ZAR', divisor: 100 },
  ILA: { currency: 'ILS', divisor: 100 },
};

/**
 * @param {string} code - devise telle que renvoyée par la source de cours
 * @returns {{currency: string, divisor: number}}
 */
export const normalizeQuoteCurrency = (code) => {
  if (!code) return { currency: 'USD', divisor: 1 };
  const sub = SUB_UNITS[code];
  if (sub) return sub;
  return { currency: String(code).toUpperCase(), divisor: 1 };
};

/** Taux le plus récent connu à `dateKey` (même jour, sinon jour ouvré précédent). */
export const rateAt = (series, dateKey, sortedKeys = null) => {
  if (!series) return null;
  if (series[dateKey] > 0) return series[dateKey];
  const keys = sortedKeys || Object.keys(series).sort();
  if (!keys.length) return null;
  let lo = 0;
  let hi = keys.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= dateKey) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Avant le début de la série : le premier taux connu est le meilleur repli.
  return series[keys[best >= 0 ? best : 0]] || null;
};

/**
 * Construit un convertisseur vers la devise de référence.
 *
 * @param {object} params
 * @param {string} params.base - devise de référence (ex. 'EUR')
 * @param {Object<string, number>} [params.latest] - taux actuels par devise
 * @param {Object<string, Object<string, number>>} [params.history] - taux par devise et par jour
 * @returns {{base: string, now: (cur: string) => number|null, at: (cur: string, date: any) => number|null}}
 */
export const createFxConverter = ({ base, latest = {}, history = {} }) => {
  const sortedKeys = {};
  const keysOf = (cur) => {
    if (!sortedKeys[cur]) sortedKeys[cur] = Object.keys(history[cur] || {}).sort();
    return sortedKeys[cur];
  };

  const now = (cur) => {
    if (!cur || cur === base) return 1;
    if (latest[cur] > 0) return latest[cur];
    // Sans taux du jour, le dernier taux historique connu reste plus juste
    // qu'aucune conversion.
    const keys = keysOf(cur);
    return keys.length ? history[cur][keys[keys.length - 1]] : null;
  };

  const at = (cur, date) => {
    if (!cur || cur === base) return 1;
    const series = history[cur];
    if (series) {
      const key = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : formatDateKey(date);
      const r = rateAt(series, key, keysOf(cur));
      if (r > 0) return r;
    }
    return now(cur);
  };

  return { base, now, at };
};
