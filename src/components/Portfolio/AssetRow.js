/**
 * Ligne d'actif, façon tableau : logo, nom et ticker à gauche, valeur et
 * performance à droite. Sert pour un actif toutes enveloppes confondues
 * (`item.accounts`) comme pour une position (`item.account`).
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import AssetLogo from '../AssetLogo';
import ChangeBadge from '../ChangeBadge';

const AssetRow = memo(({ item, onPress, isLast }) => {
  const theme = useTheme();
  const { t, formatAmount } = useSettings();

  const held = item.isHeld;
  const accounts = item.accounts || (item.account ? [item.account] : []);
  const subtitle = [item.symbol, ...accounts.map((a) => t(`accounts.short.${a}`))].join(' · ');
  const closedPnl = item.realized + (item.dividends || 0);

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatAmount(item.value)}`}
      style={[styles.row, !isLast && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <AssetLogo assetId={item.assetId} symbol={item.symbol} />
      <View style={styles.main}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
        <View style={styles.subRow}>
          <Text style={[styles.sub, { color: theme.colors.textTertiary }]} numberOfLines={1}>{subtitle}</Text>
          {item.pricePending && <Ionicons name="time-outline" size={12} color={theme.colors.warning} />}
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.value, { color: held ? theme.colors.text : theme.colors.textTertiary }]}>
          {held ? formatAmount(item.value, { decimals: 0 }) : t('portfolio.closed')}
        </Text>
        {held ? (
          <ChangeBadge value={item.roi} />
        ) : (
          <Text style={[styles.sub, { color: closedPnl >= 0 ? theme.colors.success : theme.colors.error }]}>
            {formatAmount(closedPnl, { showSign: true })}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

AssetRow.displayName = 'AssetRow';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 60 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sub: { fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 4 },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default AssetRow;
