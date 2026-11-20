/**
 * Connexion bancaire via GoCardless Bank Account Data (DSP2) : lecture du
 * solde et du nom des comptes, rien d'autre (ni transactions ni paiement).
 *
 * Les clés (Secret ID / Secret Key) se créent dans le portail GoCardless et se
 * saisissent dans l'app. Elles restent dans le coffre sécurisé du téléphone
 * (Keystore Android) : jamais dans le code, l'APK ou une sauvegarde. Le
 * jeton d'accès (24 h) et celui de renouvellement (30 jours) y sont gardés
 * aussi, pour ne pas redemander un jeton à chaque appel.
 *
 * Limites de GoCardless : environ 4 lectures par jour et par compte ;
 * l'accord bancaire dure 90 à 180 jours selon la banque.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fetchWithRetry } from './apiClient';

const BASE = 'https://bankaccountdata.gocardless.com/api/v2';
const KEYS = { id: 'gc_secret_id', key: 'gc_secret_key', tokens: 'gc_tokens' };
const REQUEST = { timeoutMs: 20000 };

/** Adresse de retour après l'accord donné sur le site de la banque. */
export const BANK_REDIRECT = 'patrimo://bank-callback';

let tokens = null; // { access, accessUntil, refresh, refreshUntil }

const json = (method, body) => ({
  ...REQUEST,
  method,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

const readTokens = async () => {
  if (tokens) return tokens;
  try {
    tokens = JSON.parse((await SecureStore.getItemAsync(KEYS.tokens)) || 'null');
  } catch {
    tokens = null;
  }
  return tokens;
};

const saveTokens = async (next) => {
  tokens = next;
  await SecureStore.setItemAsync(KEYS.tokens, JSON.stringify(next));
};

/** Un jeton valide : le gardé, renouvelé, ou un nouveau à partir des clés. */
const accessToken = async () => {
  const now = Date.now();
  const t = await readTokens();
  if (t?.access && t.accessUntil - 60000 > now) return t.access;
  if (t?.refresh && t.refreshUntil - 60000 > now) {
    try {
      const r = await fetchWithRetry(`${BASE}/token/refresh/`, json('POST', { refresh: t.refresh }), 0);
      await saveTokens({ ...t, access: r.access, accessUntil: now + r.access_expires * 1000 });
      return r.access;
    } catch {
      // Jeton de renouvellement refusé : on repart des clés.
    }
  }
  const [secretId, secretKey] = await Promise.all([SecureStore.getItemAsync(KEYS.id), SecureStore.getItemAsync(KEYS.key)]);
  if (!secretId || !secretKey) throw new Error('NO_CREDENTIALS');
  const r = await fetchWithRetry(`${BASE}/token/new/`, json('POST', { secret_id: secretId, secret_key: secretKey }), 0);
  await saveTokens({
    access: r.access,
    accessUntil: now + r.access_expires * 1000,
    refresh: r.refresh,
    refreshUntil: now + r.refresh_expires * 1000,
  });
  return r.access;
};

// Pas de nouvel essai automatique : chaque lecture de compte compte dans le
// quota du jour, et un refus 429 ne doit pas faire attendre des heures.
const call = async (path, method = 'GET', body) => {
  let token;
  try {
    token = await accessToken();
  } catch (err) {
    err.code = 'AUTH'; // clés absentes ou refusées, pas l'accord bancaire
    throw err;
  }
  const options = json(method, body);
  options.headers.Authorization = `Bearer ${token}`;
  return fetchWithRetry(`${BASE}${path}`, options, 0);
};

/**
 * Empreinte d'un compte pour le reconnaître d'un accord à l'autre, sans
 * garder son IBAN.
 */
export const accountFingerprint = async ({ iban, resourceId, name, currency }) => {
  // Avec la devise : chez Revolut, les poches EUR et USD partagent un IBAN.
  let source = `name:${name}`;
  if (resourceId) source = `resource:${resourceId}`;
  if (iban) source = `iban:${String(iban).replace(/\s+/g, '').toUpperCase()}`;
  source = `${source}|${currency}`;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `patrimo:${source}`);
  return digest.slice(0, 24);
};

export const gocardless = {
  async hasCredentials() {
    return !!(await SecureStore.getItemAsync(KEYS.id)) && !!(await SecureStore.getItemAsync(KEYS.key));
  },

  /** Enregistre les clés après avoir vérifié qu'elles ouvrent bien une session. */
  async saveCredentials(secretId, secretKey) {
    const id = String(secretId || '').trim();
    const key = String(secretKey || '').trim();
    if (!id || !key) throw new Error('EMPTY');
    const now = Date.now();
    const r = await fetchWithRetry(`${BASE}/token/new/`, json('POST', { secret_id: id, secret_key: key }), 0);
    await SecureStore.setItemAsync(KEYS.id, id);
    await SecureStore.setItemAsync(KEYS.key, key);
    await saveTokens({
      access: r.access,
      accessUntil: now + r.access_expires * 1000,
      refresh: r.refresh,
      refreshUntil: now + r.refresh_expires * 1000,
    });
  },

  async clearCredentials() {
    tokens = null;
    await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
  },

  /** Banques disponibles dans un pays. */
  listInstitutions: (country = 'FR') => call(`/institutions/?country=${encodeURIComponent(country.toLowerCase())}`),

  /**
   * Prépare la connexion à une banque : un accord limité au solde et au
   * détail des comptes, pour la durée maximale que la banque accepte.
   * @returns {Promise<{requisitionId: string, link: string, validDays: number}>}
   */
  async startConnection(institution, { language = 'FR' } = {}) {
    const days = Math.min(180, Number(institution.max_access_valid_for_days) || 90);
    // On ne lit pas les opérations : 90 jours d'historique suffisent et
    // évitent le consentement renforcé que certaines banques exigent au-delà.
    const history = Math.min(90, Number(institution.transaction_total_days) || 90);
    // Accord limité au solde et au détail ; si la banque le refuse, accord
    // par défaut, puis sur 90 jours (certaines n'acceptent pas plus).
    const attempts = [
      { max_historical_days: history, access_valid_for_days: days, access_scope: ['balances', 'details'] },
      { max_historical_days: history, access_valid_for_days: days },
      { max_historical_days: history, access_valid_for_days: Math.min(days, 90) },
    ];
    let agreement = null;
    let lastError = null;
    for (const body of attempts) {
      try {
        agreement = await call('/agreements/enduser/', 'POST', { institution_id: institution.id, ...body });
        break;
      } catch (err) {
        lastError = err;
        // Clés, quota ou réseau : inutile d'insister avec un autre accord.
        if (err?.code === 'AUTH' || !err?.statusCode || [401, 403, 429].includes(err.statusCode)) throw err;
      }
    }
    if (!agreement) throw lastError;
    const requisition = await call('/requisitions/', 'POST', {
      redirect: BANK_REDIRECT,
      institution_id: institution.id,
      agreement: agreement.id,
      reference: `patrimo-${Date.now()}`,
      user_language: language.toUpperCase(),
    });
    return { requisitionId: requisition.id, link: requisition.link, validDays: agreement.access_valid_for_days || days };
  },

  /** Statut de la connexion (« LN » : comptes reliés) et ses comptes. */
  getRequisition: (id) => call(`/requisitions/${encodeURIComponent(id)}/`),

  /** Révoque l'accord côté banque, au mieux : on oublie la banque de toute façon. */
  async deleteRequisition(id) {
    try {
      await call(`/requisitions/${encodeURIComponent(id)}/`, 'DELETE');
      return true;
    } catch {
      return false;
    }
  },

  getAccountDetails: (accountId) => call(`/accounts/${encodeURIComponent(accountId)}/details/`),
  getAccountBalances: (accountId) => call(`/accounts/${encodeURIComponent(accountId)}/balances/`),
};

export default gocardless;
