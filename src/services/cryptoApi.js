/**
 * Services API pour les données crypto
 * Utilise l'API Binance (gratuit, historique complet depuis 2017+)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithRetry } from './apiClient';

// Cours du moment : une réponse rapide ou rien (le dernier cours connu prend le
// relais), pour que l'écran et le widget n'attendent pas une minute.
const QUOTE_REQUEST = { timeoutMs: 8000 };
const QUOTE_RETRIES = 1;
import { formatDateKey } from '../utils/formatters';
import { STORAGE_KEYS, BINANCE_PAIRS_TTL } from '../constants';

// Configuration Binance API
const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

/**
 * Convertit un symbole en paire Binance USDT
 * @param {string} symbol - Symbole de la crypto
 * @returns {string} - Paire Binance
 */
/**
 * Correspondances non deductibles du symbole. Binance n'utilise pas toujours le
 * ticker courant : cette table est le point unique ou les exceptions se
 * declarent, plutot que de coller aveuglement "USDT" au symbole.
 */
const SYMBOL_OVERRIDES = {
  MIOTA: 'IOTA',
  IOTA: 'IOTA',
};

/**
 * Stablecoins indexes sur le dollar : ils n'ont pas de paire contre USDT parce
 * qu'ils SONT la contrepartie. Demander "USDTUSDT" renvoie une erreur.
 */
const USD_PEGGED = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI']);

const toBinanceBase = (symbol) => {
  const clean = String(symbol || '').toUpperCase().trim();
  return SYMBOL_OVERRIDES[clean] || clean;
};

const isUsdPegged = (symbol) => USD_PEGGED.has(toBinanceBase(symbol));

const getBinancePair = (symbol) => `${toBinanceBase(symbol)}USDT`;

/**
 * Interroge Binance symbole par symbole et ne garde que ce qui repond.
 *
 * Necessaire parce que l'endpoint groupe est tout-ou-rien : un seul symbole
 * inconnu et il renvoie 400 "Invalid symbol", donc AUCUN prix. Une crypto sans
 * paire USDT mettait ainsi le portefeuille entier a zero. On tente d'abord le
 * lot (une requete), et on ne retombe sur l'unitaire qu'en cas d'echec.
 */
const fetchPerSymbol = async (symbols, endpoint, extract) => {
  const out = {};
  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const data = await fetchWithRetry(
        `${BINANCE_BASE_URL}/${endpoint}?symbol=${getBinancePair(symbol)}`,
        QUOTE_REQUEST,
        QUOTE_RETRIES,
      );
      return { symbol, value: extract(data) };
    })
  );
  settled.forEach((r) => {
    if (r.status === 'fulfilled' && Number.isFinite(r.value.value)) {
      out[r.value.symbol] = r.value.value;
    }
  });
  return out;
};

/**
 * Service pour récupérer les prix en temps réel
 */
/**
 * Cache court des cotations.
 *
 * Les prix Binance ne bougent pas assez en une minute pour justifier un appel
 * a chaque retour sur le dashboard. Le cache sert aussi de repli quand l'API
 * echoue : renvoyer le dernier prix connu vaut mieux qu'un objet vide, qui
 * afficherait un portefeuille a zero.
 */
const QUOTE_CACHE_TTL = 60 * 1000;
const quoteCache = new Map();

const cacheKey = (kind, symbols) => `${kind}:${[...symbols].sort().join(',')}`;

const readCache = (key, { allowStale = false } = {}) => {
  const hit = quoteCache.get(key);
  if (!hit) return null;
  if (!allowStale && Date.now() - hit.at > QUOTE_CACHE_TTL) return null;
  return hit.value;
};

const writeCache = (key, value) => {
  quoteCache.set(key, { at: Date.now(), value });
};

export const priceService = {
  /**
   * Récupère les prix actuels pour plusieurs cryptos
   * @param {string[]} symbols - Liste des symboles
   * @returns {Promise<Object>} - Map symbol -> price
   */
  async getCurrentPrices(symbols = [], { force = false } = {}) {
    if (!symbols.length) return {};

    const key = cacheKey('price', symbols);
    if (!force) {
      const fresh = readCache(key);
      if (fresh) return fresh;
    }

    // Les stablecoins dollar valent 1 par definition : pas de requete a faire,
    // et surtout pas de paire inexistante a glisser dans le lot.
    const prices = {};
    const quotable = [];
    symbols.forEach((s) => {
      if (isUsdPegged(s)) prices[s] = 1;
      else quotable.push(s);
    });

    if (!quotable.length) {
      writeCache(key, prices);
      return prices;
    }

    try {
      const pairs = quotable.map(s => `"${getBinancePair(s)}"`).join(',');
      const data = await fetchWithRetry(
        `${BINANCE_BASE_URL}/ticker/price?symbols=[${pairs}]`,
        QUOTE_REQUEST,
        QUOTE_RETRIES,
      );

      if (Array.isArray(data)) {
        data.forEach(ticker => {
          const symbol = quotable.find(s => getBinancePair(s) === ticker.symbol);
          if (symbol) {
            prices[symbol] = parseFloat(ticker.price);
          }
        });
      }

      writeCache(key, prices);
      return prices;
    } catch (err) {
      if (__DEV__) console.warn('[API] getCurrentPrices lot echoue, repli unitaire:', err.message);

      // Le lot est tout-ou-rien : on redemande symbole par symbole pour ne
      // perdre que celui qui pose probleme.
      const perSymbol = await fetchPerSymbol(
        quotable,
        'ticker/price',
        (d) => parseFloat(d?.price)
      );
      const merged = { ...prices, ...perSymbol };

      if (Object.keys(merged).length > 0) {
        writeCache(key, merged);
        return merged;
      }
      return readCache(key, { allowStale: true }) ?? {};
    }
  },

  /**
   * Récupère l'historique des prix pour un graphique
   * Supporte plus de 1000 jours via pagination
   * @param {string} symbol - Symbole de la crypto
   * @param {number} days - Nombre de jours
   * @returns {Promise<Array<{time: number, price: number}>>}
   */
  async getPriceHistory(symbol, days = 30) {
    try {
      const pair = getBinancePair(symbol);

      // Si moins de 1000 jours, une seule requête suffit
      if (days <= 1000) {
        const data = await fetchWithRetry(
          `${BINANCE_BASE_URL}/klines?symbol=${pair}&interval=1d&limit=${days}`
        );

        if (data?.code) {
          if (__DEV__) console.warn(`[API] ${symbol}: paire ${pair} non trouvée sur Binance`);
          return [];
        }

        if (Array.isArray(data)) {
          return data.map(candle => ({
            time: candle[0],
            price: parseFloat(candle[4]),
          }));
        }
        return [];
      }

      // Pour plus de 1000 jours, faire plusieurs requêtes
      const allCandles = [];
      const now = Date.now();
      let endTime = now;
      let totalRequested = 0;
      const maxDays = Math.min(days, 5000);

      while (totalRequested < maxDays) {
        const remaining = maxDays - totalRequested;
        const limit = Math.min(1000, remaining);
        const url = `${BINANCE_BASE_URL}/klines?symbol=${pair}&interval=1d&limit=${limit}&endTime=${endTime}`;

        const data = await fetchWithRetry(url);

        if (data?.code || !Array.isArray(data) || data.length === 0) {
          break;
        }

        allCandles.unshift(...data);
        totalRequested += data.length;

        if (data.length < limit) {
          break;
        }

        endTime = data[0][0] - 1;
        // Petit délai pour éviter le rate limiting
        await new Promise(r => setTimeout(r, 100));
      }

      return allCandles.map(candle => ({
        time: candle[0],
        price: parseFloat(candle[4]),
      }));
    } catch (err) {
      if (__DEV__) console.warn('[API] getPriceHistory error:', err.message);
      return [];
    }
  },

  /**
   * Récupère les variations 24h pour plusieurs cryptos
   * @param {string[]} symbols - Liste des symboles
   * @returns {Promise<Object>} - Map symbol -> change%
   */
  async get24hChange(symbols = [], { force = false } = {}) {
    if (!symbols.length) return {};

    const key = cacheKey('change24h', symbols);
    if (!force) {
      const fresh = readCache(key);
      if (fresh) return fresh;
    }

    // Un stablecoin ne varie pas : 0 % sans appel reseau.
    const changes = {};
    const quotable = [];
    symbols.forEach((s) => {
      if (isUsdPegged(s)) changes[s] = 0;
      else quotable.push(s);
    });

    if (!quotable.length) {
      writeCache(key, changes);
      return changes;
    }

    try {
      const pairs = quotable.map(s => `"${getBinancePair(s)}"`).join(',');
      const data = await fetchWithRetry(
        `${BINANCE_BASE_URL}/ticker/24hr?symbols=[${pairs}]`
      );

      if (Array.isArray(data)) {
        data.forEach(ticker => {
          const symbol = quotable.find(s => getBinancePair(s) === ticker.symbol);
          if (symbol) {
            changes[symbol] = parseFloat(ticker.priceChangePercent);
          }
        });
      }

      writeCache(key, changes);
      return changes;
    } catch (err) {
      if (__DEV__) console.warn('[API] get24hChange lot echoue, repli unitaire:', err.message);

      const perSymbol = await fetchPerSymbol(
        quotable,
        'ticker/24hr',
        (d) => parseFloat(d?.priceChangePercent)
      );
      const merged = { ...changes, ...perSymbol };

      if (Object.keys(merged).length > 0) {
        writeCache(key, merged);
        return merged;
      }
      return readCache(key, { allowStale: true }) ?? {};
    }
  },

};

/**
 * Service pour les données crypto avancées
 */
export const cryptoService = {
  /**
   * Récupère le prix à une date spécifique
   * @param {string} symbol - Symbole
   * @param {number} timestamp - Timestamp en ms
   * @returns {Promise<number|null>}
   */
  async getPriceAtDate(symbol, timestamp) {
    try {
      const pair = getBinancePair(symbol);
      const startTime = timestamp;
      const endTime = timestamp + (24 * 60 * 60 * 1000);

      const url = `${BINANCE_BASE_URL}/klines?symbol=${pair}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1`;
      const data = await fetchWithRetry(url);

      if (data?.code) {
        if (__DEV__) console.warn(`[API] ${symbol}: paire ${pair} non disponible`);
        return null;
      }

      if (Array.isArray(data) && data.length > 0) {
        return parseFloat(data[0][4]); // Close price
      }

      return null;
    } catch (err) {
      if (__DEV__) console.warn(`[API] getPriceAtDate error for ${symbol}:`, err.message);
      return null;
    }
  },

  /**
   * Récupère l'historique complet pour plusieurs cryptos
   * Optimisé avec traitement par batch
   * @param {string[]} symbols - Liste des symboles
   * @param {number} days - Nombre de jours
   * @returns {Promise<Object>} - Map symbol -> dateKey -> price
   */
  async getMultipleHistoricalData(symbols, days = 2000) {
    const results = {};
    const maxDays = days === 2000 ? 5000 : days;

    if (__DEV__) console.warn(`[API] Chargement historique pour: ${symbols.join(', ')} (${maxDays} jours max)`);

    // Traiter en parallèle par groupes de 2 pour éviter le rate limiting
    const batchSize = 2;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(symbol => this._fetchHistoricalForSymbol(symbol, maxDays))
      );
      
      batch.forEach((symbol, idx) => {
        results[symbol] = batchResults[idx];
      });

      // Délai entre les batches
      if (i + batchSize < symbols.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return results;
  },

  /**
   * Récupère l'historique d'un symbole (méthode interne)
   * @private
   */
  async _fetchHistoricalForSymbol(symbol, maxDays) {
    try {
      const pair = getBinancePair(symbol);
      const allCandles = [];
      const now = Date.now();
      let endTime = now;
      let totalRequested = 0;

      while (totalRequested < maxDays) {
        const remaining = maxDays - totalRequested;
        const limit = Math.min(1000, remaining);
        const url = `${BINANCE_BASE_URL}/klines?symbol=${pair}&interval=1d&limit=${limit}&endTime=${endTime}`;

        const data = await fetchWithRetry(url, {}, 2); // Max 2 retries

        if (data?.code || !Array.isArray(data) || data.length === 0) {
          break;
        }

        allCandles.unshift(...data);
        totalRequested += data.length;

        if (data.length < limit) {
          break;
        }

        endTime = data[0][0] - 1;
        await new Promise(r => setTimeout(r, 100));
      }

      if (__DEV__) console.warn(`[API] ${symbol}: ${allCandles.length} jours de données récupérés`);

      // Convertir en map date -> prix
      const priceMap = {};
      allCandles.forEach(candle => {
        const price = parseFloat(candle[4]);
        if (price > 0) {
          const key = formatDateKey(new Date(candle[0]));
          priceMap[key] = price;
        }
      });

      return priceMap;
    } catch (err) {
      if (__DEV__) console.warn(`[API] ${symbol}: erreur -`, err.message);
      return {};
    }
  },
};

/**
 * Catalogue des cryptos cotées contre USDT sur Binance (~2 000 actifs).
 * Volumineux : chargé à la première recherche puis gardé 24 h.
 */
export const cryptoCatalog = {
  async load({ force = false } = {}) {
    let cached = null;
    try {
      const [raw, ts] = await AsyncStorage.multiGet([STORAGE_KEYS.BINANCE_PAIRS, STORAGE_KEYS.BINANCE_PAIRS_TS]);
      cached = raw[1] ? JSON.parse(raw[1]) : null;
      const fresh = ts[1] && Date.now() - Number(ts[1]) < BINANCE_PAIRS_TTL;
      if (!force && cached?.length && fresh) return cached;
    } catch {
      // cache illisible : on retélécharge
    }
    try {
      const data = await fetchWithRetry(`${BINANCE_BASE_URL}/exchangeInfo?permissions=SPOT`);
      const list = (data?.symbols || [])
        .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s) => s.baseAsset);
      const unique = [...new Set(list)];
      if (unique.length) {
        AsyncStorage.multiSet([
          [STORAGE_KEYS.BINANCE_PAIRS, JSON.stringify(unique)],
          [STORAGE_KEYS.BINANCE_PAIRS_TS, String(Date.now())],
        ]).catch(() => {});
        return unique;
      }
    } catch (err) {
      if (__DEV__) console.warn('[Binance] catalogue indisponible:', err.message);
    }
    return cached || [];
  },
};

export default {
  cryptoService,
  priceService,
  cryptoCatalog,
};
