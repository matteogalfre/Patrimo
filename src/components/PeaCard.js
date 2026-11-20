/**
 * Suivi du PEA : versements face au plafond de 150 000 € et date des 5 ans.
 *
 * Les versements sont estimés d'après les achats tant que l'utilisateur n'a
 * pas saisi le vrai montant (le plafond porte sur l'argent versé, pas sur la
 * valeur du plan) : on le dit clairement plutôt que d'afficher un chiffre qui
 * a l'air officiel.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import AccountInstitution from './Portfolio/AccountInstitution';
import { useSettings } from '../context/SettingsContext';
import { formatDate } from '../utils/formatters';

const PeaCard = ({ pea, onPress }) => {
  const theme = useTheme();
  const { t, formatAmount, locale } = useSettings();
  if (!pea) return null;

  const pct = Math.max(0, Math.min(100, pea.usedPct));
  const barColor = pct >= 90 ? theme.colors.warning : theme.colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityHint={t('pea.editHint')}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('pea.title')}</Text>
          <AccountInstitution account="PEA" />
        </View>
        {pea.isMature && (
          <View style={[styles.badge, { backgroundColor: theme.colors.successBg }]}>
            <Text style={[styles.badgeText, { color: theme.colors.success }]}>{t('pea.matureBadge')}</Text>
          </View>
        )}
        <Ionicons name="create-outline" size={16} color={theme.colors.textTertiary} style={styles.edit} />
      </View>

      <View style={styles.amounts}>
        <Text style={[styles.deposits, { color: theme.colors.text }]}>
          {formatAmount(pea.deposits, { decimals: 0 })}
        </Text>
        <Text style={[styles.ceiling, { color: theme.colors.textTertiary }]}>
          {' / '}{formatAmount(pea.ceiling, { decimals: 0, reveal: true })}
        </Text>
      </View>
      <Text style={[styles.caption, { color: theme.colors.textTertiary }]}>
        {pea.depositsEstimated ? t('pea.depositsEstimated') : t('pea.depositsEntered')}
      </Text>

      <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.line, { color: theme.colors.textSecondary }]}>
        {t('pea.remaining', { amount: formatAmount(pea.remaining, { decimals: 0 }) })}
      </Text>

      {pea.maturityDate && (
        <View style={styles.maturity}>
          <Ionicons
            name={pea.isMature ? 'checkmark-circle-outline' : 'hourglass-outline'}
            size={15}
            color={pea.isMature ? theme.colors.success : theme.colors.textSecondary}
          />
          <Text style={[styles.line, styles.maturityText, { color: theme.colors.textSecondary }]}>
            {pea.isMature
              ? t('pea.mature')
              : t('pea.maturityOn', { date: formatDate(pea.maturityDate, { format: 'short', locale }) })}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700' },
  edit: { marginLeft: 'auto' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  amounts: { flexDirection: 'row', alignItems: 'baseline' },
  deposits: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ceiling: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 11, marginTop: 2, marginBottom: 10 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  fill: { height: 8, borderRadius: 4 },
  line: { fontSize: 13, lineHeight: 18 },
  maturity: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  maturityText: { flex: 1 },
});

export default PeaCard;
