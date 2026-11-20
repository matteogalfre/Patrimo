/**
 * Actions, ETF et fonds cotés via l'API publique de Yahoo Finance.
 *
 * Tous les prix sont renvoyés dans la devise de COTATION du titre (EUR pour
 * Euronext Paris, USD pour le Nasdaq...). La conversion vers la devise de
 * référence est l'affaire du moteur, au taux du bon jour.
 *
 * API non officielle : pas de clé, mais pas de contrat non plus. Chaque appel
 * est donc protégé (retry, cache, repli sur la dernière valeur connue).
 *
 * Les cours du jour passent par une seule requête groupée (« spark », jusqu'à
 * 20 titres) ; elle ne donne pas la devise, retenue à la première cotation
 * de chaque titre (requête « chart », une fois pour toutes).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithRetry } from './apiClient';
import { formatDateKey } from '../utils/formatters';
import { normalizeQuoteCurrency } from '../core/fx';

const YH_BASE = 'https://query1.finance.yahoo.com';
const YH_HEADERS = { Accept: 'application/json' };

const QUOTE_TTL = 60 * 1000;
const quoteCache = new Map(); // symbol -> { at, value }
const weeklyCache = new Map(); // symbol -> { currency, series }
// Dividendes par titre, pour la session : ils ne changent qu'une ou deux fois par an.
const dividendCache = new Map();

// Un cours du jour : vite, une seule nouvelle tentative.
const QUOTE_REQUEST = { headers: YH_HEADERS, timeoutMs: 8000 };
const SPARK_CHUNK = 20;

// Devise de cotation de chaque titre (telle que Yahoo l'écrit, GBp compris).
const CURRENCY_KEY = '@patrimo_quote_currencies';
let currencies = null;
const loadCurrencies = async () => {
  if (!currencies) {
    try {
      currencies = JSON.parse((await AsyncStorage.getItem(CURRENCY_KEY)) || '{}') || {};
    } catch {
      currencies = {};
    }
  }
  return currencies;
};
const rememberCurrency = (symbol, raw) => {
  if (!raw || !currencies || currencies[symbol] === raw) return;
  currencies[symbol] = raw;
  AsyncStorage.setItem(CURRENCY_KEY, JSON.stringify(currencies)).catch(() => {});
};

/** Cours de plusieurs titres en une requête ; les absents de la réponse sont ignorés. */
const fetchSpark = async (symbols, known) => {
  const data = await fetchWithRetry(
    `${YH_BASE}/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=1d&interval=1d`,
    QUOTE_REQUEST,
    1,
  );
  const out = {};
  symbols.forEach((symbol) => {
    const r = data?.[symbol];
    const closes = (r?.close || []).filter((c) => Number.isFinite(c) && c > 0);
    const value = closes.length
      ? parseChartMeta({ regularMarketPrice: closes[closes.length - 1], chartPreviousClose: r.chartPreviousClose, currency: known[symbol] })
      : null;
    if (value) out[symbol] = value;
  });
  return out;
};

/** Lit le bloc `meta` d'une réponse chart et normalise prix et devise. */
export const parseChartMeta = (meta) => {
  if (!meta) return null;
  const raw = meta.regularMarketPrice;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const { currency, divisor } = normalizeQuoteCurrency(meta.currency);
  const prevRaw = meta.chartPreviousClose ?? meta.previousClose;
  const changePct = Number.isFinite(prevRaw) && prevRaw > 0 ? ((raw - prevRaw) / prevRaw) * 100 : null;
  return {
    price: raw / divisor,
    currency,
    changePct,
    name: meta.longName || meta.shortName || null,
    exchange: meta.fullExchangeName || meta.exchangeName || null,
  };
};

/** Transforme une réponse chart en série { 'YYYY-MM-DD': cours } normalisée. */
export const parseChartSeries = (result) => {
  if (!result?.timestamp) return { currency: null, series: {} };
  const { currency, divisor } = normalizeQuoteCurrency(result.meta?.currency);
  const closes = result.indicators?.quote?.[0]?.close || [];
  const series = {};
  result.timestamp.forEach((ts, i) => {
    const c = closes[i];
    if (Number.isFinite(c) && c > 0) series[formatDateKey(new Date(ts * 1000))] = c / divisor;
  });
  return { currency, series };
};

const runInBatches = async (items, worker, batchSize = 4) => {
  const out = {};
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((s) => worker(s)));
    batch.forEach((s, idx) => { out[s] = results[idx]; });
    if (i + batchSize < items.length) await new Promise((r) => setTimeout(r, 120));
  }
  return out;
};

export const yahooApi = {
  /**
   * Cotations actuelles.
   * @param {string[]} symbols
   * @param {{force?: boolean}} [opts]
   * @returns {Promise<Object<string, {price: number, currency: string, changePct: number|null}>>}
   */
  async getQuotes(symbols = [], { force = false } = {}) {
    const out = {};
    const stale = symbols.filter((symbol) => {
      const hit = quoteCache.get(symbol);
      if (!force && hit && Date.now() - hit.at < QUOTE_TTL) {
        out[symbol] = hit.value;
        return false;
      }
      return true;
    });
    if (!stale.length) return out;

    // Titres dont on connaît la devise : tous ensemble, en une requête.
    const known = await loadCurrencies();
    const grouped = stale.filter((s) => known[s]);
    for (let i = 0; i < grouped.length; i += SPARK_CHUNK) {
      const chunk = grouped.slice(i, i + SPARK_CHUNK);
      try {
        // eslint-disable-next-line no-await-in-loop
        const values = await fetchSpark(chunk, known);
        Object.entries(values).forEach(([symbol, value]) => {
          quoteCache.set(symbol, { at: Date.now(), value: { ...quoteCache.get(symbol)?.value, ...value } });
          out[symbol] = quoteCache.get(symbol).value;
        });
      } catch (err) {
        if (__DEV__) console.warn('[Yahoo] cotations groupées:', err.message);
      }
    }

    // Les autres (nouveaux titres, ou absents de la réponse groupée) : un par un.
    await runInBatches(stale.filter((s) => !out[s]), async (symbol) => {
      const hit = quoteCache.get(symbol);
      try {
        const data = await fetchWithRetry(
          `${YH_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          QUOTE_REQUEST,
          1,
        );
        const meta = data?.chart?.result?.[0]?.meta;
        const value = parseChartMeta(meta);
        if (value) {
          rememberCurrency(symbol, meta.currency);
          quoteCache.set(symbol, { at: Date.now(), value });
          out[symbol] = value;
        } else if (hit) {
          out[symbol] = hit.value;
        }
      } catch (err) {
        // Mieux vaut le dernier cours connu qu'une position à zéro.
        if (hit) out[symbol] = hit.value;
        if (__DEV__) console.warn(`[Yahoo] cotation ${symbol}:`, err.message);
      }
    });
    return out;
  },

  /**
   * Cours de clôture à une date (ou au premier jour de cotation suivant, pour
   * les week-ends et jours fériés).
   * @returns {Promise<{price: number, currency: string}|null>}
   */
  async getPriceAt(symbol, date) {
    try {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const period1 = Math.floor(start.getTime() / 1000);
      const period2 = period1 + 7 * 24 * 60 * 60;
      const data = await fetchWithRetry(
        `${YH_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`,
        { headers: YH_HEADERS },
        2,
      );
      const { currency, series } = parseChartSeries(data?.chart?.result?.[0]);
      const first = Object.keys(series).sort()[0];
      return first ? { price: series[first], currency } : null;
    } catch (err) {
      if (__DEV__) console.warn(`[Yahoo] cours du ${date} pour ${symbol}:`, err.message);
      return null;
    }
  },

  /**
   * Historique hebdomadaire complet (indices sur plusieurs décennies), gardé
   * pour la session : il ne change qu'une fois par semaine.
   * @returns {Promise<{currency: string|null, series: Object<string, number>}>}
   */
  async getWeeklyHistory(symbol) {
    const hit = weeklyCache.get(symbol);
    if (hit) return hit;
    const to = Math.floor(Date.now() / 1000);
    const data = await fetchWithRetry(
      `${YH_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&period1=0&period2=${to}`,
      { headers: YH_HEADERS },
      2,
    );
    const value = parseChartSeries(data?.chart?.result?.[0]);
    if (Object.keys(value.series).length) weeklyCache.set(symbol, value);
    return value;
  },

  /**
   * Dividendes par action des 5 dernières années, à leur date de
   * détachement, gardés pour la session.
   * @returns {Promise<{currency: string|null, events: Array<{date: string, amount: number}>}>}
   */
  async getDividendEvents(symbol) {
    const hit = dividendCache.get(symbol);
    if (hit) return hit;
    try {
      const data = await fetchWithRetry(
        `${YH_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=5y&events=div`,
        { headers: YH_HEADERS, timeoutMs: 8000 },
        1,
      );
      const result = data?.chart?.result?.[0];
      const { currency, divisor } = normalizeQuoteCurrency(result?.meta?.currency);
      const events = Object.values(result?.events?.dividends || {})
        .map((e) => ({ date: formatDateKey(new Date(e.date * 1000)), amount: Number(e.amount) / divisor }))
        .filter((e) => e.amount > 0)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      const value = { currency, events };
      dividendCache.set(symbol, value);
      return value;
    } catch (err) {
      if (__DEV__) console.warn(`[Yahoo] dividendes ${symbol}:`, err.message);
      return { currency: null, events: [] };
    }
  },

  /**
   * Historique quotidien depuis une date.
   * @returns {Promise<{currency: string|null, series: Object<string, number>}>}
   */
  async getHistory(symbol, fromDate) {
    try {
      const from = Math.floor(new Date(fromDate).getTime() / 1000) - 7 * 24 * 60 * 60;
      const to = Math.floor(Date.now() / 1000);
      const data = await fetchWithRetry(
        `${YH_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${from}&period2=${to}`,
        { headers: YH_HEADERS },
        2,
      );
      return parseChartSeries(data?.chart?.result?.[0]);
    } catch (err) {
      if (__DEV__) console.warn(`[Yahoo] historique ${symbol}:`, err.message);
      return { currency: null, series: {} };
    }
  },

  /**
   * Recherche d'actions, d'ETF et de fonds. Les indices (^GSPC...) sont exclus :
   * on ne peut pas les détenir.
   * @returns {Promise<Array<{symbol: string, name: string, exchange: string, quoteType: string}>>}
   */
  async search(query) {
    const q = (query || '').trim();
    if (!q) return [];
    try {
      const data = await fetchWithRetry(
        `${YH_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`,
        { headers: YH_HEADERS },
        2,
      );
      const ALLOWED = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);
      return (data?.quotes || [])
        .filter((item) => item.symbol && ALLOWED.has(item.quoteType))
        .map((item) => ({
          symbol: item.symbol,
          name: item.shortname || item.longname || item.symbol,
          exchange: item.exchDisp || item.exchange || '',
          quoteType: item.quoteType,
        }));
    } catch (err) {
      if (__DEV__) console.warn('[Yahoo] recherche:', err.message);
      return [];
    }
  },
};

/** Taux de change via Yahoo, en secours des devises absentes de la BCE. */
export const yahooFx = {
  async latest(from, to) {
    const q = await yahooApi.getQuotes([`${from}${to}=X`]);
    return q[`${from}${to}=X`]?.price || null;
  },
  async history(from, to, fromDate) {
    const { series } = await yahooApi.getHistory(`${from}${to}=X`, fromDate);
    return series;
  },
};

export default yahooApi;
