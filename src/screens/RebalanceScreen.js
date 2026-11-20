/**
 * Rééquilibrage : une répartition cible entre actions et ETF, crypto et
 * liquidités, et la façon d'y revenir. D'abord en orientant le prochain
 * versement (rien à vendre, donc pas d'impôt ni de frais), ensuite, pour
 * information, les achats et ventes qui y ramèneraient d'un coup.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { useMyNumbers } from '../hooks/useMyNumbers';
import Slider from '../components/Slider';
import {
  allocationPct,
  BUCKETS,
  fullRebalance,
  fundBasedTargets,
  PRESETS,
  rebalanceInsights,
  setInvestedShare,
  splitContribution,
  targetsValid,
} from '../core/rebalance';
import { CLASS_COLORS } from '../utils/assetColors';
import { formatPercent } from '../utils/formatters';

const STEP = 5;
const roundTo = (v, step) => Math.round(v / step) * step;

/** Cible de départ : la répartition actuelle, arrondie à 5 % et ramenée à 100. */
const initialTargets = (pct) => {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, roundTo(pct[b], STEP)]));
  const diff = 100 - BUCKETS.reduce((s, b) => s + out[b], 0);
  const biggest = BUCKETS.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[biggest] += diff;
  return out;
};

const INSIGHT_ICONS = { warning: 'alert-circle', info: 'information-circle' };
const same = (a, b) => !!a && !!b && BUCKETS.every((k) => a[k] === b[k]);

const RebalanceScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount, currencySymbol } = useSettings();
  const { totals, cash } = usePortfolio();
  const { targets: saved, setTargets, monthlyExpenses } = usePlanning();
  // Le prochain versement : ce que ton budget investit chaque mois, sinon ton épargne.
  const numbers = useMyNumbers();
  const monthly = numbers.invest || numbers.savings;

  const values = useMemo(() => ({
    stock: totals.byClass?.stock?.value || 0,
    crypto: totals.byClass?.crypto?.value || 0,
    cash: cash.total,
  }), [totals.byClass, cash.total]);
  const current = allocationPct(values);

  const [targets, setLocal] = useState(() => (targetsValid(saved) ? saved : initialTargets(current)));
  const [amountInput, setAmountInput] = useState(String(monthly || 500));
  const amount = Math.max(0, Number(String(amountInput).replace(/\s/g, '').replace(',', '.')) || 0);

  const split = splitContribution({ values, targets, amount });
  const full = fullRebalance({ values, targets });
  const fund = fundBasedTargets({ values, monthlyExpenses });
  const insights = rebalanceInsights({ values, monthlyExpenses });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const label = (b) => (b === 'cash' ? t('classes.cash') : t(`classes.${b}`));
  const pct = (v) => formatPercent(v, { showSign: false, decimals: 0 });
  const levelColor = { warning: theme.colors.warning, info: theme.colors.textTertiary };

  // Toute cible fait 100 % : on l'applique et on l'enregistre directement.
  const apply = (next) => {
    setLocal(next);
    setTargets(next);
  };
  const presets = [
    ...Object.entries(PRESETS).map(([key, value]) => ({ key, value })),
    ...(fund ? [{ key: 'fund', value: fund }] : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('rebalance.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('rebalance.targetTitle')}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('rebalance.intro')}</Text>

            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('rebalance.presetsTitle')}</Text>
            <View style={styles.chips}>
              {presets.map((p) => {
                const on = same(p.value, targets);
                return (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => apply(p.value)}
                    style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primaryMuted : 'transparent' }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipLabel, { color: on ? theme.colors.primary : theme.colors.text }]}>{t(`rebalance.presets.${p.key}`)}</Text>
                    <Text style={[styles.chipValue, { color: theme.colors.textTertiary }]}>{BUCKETS.map((k) => p.value[k]).join(' / ')}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!fund && (
              <TouchableOpacity onPress={() => navigation.navigate('Goals')} accessibilityRole="button">
                <Text style={[styles.small, { color: theme.colors.primary }]}>{t('rebalance.fundMissing')}</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.small, { color: theme.colors.textTertiary }]}>{t('rebalance.presetsNote')}</Text>

            {BUCKETS.map((b) => (
              <View key={b} style={styles.bucket}>
                <View style={styles.bucketHead}>
                  <View style={[styles.dot, { backgroundColor: CLASS_COLORS[b] }]} />
                  <Text style={[styles.bucketName, { color: theme.colors.text }]}>{label(b)}</Text>
                  <Text style={[styles.target, { color: theme.colors.text }]}>{pct(targets[b])}</Text>
                </View>
                {b === 'cash' ? (
                  <View style={[styles.restTrack, { backgroundColor: theme.colors.backgroundSecondary }]}>
                    <View style={[styles.restFill, { width: `${targets.cash}%`, backgroundColor: CLASS_COLORS.cash }]} />
                  </View>
                ) : (
                  <Slider
                    value={targets[b]}
                    min={0}
                    max={100}
                    limit={100 - targets[b === 'stock' ? 'crypto' : 'stock']}
                    step={5}
                    color={CLASS_COLORS[b]}
                    onChange={(v) => apply(setInvestedShare(targets, b, v))}
                    accessibilityLabel={label(b)}
                    formatValue={pct}
                  />
                )}
                <Text style={[styles.small, { color: theme.colors.textTertiary }]}>
                  {b === 'cash' ? `${t('rebalance.rest')} · ` : ''}
                  {t('rebalance.currentLine', { pct: pct(current[b]), amount: formatAmount(values[b], { decimals: 0 }) })}
                </Text>
              </View>
            ))}

            {insights.map((it) => (
              <View key={it.key} style={styles.insight}>
                <Ionicons name={INSIGHT_ICONS[it.level]} size={18} color={levelColor[it.level]} />
                <Text style={[styles.insightText, { color: theme.colors.text }]}>
                  {t(`rebalance.insights.${it.key}`, {
                    months: it.months != null ? Math.round(it.months) : '',
                    amount: it.surplus != null ? formatAmount(it.surplus, { decimals: 0 }) : '',
                    pct: it.pct != null ? pct(it.pct) : '',
                  })}
                </Text>
              </View>
            ))}
          </View>

          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('rebalance.nextTitle')}</Text>
            <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.colors.text }]}
                accessibilityLabel={t('rebalance.nextTitle')}
              />
              <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol}</Text>
            </View>
            {BUCKETS.map((b) => (
              <View key={b} style={styles.line}>
                <View style={[styles.dot, { backgroundColor: CLASS_COLORS[b] }]} />
                <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>{label(b)}</Text>
                <Text style={[styles.lineValue, { color: theme.colors.text }]}>{formatAmount(split[b], { decimals: 0, reveal: true })}</Text>
              </View>
            ))}
            <Text style={[styles.small, { color: theme.colors.textTertiary }]}>{t('rebalance.nextNote')}</Text>
          </View>

          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('rebalance.fullTitle')}</Text>
            {BUCKETS.map((b) => (
              <View key={b} style={styles.line}>
                <View style={[styles.dot, { backgroundColor: CLASS_COLORS[b] }]} />
                <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>{label(b)}</Text>
                <Text style={[styles.lineValue, { color: Math.abs(full[b]) < 1 ? theme.colors.textTertiary : theme.colors.text }]}>
                  {Math.abs(full[b]) < 1
                    ? t('rebalance.balanced')
                    : b === 'cash'
                      // Des liquidités ne se « vendent » pas : on les garde ou on les sort des comptes.
                      ? t(full[b] > 0 ? 'rebalance.cashIn' : 'rebalance.cashOut', { amount: formatAmount(Math.abs(full[b]), { decimals: 0 }) })
                      : full[b] > 0
                        ? t('rebalance.buy', { amount: formatAmount(full[b], { decimals: 0 }) })
                        : t('rebalance.sell', { amount: formatAmount(-full[b], { decimals: 0 }) })}
                </Text>
              </View>
            ))}
            <Text style={[styles.small, { color: theme.colors.textTertiary }]}>{t('rebalance.fullNote')}</Text>
          </View>
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
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 4 },
  bucket: { marginTop: 16 },
  bucketHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bucketName: { flex: 1, fontSize: 15, fontWeight: '600' },
  target: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  restTrack: { height: 6, borderRadius: 3, marginHorizontal: 13, marginVertical: 17, overflow: 'hidden' },
  restFill: { height: 6, borderRadius: 3 },
  small: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  chipValue: { fontSize: 11, fontVariant: ['tabular-nums'] },
  insight: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  insightText: { flex: 1, fontSize: 13, lineHeight: 19 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12, marginTop: 12, marginBottom: 6 },
  input: { flex: 1, fontSize: 18, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 14, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  lineLabel: { flex: 1, fontSize: 14 },
  lineValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default RebalanceScreen;
