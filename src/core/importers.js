/**
 * Normalisation des opérations et sauvegardes Patrimo (fonctions pures).
 *
 * Chaque enregistrement garde son identifiant : réimporter la même sauvegarde
 * ne crée pas de doublon.
 */

import {
  ACCOUNTS,
  ASSET_TYPES,
  defaultAccountFor,
  isValidAccountForType,
  makeAssetId,
  normalizeSymbol,
} from './assets';
import { normalizeCashAccount } from './cash';

export const BACKUP_APP_NAME = 'Patrimo';
export const BACKUP_FORMAT_VERSION = 1;

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
};

const toIsoDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Remet une opération au format interne. Renvoie null si elle est inutilisable
 * (pas de symbole, quantité nulle, date invalide).
 */
export const normalizeTransaction = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const assetType = raw.assetType === ASSET_TYPES.CRYPTO ? ASSET_TYPES.CRYPTO : ASSET_TYPES.STOCK;
  const symbol = normalizeSymbol(raw.symbol);
  const quantity = Math.abs(toNum(raw.quantity) ?? 0);
  const date = toIsoDate(raw.date);
  if (!symbol || !(quantity > 0) || !date) return null;

  const account = isValidAccountForType(raw.account, assetType) ? raw.account : defaultAccountFor(assetType);
  const unitPrice = toNum(raw.unitPrice);
  return {
    id: String(raw.id || ''),
    assetType,
    symbol,
    assetId: makeAssetId(assetType, symbol),
    name: raw.name || symbol,
    account,
    side: raw.side === 'sell' ? 'sell' : 'buy',
    quantity,
    unitPrice: unitPrice > 0 ? unitPrice : null,
    fees: Math.abs(toNum(raw.fees) ?? 0),
    currency: String(raw.currency || 'EUR').toUpperCase(),
    date,
    notes: raw.notes || null,
    priceSource: raw.priceSource === 'market' ? 'market' : 'user',
    createdAt: raw.createdAt || raw.created_at || date,
    updatedAt: raw.updatedAt || raw.updated_at || null,
  };
};

export const normalizeDividend = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const amount = toNum(raw.amount);
  const date = toIsoDate(raw.date);
  const symbol = normalizeSymbol(raw.symbol);
  if (!(amount > 0) || !date) return null;
  const account = [ACCOUNTS.PEA, ACCOUNTS.CTO].includes(raw.account) ? raw.account : ACCOUNTS.CTO;
  return {
    id: String(raw.id || ''),
    assetId: symbol ? makeAssetId(ASSET_TYPES.STOCK, symbol) : null,
    symbol: symbol || null,
    name: raw.name || symbol || null,
    account,
    amount,
    currency: String(raw.currency || 'EUR').toUpperCase(),
    date,
    notes: raw.notes || null,
  };
};

/** Une sauvegarde Patrimo ? Renvoie 'patrimo', sinon null. */
export const detectBackupFormat = (json) => {
  if (!json || typeof json !== 'object' || !json.data) return null;
  const isPatrimo = json.appName === BACKUP_APP_NAME || Array.isArray(json.data.transactions);
  return isPatrimo ? 'patrimo' : null;
};

/**
 * Lit une sauvegarde Patrimo.
 * @returns {{format: string, transactions: object[], dividends: object[], cashAccounts: object[], skipped: number}}
 */
export const parseBackup = (json) => {
  const format = detectBackupFormat(json);
  if (!format) throw new Error('UNKNOWN_FORMAT');

  const tx = json.data.transactions || [];
  const dv = json.data.dividends || [];
  const cash = json.data.cashAccounts || [];
  const transactions = tx.map(normalizeTransaction).filter(Boolean);
  const dividends = dv.map(normalizeDividend).filter(Boolean);
  const cashAccounts = cash.map(normalizeCashAccount).filter(Boolean);
  return {
    format,
    transactions,
    dividends,
    cashAccounts,
    skipped: tx.length + dv.length + cash.length - transactions.length - dividends.length - cashAccounts.length,
  };
};

/** Fusionne sans doublon (même identifiant = même opération). */
export const mergeById = (existing, incoming) => {
  const ids = new Set(existing.map((x) => x.id));
  const added = incoming.filter((x) => x.id && !ids.has(x.id));
  return { merged: [...existing, ...added], added: added.length };
};

/** Contenu d'une sauvegarde Patrimo. */
export const buildBackup = ({ transactions, dividends, cashAccounts = [], settings = {}, appVersion }) => ({
  appName: BACKUP_APP_NAME,
  formatVersion: BACKUP_FORMAT_VERSION,
  version: appVersion,
  exportDate: new Date().toISOString(),
  data: { transactions, dividends, cashAccounts, settings },
});
