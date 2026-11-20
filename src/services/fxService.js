/**
 * Taux de change vers la devise de référence.
 *
 * Source principale : taux de référence de la BCE (API Frankfurter, gratuite,
 * sans clé). Une seule requête rapatrie toutes les devises utiles, sur tout
 * l'historique demandé. Les devises absentes de la BCE passent par Yahoo.
 *
 * L'historique est conservé un jour en AsyncStorage : un taux passé ne change
 * plus, inutile de le retélécharger à chaque lancement.
 *
 * Si Frankfurter ne répond pas (panne du 4 novembre 2026 : requêtes sans
 * réponse pendant 20 secondes), on n'insiste pas : délai court, aucune
 * nouvelle tentative, et Yahoo prend le relais pour toutes les devises.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithRetry } from './apiClient';
import { yahooFx } from './yahooApi';
import { formatDateKey } from '../utils/formatters';

const FRANKFURTER = 'https://api.frankfurter.dev/v1';

/** Devises publiées par la BCE. */
export const ECB_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF',
  'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP',
  'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

const HISTORY_TTL = 24 * 60 * 60 * 1000;
// Frankfurter : une seule tentative, courte ; Yahoo sait faire la même chose.
const ECB_REQUEST = { timeoutMs: 6000 };
// Après un échec, on ne réessaie pas Frankfurter avant 6 heures.
const ECB_PAUSE = 6 * 60 * 60 * 1000;
const ECB_DOWN_KEY = '@patrimo_fx_ecb_down';
let ecbDownAt = null;
const ecbAvailable = async () => {
  if (ecbDownAt === null) ecbDownAt = Number(await AsyncStorage.getItem(ECB_DOWN_KEY).catch(() => 0)) || 0;
  return Date.now() - ecbDownAt > ECB_PAUSE;
};
const markEcbDown = () => {
  ecbDownAt = Date.now();
  AsyncStorage.setItem(ECB_DOWN_KEY, String(ecbDownAt)).catch(() => {});
};
const LATEST_TTL = 30 * 60 * 1000;
const cacheKey = (base) => `@patrimo_fx_history_${base}`;

let latestMemo = { key: null, at: 0, rates: {} };

/**
 * Inverse une réponse Frankfurter `from=base&to=X` (1 base = v X) en taux
 * « 1 X = ? base ».
 */
export const invertRates = (rates = {}) => {
  const out = {};
  Object.entries(rates).forEach(([cur, v]) => {
    if (v > 0) out[cur] = 1 / v;
  });
  return out;
};

/** Transforme une série Frankfurter en { devise: { date: taux inversé } }. */
export const invertTimeSeries = (ratesByDate = {}) => {
  const out = {};
  Object.entries(ratesByDate).forEach(([date, rates]) => {
    Object.entries(rates || {}).forEach(([cur, v]) => {
      if (!(v > 0)) return;
      if (!out[cur]) out[cur] = {};
      out[cur][date] = 1 / v;
    });
  });
  return out;
};

const readHistoryCache = async (base) => {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(base));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeHistoryCache = async (base, entry) => {
  try {
    await AsyncStorage.setItem(cacheKey(base), JSON.stringify(entry));
  } catch {
    // Cache facultatif : on refera la requête au prochain lancement.
  }
};

export const fxService = {
  /**
   * @param {string} base - devise de référence
   * @param {string[]} currencies - devises à convertir
   * @param {Date|string} fromDate - date de la plus ancienne opération
   * @returns {Promise<{latest: Object<string, number>, history: Object<string, Object<string, number>>}>}
   */
  async loadRates(base, currencies, fromDate) {
    const wanted = [...new Set(currencies)].filter((c) => c && c !== base);
    if (!wanted.length) return { latest: {}, history: {} };

    const fromKey = formatDateKey(fromDate || new Date());
    const [history, latest] = await Promise.all([
      this._history(base, wanted, fromKey),
      this._latest(base, wanted),
    ]);
    return { latest, history };
  },

  async _history(base, wanted, fromKey) {
    const cached = await readHistoryCache(base);
    const fresh = cached && Date.now() - cached.ts < HISTORY_TTL && cached.from <= fromKey;
    if (fresh && wanted.every((c) => cached.series[c])) return cached.series;

    const series = fresh ? { ...cached.series } : {};
    const ecb = (await ecbAvailable()) ? wanted.filter((c) => ECB_CURRENCIES.has(c) && ECB_CURRENCIES.has(base)) : [];
    const others = wanted.filter((c) => !ecb.includes(c));

    if (ecb.length) {
      try {
        const data = await fetchWithRetry(
          `${FRANKFURTER}/${fromKey}..?from=${base}&to=${ecb.join(',')}`,
          ECB_REQUEST,
          0,
        );
        Object.assign(series, invertTimeSeries(data?.rates));
      } catch (err) {
        if (__DEV__) console.warn('[FX] historique BCE indisponible:', err.message);
        markEcbDown();
        // Sans la BCE, Yahoo pour ces devises aussi.
        others.push(...ecb.filter((c) => !series[c]));
      }
    }

    await Promise.all(others.map(async (c) => {
      const s = await yahooFx.history(c, base, fromKey);
      if (Object.keys(s).length) series[c] = s;
      else if (cached?.series?.[c]) series[c] = cached.series[c];
    }));

    const from = fresh ? cached.from : fromKey;
    writeHistoryCache(base, { ts: Date.now(), from, series });
    return series;
  },

  async _latest(base, wanted) {
    const memoKey = `${base}:${[...wanted].sort().join(',')}`;
    if (latestMemo.key === memoKey && Date.now() - latestMemo.at < LATEST_TTL) return latestMemo.rates;

    const rates = {};
    const ecb = (await ecbAvailable()) ? wanted.filter((c) => ECB_CURRENCIES.has(c) && ECB_CURRENCIES.has(base)) : [];
    if (ecb.length) {
      try {
        const data = await fetchWithRetry(`${FRANKFURTER}/latest?from=${base}&to=${ecb.join(',')}`, ECB_REQUEST, 0);
        Object.assign(rates, invertRates(data?.rates));
      } catch (err) {
        if (__DEV__) console.warn('[FX] taux du jour BCE indisponibles:', err.message);
        markEcbDown();
      }
    }
    await Promise.all(wanted.filter((c) => !rates[c]).map(async (c) => {
      const r = await yahooFx.latest(c, base);
      if (r > 0) rates[c] = r;
    }));

    latestMemo = { key: memoKey, at: Date.now(), rates };
    return rates;
  },
};

/**
 * Les derniers taux connus, sans attendre le réseau : pour afficher tout de
 * suite. `complete` : toutes les devises demandées y sont.
 */
fxService.cachedRates = async (base, currencies = []) => {
  const cached = await readHistoryCache(base);
  const history = cached?.series || {};
  const wanted = [...new Set(currencies)].filter((c) => c && c !== base);
  return { latest: {}, history, complete: wanted.every((c) => history[c] && Object.keys(history[c]).length) };
};

export default fxService;
