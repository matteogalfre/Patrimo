/**
 * Modales de l'écran Réglages, extraites de SettingsScreen pour alléger ce
 * dernier (il dépassait 1300 lignes). Chaque modale reste « bête » : tout
 * l'état vit dans SettingsScreen et descend via props, les callbacks remontent.
 *
 * Les couleurs de texte posées sur les fonds vifs utilisent les tokens
 * sémantiques du thème (`onPrimary`) plutôt que des littéraux `#000`.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BaseModal } from '..';

export const LanguageModal = ({
  visible,
  onClose,
  t,
  theme,
  isAutoLanguage,
  language,
  supportedLanguages,
  onSelect,
}) => (
  <BaseModal visible={visible} onClose={onClose} title={t('settings.language')}>
    <View style={styles.optionsList}>
      <TouchableOpacity
        style={[styles.optionItem, isAutoLanguage && { backgroundColor: theme.colors.primaryMuted }]}
        onPress={() => onSelect(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isAutoLanguage }}
        accessibilityLabel={`Auto (${supportedLanguages[language]?.nativeName})`}
      >
        <Text style={[styles.optionText, { color: theme.colors.text }]}>
          Auto ({supportedLanguages[language]?.nativeName})
        </Text>
        {isAutoLanguage && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
      </TouchableOpacity>

      {Object.entries(supportedLanguages).map(([code, lang]) => (
        <TouchableOpacity
          key={code}
          style={[
            styles.optionItem,
            !isAutoLanguage && language === code && { backgroundColor: theme.colors.primaryMuted },
          ]}
          onPress={() => onSelect(code)}
          accessibilityRole="radio"
          accessibilityState={{ selected: !isAutoLanguage && language === code }}
          accessibilityLabel={lang.nativeName}
        >
          <Text style={[styles.optionText, { color: theme.colors.text }]}>{lang.nativeName}</Text>
          {!isAutoLanguage && language === code && (
            <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  </BaseModal>
);

export const CurrencyModal = ({
  visible,
  onClose,
  t,
  theme,
  currency,
  supportedCurrencies,
  onSelect,
}) => (
  <BaseModal visible={visible} onClose={onClose} title={t('settings.currency')}>
    <View style={styles.optionsList}>
      {Object.entries(supportedCurrencies).map(([code, curr]) => (
        <TouchableOpacity
          key={code}
          style={[styles.optionItem, currency === code && { backgroundColor: theme.colors.primaryMuted }]}
          onPress={() => onSelect(code)}
          accessibilityRole="radio"
          accessibilityState={{ selected: currency === code }}
          accessibilityLabel={`${code} - ${t(`currencies.${code}`)}`}
        >
          <View style={styles.currencyOption}>
            <Text style={[styles.currencySymbol, { color: theme.colors.primary }]}>{curr.symbol}</Text>
            <View>
              <Text style={[styles.optionText, { color: theme.colors.text }]}>{code}</Text>
              <Text style={[styles.currencyName, { color: theme.colors.textSecondary }]}>
                {t(`currencies.${code}`)}
              </Text>
            </View>
          </View>
          {currency === code && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
        </TouchableOpacity>
      ))}
    </View>
  </BaseModal>
);

// Palettes statiques pour les aperçus (reflètent theme.js light/dark).
const THEME_PALETTES = {
  light: { bg: '#F4F4F6', surface: '#FFFFFF', line: '#E6E6EA', text: '#16171A', accent: '#B5560F', up: '#13834E' },
  dark: { bg: '#0F1012', surface: '#17181B', line: '#26272C', text: '#F2F2F3', accent: '#F0A35E', up: '#3DBE7A' },
};

// Mini mockup d'écran (barre titre + carte avec "solde" + barres) rendu dans
// la palette donnée, pour que l'utilisateur visualise vraiment le rendu.
const ThemePreview = ({ palette }) => (
  <View style={[styles.previewScreen, { backgroundColor: palette.bg }]}>
    <View style={styles.previewTopRow}>
      <View style={[styles.previewDot, { backgroundColor: palette.accent }]} />
      <View style={[styles.previewBarSm, { backgroundColor: palette.line }]} />
    </View>
    <View style={[styles.previewCard, { backgroundColor: palette.surface }]}>
      <View style={[styles.previewBarMd, { backgroundColor: palette.accent }]} />
      <View style={[styles.previewBarLg, { backgroundColor: palette.text, opacity: 0.85 }]} />
      <View style={styles.previewStatRow}>
        <View style={[styles.previewStat, { backgroundColor: palette.up }]} />
        <View style={[styles.previewStat, { backgroundColor: palette.line }]} />
      </View>
    </View>
  </View>
);

export const ThemeModal = ({ visible, onClose, t, theme, onSelect }) => (
  <BaseModal visible={visible} onClose={onClose} title={t('settings.theme')}>
    <View style={styles.themeGrid}>
      {['light', 'dark', 'auto'].map((option) => {
        const isSelected = theme.themePreference === option;
        const iconName =
          option === 'auto' ? 'phone-portrait' : option === 'light' ? 'sunny' : 'moon';
        return (
          <TouchableOpacity
            key={option}
            style={[
              styles.themeCard,
              {
                backgroundColor: isSelected ? theme.colors.primaryMuted : theme.colors.surface,
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => onSelect(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(`settings.themeOption.${option}`)}
            activeOpacity={0.85}
          >
            {option === 'auto' ? (
              <View style={styles.previewSplit}>
                <View style={styles.previewSplitHalf}>
                  <ThemePreview palette={THEME_PALETTES.light} />
                </View>
                <View style={[styles.previewSplitHalf, styles.previewSplitHalfRight]}>
                  <ThemePreview palette={THEME_PALETTES.dark} />
                </View>
              </View>
            ) : (
              <ThemePreview palette={THEME_PALETTES[option]} />
            )}

            <View style={styles.themeCardFooter}>
              <Ionicons
                name={iconName}
                size={15}
                color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.themeCardLabel,
                  { color: isSelected ? theme.colors.primary : theme.colors.text },
                ]}
                numberOfLines={1}
              >
                {t(`settings.themeOption.${option}`)}
              </Text>
            </View>

            {isSelected && (
              <View style={[styles.themeCheck, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="checkmark" size={12} color={theme.colors.onPrimary} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  </BaseModal>
);

export const ImportModal = ({ visible, onClose, t, theme, onReplace, onMerge }) => (
  <BaseModal visible={visible} onClose={onClose} title={t('settings.importTitle')} showCloseButton={false}>
    <View style={[styles.importModalIcon, { backgroundColor: theme.colors.primaryMuted }]}>
      <Ionicons name="cloud-upload" size={32} color={theme.colors.primary} />
    </View>

    <Text style={[styles.importModalMessage, { color: theme.colors.textSecondary }]}>
      {t('settings.importQuestion')}
    </Text>

    <TouchableOpacity
      style={[styles.importModalBtn, { backgroundColor: theme.colors.primary }]}
      onPress={onReplace}
      accessibilityRole="button"
      accessibilityLabel={t('settings.replaceAll')}
    >
      <Ionicons name="swap-horizontal" size={18} color={theme.colors.onPrimary} />
      <Text style={[styles.importModalBtnText, { color: theme.colors.onPrimary }]}>
        {t('settings.replaceAll')}
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.importModalBtn, styles.importModalBtnSecondary, { borderColor: theme.colors.border }]}
      onPress={onMerge}
      accessibilityRole="button"
      accessibilityLabel={t('settings.mergeExisting')}
    >
      <Ionicons name="git-merge" size={18} color={theme.colors.primary} />
      <Text style={[styles.importModalBtnTextSecondary, { color: theme.colors.text }]}>
        {t('settings.mergeExisting')}
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.importModalCancel}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={t('common.cancel')}
    >
      <Text style={[styles.importModalCancelText, { color: theme.colors.textSecondary }]}>
        {t('common.cancel')}
      </Text>
    </TouchableOpacity>
  </BaseModal>
);

const styles = StyleSheet.create({
  optionsList: { width: '100%' },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 4,
  },
  optionText: { fontSize: 15, fontWeight: '500' },
  currencyOption: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currencySymbol: { fontSize: 18, fontWeight: '700', width: 44, textAlign: 'center' },
  currencyName: { fontSize: 12, marginTop: 2 },
  // Theme picker — cartes avec aperçu réel
  themeGrid: { flexDirection: 'row', gap: 10, width: '100%' },
  themeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    paddingBottom: 10,
  },
  themeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  themeCardLabel: { fontSize: 12, fontWeight: '600' },
  themeCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewScreen: {
    height: 92,
    borderRadius: 9,
    padding: 6,
    overflow: 'hidden',
  },
  previewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewBarSm: { flex: 1, height: 4, borderRadius: 2, maxWidth: 28 },
  previewCard: { flex: 1, borderRadius: 7, padding: 6, justifyContent: 'center', gap: 5 },
  previewBarMd: { width: 22, height: 4, borderRadius: 2 },
  previewBarLg: { width: '70%', height: 7, borderRadius: 3 },
  previewStatRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  previewStat: { width: 16, height: 4, borderRadius: 2 },
  previewSplit: { flexDirection: 'row', height: 92, borderRadius: 9, overflow: 'hidden' },
  previewSplitHalf: { flex: 1, overflow: 'hidden' },
  previewSplitHalfRight: { marginLeft: 2 },
  taxReportOptions: { width: '100%' },
  taxReportLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  yearSelector: { flexDirection: 'row', gap: 8 },
  yearOption: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  yearText: { fontSize: 14, fontWeight: '600' },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  methodText: { fontSize: 14, fontWeight: '500' },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 10,
  },
  actionBtnText: { fontSize: 15, fontWeight: '600' },
  importModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  importModalMessage: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  importModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 10,
  },
  importModalBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1 },
  importModalBtnText: { fontSize: 15, fontWeight: '600' },
  importModalBtnTextSecondary: { fontSize: 15, fontWeight: '600' },
  importModalCancel: { paddingVertical: 12, alignItems: 'center' },
  importModalCancelText: { fontSize: 14, fontWeight: '500' },
});
