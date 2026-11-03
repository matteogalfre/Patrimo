import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../constants';

// Palette sobre : fond neutre, cartes unies, UN seul accent (orange brûlé).
// Le vert et le rouge sont réservés aux gains et aux pertes ; aucun halo ni
// dégradé, pour que les chiffres restent ce qu'on regarde en premier.
const ACCENT = '#B5560F';
const ACCENT_DARK_MODE = '#F0A35E';

const lightTheme = {
  mode: 'light',
  colors: {
    background: '#F4F4F6',
    backgroundSecondary: '#ECECEF',
    surface: '#FFFFFF',
    surfacePressed: '#F0F0F2',

    primary: ACCENT,
    primaryMuted: 'rgba(181, 86, 15, 0.10)',
    secondary: '#6E56CF',
    accent: ACCENT,

    text: '#16171A',
    textSecondary: '#5F6368',
    textTertiary: '#80858E',
    textMuted: '#B0B4BA',

    success: '#13834E',
    successBg: 'rgba(19, 131, 78, 0.10)',
    error: '#C93A3A',
    errorBg: 'rgba(201, 58, 58, 0.10)',
    warning: '#A86A12',
    warningBg: 'rgba(183, 121, 31, 0.12)',

    onPrimary: '#FFFFFF',
    onSuccess: '#FFFFFF',
    onError: '#FFFFFF',
    onAccent: '#FFFFFF',
    onWarning: '#FFFFFF',

    border: '#E6E6EA',
    borderLight: '#EFEFF2',
    borderFocus: ACCENT,
  },
};

const darkTheme = {
  mode: 'dark',
  colors: {
    background: '#0F1012',
    backgroundSecondary: '#1C1D21',
    surface: '#17181B',
    surfacePressed: '#222327',

    primary: ACCENT_DARK_MODE,
    primaryMuted: 'rgba(240, 163, 94, 0.14)',
    secondary: '#A594F9',
    accent: ACCENT_DARK_MODE,

    text: '#F2F2F3',
    textSecondary: '#A6A8AD',
    textTertiary: '#7D8087',
    textMuted: '#55585E',

    success: '#3DBE7A',
    successBg: 'rgba(61, 190, 122, 0.14)',
    error: '#F06A6A',
    errorBg: 'rgba(240, 106, 106, 0.14)',
    warning: '#E0A63A',
    warningBg: 'rgba(224, 166, 58, 0.14)',

    onPrimary: '#1A1206',
    onSuccess: '#08130D',
    onError: '#1A0808',
    onAccent: '#1A1206',
    onWarning: '#1A1206',

    border: '#26272C',
    borderLight: '#1F2024',
    borderFocus: ACCENT_DARK_MODE,
  },
};

const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

// Rayons de bordure
const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

// Animation tokens. Use these via `theme.animation.fast/normal/slow` instead
// of hardcoded millisecond literals so the whole app can be slowed down or
// disabled (e.g. for E2E tests / reduce-motion) in one place.
const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
};

// Typographie
const typography = {
  display: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 44,
    letterSpacing: -1,
  },
  h1: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  h4: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  captionMedium: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  small: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
  },
  smallMedium: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: 0.5,
  },
  numeric: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  numericSmall: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
};

// Ombres avec glow effect
const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  }),
  glowSm: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  }),
};

// Context
const ThemeContext = createContext(undefined);

const STORAGE_KEY = STORAGE_KEYS.THEME_PREFERENCE;
const VALID_PREFERENCES = ['auto', 'light', 'dark'];
const DEFAULT_PREFERENCE = 'light';

const resolveEffectiveMode = (preference, systemScheme) => {
  if (preference === 'light' || preference === 'dark') return preference;
  // `auto` : on suit le système. `useColorScheme` peut renvoyer `null` avant
  // la première mesure : on retombe alors sur le thème clair.
  if (systemScheme === 'light' || systemScheme === 'dark') return systemScheme;
  return DEFAULT_PREFERENCE;
};

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState(DEFAULT_PREFERENCE);

  // Préférence enregistrée chargée au montage, sans bloquer le premier rendu :
  // au pire une image en thème clair avant de basculer en sombre.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored && VALID_PREFERENCES.includes(stored)) {
          setThemePreferenceState(stored);
        }
      })
      .catch(() => {
        // Ignore storage errors — we keep the in-memory default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemePreference = useCallback((next) => {
    if (!VALID_PREFERENCES.includes(next)) return;
    setThemePreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Storage failure shouldn't crash the UI; the in-memory state still wins.
    });
  }, []);

  const toggleTheme = useCallback(() => {
    // Backwards-compat helper used by the existing dark-mode switch. Always
    // produces a concrete mode (never `auto`) so the user sees an immediate
    // visual change.
    setThemePreference(
      resolveEffectiveMode(themePreference, systemScheme) === 'dark' ? 'light' : 'dark',
    );
  }, [setThemePreference, themePreference, systemScheme]);

  const theme = useMemo(() => {
    const effectiveMode = resolveEffectiveMode(themePreference, systemScheme);
    const colorTheme = effectiveMode === 'dark' ? darkTheme : lightTheme;
    return {
      ...colorTheme,
      spacing,
      borderRadius,
      typography,
      shadows,
      animation,
      toggleTheme,
      isDark: effectiveMode === 'dark',
      themePreference,
      setThemePreference,
      systemColorScheme: systemScheme,
    };
  }, [themePreference, systemScheme, toggleTheme, setThemePreference]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Réexporter les utilitaires de formatage depuis utils pour compatibilité
export { 
  formatCurrency, 
  formatPercent, 
  formatCryptoAmount 
} from '../utils/formatters';

export default { lightTheme, darkTheme, spacing, borderRadius, typography, shadows };
