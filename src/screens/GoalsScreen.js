/**
 * Objectifs : un montant à atteindre à une date, avec la progression et ce
 * qu'il faudrait épargner chaque mois pour y arriver. Plus l'épargne de
 * précaution : combien de mois de dépenses les liquidités couvrent.
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
import DateField from '../components/Transaction/DateField';
import { useMyNumbers } from '../hooks/useMyNumbers';
import { averageCashRate, SCENARIOS } from '../core/projection';
import { emergencyFund, goalStatus } from '../core/goals';
import { availableCash } from '../core/cash';
import { emergencyMonths } from '../core/profile';
import { formatDate } from '../utils/formatters';

const parseNum = (s) => {
  const n = Number(String(s ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const inFiveYears = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d;
};

const GoalsScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, locale, formatAmount, currencySymbol } = useSettings();
  const { overview, cash } = usePortfolio();
  const { goals, addGoal, removeGoal, monthlyExpenses, setMonthlyExpenses, profile } = usePlanning();
  const monthly = useMyNumbers().savings || 0;

  const [expensesInput, setExpensesInput] = useState(monthlyExpenses ? String(monthlyExpenses) : '');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(inFiveYears());
  const [error, setError] = useState(null);
  const [kind, setKind] = useState(null);

  const base = useMemo(() => ({
    invested: Math.max(0, overview.investedValue ?? overview.value - cash.total),
    cash: cash.total,
    cashRate: averageCashRate(cash.total, cash.yearlyInterest),
    annualRate: SCENARIOS.median,
    monthly,
  }), [overview, cash, monthly]);

  // Seul l'argent disponible tout de suite compte ; la cible suit le profil
  // (6 mois pour des revenus irréguliers, plus avec des enfants).
  const fund = emergencyFund({
    cash: availableCash(cash.accounts),
    monthlyExpenses,
    target: profile?.answers ? emergencyMonths(profile.answers) : 3,
  });
  const gaugeMax = fund ? Math.max(12, fund.high + 3) : 12;
  const gaugePos = fund ? Math.min(1, fund.months / gaugeMax) : 0;
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const levelColor = { low: theme.colors.warning, ok: theme.colors.success, high: theme.colors.primary };

  const saveExpenses = () => {
    const n = parseNum(expensesInput);
    setMonthlyExpenses(n);
    if (!(n > 0)) setExpensesInput('');
  };

  // Projets cochés dans le questionnaire, pas encore devenus des objectifs :
  // un toucher pré-remplit le nom et l'échéance, il reste le montant à mettre.
  const monthsFromNow = (months) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d;
  };
  const answers = profile?.answers || {};
  const suggestions = [
    answers.projects?.includes('home') && { kind: 'home', months: answers.homeWhen === 'soon' ? 18 : 48 },
    answers.projects?.includes('car') && { kind: 'car', months: 24 },
    answers.projects?.includes('bigSpend') && { kind: 'bigSpend', months: 12 },
  ].filter((x) => x && !goals.some((g) => g.kind === x.kind));
  const applySuggestion = (sug) => {
    Haptics.selectionAsync();
    setKind(sug.kind);
    setName(t(`goals.suggest.${sug.kind}.name`));
    setDate(monthsFromNow(sug.months));
    setError(null);
  };
  const suggestionHint = kind ? t(`goals.suggest.${kind}.hint`) : null;

  const submitGoal = () => {
    const amount = parseNum(target);
    if (!name.trim() || !(amount > 0)) {
      setError(t('goals.errors.form'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    addGoal({ name: name.trim(), target: amount, date: date.toISOString(), ...(kind ? { kind } : {}) });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setName('');
    setTarget('');
    setDate(inFiveYears());
    setError(null);
    setKind(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('goals.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Épargne de précaution */}
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('goals.fund.title')}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('goals.fund.intro')}</Text>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('goals.fund.expenses')}</Text>
            <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput
                value={expensesInput}
                onChangeText={setExpensesInput}
                onEndEditing={saveExpenses}
                onSubmitEditing={saveExpenses}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="0"
                placeholderTextColor={theme.colors.textTertiary}
                style={[styles.input, { color: theme.colors.text }]}
                accessibilityLabel={t('goals.fund.expenses')}
              />
              <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol} / {t('projection.perMonth')}</Text>
            </View>
            {fund && (
              <>
                <Text style={[styles.big, { color: levelColor[fund.level] }]}>
                  {t('goals.fund.months', { value: fund.months.toLocaleString(locale, { maximumFractionDigits: 1 }) })}
                </Text>
                {/* Trois zones, et un repère qui dit où tu en es. */}
                <View style={styles.gauge}>
                  <View
                    style={[
                      styles.pin,
                      gaugePos < 0.15 ? { left: 0 } : gaugePos > 0.85 ? { right: 0 } : { left: `${gaugePos * 100}%`, transform: [{ translateX: -36 }] },
                    ]}
                  >
                    <View style={[styles.pinBubble, { backgroundColor: levelColor[fund.level] }]}>
                      <Text style={[styles.pinText, { color: theme.colors.onPrimary }]}>
                        {t('goals.fund.you', { value: fund.months.toLocaleString(locale, { maximumFractionDigits: 1 }) })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.zones}>
                    <View style={[styles.zone, { flex: fund.low, backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warning }]} />
                    <View style={[styles.zone, { flex: fund.high - fund.low, backgroundColor: theme.colors.successBg, borderColor: theme.colors.success }]} />
                    <View style={[styles.zone, { flex: gaugeMax - fund.high, backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary }]} />
                  </View>
                  <View style={[styles.marker, { left: `${gaugePos * 100}%`, backgroundColor: levelColor[fund.level], borderColor: theme.colors.surface }]} />
                </View>
                <View style={styles.zoneLabels}>
                  <Text style={[styles.zoneLabel, { flex: fund.low, color: fund.level === 'low' ? theme.colors.warning : theme.colors.textTertiary }]} numberOfLines={2}>{t('goals.fund.zones.low')}</Text>
                  <Text style={[styles.zoneLabel, styles.zoneCenter, { flex: fund.high - fund.low, color: fund.level === 'ok' ? theme.colors.success : theme.colors.textTertiary }]} numberOfLines={2}>
                    {t('goals.fund.zones.ok', { low: fund.low, high: fund.high })}
                  </Text>
                  <Text style={[styles.zoneLabel, styles.zoneRight, { flex: gaugeMax - fund.high, color: fund.level === 'high' ? theme.colors.primary : theme.colors.textTertiary }]} numberOfLines={2}>{t('goals.fund.zones.high')}</Text>
                </View>
                <Text style={[styles.sub, { color: theme.colors.text }]}>
                  {fund.level === 'low' && t('goals.fund.low', { amount: formatAmount(fund.shortfall, { decimals: 0 }), months: fund.low })}
                  {fund.level === 'ok' && t('goals.fund.ok')}
                  {fund.level === 'high' && t('goals.fund.high', { amount: formatAmount(fund.surplus, { decimals: 0 }), months: fund.high })}
                </Text>
                <Text style={[styles.counted, { color: theme.colors.textTertiary }]}>{t('goals.fund.counted')}</Text>
                {fund.level === 'high' && (
                  <TouchableOpacity onPress={() => navigation.navigate('Projection')} accessibilityRole="button" style={styles.link}>
                    <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('goals.fund.simulate')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Objectifs */}
          {goals.map((goal) => {
            const s = goalStatus({ goal, base });
            return (
              <View key={goal.id} style={cardStyle}>
                <View style={styles.goalHead}>
                  <Text style={[styles.cardTitle, styles.flex, { color: theme.colors.text }]} numberOfLines={1}>{goal.name}</Text>
                  <TouchableOpacity
                    onPress={() => removeGoal(goal.id)}
                    style={styles.trash}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                  {t('goals.targetLine', { amount: formatAmount(goal.target, { decimals: 0 }), date: formatDate(goal.date, { locale }) })}
                </Text>
                <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  <View style={[styles.fill, { width: `${s.progress}%`, backgroundColor: s.onTrack ? theme.colors.success : theme.colors.warning }]} />
                </View>
                <Text style={[styles.progress, { color: theme.colors.text }]}>
                  {t('goals.progress', { value: Math.round(s.progress) })}
                </Text>
                <Text style={[styles.sub, { color: s.onTrack ? theme.colors.success : theme.colors.warning }]}>
                  {s.reached
                    ? t('goals.reached')
                    : s.onTrack
                      ? t('goals.onTrack', { amount: formatAmount(s.projected, { decimals: 0 }) })
                      : t('goals.behind', { amount: formatAmount(s.neededMonthly, { decimals: 0 }), current: formatAmount(monthly, { decimals: 0 }) })}
                </Text>
              </View>
            );
          })}

          {/* Nouvel objectif */}
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('goals.newTitle')}</Text>
            {suggestions.length > 0 && (
              <>
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('goals.suggest.intro')}</Text>
                <View style={styles.suggestions}>
                  {suggestions.map((sug) => {
                    const active = kind === sug.kind;
                    return (
                      <TouchableOpacity
                        key={sug.kind}
                        onPress={() => applySuggestion(sug)}
                        style={[styles.suggestion, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primaryMuted : theme.colors.background }]}
                        accessibilityRole="button"
                      >
                        <Ionicons name={{ home: 'key-outline', car: 'car-outline', bigSpend: 'sparkles-outline' }[sug.kind]} size={15} color={theme.colors.primary} />
                        <Text style={[styles.suggestionText, { color: theme.colors.text }]}>{t(`goals.suggest.${sug.kind}.name`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('goals.name')}</Text>
            <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('goals.namePlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
                style={[styles.input, { color: theme.colors.text }]}
                accessibilityLabel={t('goals.name')}
              />
            </View>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('goals.target')}</Text>
            <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.textTertiary}
                style={[styles.input, { color: theme.colors.text }]}
                accessibilityLabel={t('goals.target')}
              />
              <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol}</Text>
            </View>
            {!!suggestionHint && <Text style={[styles.counted, { color: theme.colors.textTertiary }]}>{suggestionHint}</Text>}
            {kind === 'home' && (
              <TouchableOpacity onPress={() => navigation.navigate('HomeBuy')} accessibilityRole="button" style={styles.link}>
                <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('homeBuy.fromGoal')}</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('goals.date')}</Text>
            <DateField value={date} onChange={setDate} label={t('goals.date')} allowFuture />
            {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={submitGoal} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{t('goals.add')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
            {t('goals.note', { monthly: formatAmount(monthly, { decimals: 0 }) })}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 26, fontWeight: '700', marginTop: 14, marginBottom: 8, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  fill: { height: 8, borderRadius: 4 },
  gauge: { marginTop: 14, paddingTop: 30, height: 30 + 14 },
  zones: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 },
  zone: { height: 14, borderBottomWidth: 2 },
  marker: { position: 'absolute', top: 26, width: 6, height: 22, marginLeft: -3, borderRadius: 3, borderWidth: 1.5 },
  pin: { position: 'absolute', top: 0, width: 72, alignItems: 'center' },
  pinBubble: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pinText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  zoneLabels: { flexDirection: 'row', gap: 2, marginTop: 6 },
  zoneLabel: { fontSize: 10.5, fontWeight: '600' },
  zoneCenter: { textAlign: 'center' },
  zoneRight: { textAlign: 'right' },
  counted: { fontSize: 11, lineHeight: 15, marginTop: 8 },
  link: { minHeight: 40, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600' },
  goalHead: { flexDirection: 'row', alignItems: 'center' },
  trash: { minWidth: 40, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  progress: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  error: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  suggestionText: { fontSize: 13, fontWeight: '600' },
});

export default GoalsScreen;
