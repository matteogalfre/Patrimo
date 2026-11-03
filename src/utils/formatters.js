/**
 * Utilitaires de formatage.
 *
 * Tous les formatters acceptent une `locale` optionnelle (BCP-47) afin de
 * respecter la langue choisie par l'utilisateur. Les anciens appels sans
 * locale tombent désormais sur `en-US` (au lieu d'un `fr-FR` codé en dur),
 * et les appelants applicatifs (`DashboardScreen`, `PortfolioScreen`, …)
 * propagent la locale issue de `SettingsContext`.
 */

import { MONTHS_SHORT_FR, MONTHS_FR } from '../constants';
import { getCryptoDecimals } from '../constants/cryptoMetadata';

const DEFAULT_LOCALE = 'en-US';

// Langue des pourcentages, tenue à jour par SettingsContext : formatPercent est
// appelé partout et lui passer la langue à chaque fois serait fastidieux.
let displayLocale = DEFAULT_LOCALE;
export const setDisplayLocale = (locale) => {
  displayLocale = locale || DEFAULT_LOCALE;
};

/**
 * Formate une date selon différents formats.
 * @param {Date|string|number} date
 * @param {object} [options]
 * @param {string} [options.format] - 'short' | 'long' | 'time' | 'full' | 'dateTime' | 'iso' | 'relative'
 * @param {string} [options.locale] - BCP-47 (ex: 'fr-FR'). Défaut: 'en-US'.
 * @param {object} [options.relative] - options forwardées à `formatRelativeDate`
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';

  const { format = 'short', locale = DEFAULT_LOCALE, relative } = options;

  const formats = {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    time: { hour: '2-digit', minute: '2-digit' },
    full: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
    dateTime: { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' },
  };

  if (format === 'iso') return d.toISOString();
  if (format === 'relative') return formatRelativeDate(d, relative);

  const text = d.toLocaleDateString(locale, formats[format] || formats.short);
  // En français, le premier du mois s'écrit « 1er ».
  return String(locale).startsWith('fr') && d.getDate() === 1 && format !== 'time' ? text.replace(/(^|\s)1(?=\s)/, '$11er') : text;
};

/**
 * Formate une date en format relatif. Si `t` est fourni, utilise les clés
 * `time.now`, `time.minutesAgo`, `time.hoursAgo`, `time.daysAgo`,
 * `time.weeksAgo`, `time.monthsAgo`, `time.yearsAgo`. Sinon: fallback anglais.
 *
 * @param {Date|string|number} date
 * @param {object} [opts]
 * @param {function} [opts.t]
 * @returns {string}
 */
export const formatRelativeDate = (date, opts = {}) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '--';

  const now = new Date();
  const diffMs = now - d;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const fallback = (en) => en;
  const t = opts.t || fallback;

  if (diffMinutes < 1) return opts.t ? t('time.now') : 'Just now';
  if (diffMinutes < 60) {
    return opts.t ? t('time.minutesAgo', { count: diffMinutes }) : `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return opts.t ? t('time.hoursAgo', { count: diffHours }) : `${diffHours}h ago`;
  }
  if (diffDays === 1) return opts.t ? t('time.yesterday') : 'Yesterday';
  if (diffDays < 7) {
    return opts.t ? t('time.daysAgo', { count: diffDays }) : `${diffDays}d ago`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return opts.t ? t('time.weeksAgo', { count: weeks }) : `${weeks}w ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return opts.t ? t('time.monthsAgo', { count: months }) : `${months}mo ago`;
  }
  const years = Math.floor(diffDays / 365);
  return opts.t ? t('time.yearsAgo', { count: years }) : `${years}y ago`;
};

/**
 * Formate une date en clé YYYY-MM-DD (indépendant de la locale).
 */
export const formatDateKey = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Formate une heure (HH:MM, locale-indépendant pour rester stable visuellement).
 */
export const formatTime = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Formate un montant en devise.
 * @param {number} value
 * @param {object} [options]
 * @param {number} [options.decimals=2]
 * @param {string} [options.prefix='$']
 * @param {boolean} [options.compact=false]
 * @param {boolean} [options.showSign=false]
 * @param {string} [options.locale='en-US']
 */
export const formatCurrency = (value, options = {}) => {
  const {
    decimals = 2,
    prefix = '$',
    compact = false,
    showSign = false,
    locale = DEFAULT_LOCALE,
  } = options;
  const num = Number(value);

  if (!Number.isFinite(num)) return `${prefix}0`;

  if (compact) {
    if (Math.abs(num) >= 1_000_000_000) {
      return `${showSign && num > 0 ? '+' : ''}${prefix}${(num / 1_000_000_000).toFixed(1)}B`;
    }
    if (Math.abs(num) >= 1_000_000) {
      return `${showSign && num > 0 ? '+' : ''}${prefix}${(num / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1_000) {
      return `${showSign && num > 0 ? '+' : ''}${prefix}${(num / 1_000).toFixed(1)}K`;
    }
  }

  const formatted = Math.abs(num).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign = showSign && num > 0 ? '+' : '';
  return num < 0 ? `-${prefix}${formatted}` : `${sign}${prefix}${formatted}`;
};

/**
 * Formate un pourcentage.
 */
export const formatPercent = (value, options = {}) => {
  const { decimals = 1, showSign = true, locale = displayLocale } = options;
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  const sign = showSign && num > 0 ? '+' : '';
  try {
    // « -0,8 % » en français, « -0.8% » en anglais.
    return sign + new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num / 100);
  } catch {
    return `${sign}${num.toFixed(decimals)}%`;
  }
};

/**
 * Formate une quantité de crypto avec sa précision recommandée.
 * Backward-compatible: `(value, symbol)` ou `(value, symbol, locale)`.
 */
export const formatCryptoAmount = (value, symbol, locale = DEFAULT_LOCALE) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const precision = getCryptoDecimals(symbol);
  return num.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
};

/**
 * Formate une quantité : jusqu'à 8 décimales pour une crypto, 4 pour un titre
 * (fractions d'ETF chez certains courtiers), sans zéros inutiles.
 */
export const formatQuantity = (value, assetType, locale = DEFAULT_LOCALE) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: assetType === 'crypto' ? 8 : 4,
  });
};

/**
 * Formate un label de graphique. Si `months` (tableau de 12 noms courts) est
 * fourni, l'utilise; sinon retombe sur les mois français.
 */
export const formatChartLabel = (date, showYear = false, months = MONTHS_SHORT_FR) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const monthName = (months && months[d.getMonth()]) || MONTHS_SHORT_FR[d.getMonth()];
  if (showYear) {
    return `${monthName} '${String(d.getFullYear()).slice(-2)}`;
  }
  return monthName;
};

/**
 * Obtient le nom du mois. Accepte des libellés i18n via `months`.
 */
export const getMonthName = (monthIndex, short = false, months) => {
  if (months && months[monthIndex]) return months[monthIndex];
  const fallback = short ? MONTHS_SHORT_FR : MONTHS_FR;
  return fallback[monthIndex] || '';
};

export default {
  formatDate,
  formatRelativeDate,
  formatDateKey,
  formatTime,
  formatCurrency,
  formatPercent,
  formatCryptoAmount,
  formatChartLabel,
  getMonthName,
};
