/**
 * Stockage local (AsyncStorage) : rien ne quitte le téléphone.
 *
 *  - opérations (achats / ventes) ;
 *  - dividendes ;
 *  - comptes de liquidités et d'épargne ;
 *  - cache des historiques de cours ;
 *  - sauvegarde / restauration en fichier JSON, protégée ou non par mot de passe.
 *
 * Mode démo : les opérations, dividendes, liquidités, crédits, biens et la
 * planification d'exemple vivent sous d'autres clés. Les vraies données ne
 * sont ni lues ni modifiées tant qu'il est actif, et le quitter efface
 * seulement l'exemple.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';

import { STORAGE_KEYS, APP_INFO, HISTORICAL_PRICES_TTL, HISTORICAL_PRICES_MAX_BYTES } from '../constants';
import {
  buildBackup,
  mergeById,
  normalizeDividend,
  normalizeTransaction,
  parseBackup,
} from '../core/importers';
import { normalizeCashAccount } from '../core/cash';
import { normalizeLoan } from '../core/loans';
import { normalizeProperty } from '../core/realEstate';
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../core/backupCrypto';

const newId = (prefix) => {
  try {
    return `${prefix}_${Crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
};

const DEMO_SUFFIX = '_demo';
let demoOn = null; // lu une fois, au premier accès

const isDemo = async () => {
  if (demoOn === null) demoOn = (await AsyncStorage.getItem(STORAGE_KEYS.DEMO_MODE).catch(() => null)) === '1';
  return demoOn;
};

/** Clé effective d'une liste : celle de l'exemple en mode démo. */
const scoped = async (key) => ((await isDemo()) ? `${key}${DEMO_SUFFIX}` : key);

const readList = async (key) => {
  const raw = await AsyncStorage.getItem(key);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
};

const writeList = (key, list) => AsyncStorage.setItem(key, JSON.stringify(list));

/**
 * Une écriture à la fois par clé : chaque modification relit la liste puis la
 * réécrit, deux modifications lancées ensemble perdraient l'une des deux.
 */
const locks = new Map();
const withLock = (key, fn) => {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
};

/** CRUD générique sur une liste persistée, avec normalisation à l'écriture. */
const makeRepository = (baseKey, prefix, normalize) => {
  const repo = {
    key: baseKey,

    async getAll() {
      try {
        const key = await scoped(baseKey);
        return { data: (await readList(key)).map(normalize).filter(Boolean), error: null };
      } catch (error) {
        if (__DEV__) console.error(`[Storage] lecture ${baseKey}:`, error);
        return { data: [], error };
      }
    },

    async add(item) {
      try {
        const key = await scoped(baseKey);
        return await withLock(key, async () => {
          const list = await readList(key);
          const now = new Date().toISOString();
          const record = normalize({ ...item, id: newId(prefix), createdAt: now });
          if (!record) return { data: null, error: new Error('INVALID') };
          list.push(record);
          await writeList(key, list);
          return { data: record, error: null };
        });
      } catch (error) {
        return { data: null, error };
      }
    },

    async update(id, patch) {
      const { data, error } = await repo.updateMany([{ id, ...patch }]);
      if (error) return { data: null, error };
      if (!data.length) return { data: null, error: new Error('NOT_FOUND') };
      return { data: data[0], error: null };
    },

    /**
     * Plusieurs modifications en une lecture et une écriture.
     * @param {Array<{id: string}>} patches
     * @returns {Promise<{data: Array, error: Error|null}>} les enregistrements modifiés
     */
    async updateMany(patches) {
      try {
        const key = await scoped(baseKey);
        return await withLock(key, async () => {
          const list = await readList(key);
          const now = new Date().toISOString();
          const changed = [];
          for (const { id, ...patch } of patches) {
            const i = list.findIndex((x) => x.id === id);
            if (i < 0) continue;
            const record = normalize({ ...list[i], ...patch, id, updatedAt: now });
            if (!record) return { data: [], error: new Error('INVALID') };
            list[i] = record;
            changed.push(record);
          }
          if (changed.length) await writeList(key, list);
          return { data: changed, error: null };
        });
      } catch (error) {
        return { data: [], error };
      }
    },

    async remove(ids) {
      try {
        const key = await scoped(baseKey);
        const drop = new Set(Array.isArray(ids) ? ids : [ids]);
        await withLock(key, async () => {
          const list = await readList(key);
          await writeList(key, list.filter((x) => !drop.has(x.id)));
        });
        return { error: null };
      } catch (error) {
        return { error };
      }
    },

    async replaceAll(list) {
      const key = await scoped(baseKey);
      await withLock(key, () => writeList(key, list.map(normalize).filter(Boolean)));
    },
  };
  return repo;
};

export const transactionsRepo = makeRepository(STORAGE_KEYS.TRANSACTIONS, 'tx', normalizeTransaction);
export const dividendsRepo = makeRepository(STORAGE_KEYS.DIVIDENDS, 'div', normalizeDividend);
export const cashRepo = makeRepository(STORAGE_KEYS.CASH_ACCOUNTS, 'cash', normalizeCashAccount);
export const loansRepo = makeRepository(STORAGE_KEYS.LOANS, 'loan', normalizeLoan);
export const propertiesRepo = makeRepository(STORAGE_KEYS.PROPERTIES, 'prop', normalizeProperty);

/** Planification d'exemple (profil, budget, objectifs…), écrite par PlanningContext. */
export const DEMO_PLANNING_KEY = `${STORAGE_KEYS.PLANNING}${DEMO_SUFFIX}`;

const DEMO_KEYS = [
  ...[transactionsRepo, dividendsRepo, cashRepo, loansRepo, propertiesRepo].map((r) => `${r.key}${DEMO_SUFFIX}`),
  DEMO_PLANNING_KEY,
];

export const demoMode = {
  isOn: isDemo,

  /** Active l'exemple : ses listes sont écrites à part, les vraies restent intactes. */
  async enable({ transactions, dividends, cashAccounts }) {
    await AsyncStorage.multiSet([
      [`${transactionsRepo.key}${DEMO_SUFFIX}`, JSON.stringify(transactions.map(normalizeTransaction).filter(Boolean))],
      [`${dividendsRepo.key}${DEMO_SUFFIX}`, JSON.stringify(dividends.map(normalizeDividend).filter(Boolean))],
      [`${cashRepo.key}${DEMO_SUFFIX}`, JSON.stringify(cashAccounts.map(normalizeCashAccount).filter(Boolean))],
      [STORAGE_KEYS.DEMO_MODE, '1'],
    ]);
    demoOn = true;
  },

  /** Retour aux vraies données ; l'exemple est effacé. */
  async disable() {
    await AsyncStorage.multiRemove([...DEMO_KEYS, STORAGE_KEYS.DEMO_MODE]);
    demoOn = false;
  },
};

/**
 * Cache des historiques de cours, une entrée par actif : un gros portefeuille
 * ne dépasse plus la taille qu'AsyncStorage accepte d'un bloc, et on ne relit
 * que les actifs demandés. Un cours passé ne change plus : un rafraîchissement
 * par jour suffit.
 */
const HISTORY_PREFIX = `${STORAGE_KEYS.HISTORICAL_PRICES}:`;
const historyKey = (assetId) => `${HISTORY_PREFIX}${assetId}`;

export const historyCache = {
  /**
   * @param {string[]} assetIds
   * @returns {Promise<{series: object, currencies: object, froms: object, stamps: object}|null>}
   */
  async read(assetIds = []) {
    try {
      if (!assetIds.length) return null;
      const rows = await AsyncStorage.multiGet(assetIds.map(historyKey));
      const out = { series: {}, currencies: {}, froms: {}, stamps: {} };
      rows.forEach(([key, raw]) => {
        if (!raw) return;
        const id = key.slice(HISTORY_PREFIX.length);
        const v = JSON.parse(raw);
        if (!v?.series) return;
        out.series[id] = v.series;
        if (v.currency) out.currencies[id] = v.currency;
        if (v.from) out.froms[id] = v.from;
        out.stamps[id] = Number(v.ts) || 0;
      });
      return Object.keys(out.series).length ? out : null;
    } catch {
      return null;
    }
  },

  /** Écrit chaque actif à part ; un actif trop gros est simplement ignoré. */
  async write({ series, currencies = {}, froms = {}, from }) {
    try {
      const ts = String(Date.now());
      const pairs = [];
      Object.entries(series).forEach(([id, s]) => {
        if (!s || !Object.keys(s).length) return;
        const payload = JSON.stringify({ series: s, currency: currencies[id] || null, from: froms[id] || from || null, ts });
        if (payload.length <= HISTORICAL_PRICES_MAX_BYTES) pairs.push([historyKey(id), payload]);
      });
      if (pairs.length) await AsyncStorage.multiSet(pairs);
      // Ancien format (tout dans une clé) : plus lu, on libère la place.
      AsyncStorage.multiRemove([STORAGE_KEYS.HISTORICAL_PRICES, STORAGE_KEYS.HISTORICAL_PRICES_TS]).catch(() => {});
      return pairs.length > 0;
    } catch {
      return false;
    }
  },

  /** Le cache couvre-t-il chacun de ces actifs depuis cette date, et est-il récent ? */
  isUsable(cached, assetIds, fromKey) {
    if (!cached) return false;
    const now = Date.now();
    return assetIds.every((id) => cached.series[id]
      && Object.keys(cached.series[id]).length > 0
      && cached.stamps[id] > 0 && now - cached.stamps[id] <= HISTORICAL_PRICES_TTL
      && (!cached.froms[id] || !fromKey || cached.froms[id] <= fromKey));
  },

  async clear() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove([
        ...keys.filter((k) => k.startsWith(HISTORY_PREFIX)),
        STORAGE_KEYS.HISTORICAL_PRICES,
        STORAGE_KEYS.HISTORICAL_PRICES_TS,
      ]);
    } catch {
      // Un cache, rien de grave.
    }
  },
};

const pickJsonFile = async () => {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const content = await FileSystemLegacy.readAsStringAsync(result.assets[0].uri);
  return JSON.parse(content);
};

const randomBytes = (n) => Crypto.getRandomBytes(n);

export const backupService = {
  /** Sauvegarde complète en clair (opérations, dividendes, liquidités, réglages). */
  async buildPayload(settings = {}) {
    const [{ data: transactions }, { data: dividends }, { data: cashAccounts }, { data: loans }, { data: properties }] = await Promise.all([
      transactionsRepo.getAll(),
      dividendsRepo.getAll(),
      cashRepo.getAll(),
      loansRepo.getAll(),
      propertiesRepo.getAll(),
    ]);
    return buildBackup({ transactions, dividends, cashAccounts, loans, properties, settings, appVersion: APP_INFO.version });
  },

  /** Contenu du fichier : chiffré si un mot de passe est donné. */
  async buildFileContent(settings = {}, password = null) {
    const backup = await this.buildPayload(settings);
    if (!password) return JSON.stringify(backup, null, 2);
    return JSON.stringify(await encryptBackup(backup, password, randomBytes));
  },

  async exportData(settings = {}, { password = null } = {}) {
    try {
      // Une sauvegarde de l'exemple passerait pour la vraie.
      if (await isDemo()) throw new Error('DEMO_MODE');
      await this.cleanupExports();
      const content = await this.buildFileContent(settings, password);
      const fileName = `${APP_INFO.name.toLowerCase()}_sauvegarde_${new Date().toISOString().split('T')[0]}.json`;
      const filePath = `${FileSystemLegacy.cacheDirectory}${fileName}`;
      await FileSystemLegacy.writeAsStringAsync(filePath, content);
      if (!(await Sharing.isAvailableAsync())) throw new Error('SHARING_UNAVAILABLE');
      await Sharing.shareAsync(filePath, { mimeType: 'application/json', UTI: 'public.json' });
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString());
      return { success: true, fileName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Efface les fichiers de sauvegarde laissés dans le cache par un export
   * précédent (parfois en clair). Pas juste après le partage : l'appli qui
   * le reçoit peut encore être en train de le lire.
   */
  async cleanupExports() {
    try {
      const dir = FileSystemLegacy.cacheDirectory;
      if (!dir) return;
      const prefix = `${APP_INFO.name.toLowerCase()}_sauvegarde_`;
      const files = await FileSystemLegacy.readDirectoryAsync(dir);
      await Promise.all(files
        .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        .map((f) => FileSystemLegacy.deleteAsync(`${dir}${f}`, { idempotent: true })));
    } catch {
      // Rien de grave : le système vide ce cache de lui-même.
    }
  },

  async markBackedUp() {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString()).catch(() => {});
  },

  /**
   * Choisit un fichier et l'importe. Un fichier protégé n'est pas importé :
   * on renvoie `needsPassword` et l'enveloppe, à déchiffrer avec `decrypt`.
   * @param {{mode: 'merge'|'replace'}} opts - fusion par défaut : on n'écrase rien sans le demander
   */
  async importData({ mode = 'merge' } = {}) {
    try {
      if (await isDemo()) throw new Error('DEMO_MODE');
      const json = await pickJsonFile();
      if (!json) return { success: false, cancelled: true };
      if (isEncryptedBackup(json)) return { success: false, needsPassword: true, envelope: json };
      return this.applyBackup(json, { mode });
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** @throws {Error} 'WRONG_PASSWORD' */
  decrypt(envelope, password) {
    return decryptBackup(envelope, password);
  },

  async applyBackup(json, { mode = 'merge' } = {}) {
    try {
      const parsed = parseBackup(json);

      if (mode === 'replace') {
        await transactionsRepo.replaceAll(parsed.transactions);
        await dividendsRepo.replaceAll(parsed.dividends);
        await cashRepo.replaceAll(parsed.cashAccounts);
        await loansRepo.replaceAll(parsed.loans);
        await propertiesRepo.replaceAll(parsed.properties);
        return {
          success: true,
          format: parsed.format,
          added: parsed.transactions.length + parsed.dividends.length + parsed.cashAccounts.length + parsed.loans.length + parsed.properties.length,
          skipped: parsed.skipped,
          settings: json.data?.settings || null,
        };
      }

      const [{ data: tx }, { data: dv }, { data: cash }, { data: ln }, { data: pr }] = await Promise.all([
        transactionsRepo.getAll(),
        dividendsRepo.getAll(),
        cashRepo.getAll(),
        loansRepo.getAll(),
        propertiesRepo.getAll(),
      ]);
      const t = mergeById(tx, parsed.transactions);
      const d = mergeById(dv, parsed.dividends);
      const c = mergeById(cash, parsed.cashAccounts);
      const l = mergeById(ln, parsed.loans);
      const p = mergeById(pr, parsed.properties);
      await transactionsRepo.replaceAll(t.merged);
      await dividendsRepo.replaceAll(d.merged);
      await cashRepo.replaceAll(c.merged);
      await loansRepo.replaceAll(l.merged);
      await propertiesRepo.replaceAll(p.merged);
      return { success: true, format: parsed.format, added: t.added + d.added + c.added + l.added + p.added, skipped: parsed.skipped, settings: null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getLastBackupDate() {
    try {
      const date = await AsyncStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
      return date ? new Date(date) : null;
    } catch {
      return null;
    }
  },

  async clearAll() {
    // En mode démo, « tout effacer » ne vise que l'exemple.
    if (await isDemo()) {
      await demoMode.disable();
      return;
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.DIVIDENDS,
      STORAGE_KEYS.CASH_ACCOUNTS,
      STORAGE_KEYS.LOANS,
      STORAGE_KEYS.PROPERTIES,
      STORAGE_KEYS.PLANNING,
      STORAGE_KEYS.BANK_LINKS,
      STORAGE_KEYS.LAST_QUOTES,
    ]);
    await historyCache.clear();
  },
};
