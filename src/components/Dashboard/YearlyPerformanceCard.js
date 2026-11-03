/**
 * Performance année par année : gain de chaque année civile (hors apports)
 * et rendement, plus le rendement annualisé depuis le début.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { BarChart } from '../charts';
import { yearlyPerformance } from '../../core/performance';
import { useInflation } from '../../hooks/useInflation';
import { formatPercent } from '../../utils/formatters';

const YearlyPerformanceCard = ({ account = null }) => {
  const theme = useTheme();
  const { t, formatAmount } = useSettings();
  const { transactions, dividends, fx, getValuesAt } = usePortfolio();
  const inflation = useInflation();

  const years = useMemo(() => {
    const tx = transactions.filter((x) => !account || x.account === account);
    const dv = dividends.filter((d) => !account || d.account === account);
    const valueAt = (date) => getValuesAt([date], { account })[0] || 0;
    return yearlyPerformance({ transactions: tx, dividends: dv, fx, valueAt });
  }, [transactions, dividends, fx, account, getValuesAt]);

  if (years.length < 2) return null;

  const bars = years.map((y) => ({
    label: String(y.year),
    caption: y.partial ? t('performance.ytd', { year: y.year }) : String(y.year),
    value: y.gain,
    pct: y.pct,
    inflation: inflation ? inflation.ofYear(y.year) : null,
  }));

  const describe = (v, d) => {
    let text = formatAmount(v, { decimals: 0, showSign: true });
    if (d.pct != null) text += ` (${formatPercent(d.pct)})`;
    if (d.inflation != null) text += ` · ${t('performance.inflation', { value: formatPercent(d.inflation, { showSign: false }) })}`;
    return text;
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('performance.title')}</Text>
      <BarChart
        data={bars}
        color={theme.colors.success}
        mutedColor={theme.colors.successBg}
        negativeColor={theme.colors.error}
        negativeMutedColor={theme.colors.errorBg}
        baselineColor={theme.colors.border}
        textColor={theme.colors.text}
        labelColor={theme.colors.textTertiary}
        formatValue={describe}
      />
      <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
        {t('performance.note')}{inflation ? ` ${t('performance.inflationSource')}` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  note: { fontSize: 11, lineHeight: 15, marginTop: 10 },
});

export default YearlyPerformanceCard;
