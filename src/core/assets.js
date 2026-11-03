/**
 * Actifs et enveloppes.
 *
 * Un actif est identifié par `type:SYMBOLE` (ex. `crypto:BTC`, `stock:CW8.PA`)
 * pour qu'une crypto et une action portant le même ticker ne se confondent
 * jamais. Une position, elle, est un actif DANS une enveloppe : le même ETF
 * détenu en PEA et en compte-titres forme deux positions, parce que leur
 * prix de revient et leur fiscalité sont distincts.
 */

export const ASSET_TYPES = Object.freeze({
  CRYPTO: 'crypto',
  STOCK: 'stock', // actions, ETF et fonds cotés
});

export const ACCOUNTS = Object.freeze({
  PEA: 'PEA',
  CTO: 'CTO',
  CRYPTO: 'CRYPTO',
  // Livrets, comptes, assurance-vie : des soldes saisis, pas des opérations.
  CASH: 'CASH',
});

/** Ordre d'affichage des enveloppes. */
export const ACCOUNT_ORDER = [ACCOUNTS.PEA, ACCOUNTS.CTO, ACCOUNTS.CRYPTO, ACCOUNTS.CASH];

/** Plafond légal des versements sur un PEA classique. */
export const PEA_DEPOSIT_CEILING = 150000;

/** Ancienneté (en années) à partir de laquelle un retrait ne clôture plus le PEA. */
export const PEA_MATURITY_YEARS = 5;

/** Enveloppes autorisées pour un type d'actif. */
export const accountsForType = (type) =>
  type === ASSET_TYPES.CRYPTO ? [ACCOUNTS.CRYPTO] : [ACCOUNTS.PEA, ACCOUNTS.CTO];

export const defaultAccountFor = (type) =>
  type === ASSET_TYPES.CRYPTO ? ACCOUNTS.CRYPTO : ACCOUNTS.CTO;

export const isValidAccountForType = (account, type) =>
  accountsForType(type).includes(account);

export const normalizeSymbol = (symbol) => String(symbol || '').trim().toUpperCase();

export const makeAssetId = (type, symbol) => `${type}:${normalizeSymbol(symbol)}`;

export const parseAssetId = (assetId) => {
  const str = String(assetId || '');
  const i = str.indexOf(':');
  if (i < 0) return { type: ASSET_TYPES.STOCK, symbol: normalizeSymbol(str) };
  return { type: str.slice(0, i), symbol: str.slice(i + 1) };
};

/** Clé d'une position : un actif dans une enveloppe. */
export const positionKey = (assetId, account) => `${assetId}@${account}`;
