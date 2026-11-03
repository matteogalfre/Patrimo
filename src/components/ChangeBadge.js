/**
 * Variation en pastille : ▲ 18,64 % sur fond vert pâle, ▼ en rouge. Le
 * pourcentage reste visible en mode discret, c'est tout l'intérêt.
 */

import React, { memo } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { useTheme } from '../theme/theme';
import { formatPercent } from '../utils/formatters';

const ChangeBadge = memo(({ value, label, size = 'sm' }) => {
  const theme = useTheme();
  if (!Number.isFinite(value)) return null;
  const up = value >= 0;
  const color = up ? theme.colors.success : theme.colors.error;
  return (
    <View style={[styles.badge, size === 'md' && styles.badgeMd, { backgroundColor: up ? theme.colors.successBg : theme.colors.errorBg }]}>
      <Text style={[styles.text, size === 'md' && styles.textMd, { color }]}>
        {up ? '▲' : '▼'} {formatPercent(Math.abs(value), { showSign: false, decimals: 2 })}
        {label ? ` ${label}` : ''}
      </Text>
    </View>
  );
});

ChangeBadge.displayName = 'ChangeBadge';

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  badgeMd: { paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  textMd: { fontSize: 13 },
});

export default ChangeBadge;
