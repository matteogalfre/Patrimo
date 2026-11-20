/**
 * Indépendance financière : le capital qui permettrait de vivre de ses
 * placements, et quand on l'atteint, en probabilités (Monte-Carlo) plutôt
 * qu'en une date trompeuse.
 */

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { LineChartSkia } from '../components/charts';
import SegmentedControl from '../components/SegmentedControl';
import Slider from '../components/Slider';
import { useMyNumbers } from '../hooks/useMyNumbers';
import { ACCOUNTS } from '../core/assets';
import { INVESTED_KINDS } from '../core/cash';
import { portfolioAssumptions, simulateIndependence, targetCapital, WITHDRAWAL_RATES } from '../core/independence';
import { formatPercent } from '../utils/formatters';

const HORIZON = 40;
const PATHS = 600;
const CHECKPOINTS = [10, 15, 20, 25, 30];

const IndependenceScreen = ({ navigation }) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { t, formatAmount } = useSettings();
  const { overview, totals, cash } = usePortfolio();
  // Garder son train de vie : le revenu visé part de tes dépenses, l'épargne de ton budget.
  const numbers = useMyNumbers();

  const suggestedIncome = Math.round((numbers.expenses || 2000) / 100) * 100;
  const suggestedMonthly = Math.max(0, Math.round((numbers.savings || 300) / 50) * 50);
  const [income, setIncomeState] = useState(suggestedIncome);
  const [monthly, setMonthlyState] = useState(suggestedMonthly);
  // Tes chiffres arrivent parfois après l'ouverture : tant que tu n'as pas
  // touché aux curseurs, ils suivent ton budget.
  const touched = useRef({ income: false, monthly: false });
  useEffect(() => {
    if (!touched.current.income) setIncomeState(suggestedIncome);
    if (!touched.current.monthly) setMonthlyState(suggestedMonthly);
  }, [suggestedIncome, suggestedMonthly]);
  const setIncome = (v) => { touched.current.income = true; setIncomeState(v); };
  const setMonthly = (v) => { touched.current.monthly = true; setMonthlyState(v); };
  const [rate, setRate] = useState(3.5);
  // Les curseurs restent fluides : la simulation suit avec un temps de retard.
  const deferredIncome = useDeferredValue(income);
  const deferredMonthly = useDeferredValue(monthly);

  const start = Math.max(0, overview.value);
  const crypto = totals.byAccount?.[ACCOUNTS.CRYPTO]?.value || 0;
  // L'épargne salariale est placée en fonds : elle compte avec les actions.
  const funds = cash.accounts.filter((a) => INVESTED_KINDS.includes(a.kind)).reduce((s, a) => s + a.value, 0);
  const assumptions = useMemo(
    () => portfolioAssumptions({ stock: Math.max(0, totals.value - crypto) + funds, crypto, cash: cash.total - funds }),
    [totals.value, crypto, cash.total, funds],
  );
  const target = targetCapital(deferredIncome, rate);

  const sim = useMemo(
    () => simulateIndependence({ start, monthly: deferredMonthly, target, ...assumptions, years: HORIZON, paths: PATHS }),
    [start, deferredMonthly, target, assumptions],
  );
  // Leviers : 100 € de plus par mois, ou un taux de retrait de 4 %.
  const more = useMemo(
    () => simulateIndependence({ start, monthly: deferredMonthly + 100, target, ...assumptions, years: HORIZON, paths: PATHS }),
    [start, deferredMonthly, target, assumptions],
  );

  const year = new Date().getFullYear();
  const progress = target > 0 ? Math.min(1, start / target) : 0;
  const shown = Math.min(HORIZON, Math.max(15, (sim.likelyYears ?? HORIZON) + 5));
  // L'échelle suit l'objectif : la ligne verte reste en haut du graphique,
  // les trajectoires qui la dépassent largement sont coupées au plafond.
  const ceiling = target > 0 ? Math.max(target * 1.5, start * 1.1) : Infinity;
  const cap = (v) => Math.min(v, ceiling);
  const chart = useMemo(() => ({
    data: Array.from({ length: shown + 1 }, (_, i) => ({ x: i, y: cap(sim.p50[i]), low: cap(sim.p10[i]), high: cap(sim.p90[i]), goal: target })),
    labels: Array.from({ length: shown + 1 }, (_, i) => (i % Math.ceil(shown / 4) === 0 ? String(year + i) : '')),
    // Un point là où la trajectoire médiane atteint l'objectif.
    markers: sim.medianYears > 0 && sim.medianYears <= shown
      ? { [sim.medianYears]: { radius: 6, fill: theme.colors.success, stroke: theme.colors.surface, accessibilityLabel: String(year + sim.medianYears) } }
      : {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sim, shown, target, year, ceiling, theme]);

  const gained = sim.medianYears != null && more.medianYears != null ? sim.medianYears - more.medianYears : 0;
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('independence.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={cardStyle}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('independence.targetLabel', { income: formatAmount(deferredIncome, { decimals: 0 }) })}</Text>
          <Text style={[styles.big, { color: theme.colors.text }]}>{formatAmount(target, { decimals: 0 })}</Text>
          <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <View style={[styles.fill, { width: `${Math.max(progress > 0 ? 2 : 0, progress * 100)}%`, backgroundColor: theme.colors.primary }]} />
          </View>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            {t('independence.progress', { amount: formatAmount(start, { decimals: 0 }), pct: formatPercent(progress * 100, { showSign: false, decimals: 0 }) })}
          </Text>
        </View>

        <View style={cardStyle}>
          {sim.medianYears === 0 ? (
            <Text style={[styles.headline, { color: theme.colors.success }]}>{t('independence.reached')}</Text>
          ) : sim.medianYears != null ? (
            <>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('independence.medianLabel')}</Text>
              <Text style={[styles.big, { color: theme.colors.text }]}>
                {year + sim.medianYears}
                {numbers.age ? <Text style={[styles.age, { color: theme.colors.textSecondary }]}>{`  ${t('independence.atAge', { age: numbers.age + sim.medianYears })}`}</Text> : null}
              </Text>
              <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                {t('independence.medianSub', { count: sim.medianYears })}
                {sim.likelyYears != null ? ` ${t('independence.likely', { year: year + sim.likelyYears })}` : ''}
                {sim.likelyYears != null && numbers.age ? ` ${t('independence.likelyAge', { age: numbers.age + sim.likelyYears })}` : ''}
              </Text>
            </>
          ) : (
            <Text style={[styles.headline, { color: theme.colors.warning }]}>{t('independence.notReached', { count: HORIZON })}</Text>
          )}

          <View style={styles.chart}>
            <LineChartSkia
              data={chart.data}
              xLabels={chart.labels}
              width={width - 64}
              height={190}
              color={theme.colors.primary}
              series={[
                { key: 'high', color: `${theme.colors.primary}55`, width: 1 },
                { key: 'low', color: `${theme.colors.primary}55`, width: 1 },
                { key: 'goal', color: theme.colors.success, width: 1.5 },
              ]}
              curve="monotoneX"
              theme={theme}
              yTickCount={4}
              showArea={false}
              formatYLabel={(v) => formatAmount(v, { decimals: 0, compact: true })}
              markers={chart.markers}
            />
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendLine, { backgroundColor: theme.colors.primary }]} />
            <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('independence.legendMedian')}</Text>
            <View style={[styles.legendLine, { backgroundColor: `${theme.colors.primary}55` }]} />
            <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('independence.legendRange')}</Text>
            <View style={[styles.legendLine, { backgroundColor: theme.colors.success }]} />
            <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>
              {t('independence.legendGoal')} {formatAmount(target, { decimals: 0, compact: true })}
            </Text>
          </View>
          <Text style={[styles.footnote, { color: theme.colors.textSecondary }]}>{t('independence.chartHint')}</Text>

          <View style={styles.odds}>
            {CHECKPOINTS.map((n) => (
              <View key={n} style={styles.odd}>
                <Text style={[styles.oddValue, { color: theme.colors.text }]}>{formatPercent(sim.reachedBy[n] * 100, { showSign: false, decimals: 0 })}</Text>
                <Text style={[styles.oddLabel, { color: theme.colors.textTertiary }]}>{year + n}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('independence.oddsNote')}</Text>
        </View>

        <View style={cardStyle}>
          <View style={styles.sliderHead}>
            <Text style={[styles.sliderLabel, { color: theme.colors.text }]}>{t('independence.income')}</Text>
            <Text style={[styles.sliderValue, { color: theme.colors.primary }]}>{t('independence.perMonth', { amount: formatAmount(income, { decimals: 0 }) })}</Text>
          </View>
          <Slider value={income} min={500} max={10000} step={100} onChange={setIncome} accessibilityLabel={t('independence.income')} formatValue={(v) => formatAmount(v, { decimals: 0 })} />

          <View style={styles.sliderHead}>
            <Text style={[styles.sliderLabel, { color: theme.colors.text }]}>{t('independence.savings')}</Text>
            <Text style={[styles.sliderValue, { color: theme.colors.primary }]}>{t('independence.perMonth', { amount: formatAmount(monthly, { decimals: 0 }) })}</Text>
          </View>
          <Slider value={monthly} min={0} max={5000} step={50} onChange={setMonthly} accessibilityLabel={t('independence.savings')} formatValue={(v) => formatAmount(v, { decimals: 0 })} />

          <Text style={[styles.sliderLabel, { color: theme.colors.text, marginTop: 12 }]}>{t('independence.withdrawal')}</Text>
          <SegmentedControl
            options={WITHDRAWAL_RATES.map((r) => ({ key: String(r), label: formatPercent(r, { showSign: false, decimals: r % 1 ? 1 : 0 }) }))}
            value={String(rate)}
            onChange={(k) => setRate(Number(k))}
            variant="inCard"
            size="sm"
            fill
            style={styles.segment}
          />
          <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('independence.withdrawalNote')}</Text>

          {gained > 0 && (
            <View style={[styles.tip, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="bulb-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.tipText, { color: theme.colors.text }]}>
                {t('independence.lever', { amount: formatAmount(100, { decimals: 0 }), count: gained })}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
          {t('independence.assumptions', {
            mu: formatPercent(assumptions.mu, { showSign: false, decimals: 1 }),
            sigma: formatPercent(assumptions.sigma, { showSign: false, decimals: 0 }),
          })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  age: { fontSize: 16, fontWeight: '600' },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500' },
  big: { fontSize: 30, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  headline: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 12 },
  fill: { height: 10, borderRadius: 5 },
  chart: { marginTop: 14, marginHorizontal: -4 },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 11, marginRight: 8 },
  odds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  odd: { alignItems: 'center', flex: 1 },
  oddValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  oddLabel: { fontSize: 11, marginTop: 2 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  sliderLabel: { fontSize: 14, fontWeight: '600' },
  sliderValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  segment: { marginTop: 8 },
  tip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, padding: 12, marginTop: 14 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 10 },
});

export default IndependenceScreen;
