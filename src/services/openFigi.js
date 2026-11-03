/**
 * OpenFIGI (Bloomberg) : correspondance ISIN → cotations. Gratuit, sans clé
 * (25 requêtes par minute), utilisé seulement quand on cherche un ISIN.
 * Comme pour les cours, le service voit l'ISIN demandé, rien d'autre.
 */

import { fetchWithRetry } from './apiClient';
import { listingsFromFigi } from '../core/listings';

const URL = 'https://api.openfigi.com/v3/mapping';

export const openFigi = {
  /** @returns {Promise<Array<{symbol: string, name: string, exchange: string, quoteType: string}>>} */
  async listings(isin) {
    const data = await fetchWithRetry(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    }, 1);
    return listingsFromFigi(data?.[0]?.data || [], isin);
  },
};
