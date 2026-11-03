/**
 * Context des réglages utilisateur
 * - langue de l'application
 * - devise de référence (tous les montants du patrimoine y sont calculés)
 * - suivi du PEA (date d'ouverture, versements réels)
 * - mode discret (montants masqués, pourcentages visibles)
 * - PIN (expo-secure-store, jamais en AsyncStorage) et biométrie
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, LIMITS } from '../constants';
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  getDeviceLanguage,
  setLanguage as setI18nLanguage,
  getLocaleTag,
  t,
} from '../i18n';
import {
  loadPinHashSecure,
  savePinHashSecure,
  deletePinHashSecure,
  clearFailedAttempts,
  migrateLegacyHashIfNeeded,
} from '../utils/pinSecurity';
import { setDisplayLocale, formatQuantity } from '../utils/formatters';

const SettingsContext = createContext(undefined);

const SETTINGS_KEY = STORAGE_KEYS.SETTINGS;

// Public visé en premier : les investisseurs français, donc l'euro.
const DEFAULT_SETTINGS = {
  language: null, // null = langue du système
  currency: 'EUR',
  pea: { openDate: null, depositsOverride: null },
  privacyMode: false,
};

/** Ce qui remplace un montant en mode discret. */
export const MASK = '••••••';

// Abréviations des grands montants (graphiques, widget).
const COMPACT_UNITS = {
  fr: ['k', 'M', 'Md'],
  default: ['K', 'M', 'B'],
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pinHash, setPinHashState] = useState(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        const parsed = stored ? JSON.parse(stored) : null;

        const lang = parsed?.language || getDeviceLanguage();
        setI18nLanguage(lang);

        if (parsed) {
          // eslint-disable-next-line no-unused-vars
          const { pinHash: legacyInSettings, ...rest } = parsed;
          const migrated = await migrateLegacyHashIfNeeded(legacyInSettings);
          if (legacyInSettings) {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest)).catch(() => {});
          }
          if (!cancelled) setPinHashState(migrated || null);
          if (!cancelled) {
            setSettings({
              ...DEFAULT_SETTINGS,
              ...rest,
              pea: { ...DEFAULT_SETTINGS.pea, ...(rest.pea || {}) },
            });
          }
        } else {
          const existing = await loadPinHashSecure();
          if (!cancelled) setPinHashState(existing || null);
        }

        // La biométrie n'a de sens qu'avec un PIN : l'UI ne l'affiche que dans ce cas.
        const bio = await AsyncStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
        if (!cancelled) setBiometricEnabledState(bio === 'true');
      } catch (error) {
        if (__DEV__) console.error('[Settings] load error:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Accepte un objet ou une fonction (prev) => patch. */
  const persistSettings = useCallback((patch) => {
    setSettings((prev) => {
      const updated = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated)).catch((err) => {
        if (__DEV__) console.error('[Settings] save error:', err);
      });
      return updated;
    });
  }, []);

  const setLanguage = useCallback(
    async (languageCode) => {
      if (SUPPORTED_LANGUAGES[languageCode] || languageCode === null) {
        setI18nLanguage(languageCode || getDeviceLanguage());
        persistSettings({ language: languageCode });
      }
    },
    [persistSettings],
  );

  const setCurrency = useCallback(
    async (currencyCode) => {
      if (SUPPORTED_CURRENCIES[currencyCode]) persistSettings({ currency: currencyCode });
    },
    [persistSettings],
  );

  /** @param {{openDate?: string|null, depositsOverride?: number|null}} patch */
  const togglePrivacyMode = useCallback(
    () => persistSettings((prev) => ({ privacyMode: !prev.privacyMode })),
    [persistSettings],
  );

  const setPeaSettings = useCallback(
    (patch) => persistSettings((prev) => ({ pea: { ...prev.pea, ...patch } })),
    [persistSettings],
  );

  const setPinHash = useCallback(async (hash) => {
    if (!hash) return;
    await savePinHashSecure(hash);
    await clearFailedAttempts();
    setPinHashState(hash);
  }, []);

  const clearPin = useCallback(async () => {
    await deletePinHashSecure();
    await clearFailedAttempts();
    setPinHashState(null);
    // Retirer le PIN désactive aussi la biométrie : elle ne protège plus rien.
    setBiometricEnabledState(false);
    AsyncStorage.removeItem(STORAGE_KEYS.BIOMETRIC_ENABLED).catch(() => {});
  }, []);

  const setBiometricEnabled = useCallback(async (enabled) => {
    setBiometricEnabledState(enabled);
    try {
      if (enabled) await AsyncStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true');
      else await AsyncStorage.removeItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
    } catch (err) {
      if (__DEV__) console.error('[Settings] biometric save error:', err);
    }
  }, []);

  const effectiveLanguage = useMemo(() => settings.language || getDeviceLanguage(), [settings.language]);
  const locale = useMemo(() => {
    const tag = getLocaleTag(effectiveLanguage);
    setDisplayLocale(tag);
    return tag;
  }, [effectiveLanguage]);
  const currencySymbol = SUPPORTED_CURRENCIES[settings.currency]?.symbol || settings.currency;

  // Formateurs Intl par nombre de décimales : la place du symbole et les
  // séparateurs suivent la langue (« 1 234,56 € » / « €1,234.56 »).
  const money = useMemo(() => {
    const cache = new Map();
    const get = (decimals) => {
      if (!cache.has(decimals)) {
        try {
          cache.set(decimals, new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: settings.currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }));
        } catch {
          cache.set(decimals, null);
        }
      }
      return cache.get(decimals);
    };
    const sample = get(0)?.format(1) || '';
    return { get, symbolAfter: /^\d/.test(sample.trim()) };
  }, [locale, settings.currency]);

  /**
   * Formate un montant déjà exprimé dans la devise de référence : le moteur
   * calcule tout dans cette devise, il n'y a plus rien à convertir ici.
   * @param {number} amount
   * @param {{decimals?: number, compact?: boolean, showSign?: boolean}} [options]
   */
  const formatAmount = useCallback(
    (amount, options = {}) => {
      const { decimals = 2, compact = false, showSign = false, reveal = false } = options;
      // Mode discret : on montre les pourcentages, jamais les montants.
      if (settings.privacyMode && !reveal) return MASK;
      const num = Number.isFinite(Number(amount)) ? Number(amount) : 0;
      const abs = Math.abs(num);
      const sign = num < 0 ? '-' : showSign && num > 0 ? '+' : '';

      if (compact && abs >= 1e3) {
        const units = COMPACT_UNITS[effectiveLanguage] || COMPACT_UNITS.default;
        const [unit, div] = abs >= 1e9 ? [units[2], 1e9] : abs >= 1e6 ? [units[1], 1e6] : [units[0], 1e3];
        const scaled = (abs / div).toLocaleString(locale, { maximumFractionDigits: 1 });
        return money.symbolAfter
          ? `${sign}${scaled}${unit} ${currencySymbol}`
          : `${sign}${currencySymbol}${scaled}${unit}`;
      }

      // « 7 € » pour un patrimoine de 7,42 € induirait en erreur : sous 10,
      // on garde les centimes même si l'appelant a demandé 0 décimale.
      const effectiveDecimals = decimals === 0 && abs > 0 && abs < 10 ? 2 : decimals;
      const nf = money.get(effectiveDecimals);
      const formatted = nf ? nf.format(abs) : `${abs.toFixed(effectiveDecimals)} ${currencySymbol}`;
      return `${sign}${formatted}`;
    },
    [money, currencySymbol, locale, effectiveLanguage, settings.privacyMode],
  );

  /**
   * Formate un cours dans SA devise de cotation (182,31 $US, 498,20 €).
   * Les petites cryptos gardent plus de décimales.
   */
  const formatPrice = useCallback(
    (price, currencyCode) => {
      const num = Number(price);
      if (!Number.isFinite(num) || num <= 0) return '—';
      const decimals = num >= 1 ? 2 : num >= 0.01 ? 4 : 8;
      const code = currencyCode || settings.currency;
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: code,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(num);
      } catch {
        return `${num.toFixed(decimals)} ${code}`;
      }
    },
    [locale, settings.currency],
  );

  /** Quantité détenue : masquée en mode discret, comme les montants. */
  const formatQty = useCallback(
    (quantity, assetType) => (settings.privacyMode ? MASK : formatQuantity(quantity, assetType, locale)),
    [settings.privacyMode, locale],
  );

  const value = useMemo(
    () => ({
      settings,
      isLoading,

      // Langue
      language: effectiveLanguage,
      locale,
      isAutoLanguage: settings.language === null,
      supportedLanguages: SUPPORTED_LANGUAGES,
      setLanguage,
      t,

      // Devise
      currency: settings.currency,
      currencySymbol,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      setCurrency,
      formatAmount,
      formatPrice,
      formatQty,

      // Mode discret
      privacyMode: !!settings.privacyMode,
      togglePrivacyMode,

      // PEA
      pea: settings.pea,
      setPeaSettings,

      // PIN lock
      pinHash,
      setPinHash,
      clearPin,

      // Biométrie
      biometricEnabled,
      setBiometricEnabled,

      limits: LIMITS,
    }),
    [
      settings,
      isLoading,
      effectiveLanguage,
      locale,
      setLanguage,
      currencySymbol,
      setCurrency,
      formatAmount,
      formatPrice,
      formatQty,
      togglePrivacyMode,
      setPeaSettings,
      pinHash,
      setPinHash,
      clearPin,
      biometricEnabled,
      setBiometricEnabled,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;
