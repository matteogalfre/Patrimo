/**
 * Ligne de compte de liquidités : livret, compte courant, assurance-vie.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import AssetLogo from '../AssetLogo';
import { findInstitution } from '../../core/institutions';
import { formatPercent } from '../../utils/formatters';

export const CASH_ICONS = {
  livretA: 'leaf-outline',
  ldds: 'leaf-outline',
  lep: 'leaf-outline',
  livretJeune: 'leaf-outline',
  cel: 'home-outline',
  pel: 'home-outline',
  pee: 'people-outline',
  percol: 'people-outline',
  current: 'card-outline',
  broker: 'briefcase-outline',
  peaCash: 'briefcase-outline',
  ctoCash: 'briefcase-outline',
  term: 'time-outline',
  lifeInsurance: 'shield-checkmark-outline',
  other: 'wallet-outline',
};

const CashRow = memo(({ account, onPress, isLast }) => {
  const theme = useTheme();
  const { t, formatAmount } = useSettings();
  const institution = findInstitution(account.institution);
  const subtitle = [
    institution?.name || account.institution || t(`cash.kinds.${account.kind}`),
    account.rate > 0 ? t('cash.rateShort', { rate: formatPercent(account.rate, { showSign: false, decimals: 2 }) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={() => onPress(account)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${formatAmount(account.value)}`}
      style={[styles.row, !isLast && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      {institution ? <AssetLogo institution={institution} /> : <AssetLogo icon={CASH_ICONS[account.kind] || CASH_ICONS.other} />}
      <View style={styles.main}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{account.name}</Text>
        <Text style={[styles.sub, { color: theme.colors.textTertiary }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={[styles.value, { color: theme.colors.text }]}>{formatAmount(account.value, { decimals: 0 })}</Text>
    </TouchableOpacity>
  );
});

CashRow.displayName = 'CashRow';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 60 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12 },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default CashRow;
