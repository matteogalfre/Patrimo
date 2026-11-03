/**
 * Mapping code langue -> tag BCP-47 pour Intl / toLocaleString.
 *
 * Volontairement isolé dans un module SANS dépendance native (pas d'import
 * d'expo-localization ni d'i18n-js) afin de rester importable depuis des
 * modules testés en environnement Node (ex: taxReportService) sans tirer
 * les modules natifs Expo. `src/i18n/index.js` le réexporte pour le reste
 * de l'app.
 */
export const LOCALE_MAP = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
};

/**
 * Retourne le tag de locale (ex: 'fr-FR') pour un code langue, fallback en-US.
 * @param {string} languageCode
 * @returns {string}
 */
export const getLocaleTag = (languageCode) => LOCALE_MAP[languageCode] || 'en-US';
