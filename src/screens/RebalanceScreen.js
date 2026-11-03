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
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { useSuggestedMonthly } from '../hooks/useSuggestedMonthly';
import { allocationPct, BUCKETS, fullRebalance, splitContribution, targetsValid } from '../core/rebalance';
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

const RebalanceScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount, currencySymbol } = useSettings();
  const { totals, cash } = usePortfolio();
  const { targets: saved, setTargets } = usePlanning();
  const monthly = useSuggestedMonthly();

  const values = useMemo(() => ({
    stock: totals.byClass?.stock?.value || 0,
    crypto: totals.byClass?.crypto?.value || 0,
    cash: cash.total,
  }), [totals.byClass, cash.total]);
  const current = allocationPct(values);

  const [targets, setLocal] = useState(() => (targetsValid(saved) ? saved : initialTargets(current)));
  const [amountInput, setAmountInput] = useState(String(monthly || 500));
  const amount = Math.max(0, Number(String(amountInput).replace(/\s/g, '').replace(',', '.')) || 0);

  const sum = BUCKETS.reduce((s, b) => s + targets[b], 0);
  const valid = targetsValid(targets);
  const split = splitContribution({ values, targets, amount });
  const full = fullRebalance({ values, targets });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const label = (b) => (b === 'cash' ? t('classes.cash') : t(`classes.${b}`));

  const change = (bucket, delta) => {
    Haptics.selectionAsync();
    setLocal((prev) => {
      const next = { ...prev, [bucket]: Math.max(0, Math.min(100, prev[bucket] + delta)) };
      if (targetsValid(next)) setTargets(next);
      return next;
    });
  };

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
            {BUCKETS.map((b) => (
              <View key={b} style={styles.bucket}>
                <View style={styles.bucketHead}>
                  <View style={[styles.dot, { backgroundColor: CLASS_COLORS[b] }]} />
                  <Text style={[styles.bucketName, { color: theme.colors.text }]}>{label(b)}</Text>
                  <TouchableOpacity onPress={() => change(b, -STEP)} style={[styles.step, { borderColor: theme.colors.border }]} accessibilityRole="button" accessibilityLabel={`− ${label(b)}`}>
                    <Ionicons name="remove" size={18} color={theme.colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.target, { color: theme.colors.text }]}>{formatPercent(targets[b], { showSign: false, decimals: 0 })}</Text>
                  <TouchableOpacity onPress={() => change(b, STEP)} style={[styles.step, { borderColor: theme.colors.border }]} accessibilityRole="button" accessibilityLabel={`+ ${label(b)}`}>
                    <Ionicons name="add" size={18} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  <View style={[styles.fill, { width: `${Math.min(100, current[b])}%`, backgroundColor: CLASS_COLORS[b] }]} />
                  <View style={[styles.marker, { left: `${Math.min(100, targets[b])}%`, backgroundColor: theme.colors.text }]} />
                </View>
                <Text style={[styles.small, { color: theme.colors.textTertiary }]}>
                  {t('rebalance.currentLine', { pct: formatPercent(current[b], { showSign: false, decimals: 0 }), amount: formatAmount(values[b], { decimals: 0 }) })}
                </Text>
              </View>
            ))}
            {!valid && (
              <Text style={[styles.warning, { color: theme.colors.warning }]}>
                {t('rebalance.sumWarning', { sum: formatPercent(sum, { showSign: false, decimals: 0 }) })}
              </Text>
            )}
          </View>

          {valid && (
            <>
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
                        : full[b] > 0
                          ? t('rebalance.buy', { amount: formatAmount(full[b], { decimals: 0 }) })
                          : t('rebalance.sell', { amount: formatAmount(-full[b], { decimals: 0 }) })}
                    </Text>
                  </View>
                ))}
                <Text style={[styles.small, { color: theme.colors.textTertiary }]}>{t('rebalance.fullNote')}</Text>
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
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 4 },
  bucket: { marginTop: 16 },
  bucketHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bucketName: { flex: 1, fontSize: 15, fontWeight: '600' },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  target: { width: 52, textAlign: 'center', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, marginTop: 10, overflow: 'visible' },
  fill: { height: 8, borderRadius: 4 },
  marker: { position: 'absolute', top: -4, width: 2, height: 16, marginLeft: -1, borderRadius: 1 },
  small: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  warning: { fontSize: 13, fontWeight: '600', marginTop: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12, marginTop: 12, marginBottom: 6 },
  input: { flex: 1, fontSize: 18, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 14, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  lineLabel: { flex: 1, fontSize: 14 },
  lineValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default RebalanceScreen;
