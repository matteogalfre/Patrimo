/**
 * Données des marchés suivis (S&P 500, Bitcoin) : historique quotidien
 * complet chez Yahoo, gardé sous forme de statistiques (recalculées au plus
 * une fois par semaine, l'historique du S&P 500 pèse 2 Mo) et des deux
 * dernières années de cours (complétées au plus toutes les 6 heures avec le
 * dernier mois seulement). Plus les indices de peur : le VIX (Yahoo) et le
 * Fear & Greed crypto (alternative.me, gratuit, sans clé). Rien de
 * personnel n'est envoyé.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { yahooApi } from './yahooApi';
import { fetchWithRetry } from './apiClient';
import { allTimeHigh, computeMarketStats, MARKETS, toPoints } from '../core/markets';

const KEY = '@patrimo_markets';
const DAY = 24 * 60 * 60 * 1000;
const STATS_TTL = 7 * DAY;
const PRICES_TTL = 6 * 60 * 60 * 1000;
const KEEP = 520; // environ deux ans de séances, pour la courbe et la moyenne 200 jours
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const readAll = async () => {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') || {};
  } catch {
    return {};
  }
};
const writeAll = (all) => AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => {});

// Laisse respirer l'écran avant un calcul lourd.
const nextTick = () => new Promise((r) => setTimeout(r, 0));

export const marketsService = {
  /** Ce qui est déjà en cache, sans réseau (null si rien). */
  async cached(id) {
    return (await readAll())[id] || null;
  },

  /**
   * Statistiques et cours récents d'un marché, du cache si possible.
   * @param {'sp500'|'btc'} id
   * @param {{light?: boolean, force?: boolean}} opts
   *   light : sans statistiques en cache, se contenter d'un an de cours (accueil)
   * @returns {Promise<{points: Array, ath: object, stats: object|null, statsTs: number|null, pricesTs: number}>}
   */
  async load(id, { light = false, force = false } = {}) {
    const market = MARKETS[id];
    const all = await readAll();
    let entry = all[id] || null;
    const now = Date.now();
    const needStats = force || !entry?.stats || now - (entry.statsTs || 0) > STATS_TTL;

    if (needStats && !light) {
      const { series } = await yahooApi.getHistory(market.symbol, market.since);
      const points = toPoints(series);
      if (points.length > 300) {
        await nextTick();
        entry = {
          stats: computeMarketStats(points, market),
          statsTs: now,
          ath: allTimeHigh(points),
          points: points.slice(-KEEP),
          pricesTs: now,
        };
      }
    } else if (needStats && light && !entry) {
      // Accueil sans cache : un an de cours suffit pour dire où on en est.
      const { series } = await yahooApi.getHistory(market.symbol, iso(now - 400 * DAY));
      const points = toPoints(series);
      if (points.length) entry = { stats: null, statsTs: null, ath: allTimeHigh(points), points: points.slice(-KEEP), pricesTs: now, partialHigh: true };
    }

    if (entry && now - (entry.pricesTs || 0) > PRICES_TTL) {
      const { series } = await yahooApi.getHistory(market.symbol, iso(now - 40 * DAY));
      const fresh = toPoints(series);
      if (fresh.length) {
        const merged = new Map(entry.points);
        fresh.forEach(([d, v]) => merged.set(d, v));
        entry = {
          ...entry,
          points: [...merged.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-KEEP),
          ath: fresh.reduce((best, [d, v]) => (v > best.value ? { date: d, value: v } : best), entry.ath),
          pricesTs: now,
        };
      }
    }

    if (!entry) throw new Error('NO_DATA');
    all[id] = entry;
    await writeAll(all);
    return entry;
  },

  /**
   * Indice de peur du marché : VIX pour les actions, Fear & Greed pour la
   * crypto. Gardé 6 heures. null si indisponible.
   * @returns {Promise<{value: number, date: string, previous?: number}|null>}
   */
  async fear(kind) {
    const all = await readAll();
    const cacheKey = `fear_${kind}`;
    const hit = all[cacheKey];
    if (hit && Date.now() - hit.ts < PRICES_TTL) return hit.data;
    let data = null;
    try {
      if (kind === 'vix') {
        const points = toPoints((await yahooApi.getHistory('^VIX', iso(Date.now() - 30 * DAY))).series);
        if (points.length) data = { value: points[points.length - 1][1], date: points[points.length - 1][0], previous: points[Math.max(0, points.length - 6)][1] };
      } else {
        const r = await fetchWithRetry('https://api.alternative.me/fng/?limit=8', { timeoutMs: 8000 }, 1);
        const list = Array.isArray(r?.data) ? r.data : [];
        if (list.length) data = { value: Number(list[0].value), date: iso(Number(list[0].timestamp) * 1000), previous: Number(list[list.length - 1].value) };
      }
    } catch {
      data = hit?.data || null;
    }
    if (data) {
      all[cacheKey] = { ts: Date.now(), data };
      await writeAll(all);
    }
    return data;
  },
};

export default marketsService;
