/**
 * PIN security utilities.
 *
 * Storage strategy:
 * - The authoritative location for the PIN hash is `expo-secure-store`
 *   (Android Keystore / iOS Keychain). This survives AsyncStorage leaks.
 * - Legacy hashes that used to live inside `AsyncStorage` `settings.pinHash`
 *   are migrated transparently. Verification accepts both formats; once a
 *   legacy hash unlocks successfully we silently re-hash with v2.
 *
 * Hash format v2: `v2:<saltHex>:<sha256Hex>`
 *   - salt: 16 random bytes (`expo-crypto.getRandomBytesAsync`)
 *   - pepper: per-build constant baked in the code, defends against pure
 *     storage exfiltration (attacker still needs the binary).
 *
 * Brute-force resistance: a 4-digit PIN has only 10_000 possibilities, so
 * algorithmic strength alone cannot save us. We additionally enforce a
 * progressive lockout (5 fails → 30s; 10 fails → 5 min) persisted in
 * SecureStore so a process restart cannot reset the counter.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_HASH_KEY = 'patrimo_pin_v2';
const ATTEMPTS_KEY = 'patrimo_pin_attempts';
const LOCKOUT_KEY = 'patrimo_pin_lockout_until';

// Repli AsyncStorage utilisé UNIQUEMENT quand expo-secure-store est
// indisponible ou non fiable dans l'environnement d'exécution (typiquement
// Expo Go, où le Keystore Android n'est pas toujours accessible). Le hash reste
// salé + peppered : c'est moins protégé qu'un stockage Keystore, mais cela
// garantit que le verrouillage par PIN peut bien s'activer et fonctionner.
const FALLBACK_HASH_KEY = '@patrimo_pin_fallback';

// Defense in depth: not a secret, but raises the cost of an offline attack
// against an exfiltrated SecureStore copy.
const APP_PEPPER = 'Patrimo/v1/pepper.Qm7vK2xR-keep-stable';

const SECURE_OPTIONS = {
  keychainService: 'patrimo.pin',
};

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const constantTimeEquals = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

/**
 * Legacy hash kept ONLY for backwards-compatible verification. Never used to
 * produce new hashes. Identical to the original implementation in
 * `PinLockScreen` to preserve binary compatibility.
 */
const legacyHash = (pin) => {
  let hash = 0;
  const str = `${pin}CryptoTrackr_salt`;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};

const sha256 = (data) =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

const computeV2Hash = async (pin, saltHex) =>
  sha256(`${saltHex}|${pin}|${APP_PEPPER}`);

export const isV2Hash = (hash) =>
  typeof hash === 'string' && hash.startsWith('v2:');

/**
 * Produce a fresh v2 hash for the given PIN.
 * @param {string} pin
 * @returns {Promise<string>} formatted as `v2:<salt>:<hash>`
 */
export const createPinHash = async (pin) => {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const saltHex = toHex(saltBytes);
  const hashHex = await computeV2Hash(pin, saltHex);
  return `v2:${saltHex}:${hashHex}`;
};

/**
 * Verify a plain-text PIN against any stored hash format.
 * @param {string} pin
 * @param {string|null|undefined} storedHash
 * @returns {Promise<boolean>}
 */
export const verifyPin = async (pin, storedHash) => {
  if (!storedHash) return false;

  if (isV2Hash(storedHash)) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, saltHex, hashHex] = parts;
    const candidate = await computeV2Hash(pin, saltHex);
    return constantTimeEquals(candidate, hashHex);
  }

  // Legacy fallback (32-bit non-cryptographic hash). Constant-time compare too.
  return constantTimeEquals(legacyHash(pin), storedHash);
};

// ---------------------------------------------------------------------------
// Secure storage helpers
// ---------------------------------------------------------------------------

export const savePinHashSecure = async (hash) => {
  // 1) Tentative via SecureStore, PUIS relecture pour confirmer la persistance.
  //    Sur certains runtimes (Expo Go), setItemAsync peut échouer — ou pire, ne
  //    rien persister sans lever d'erreur — d'où la vérification explicite.
  try {
    await SecureStore.setItemAsync(PIN_HASH_KEY, hash, SECURE_OPTIONS);
    const check = await SecureStore.getItemAsync(PIN_HASH_KEY, SECURE_OPTIONS);
    if (check === hash) {
      // SecureStore est fiable ici : on purge un éventuel repli obsolète.
      await AsyncStorage.removeItem(FALLBACK_HASH_KEY).catch(() => {});
      return;
    }
  } catch {
    // On bascule sur le repli ci-dessous.
  }

  // 2) Repli AsyncStorage : garantit l'activation du PIN même sans SecureStore.
  await AsyncStorage.setItem(FALLBACK_HASH_KEY, hash);
};

export const loadPinHashSecure = async () => {
  // SecureStore prioritaire (emplacement le plus sûr), repli AsyncStorage.
  try {
    const secure = await SecureStore.getItemAsync(PIN_HASH_KEY, SECURE_OPTIONS);
    if (secure) return secure;
  } catch {
    // On tente le repli.
  }
  try {
    return await AsyncStorage.getItem(FALLBACK_HASH_KEY);
  } catch {
    return null;
  }
};

export const deletePinHashSecure = async () => {
  // On efface les deux emplacements pour ne jamais laisser un PIN « fantôme ».
  try {
    await SecureStore.deleteItemAsync(PIN_HASH_KEY, SECURE_OPTIONS);
  } catch {
    // already absent
  }
  try {
    await AsyncStorage.removeItem(FALLBACK_HASH_KEY);
  } catch {
    // already absent
  }
};

// ---------------------------------------------------------------------------
// Lockout (anti brute force) helpers
// ---------------------------------------------------------------------------

const LOCKOUT_SCHEDULE = [
  { failuresAtLeast: 10, durationMs: 5 * 60 * 1000 },
  { failuresAtLeast: 5, durationMs: 30 * 1000 },
];

const readNumber = async (key) => {
  try {
    const raw = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const writeNumber = async (key, value) => {
  try {
    await SecureStore.setItemAsync(key, String(value), SECURE_OPTIONS);
  } catch {
    // best effort
  }
};

const deleteKey = async (key) => {
  try {
    await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
  } catch {
    // already absent
  }
};

/**
 * @returns {Promise<{ count: number, lockoutUntil: number }>}
 */
export const getAttemptState = async () => {
  const [count, lockoutUntil] = await Promise.all([
    readNumber(ATTEMPTS_KEY),
    readNumber(LOCKOUT_KEY),
  ]);
  return { count, lockoutUntil };
};

/**
 * Record a failed attempt and compute the new lockout (if any).
 * @returns {Promise<{ count: number, lockoutUntil: number }>}
 */
export const recordFailedAttempt = async () => {
  const current = await readNumber(ATTEMPTS_KEY);
  const nextCount = current + 1;
  const rule = LOCKOUT_SCHEDULE.find((r) => nextCount >= r.failuresAtLeast);
  const lockoutUntil = rule ? Date.now() + rule.durationMs : 0;

  await writeNumber(ATTEMPTS_KEY, nextCount);
  await writeNumber(LOCKOUT_KEY, lockoutUntil);

  return { count: nextCount, lockoutUntil };
};

export const clearFailedAttempts = async () => {
  await Promise.all([deleteKey(ATTEMPTS_KEY), deleteKey(LOCKOUT_KEY)]);
};

/**
 * Migrate a legacy `pinHash` from AsyncStorage settings into SecureStore.
 * Returns the hash now in SecureStore (or null if nothing).
 */
export const migrateLegacyHashIfNeeded = async (legacyHashFromAsyncStorage) => {
  const existing = await loadPinHashSecure();
  if (existing) return existing;
  if (!legacyHashFromAsyncStorage) return null;
  await savePinHashSecure(legacyHashFromAsyncStorage);
  return legacyHashFromAsyncStorage;
};

export default {
  createPinHash,
  verifyPin,
  isV2Hash,
  savePinHashSecure,
  loadPinHashSecure,
  deletePinHashSecure,
  getAttemptState,
  recordFailedAttempt,
  clearFailedAttempts,
  migrateLegacyHashIfNeeded,
};
