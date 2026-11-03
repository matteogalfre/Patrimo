/**
 * Répartition : une barre empilée pour la vue d'ensemble, puis une ligne par
 * part (nom, montant, pourcentage). Tout est dans le flux de la mise en page :
 * aucun texte posé par-dessus, donc rien ne peut se chevaucher.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { formatPercent } from '../utils/formatters';

const AllocationChart = ({ data, theme, formatAmount }) => {
  const parts = useMemo(() => {
    const total = data.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
    if (!(total > 0)) return [];
    return data.filter((d) => d.value > 0).map((d) => ({ ...d, share: d.value / total }));
  }, [data]);

  if (!parts.length) return null;

  return (
    <View>
      <View style={[styles.bar, { backgroundColor: theme.colors.backgroundSecondary }]}>
        {parts.map((p, i) => (
          <View
            key={p.name}
            style={[
              styles.segment,
              { flex: p.share, backgroundColor: p.color },
              i < parts.length - 1 && { marginRight: 2 },
            ]}
          />
        ))}
      </View>

      <View>
        {parts.map((p, i) => (
          <View
            key={p.name}
            style={[styles.row, i < parts.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
            accessible
            accessibilityLabel={`${p.name} ${formatPercent(p.share * 100, { showSign: false })}`}
          >
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{p.name}</Text>
            <Text style={[styles.amount, { color: theme.colors.textTertiary }]} numberOfLines={1}>
              {formatAmount(p.value, { decimals: 0 })}
            </Text>
            <Text style={[styles.pct, { color: theme.colors.text }]}>
              {formatPercent(p.share * 100, { showSign: false })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  segment: { height: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  name: { flex: 1, fontSize: 14, fontWeight: '500' },
  amount: { fontSize: 13, fontVariant: ['tabular-nums'] },
  pct: { width: 56, textAlign: 'right', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export default AllocationChart;
