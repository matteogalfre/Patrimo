/**
 * Marchés : où en est le S&P 500 ou le Bitcoin (courbe, moyennes mobiles 50
 * et 200 jours, écart au plus haut, indice de peur), ce qui s'est passé les
 * autres fois qu'il était dans la même situation, ce que ça représente pour
 * toi (ta réserve, ta cible), et ton plan anti-panique : une règle décidée à
 * froid, rappelée le jour où elle se déclenche.
 *
 * Des statistiques du passé et des calculs sur tes chiffres : jamais une
 * prévision ni un conseil. Le pire cas est toujours affiché.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { LineChartSkia } from '../components/charts';
import SegmentedControl from '../components/SegmentedControl';
import { marketsService } from '../services/markets';
import { fearLevel, MARKETS, marketState, movingAverage, opportunity, stepFor } from '../core/markets';
import { availableCash } from '../core/cash';
import { classify } from '../core/exposure';
import { emergencyMonths, profileTargets } from '../core/profile';
import { formatDate, formatPercent } from '../utils/formatters';
import { normalizeNumber } from '../utils/parseNumber';

const PERIODS = [{ key: '3m', n: 65 }, { key: '6m', n: 130 }, { key: '1y', n: 260 }];
const SPREAD_MONTHS = [3, 6, 12];
const MA_COLORS = { ma50: '#E0A33A', ma200: '#8E7CF0' };
const FEAR_COLORS = { calm: 'success', normal: 'textSecondary', worry: 'warning', fear: 'error', panic: 'error', greed: 'warning', euphoria: 'error' };

const MarketsScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { t, locale, formatAmount, currencySymbol } = useSettings();
  const { assets, cash, totals } = usePortfolio();
  const { targets, monthlyExpenses, profile, marketRules, setMarketRule, exposure } = usePlanning();

  const [id, setId] = useState(route?.params?.market || 'sp500');
  const [period, setPeriod] = useState('1y');
  const [data, setData] = useState({});
  const [fear, setFear] = useState({});
  const [error, setError] = useState(null);
  const [months, setMonths] = useState(6);
  const [ruleStep, setRuleStep] = useState(null);
  const [ruleAmount, setRuleAmount] = useState('');
  const market = MARKETS[id];
  const entry = data[id];
  const loading = !entry && !error;

  const load = useCallback(async (which) => {
    setError(null);
    try {
      const e = await marketsService.load(which);
      setData((d) => ({ ...d, [which]: e }));
    } catch {
      setError('load');
    }
    marketsService.fear(MARKETS[which].fear).then((f) => setFear((x) => ({ ...x, [which]: f }))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!data[id]) load(id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = useMemo(() => (entry ? marketState(entry.points, entry.ath) : null), [entry]);
  const chart = useMemo(() => {
    if (!entry) return null;
    const ma50 = movingAverage(entry.points, 50);
    const ma200 = movingAverage(entry.points, 200);
    const n = PERIODS.find((p) => p.key === period).n;
    const start = Math.max(0, entry.points.length - n, 199);
    const slice = entry.points.slice(start);
    const months = t('months.short');
    const every = Math.max(1, Math.ceil(slice.length / 4));
    return {
      data: slice.map(([, v], i) => ({ x: i, y: v, ma50: ma50[start + i] ?? v, ma200: ma200[start + i] ?? v })),
      xLabels: slice.map(([d], i) => {
        if (i % every !== 0 && i !== slice.length - 1) return '';
        const date = new Date(`${d}T12:00:00`);
        return `${months[date.getMonth()]} '${String(date.getFullYear()).slice(-2)}`;
      }),
    };
  }, [entry, period, t]);

  // --- Mise en forme --------------------------------------------------------
  const pct = (v, decimals = 1) => formatPercent(v * 100, { decimals });
  const pctAbs = (v) => formatPercent(Math.abs(v) * 100, { showSign: false, decimals: 1 });
  const level = (v) => {
    if (id === 'btc') return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
  };
  const money = (v) => formatAmount(v, { decimals: 0 });
  const color = (v) => (v >= 0 ? theme.colors.success : theme.colors.error);
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const sinceYear = entry?.stats?.since ? entry.stats.since.slice(0, 4) : market.since.slice(0, 4);

  // --- Situation --------------------------------------------------------------
  const dd = state ? -state.drawdown : 0;
  // Le bitcoin bouge bien plus que le S&P 500 : ses paliers sont plus larges.
  const phaseSteps = id === 'btc' ? [15, 30, 50] : [5, 10, 20];
  const phase = dd * 100 < phaseSteps[0] ? 'near' : dd * 100 < phaseSteps[1] ? 'pullback' : dd * 100 < phaseSteps[2] ? 'correction' : 'bear';
  const fearData = fear[id];
  const fearLvl = fearData ? fearLevel(market.fear, fearData.value) : null;

  // --- Ce que dit l'histoire ----------------------------------------------------
  const step = state ? stepFor(state.drawdown, market.drawdownSteps) : null;
  const shownStep = step ?? market.drawdownSteps[0];
  const hist = entry?.stats?.drawdown?.[shownStep] || null;
  const spread = entry?.stats?.spread?.[shownStep] || null;
  const dropStep = state ? stepFor(Math.min(0, state.change1d), market.dropSteps) : null;
  const dropStats = dropStep ? entry?.stats?.drops?.[dropStep] : null;

  // --- Et toi ---------------------------------------------------------------
  const holdings = useMemo(() => {
    const held = assets.filter((a) => a.isHeld);
    const mine = id === 'btc'
      ? held.filter((a) => a.assetId === market.assetId)
      : held.filter((a) => classify(a, exposure?.[a.assetId]).profile === market.exposure);
    return { value: mine.reduce((s, a) => s + (a.value || 0), 0), assets: mine.sort((a, b) => (b.value || 0) - (a.value || 0)) };
  }, [assets, exposure, id, market]);
  const reserveMonths = Math.max(6, profile?.answers ? emergencyMonths(profile.answers) : 0);
  const reserve = (monthlyExpenses || 0) * reserveMonths;
  const values = { stock: totals.byClass?.stock?.value || 0, crypto: totals.byClass?.crypto?.value || 0, cash: cash.total };
  const total = values.stock + values.crypto + values.cash;
  const target = targets || (profile?.answers ? profileTargets(profile.answers, { total }) : null);
  const bucket = id === 'btc' ? 'crypto' : 'stock';
  const opp = opportunity({
    available: availableCash(cash.accounts),
    reserve,
    targetPct: target ? target[bucket] : null,
    current: values[bucket],
    total,
    months,
  });
  const planAsset = holdings.assets[0]
    ? { assetId: holdings.assets[0].assetId, assetType: holdings.assets[0].assetType, symbol: holdings.assets[0].symbol, name: holdings.assets[0].name }
    : id === 'btc' ? { assetId: 'crypto:BTC', assetType: 'crypto', symbol: 'BTC', name: 'Bitcoin' } : null;

  // --- Plan anti-panique ------------------------------------------------------
  const rule = marketRules?.[id] || null;
  const saveRule = () => {
    const amount = Number(normalizeNumber(ruleAmount));
    const threshold = ruleStep || market.ruleSteps[0];
    if (!(amount > 0)) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMarketRule(id, { threshold, amount, notifiedFor: null });
    setRuleAmount('');
  };

  const fwdLine = (label, f) => (f ? (
    <Text style={[styles.histLine, { color: theme.colors.text }]}>
      {label}{' '}
      <Text style={{ fontWeight: '700' }}>{t('markets.upCount', { up: f.up, n: f.n })}</Text>
      {t('markets.medianWorst', { median: pct(f.median, 0), worst: pct(f.worst, 0) })}
    </Text>
  ) : null);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('markets.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <SegmentedControl
            options={[{ key: 'sp500', label: 'S&P 500' }, { key: 'btc', label: 'Bitcoin' }]}
            value={id}
            onChange={(k) => {
              setId(k);
              setRuleStep(null);
            }}
            variant="track"
            fill
          />

          {loading && <ActivityIndicator style={styles.loader} color={theme.colors.primary} />}
          {!!error && !entry && (
            <View style={cardStyle}>
              <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('markets.error')}</Text>
              <TouchableOpacity onPress={() => load(id)} style={styles.link} accessibilityRole="button">
                <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('network.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {state && (
            <>
              {/* 1. Où on en est */}
              <View style={cardStyle}>
                <Text style={[styles.cardLabel, { color: theme.colors.textSecondary }]}>
                  {t('markets.closeOn', { date: formatDate(state.date, { locale }) })}
                </Text>
                <Text style={[styles.big, { color: theme.colors.text }]}>{level(state.close)}{id === 'sp500' ? ` ${t('markets.points')}` : ''}</Text>
                <View style={styles.changes}>
                  <Text style={[styles.change, { color: color(state.change1d) }]}>{t('markets.day', { pct: pct(state.change1d) })}</Text>
                  <Text style={[styles.change, { color: color(state.change5d) }]}>{t('markets.week', { pct: pct(state.change5d) })}</Text>
                </View>

                {chart && (
                  <View style={styles.chart}>
                    <LineChartSkia
                      data={chart.data}
                      xLabels={chart.xLabels}
                      width={width - 64}
                      height={190}
                      color={theme.colors.primary}
                      series={[{ key: 'ma50', color: MA_COLORS.ma50, width: 1.25 }, { key: 'ma200', color: MA_COLORS.ma200, width: 1.5 }]}
                      theme={theme}
                      yTickCount={4}
                      showArea={false}
                      formatYLabel={(v) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v)}
                    />
                  </View>
                )}
                <View style={styles.legend}>
                  <View style={[styles.legendLine, { backgroundColor: MA_COLORS.ma50 }]} />
                  <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('markets.ma50')}</Text>
                  <View style={[styles.legendLine, { backgroundColor: MA_COLORS.ma200 }]} />
                  <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('markets.ma200')}</Text>
                </View>
                <SegmentedControl
                  options={PERIODS.map((p) => ({ key: p.key, label: t(`markets.periods.${p.key}`) }))}
                  value={period}
                  onChange={setPeriod}
                  variant="inCard"
                  size="sm"
                  fill
                />

                <View style={styles.facts}>
                  <Text style={[styles.fact, { color: theme.colors.text }]}>
                    {t('markets.fromHigh', { pct: pct(state.drawdown), date: formatDate(state.highDate, { locale }) })}
                  </Text>
                  {state.distMa200 != null && (
                    <Text style={[styles.fact, { color: theme.colors.text }]}>
                      {t(state.distMa200 >= 0 ? 'markets.aboveMa200' : 'markets.belowMa200', { pct: pctAbs(state.distMa200) })}
                    </Text>
                  )}
                  {state.distMa50 != null && (
                    <Text style={[styles.fact, { color: theme.colors.textSecondary }]}>
                      {t(state.distMa50 >= 0 ? 'markets.aboveMa50' : 'markets.belowMa50', { pct: pctAbs(state.distMa50) })}
                    </Text>
                  )}
                </View>

                <View style={[styles.verdict, { backgroundColor: phase === 'near' ? theme.colors.successBg : theme.colors.warningBg }]}>
                  <Text style={[styles.verdictText, { color: theme.colors.text }]}>
                    {t(`markets.phase.${phase}`, { market: t(`markets.names.${id}`) })}
                    {' '}
                    {state.distMa200 != null && t(state.distMa200 >= 0 ? 'markets.trendUp' : 'markets.trendDown')}
                  </Text>
                </View>

                {fearData && fearLvl && (
                  <View style={styles.fearRow}>
                    <Ionicons name="pulse-outline" size={16} color={theme.colors[FEAR_COLORS[fearLvl]]} />
                    <Text style={[styles.fearText, { color: theme.colors.text }]}>
                      {t(market.fear === 'vix' ? 'markets.vix' : 'markets.cryptoFear', { value: Math.round(fearData.value) })}{' '}
                      <Text style={{ color: theme.colors[FEAR_COLORS[fearLvl]], fontWeight: '700' }}>{t(`markets.fearLevels.${fearLvl}`)}</Text>
                    </Text>
                  </View>
                )}
                {fearData && <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t(market.fear === 'vix' ? 'markets.vixHint' : 'markets.cryptoFearHint')}</Text>}
              </View>

              {/* 2. Ce que dit l'histoire */}
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('markets.historyTitle')}</Text>
                {!entry.stats ? (
                  <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
                ) : hist ? (
                  <>
                    <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                      {step
                        ? t('markets.historyIntro', { step: shownStep, count: hist.count, year: sinceYear })
                        : t('markets.historyIfIntro', { step: shownStep, count: hist.count, year: sinceYear })}
                    </Text>
                    <Text style={[styles.histLine, { color: theme.colors.text }]}>
                      {t('markets.stopped', { stopped: hist.count - hist.deeper, count: hist.count, limit: shownStep + 10 })}
                    </Text>
                    <Text style={[styles.histLine, { color: theme.colors.text }]}>
                      {t('markets.trough', { median: pct(hist.troughMedian, 0), worst: pct(hist.troughWorst, 0) })}
                    </Text>
                    {fwdLine(t('markets.after1y'), hist.fwd1y)}
                    {fwdLine(t('markets.after3y'), hist.fwd3y)}
                    {dropStats?.fwd1y && (
                      <Text style={[styles.histLine, { color: theme.colors.text }]}>
                        {t('markets.dropDays', { step: dropStep, count: dropStats.count, year: sinceYear, up: dropStats.fwd1y.up, n: dropStats.fwd1y.n, median: pct(dropStats.fwd1y.median, 0) })}
                      </Text>
                    )}
                    {spread && (
                      <Text style={[styles.histLine, { color: theme.colors.text }]}>
                        {t('markets.spread', { better: spread.better, n: spread.n })}
                      </Text>
                    )}
                    <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t(id === 'btc' ? 'markets.historyNoteBtc' : 'markets.historyNote', { year: sinceYear })}</Text>
                  </>
                ) : null}
              </View>

              {/* 3. Et toi */}
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('markets.youTitle')}</Text>
                <Text style={[styles.histLine, { color: theme.colors.text }]}>
                  {holdings.assets.length > 0
                    ? t(id === 'btc' ? 'markets.holdBtc' : 'markets.holdSp', { amount: money(holdings.value), names: holdings.assets.map((a) => a.symbol).slice(0, 3).join(', ') })
                    : t(id === 'btc' ? 'markets.noBtc' : 'markets.noSp')}
                </Text>
                {reserve > 0 ? (
                  <Text style={[styles.histLine, { color: theme.colors.text }]}>
                    {t('markets.surplus', { months: reserveMonths, reserve: money(reserve), surplus: money(opp.surplus) })}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={() => navigation.navigate('Goals')} style={styles.link} accessibilityRole="button">
                    <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('markets.needExpenses')}</Text>
                  </TouchableOpacity>
                )}
                {target ? (
                  <Text style={[styles.histLine, { color: theme.colors.text }]}>
                    {t(id === 'btc' ? 'markets.targetCrypto' : 'markets.targetStock', {
                      target: target[bucket],
                      current: total > 0 ? Math.round((values[bucket] / total) * 100) : 0,
                    })}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={() => navigation.navigate('Rebalance')} style={styles.link} accessibilityRole="button">
                    <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('markets.needTarget')}</Text>
                  </TouchableOpacity>
                )}

                {opp.amount != null && reserve > 0 && (opp.amount > 0 ? (
                  <>
                    <Text style={[styles.oppBig, { color: theme.colors.primary }]}>{money(opp.amount)}</Text>
                    <Text style={[styles.histLine, { color: theme.colors.text }]}>{t('markets.oppLine')}</Text>
                    <View style={styles.chips}>
                      {SPREAD_MONTHS.map((m) => {
                        const on = months === m;
                        return (
                          <TouchableOpacity
                            key={m}
                            onPress={() => setMonths(m)}
                            style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primaryMuted : 'transparent' }]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.chipText, { color: on ? theme.colors.primary : theme.colors.text }]}>{t('markets.overMonths', { count: m })}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.histLine, { color: theme.colors.text }]}>{t('markets.perMonth', { amount: money(opp.perMonth), count: months })}</Text>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: theme.colors.primary }]}
                      onPress={() => navigation.navigate('Plans', { prefill: { asset: planAsset, amount: opp.perMonth } })}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{t('markets.schedule')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.histLine, { color: theme.colors.textSecondary }]}>
                    {opp.gap != null && opp.gap <= 0 ? t('markets.atTarget') : t('markets.noSurplus')}
                  </Text>
                ))}
                <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('markets.youNote')}</Text>
              </View>

              {/* 4. Plan anti-panique */}
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('markets.ruleTitle')}</Text>
                {rule ? (
                  <>
                    <Text style={[styles.histLine, { color: theme.colors.text }]}>
                      {t('markets.ruleActive', { market: t(`markets.names.${id}`), step: rule.threshold, amount: money(rule.amount) })}
                    </Text>
                    <TouchableOpacity onPress={() => setMarketRule(id, null)} style={styles.link} accessibilityRole="button">
                      <Text style={[styles.linkText, { color: theme.colors.error }]}>{t('markets.ruleRemove')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('markets.ruleIntro')}</Text>
                    <View style={styles.chips}>
                      {market.ruleSteps.map((s) => {
                        const on = (ruleStep || market.ruleSteps[0]) === s;
                        return (
                          <TouchableOpacity
                            key={s}
                            onPress={() => setRuleStep(s)}
                            style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primaryMuted : 'transparent' }]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.chipText, { color: on ? theme.colors.primary : theme.colors.text }]}>−{s} %</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                      <TextInput
                        value={ruleAmount}
                        onChangeText={setRuleAmount}
                        keyboardType="decimal-pad"
                        placeholder="2000"
                        placeholderTextColor={theme.colors.textTertiary}
                        style={[styles.input, { color: theme.colors.text }]}
                        accessibilityLabel={t('markets.ruleAmount')}
                      />
                      <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol}</Text>
                    </View>
                    <TouchableOpacity style={[styles.button, styles.outline, { borderColor: theme.colors.primary }]} onPress={saveRule} accessibilityRole="button">
                      <Text style={[styles.buttonText, { color: theme.colors.primary }]}>{t('markets.ruleSave')}</Text>
                    </TouchableOpacity>
                  </>
                )}
                <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('markets.ruleNote')}</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  loader: { marginVertical: 24 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 30, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  changes: { flexDirection: 'row', gap: 16, marginTop: 4 },
  change: { fontSize: 14, fontWeight: '700' },
  chart: { marginTop: 12, marginHorizontal: -8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 10 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 11, marginRight: 8 },
  facts: { marginTop: 14, gap: 4 },
  fact: { fontSize: 14, lineHeight: 20 },
  verdict: { borderRadius: 12, padding: 12, marginTop: 12 },
  verdictText: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  fearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  fearText: { flex: 1, fontSize: 14 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  histLine: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  oppBig: { fontSize: 26, fontWeight: '800', marginTop: 14, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12, marginTop: 10 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  link: { minHeight: 40, justifyContent: 'center', marginTop: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  outline: { borderWidth: 1.5 },
  buttonText: { fontSize: 15, fontWeight: '700' },
});

export default MarketsScreen;
