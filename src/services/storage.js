/**
 * Stockage local (AsyncStorage) : rien ne quitte le téléphone.
 *
 *  - opérations (achats / ventes) ;
 *  - dividendes ;
 *  - comptes de liquidités et d'épargne ;
 *  - cache des historiques de cours ;
 *  - sauvegarde / restauration en fichier JSON, protégée ou non par mot de passe.
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
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../core/backupCrypto';

const newId = (prefix) => {
  try {
    return `${prefix}_${Crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
};

const readList = async (key) => {
  const raw = await AsyncStorage.getItem(key);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
};

const writeList = (key, list) => AsyncStorage.setItem(key, JSON.stringify(list));

/** CRUD générique sur une liste persistée, avec normalisation à l'écriture. */
const makeRepository = (key, prefix, normalize) => ({
  async getAll() {
    try {
      return { data: (await readList(key)).map(normalize).filter(Boolean), error: null };
    } catch (error) {
      if (__DEV__) console.error(`[Storage] lecture ${key}:`, error);
      return { data: [], error };
    }
  },

  async add(item) {
    try {
      const list = await readList(key);
      const now = new Date().toISOString();
      const record = normalize({ ...item, id: newId(prefix), createdAt: now });
      if (!record) return { data: null, error: new Error('INVALID') };
      list.push(record);
      await writeList(key, list);
      return { data: record, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async update(id, patch) {
    try {
      const list = await readList(key);
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return { data: null, error: new Error('NOT_FOUND') };
      const record = normalize({ ...list[i], ...patch, id, updatedAt: new Date().toISOString() });
      if (!record) return { data: null, error: new Error('INVALID') };
      list[i] = record;
      await writeList(key, list);
      return { data: record, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  async remove(ids) {
    try {
      const drop = new Set(Array.isArray(ids) ? ids : [ids]);
      const list = await readList(key);
      await writeList(key, list.filter((x) => !drop.has(x.id)));
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  async replaceAll(list) {
    await writeList(key, list.map(normalize).filter(Boolean));
  },
});

export const transactionsRepo = makeRepository(STORAGE_KEYS.TRANSACTIONS, 'tx', normalizeTransaction);
export const dividendsRepo = makeRepository(STORAGE_KEYS.DIVIDENDS, 'div', normalizeDividend);
export const cashRepo = makeRepository(STORAGE_KEYS.CASH_ACCOUNTS, 'cash', normalizeCashAccount);

/**
 * Cache des historiques de cours, par actif. Un cours passé ne change plus :
 * un rafraîchissement par jour suffit.
 */
export const historyCache = {
  async read() {
    try {
      const [raw, rawTs] = await AsyncStorage.multiGet([
        STORAGE_KEYS.HISTORICAL_PRICES,
        STORAGE_KEYS.HISTORICAL_PRICES_TS,
      ]);
      const value = raw[1] ? JSON.parse(raw[1]) : null;
      if (!value?.series) return null;
      return { ...value, ts: rawTs[1] ? Number(rawTs[1]) : 0 };
    } catch {
      return null;
    }
  },

  async write({ series, currencies, from }) {
    try {
      const payload = JSON.stringify({ series, currencies, from });
      if (payload.length > HISTORICAL_PRICES_MAX_BYTES) return false;
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.HISTORICAL_PRICES, payload],
        [STORAGE_KEYS.HISTORICAL_PRICES_TS, String(Date.now())],
      ]);
      return true;
    } catch {
      return false;
    }
  },

  /** Le cache couvre-t-il ces actifs depuis cette date, et est-il récent ? */
  isUsable(cached, assetIds, fromKey) {
    if (!cached || !(cached.ts > 0) || Date.now() - cached.ts > HISTORICAL_PRICES_TTL) return false;
    if (cached.from && fromKey && cached.from > fromKey) return false;
    return assetIds.every((id) => cached.series[id] && Object.keys(cached.series[id]).length > 0);
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
    const [{ data: transactions }, { data: dividends }, { data: cashAccounts }] = await Promise.all([
      transactionsRepo.getAll(),
      dividendsRepo.getAll(),
      cashRepo.getAll(),
    ]);
    return buildBackup({ transactions, dividends, cashAccounts, settings, appVersion: APP_INFO.version });
  },

  /** Contenu du fichier : chiffré si un mot de passe est donné. */
  async buildFileContent(settings = {}, password = null) {
    const backup = await this.buildPayload(settings);
    if (!password) return JSON.stringify(backup, null, 2);
    return JSON.stringify(await encryptBackup(backup, password, randomBytes));
  },

  async exportData(settings = {}, { password = null } = {}) {
    try {
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
        return {
          success: true,
          format: parsed.format,
          added: parsed.transactions.length + parsed.dividends.length + parsed.cashAccounts.length,
          skipped: parsed.skipped,
          settings: json.data?.settings || null,
        };
      }

      const [{ data: tx }, { data: dv }, { data: cash }] = await Promise.all([
        transactionsRepo.getAll(),
        dividendsRepo.getAll(),
        cashRepo.getAll(),
      ]);
      const t = mergeById(tx, parsed.transactions);
      const d = mergeById(dv, parsed.dividends);
      const c = mergeById(cash, parsed.cashAccounts);
      await transactionsRepo.replaceAll(t.merged);
      await dividendsRepo.replaceAll(d.merged);
      await cashRepo.replaceAll(c.merged);
      return { success: true, format: parsed.format, added: t.added + d.added + c.added, skipped: parsed.skipped, settings: null };
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
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.DIVIDENDS,
      STORAGE_KEYS.CASH_ACCOUNTS,
      STORAGE_KEYS.PLANNING,
      STORAGE_KEYS.HISTORICAL_PRICES,
      STORAGE_KEYS.HISTORICAL_PRICES_TS,
    ]);
  },
};
