import appJson from '../../app.json';

export {
  CRYPTO_METADATA,
  PREDEFINED_CRYPTOS,
  generateCryptoColor,
  getCryptoMetadata,
  getCryptoDecimals,
} from './cryptoMetadata';

// Clés de stockage AsyncStorage
export const STORAGE_KEYS = {
  TRANSACTIONS: '@patrimo_transactions',
  DIVIDENDS: '@patrimo_dividends',
  CASH_ACCOUNTS: '@patrimo_cash_accounts',
  PLANNING: '@patrimo_planning',
  SETTINGS: '@patrimo_settings',
  LAST_BACKUP: '@patrimo_last_backup',
  WIDGET_DATA: '@patrimo_widget_data',
  WIDGET_LAST_UPDATE: '@patrimo_widget_last_update',
  THEME_PREFERENCE: '@patrimo_theme',
  BINANCE_PAIRS: '@patrimo_binance_pairs',
  BINANCE_PAIRS_TS: '@patrimo_binance_pairs_ts',
  PRICE_ALERTS: '@patrimo_price_alerts',
  BIOMETRIC_ENABLED: '@patrimo_biometric_enabled',
  HISTORICAL_PRICES: '@patrimo_historical_prices',
  HISTORICAL_PRICES_TS: '@patrimo_historical_prices_ts',
  CRASH_LOG: '@patrimo_crash_log',
  INFLATION: '@patrimo_inflation',
  DEMO_MODE: '@patrimo_demo_mode',
  BANK_LINKS: '@patrimo_bank_links',
  LOANS: '@patrimo_loans',
  PROPERTIES: '@patrimo_properties',
  BANK_INSTITUTIONS: '@patrimo_bank_institutions',
  LAST_QUOTES: '@patrimo_last_quotes',
};

// Les cours passes ne changent plus : un rafraichissement par jour suffit.
export const HISTORICAL_PRICES_TTL = 24 * 60 * 60 * 1000;

// Garde-fou de taille : au-dela, on renonce a ecrire plutot que de risquer un
// echec d'AsyncStorage (la fenetre du curseur SQLite est limitee sur Android).
export const HISTORICAL_PRICES_MAX_BYTES = 1_500_000;

// Durée de vie du cache du catalogue Binance (paires USDT) — 24h.
export const BINANCE_PAIRS_TTL = 24 * 60 * 60 * 1000;

// Configuration des périodes pour les graphiques
export const CHART_PERIODS = {
  '3M': { months: 3, maxPoints: 6, maxLabels: 4 },
  '6M': { months: 6, maxPoints: 8, maxLabels: 5 },
  '1Y': { months: 12, maxPoints: 12, maxLabels: 6 },
  'ALL': { months: null, maxPoints: 18, maxLabels: 6 },
};

// Configuration des périodes pour le détail crypto
export const DETAIL_PERIODS = [
  { key: '1M', type: 'day', amount: 30, label: '1M' },
  { key: '3M', type: 'day', amount: 90, label: '3M' },
  { key: '1Y', type: 'day', amount: 365, label: '1A' },
  { key: '5Y', type: 'day', amount: 1825, label: '5A' },
  { key: 'MAX', type: 'day', amount: 5000, label: 'Max' },
];

// French month names — fallback when i18n is unavailable (e.g. non-React code paths)
export const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

// Short French month labels — fallback for chart labels when monthNames isn’t passed from i18n
export const MONTHS_SHORT_FR = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'
];

// Limites de l'application
export const LIMITS = {
  MAX_INVESTMENT_AMOUNT: 1000000000, // 1 milliard
  MAX_DECIMALS: 8,
  MAX_NOTES_LENGTH: 500,
  MAX_SYMBOL_LENGTH: 10,
  API_TIMEOUT: 15000,
  API_MAX_RETRIES: 3,
  API_RETRY_DELAY: 1000,
};

// App info : la version vient d'app.json, une seule source.
export const APP_INFO = {
  name: 'Patrimo',
  version: appJson.expo.version,
  repo: 'https://github.com/matteogalfre/Patrimo',
};
