/**
 * Client API avec retry automatique et gestion d'erreurs robuste
 */

import { LIMITS } from '../constants';

/**
 * Erreur API personnalisée
 */
export class ApiError extends Error {
  constructor(message, statusCode, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Délai exponentiel pour les retries
 * @param {number} attempt - Numéro de tentative (0-indexed)
 * @param {number} baseDelay - Délai de base en ms
 * @returns {number} - Délai en ms
 */
const getExponentialDelay = (attempt, baseDelay = LIMITS.API_RETRY_DELAY) => {
  return baseDelay * Math.pow(2, attempt) + Math.random() * 100;
};

/**
 * Attend un délai
 * @param {number} ms - Durée en millisecondes
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Effectue une requête avec retry automatique
 * @param {string} url - URL de la requête
 * @param {object} options - Options fetch
 * @param {number} maxRetries - Nombre max de tentatives
 * @returns {Promise<any>} - Données JSON
 */
export async function fetchWithRetry(url, options = {}, maxRetries = LIMITS.API_MAX_RETRIES) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LIMITS.API_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Rate limited - attendre et réessayer
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : getExponentialDelay(attempt, 2000);
        
        if (attempt < maxRetries) {
          if (__DEV__) console.warn(`[API] Rate limited, retry dans ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw new ApiError('Trop de requêtes, réessayez plus tard', 429, true);
      }

      // Erreur serveur - réessayer
      if (response.status >= 500 && attempt < maxRetries) {
        if (__DEV__) console.warn(`[API] Erreur serveur ${response.status}, retry...`);
        await sleep(getExponentialDelay(attempt));
        continue;
      }

      // Erreur client (4xx sauf 429) - ne pas réessayer
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Erreur inconnue');
        throw new ApiError(
          `Erreur HTTP ${response.status}: ${errorText}`,
          response.status,
          response.status >= 500
        );
      }

      try {
        const data = await response.json();
        return data;
      } catch {
        throw new ApiError(
          'Réponse invalide du serveur',
          response.status,
          true
        );
      }

    } catch (error) {
      lastError = error;

      // Erreur d'abandon (timeout)
      if (error.name === 'AbortError') {
        if (attempt < maxRetries) {
          if (__DEV__) console.warn(`[API] Timeout, retry ${attempt + 1}/${maxRetries}...`);
          await sleep(getExponentialDelay(attempt));
          continue;
        }
        throw new ApiError('Délai de requête dépassé', 408, true);
      }

      // Erreur réseau - réessayer
      if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        if (attempt < maxRetries) {
          if (__DEV__) console.warn(`[API] Erreur réseau, retry ${attempt + 1}/${maxRetries}...`);
          await sleep(getExponentialDelay(attempt));
          continue;
        }
        throw new ApiError('Erreur de connexion réseau', 0, true);
      }

      // Autres erreurs - propager directement
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw new ApiError(error.message || 'Erreur inconnue', 0, false);
    }
  }

  // Ne devrait jamais arriver, mais au cas où
  throw lastError || new ApiError('Échec après plusieurs tentatives', 0, true);
}

export default {
  fetchWithRetry,
  ApiError,
};
