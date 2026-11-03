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
import { useSuggestedMonthly } from '../hooks/useSuggestedMonthly';
import { averageCashRate, SCENARIOS } from '../core/projection';
import { emergencyFund, goalStatus } from '../core/goals';
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
  const { goals, addGoal, removeGoal, monthlyExpenses, setMonthlyExpenses } = usePlanning();
  const monthly = useSuggestedMonthly();

  const [expensesInput, setExpensesInput] = useState(monthlyExpenses ? String(monthlyExpenses) : '');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(inFiveYears());
  const [error, setError] = useState(null);

  const base = useMemo(() => ({
    invested: Math.max(0, overview.investedValue ?? overview.value - cash.total),
    cash: cash.total,
    cashRate: averageCashRate(cash.total, cash.yearlyInterest),
    annualRate: SCENARIOS.median,
    monthly,
  }), [overview, cash, monthly]);

  const fund = emergencyFund({ cash: cash.total, monthlyExpenses });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const levelColor = { low: theme.colors.warning, ok: theme.colors.success, high: theme.colors.primary };

  const saveExpenses = () => {
    const n = parseNum(expensesInput);
    setMonthlyExpenses(n);
    if (!(n > 0)) setExpensesInput('');
  };

  const submitGoal = () => {
    const amount = parseNum(target);
    if (!name.trim() || !(amount > 0)) {
      setError(t('goals.errors.form'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    addGoal({ name: name.trim(), target: amount, date: date.toISOString() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setName('');
    setTarget('');
    setDate(inFiveYears());
    setError(null);
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
                <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  <View style={[styles.band, { left: '25%', width: '25%', backgroundColor: theme.colors.successBg }]} />
                  <View style={[styles.fill, { width: `${Math.min(100, (fund.months / 12) * 100)}%`, backgroundColor: levelColor[fund.level] }]} />
                </View>
                <View style={styles.scale}>
                  {['0', '3', '6', '9', '12'].map((m) => (
                    <Text key={m} style={[styles.scaleText, { color: theme.colors.textTertiary }]}>{t('goals.fund.monthShort', { count: m })}</Text>
                  ))}
                </View>
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                  {fund.level === 'low' && t('goals.fund.low', { amount: formatAmount(fund.shortfall, { decimals: 0 }) })}
                  {fund.level === 'ok' && t('goals.fund.ok')}
                  {fund.level === 'high' && t('goals.fund.high', { amount: formatAmount(fund.surplus, { decimals: 0 }) })}
                </Text>
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
  band: { position: 'absolute', top: 0, bottom: 0 },
  fill: { height: 8, borderRadius: 4 },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  scaleText: { fontSize: 10 },
  link: { minHeight: 40, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600' },
  goalHead: { flexDirection: 'row', alignItems: 'center' },
  trash: { minWidth: 40, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  progress: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  error: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});

export default GoalsScreen;
