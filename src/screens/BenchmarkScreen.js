/**
 * Comparer avec un indice : tes versements rejoués sur un ETF indiciel, aux
 * mêmes dates et pour les mêmes montants. Répond à « est-ce que mes choix
 * font mieux qu'un simple ETF monde ? ».
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { LineChartSkia } from '../components/charts';
import { AccountFilter } from '../components/Portfolio';
import { marketData } from '../services/marketData';
import { BENCHMARKS, contributionFlows, livretAIndex, shadowPortfolio } from '../core/benchmark';
import { annualizedReturn } from '../core/performance';
import { rateAt } from '../core/fx';
import { ACCOUNTS } from '../core/assets';
import { formatPercent } from '../utils/formatters';

const DAY = 24 * 60 * 60 * 1000;
const MAX_POINTS = 90;

const BenchmarkScreen = ({ navigation }) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { t, formatAmount, locale } = useSettings();
  const { transactions, dividends, fx, totals, getValuesAt } = usePortfolio();
  const [key, setKey] = useState('world');
  const [account, setAccount] = useState(null);
  const [history, setHistory] = useState({ key: null, series: null, currency: null });
  const [loading, setLoading] = useState(false);

  const bench = BENCHMARKS.find((b) => b.key === key);
  const tx = useMemo(() => transactions.filter((x) => !account || x.account === account), [transactions, account]);
  const dv = useMemo(() => dividends.filter((x) => !account || x.account === account), [dividends, account]);
  const flows = useMemo(() => contributionFlows({ transactions: tx, fx }), [tx, fx]);
  const firstTime = flows.length ? flows[0].time : null;

  // Cours de la référence depuis le premier versement.
  useEffect(() => {
    if (!firstTime || !bench.symbol) return undefined;
    let alive = true;
    setLoading(true);
    const asset = { assetId: `stock:${bench.symbol}`, assetType: 'stock', symbol: bench.symbol };
    marketData.getHistories([asset], new Date(firstTime - 7 * DAY))
      .then(({ series, currencies }) => alive && setHistory({ key, series: series[asset.assetId] || null, currency: currencies[asset.assetId] || 'EUR' }))
      .catch(() => alive && setHistory({ key, series: null, currency: null }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, bench.symbol, firstTime]);

  const result = useMemo(() => {
    if (!firstTime) return null;
    const today = new Date();
    const span = today.getTime() - firstTime;
    const step = Math.max(DAY, Math.ceil(span / MAX_POINTS / DAY) * DAY);
    const dates = [];
    for (let time = firstTime; time < today.getTime(); time += step) dates.push(new Date(time));
    dates.push(today);

    let priceAt;
    if (!bench.symbol) {
      const index = livretAIndex(new Date(firstTime), today);
      priceAt = (k) => index[k] || null;
    } else {
      if (history.key !== key || !history.series) return { dates, shadow: null };
      const keys = Object.keys(history.series).sort();
      priceAt = (k) => {
        if (!keys.length || k < keys[0]) return null;
        const p = rateAt(history.series, k, keys);
        return p > 0 ? p * (fx.at(history.currency, k) || 0) : null;
      };
    }
    const shadow = shadowPortfolio({ flows, dates, priceAt, today });

    // Toi : la valeur des placements plus les dividendes touchés jusque-là.
    const values = getValuesAt(dates, { account });
    const divs = dv.map((d) => ({ time: new Date(d.date).getTime(), amount: d.amount * (fx.at(d.currency, d.date) || 0) })).sort((a, b) => a.time - b.time);
    const divsAt = (time) => divs.reduce((s, d) => (d.time <= time ? s + d.amount : s), 0);
    const mine = values.map((v, i) => v + divsAt(dates[i].getTime()));
    const invested = dates.map((d) => flows.reduce((s, f) => (f.time <= d.getTime() ? s + f.amount : s), 0));
    const value = values[values.length - 1];
    const received = divsAt(today.getTime());
    return {
      dates,
      shadow,
      mine,
      invested,
      value,
      received,
      total: value + received,
      contributed: invested[invested.length - 1],
      xirr: annualizedReturn({ transactions: tx, dividends: dv, fx, value, today }),
    };
  }, [firstTime, bench.symbol, history, key, flows, fx, getValuesAt, account, dv, tx]);

  const chart = useMemo(() => {
    if (!result?.shadow) return null;
    const months = t('months.short');
    const every = Math.max(1, Math.ceil(result.dates.length / 4));
    return {
      data: result.dates.map((d, i) => ({ x: i, y: result.mine[i], y2: result.invested[i], shadow: result.shadow.series[i] ?? result.mine[i] })),
      labels: result.dates.map((d, i) => (i % every === 0 ? `${months[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}` : '')),
    };
  }, [result, t]);

  const pick = (k) => {
    Haptics.selectionAsync();
    setKey(k);
  };

  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const shadowColor = theme.colors.secondary;
  const diff = result?.shadow ? result.total - result.shadow.value : null;
  const accounts = Object.keys(totals.byAccount || {}).filter((a) => a !== ACCOUNTS.CASH);

  const line = (label, color, amount, rate, dashed) => (
    <View style={styles.compareRow}>
      <View style={[styles.swatch, dashed ? { borderColor: color, borderWidth: 2 } : { backgroundColor: color }]} />
      <Text style={[styles.compareLabel, { color: theme.colors.text }]} numberOfLines={1}>{label}</Text>
      <View style={styles.compareRight}>
        <Text style={[styles.compareValue, { color: theme.colors.text }]}>{formatAmount(amount, { decimals: 0 })}</Text>
        {rate != null && (
          <Text style={[styles.compareRate, { color: theme.colors.textSecondary }]}>
            {t('benchmark.perYear', { value: formatPercent(rate, { decimals: 1 }) })}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('benchmark.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>{t('benchmark.intro')}</Text>

        <View style={styles.chips}>
          {BENCHMARKS.map((b) => {
            const on = b.key === key;
            return (
              <TouchableOpacity
                key={b.key}
                onPress={() => pick(b.key)}
                style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primaryMuted : theme.colors.surface }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, { color: on ? theme.colors.primary : theme.colors.text }]}>{t(`benchmark.indices.${b.key}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <AccountFilter value={account} onChange={setAccount} available={accounts} style={styles.filter} />

        {!result ? (
          <View style={styles.empty}>
            <Ionicons name="git-compare-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('benchmark.empty')}</Text>
          </View>
        ) : loading && !result.shadow ? (
          <View style={styles.empty}><ActivityIndicator color={theme.colors.primary} /></View>
        ) : !result.shadow ? (
          <View style={cardStyle}>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('benchmark.unavailable')}</Text>
          </View>
        ) : (
          <View style={cardStyle}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              {t('benchmark.gap', { index: t(`benchmark.indices.${key}`) })}
            </Text>
            <Text style={[styles.big, { color: diff >= 0 ? theme.colors.success : theme.colors.error }]}>
              {formatAmount(diff, { decimals: 0, showSign: true })}
            </Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t(diff >= 0 ? 'benchmark.ahead' : 'benchmark.behind')}{' '}
              {t('benchmark.contributed', { amount: formatAmount(result.contributed, { decimals: 0 }) })}
            </Text>

            <View style={styles.chart}>
              <LineChartSkia
                data={chart.data}
                xLabels={chart.labels}
                width={width - 64}
                height={190}
                color={theme.colors.primary}
                series={[{ key: 'shadow', color: shadowColor, width: 1.75 }]}
                theme={theme}
                yTickCount={4}
                showArea={false}
                formatYLabel={(v) => formatAmount(v, { decimals: 0, compact: true })}
              />
            </View>

            <View style={styles.compare}>
              {line(t('benchmark.you'), theme.colors.primary, result.total, result.xirr)}
              {line(bench.name, shadowColor, result.shadow.value, result.shadow.xirr)}
              {line(t('benchmark.invested'), theme.colors.textTertiary, result.contributed, null, true)}
            </View>
            {result.received > 0 && (
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                {t('benchmark.dividendsNote', { amount: formatAmount(result.received, { decimals: 0 }) })}
              </Text>
            )}
            <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
              {bench.symbol ? t('benchmark.method', { name: bench.name, symbol: bench.symbol }) : t('benchmark.methodLivret')}
            </Text>
            {result.dates.length > 0 && (
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                {t('benchmark.since', { date: result.dates[0].toLocaleDateString(locale, { month: 'long', year: 'numeric' }) })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  filter: { marginBottom: 12, marginHorizontal: -16 },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500' },
  big: { fontSize: 30, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  chart: { marginTop: 14, marginHorizontal: -4 },
  compare: { marginTop: 10, gap: 10 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  compareLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  compareRight: { alignItems: 'flex-end' },
  compareValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  compareRate: { fontSize: 12, fontVariant: ['tabular-nums'] },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 10 },
});

export default BenchmarkScreen;
