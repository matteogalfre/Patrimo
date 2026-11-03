/**
 * Configuration de l'internationalisation (i18n)
 * Utilise expo-localization pour détecter la langue du téléphone
 * et i18n-js pour les traductions
 */

import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

// Import des traductions
import fr from './translations/fr';
import en from './translations/en';
import es from './translations/es';
import de from './translations/de';
import it from './translations/it';
import pt from './translations/pt';

// Langues supportées
export const SUPPORTED_LANGUAGES = {
  fr: { code: 'fr', name: 'Français', nativeName: 'Français' },
  en: { code: 'en', name: 'English', nativeName: 'English' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch' },
  it: { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
};

// Mapping code langue -> tag BCP-47, réexporté depuis un module pur (sans
// dépendance native) pour rester testable côté Node.
export { LOCALE_MAP, getLocaleTag } from './locales';

// Devises supportées
export const SUPPORTED_CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  CNY: { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
};

// Créer l'instance i18n
const i18n = new I18n({
  fr,
  en,
  es,
  de,
  it,
  pt,
});

// Configuration par défaut
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

/**
 * Détecte la langue du système
 * @returns {string} Code de langue (fr, en, etc.)
 */
export const getDeviceLanguage = () => {
  // Récupère la locale du système (ex: 'fr-FR', 'en-US')
  const locale = Localization.getLocales()[0]?.languageCode || 'en';
  
  // Vérifie si la langue est supportée
  if (SUPPORTED_LANGUAGES[locale]) {
    return locale;
  }
  
  // Fallback sur anglais
  return 'en';
};

/**
 * Change la langue de l'application
 * @param {string} languageCode - Code de langue (fr, en, etc.)
 */
export const setLanguage = (languageCode) => {
  if (SUPPORTED_LANGUAGES[languageCode]) {
    i18n.locale = languageCode;
  }
};

/**
 * Récupère la langue actuelle
 * @returns {string} Code de langue actuel
 */
export const getCurrentLanguage = () => {
  return i18n.locale;
};

/**
 * Fonction de traduction raccourcie
 * @param {string} key - Clé de traduction (ex: 'common.cancel')
 * @param {object} options - Options de traduction (interpolation, etc.)
 * @returns {string} Texte traduit
 */
export const t = (key, options = {}) => {
  return i18n.t(key, options);
};

// Initialiser avec la langue du système
i18n.locale = getDeviceLanguage();

export default i18n;
