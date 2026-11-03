/**
 * Un livret (ou toutes les liquidités) face à l'inflation : le taux contre la
 * hausse des prix sur un an, et ce que ça change en pouvoir d'achat. Rien
 * n'apparaît tant que l'indice des prix n'est pas chargé.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import { useInflation } from '../../hooks/useInflation';
import { realRate } from '../../core/inflation';
import { formatPercent } from '../../utils/formatters';

// Prix moyen d'une baguette, pour parler concret.
const BAGUETTE = 1.1;

const InflationCard = ({ rate = 0, value = 0 }) => {
  const theme = useTheme();
  const { t, formatAmount } = useSettings();
  const inflation = useInflation();
  const yearly = inflation?.lastTwelveMonths();
  if (!yearly || !(value > 0)) return null;

  const real = realRate(rate, yearly.pct);
  const perYear = (value * real) / 100;
  const losing = perYear < 0;
  const baguettes = Math.round(Math.abs(perYear) / BAGUETTE);
  const max = Math.max(rate, yearly.pct, 0.1);
  const [y, m] = yearly.month.split('-').map(Number);
  const month = `${t('months.long')[m - 1]} ${y}`;

  const bar = (label, pct, color) => (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <View style={[styles.fill, { width: `${Math.max(2, (Math.max(0, pct) / max) * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color: theme.colors.text }]}>{formatPercent(pct, { showSign: false, decimals: 1 })}</Text>
    </View>
  );

  let message;
  if (!losing) message = t('cash.inflation.gain', { amount: formatAmount(perYear, { decimals: 0 }) });
  else if (rate > 0) message = t('cash.inflation.loss', { amount: formatAmount(-perYear, { decimals: 0 }) });
  else message = t('cash.inflation.lossZero', { amount: formatAmount(-perYear, { decimals: 0 }) });

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('cash.inflation.title')}</Text>
      {bar(t('cash.inflation.rate'), rate, losing ? theme.colors.warning : theme.colors.success)}
      {bar(t('cash.inflation.prices'), yearly.pct, theme.colors.error)}
      <Text style={[styles.message, { color: losing ? theme.colors.error : theme.colors.success }]}>{message}</Text>
      {losing && baguettes >= 1 && (
        <Text style={[styles.fun, { color: theme.colors.textSecondary }]}>{t('cash.inflation.baguettes', { count: baguettes })}</Text>
      )}
      <Text style={[styles.source, { color: theme.colors.textTertiary }]}>{t('cash.inflation.source', { month })}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 5 },
  barLabel: { width: 96, fontSize: 13 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  barValue: { width: 52, textAlign: 'right', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  message: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 10 },
  fun: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  source: { fontSize: 11, lineHeight: 15, marginTop: 10 },
});

export default InflationCard;
