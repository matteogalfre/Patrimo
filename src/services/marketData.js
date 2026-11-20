/**
 * Point d'entrée unique des données de marché, quel que soit l'actif.
 *
 *  - crypto : Binance (paires USDT, donc cotées en USD) ;
 *  - actions, ETF, fonds : Yahoo Finance, dans leur devise de cotation.
 *
 * Les écrans et le contexte ne parlent qu'à ce module : changer de source
 * pour une classe d'actifs ne touche rien d'autre.
 */

import { priceService, cryptoService, cryptoCatalog } from './cryptoApi';
import { yahooApi } from './yahooApi';
import { openFigi } from './openFigi';
import { ASSET_TYPES, makeAssetId } from '../core/assets';
import { isIsin } from '../core/listings';
import { CRYPTO_METADATA } from '../constants/cryptoMetadata';

/** Les paires Binance sont contre USDT, assimilé au dollar. */
export const CRYPTO_QUOTE_CURRENCY = 'USD';

const DAY = 24 * 60 * 60 * 1000;

const cryptoResult = (symbol) => ({
  assetType: ASSET_TYPES.CRYPTO,
  assetId: makeAssetId(ASSET_TYPES.CRYPTO, symbol),
  symbol,
  name: CRYPTO_METADATA[symbol]?.name || symbol,
  exchange: 'Binance',
  quoteType: 'CRYPTO',
});

const stockResult = (r) => ({
  assetType: ASSET_TYPES.STOCK,
  assetId: makeAssetId(ASSET_TYPES.STOCK, r.symbol),
  symbol: r.symbol.toUpperCase(),
  name: r.name,
  exchange: r.exchange,
  quoteType: r.quoteType,
});

const EURO_SUFFIXES = ['.AS', '.DE', '.MI', '.BR', '.MC'];
const MAX_EXTRA_LISTINGS = 6;

/** Nom lisible à partir des majuscules d'OpenFIGI (« AMUNDI MSCI WORLD » → « Amundi Msci World »). */
const prettyName = (name) => String(name || '').toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * Recherche par ISIN : Yahoo reconnaît l'ISIN mais ne renvoie souvent qu'une
 * place. OpenFIGI liste les autres ; on ne garde que celles qui ont un cours
 * chez Yahoo, avec le nom donné par Yahoo quand il est connu.
 */
const searchIsin = async (isin) => {
  const [fromYahoo, fromFigi] = await Promise.all([
    yahooApi.search(isin).catch(() => []),
    openFigi.listings(isin).catch(() => []),
  ]);
  // Yahoo ajoute parfois une pseudo-cotation au nom de l'ISIN (« FR00….SG »).
  const yahoo = fromYahoo.filter((r) => !r.symbol.toUpperCase().startsWith(isin));
  const known = new Set(yahoo.map((r) => r.symbol.toUpperCase()));
  const extra = fromFigi.filter((r) => !known.has(r.symbol)).slice(0, MAX_EXTRA_LISTINGS);
  const quotes = extra.length ? await yahooApi.getQuotes(extra.map((r) => r.symbol)).catch(() => ({})) : {};
  const name = yahoo[0]?.name;
  const listed = extra
    .filter((r) => quotes[r.symbol]?.price > 0)
    .map((r) => ({ ...r, name: name || prettyName(r.name) }));
  return [...yahoo, ...listed];
};

/**
 * Classe les résultats : ticker exact d'abord, puis début de ticker, puis
 * cotation à Paris (public français), le reste dans l'ordre de la source.
 */
export const rankResults = (results, query) => {
  const q = query.trim().toUpperCase();
  const score = (r) => {
    const sym = r.symbol.toUpperCase();
    const base = sym.split('.')[0];
    let s = 0;
    if (sym === q || base === q) s += 100;
    else if (sym.startsWith(q)) s += 50;
    else if ((r.name || '').toUpperCase().includes(q)) s += 10;
    if (sym.endsWith('.PA')) s += 5;
    else if (EURO_SUFFIXES.some((x) => sym.endsWith(x))) s += 2;
    return s;
  };
  return results
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
};

const searchCrypto = async (query) => {
  const q = query.trim().toUpperCase();
  const catalog = await cryptoCatalog.load();
  const byName = Object.entries(CRYPTO_METADATA)
    .filter(([, m]) => m.name.toUpperCase().includes(q))
    .map(([sym]) => sym);
  const bySymbol = catalog.filter((s) => s.includes(q));
  return [...new Set([...byName, ...bySymbol])].slice(0, 15).map(cryptoResult);
};

const split = (assets) => ({
  cryptos: assets.filter((a) => a.assetType === ASSET_TYPES.CRYPTO),
  stocks: assets.filter((a) => a.assetType !== ASSET_TYPES.CRYPTO),
});

export const marketData = {
  /**
   * @param {string} query
   * @returns {Promise<Array<{assetType: string, assetId: string, symbol: string, name: string, exchange: string, quoteType: string}>>}
   */
  async search(query) {
    if (!query || !query.trim()) return [];
    const [cryptos, stocks] = await Promise.all(this.searchParts(query));
    return rankResults([...cryptos, ...stocks], query);
  },

  /**
   * Les deux recherches séparément, pour afficher les cryptos (Binance,
   * catalogue en cache) sans attendre la réponse de Yahoo.
   * @returns {[Promise<object[]>, Promise<object[]>]}
   */
  searchParts(query) {
    return [
      searchCrypto(query).catch(() => []),
      (isIsin(query) ? searchIsin(query.trim().toUpperCase()) : yahooApi.search(query))
        .then((list) => list.map(stockResult))
        .catch(() => []),
    ];
  },

  /**
   * Historique hebdomadaire complet d'une action, d'un ETF ou d'un indice
   * (plusieurs décennies), pour les moyennes sur longue période.
   * @returns {Promise<Array<{key: string, price: number}>>}
   */
  async getWeeklyHistory(symbol) {
    const { series } = await yahooApi.getWeeklyHistory(symbol);
    return Object.keys(series).sort().map((k) => ({ key: k, price: series[k] }));
  },

  /**
   * Cotations actuelles.
   * @param {Array<{assetId: string, assetType: string, symbol: string}>} assets
   * @returns {Promise<Object<string, {price: number, currency: string, changePct: number|null}>>}
   */
  async getQuotes(assets = [], { force = false } = {}) {
    const { cryptos, stocks } = split(assets);
    const out = {};

    const cryptoSymbols = cryptos.map((a) => a.symbol);
    const [prices, changes, yq] = await Promise.all([
      cryptoSymbols.length ? priceService.getCurrentPrices(cryptoSymbols, { force }).catch(() => ({})) : {},
      cryptoSymbols.length ? priceService.get24hChange(cryptoSymbols, { force }).catch(() => ({})) : {},
      stocks.length ? yahooApi.getQuotes(stocks.map((a) => a.symbol), { force }) : {},
    ]);

    cryptos.forEach((a) => {
      if (prices[a.symbol] > 0) {
        out[a.assetId] = {
          price: prices[a.symbol],
          currency: CRYPTO_QUOTE_CURRENCY,
          changePct: Number.isFinite(changes[a.symbol]) ? changes[a.symbol] : null,
        };
      }
    });
    stocks.forEach((a) => {
      const q = yq[a.symbol];
      if (q) out[a.assetId] = { price: q.price, currency: q.currency, changePct: q.changePct };
    });
    return out;
  },

  /**
   * Cours de clôture à une date, pour pré-remplir le prix d'une opération.
   * @returns {Promise<{price: number, currency: string}|null>}
   */
  /** Dividendes par action d'une action ou d'un ETF (aucun pour une crypto). */
  async getDividendEvents(asset) {
    if (!asset?.symbol || asset.assetType === ASSET_TYPES.CRYPTO) return { currency: null, events: [] };
    return yahooApi.getDividendEvents(asset.symbol);
  },

  async getPriceAt(asset, date) {
    const d = new Date(date);
    const isToday = d.toDateString() === new Date().toDateString();
    if (isToday) {
      const q = await this.getQuotes([asset], { force: true });
      const hit = q[asset.assetId];
      return hit ? { price: hit.price, currency: hit.currency } : null;
    }
    if (asset.assetType === ASSET_TYPES.CRYPTO) {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const price = await cryptoService.getPriceAtDate(asset.symbol, start.getTime());
      return price > 0 ? { price, currency: CRYPTO_QUOTE_CURRENCY } : null;
    }
    return yahooApi.getPriceAt(asset.symbol, d);
  },

  /**
   * Historiques quotidiens depuis `fromDate`, ou depuis `since[assetId]` pour
   * un actif dont on a déjà le début : on ne télécharge que ce qui manque.
   * @param {Object<string, Date|string>} [since]
   * @returns {Promise<{series: Object<string, Object<string, number>>, currencies: Object<string, string>}>}
   */
  async getHistories(assets = [], fromDate, since = {}) {
    const { cryptos, stocks } = split(assets);
    const startOf = (a) => new Date(since[a.assetId] || fromDate);
    const daysSince = (date) => Math.min(5000, Math.ceil((Date.now() - date.getTime()) / DAY) + 10);
    const series = {};
    const currencies = {};

    // Cryptos (Binance) et actions (Yahoo) en même temps, par lots de trois
    // pour ménager les limites de débit de chacun.
    const cryptoPart = async () => {
      for (let i = 0; i < cryptos.length; i += 3) {
        const batch = cryptos.slice(i, i + 3);
        // eslint-disable-next-line no-await-in-loop
        const maps = await Promise.all(batch.map((a) => cryptoService._fetchHistoricalForSymbol(a.symbol, daysSince(startOf(a)))));
        batch.forEach((a, k) => {
          series[a.assetId] = maps[k];
          currencies[a.assetId] = CRYPTO_QUOTE_CURRENCY;
        });
      }
    };
    const stockPart = async () => {
      for (let i = 0; i < stocks.length; i += 3) {
        const batch = stocks.slice(i, i + 3);
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.all(batch.map((a) => yahooApi.getHistory(a.symbol, startOf(a))));
        batch.forEach((a, k) => {
          series[a.assetId] = results[k].series;
          if (results[k].currency) currencies[a.assetId] = results[k].currency;
        });
      }
    };
    await Promise.all([cryptoPart(), stockPart()]);
    return { series, currencies };
  },
};

export default marketData;
