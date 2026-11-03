/**
 * Indice des prix Eurostat (France), gardé en cache une semaine : il ne
 * change qu'une fois par mois. Sans réseau, le dernier indice téléchargé
 * sert ; sans rien du tout, les écrans n'affichent simplement pas le réel.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchWithRetry } from './apiClient';
import { STORAGE_KEYS } from '../constants';
import { parseEurostatIndex } from '../core/inflation';

const URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr'
  + '?geo=FR&coicop18=TOTAL&unit=I25&format=JSON&lang=EN';
const TTL = 7 * 24 * 60 * 60 * 1000;

const readCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.INFLATION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const inflationService = {
  /** @returns {Promise<Object<string, number>|null>} série { 'YYYY-MM': indice } */
  async load() {
    const cached = await readCache();
    if (cached?.series && Date.now() - cached.at < TTL) return cached.series;
    try {
      const series = parseEurostatIndex(await fetchWithRetry(URL, { headers: { Accept: 'application/json' } }, 1));
      if (series) {
        AsyncStorage.setItem(STORAGE_KEYS.INFLATION, JSON.stringify({ at: Date.now(), series })).catch(() => {});
        return series;
      }
    } catch (err) {
      if (__DEV__) console.warn('[Eurostat] inflation:', err.message);
    }
    return cached?.series || null;
  },
};
