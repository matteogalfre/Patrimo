/**
 * Simulateur d'achat immobilier : pour un prix, les frais de notaire, le
 * montant à emprunter, la mensualité, le taux d'endettement face à la règle
 * des 35 % et le coût du crédit ; et le prix le plus élevé que tes revenus
 * permettent. Pré-rempli avec tes chiffres (revenus, épargne disponible,
 * crédits en cours). Repères dans core/realEstate.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { useMyNumbers } from '../hooks/useMyNumbers';
import { availableCash } from '../core/cash';
import { DEFAULT_INSURANCE, DEFAULT_RATES, MAX_DEBT_RATIO, maxPurchase, simulatePurchase } from '../core/realEstate';
import { formatPercent } from '../utils/formatters';

const parseNum = (s) => {
  const n = Number(String(s ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const YEARS = [15, 20, 25];
const RESERVE_MONTHS = 3;

const HomeBuyScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, locale, formatAmount, currencySymbol } = useSettings();
  const { cash, debts } = usePortfolio();
  const { addGoal, goals, monthlyExpenses } = usePlanning();
  const numbers = useMyNumbers();
  const dec = (v) => String(v).replace('.', locale.startsWith('en') ? '.' : ',');

  // Apport proposé : l'épargne disponible, moins quelques mois de dépenses à garder.
  const reserve = (monthlyExpenses || numbers.expenses || 0) * RESERVE_MONTHS;
  const spare = Math.max(0, availableCash(cash.accounts) - reserve);

  const [price, setPrice] = useState('200000');
  const [kind, setKind] = useState('old');
  const [works, setWorks] = useState('');
  const [contribution, setContribution] = useState(String(Math.round(Math.min(spare, 40000) / 1000) * 1000));
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(dec(DEFAULT_RATES[25]));
  const [insurance, setInsurance] = useState(dec(DEFAULT_INSURANCE));
  const [income, setIncome] = useState(numbers.income ? String(Math.round(numbers.income)) : '');
  const [otherLoans, setOtherLoans] = useState(debts.monthly > 0 ? String(Math.round(debts.monthly)) : '');
  const [goalAdded, setGoalAdded] = useState(false);
  // Les chiffres arrivent parfois après l'ouverture : on les suit tant qu'ils ne sont pas modifiés.
  const touched = useRef({});
  useEffect(() => {
    if (!touched.current.income && numbers.income) setIncome(String(Math.round(numbers.income)));
  }, [numbers.income]);
  useEffect(() => {
    if (!touched.current.contribution) setContribution(String(Math.round(Math.min(spare, 40000) / 1000) * 1000));
  }, [spare]);
  const edit = (key, setter) => (v) => {
    touched.current[key] = true;
    setter(v);
  };

  const params = {
    price: parseNum(price) || 0,
    kind,
    works: parseNum(works) || 0,
    contribution: parseNum(contribution) || 0,
    rate: parseNum(rate) ?? DEFAULT_RATES[years],
    years,
    insuranceRate: parseNum(insurance) ?? DEFAULT_INSURANCE,
    income: parseNum(income) || 0,
    otherLoans: parseNum(otherLoans) || 0,
  };
  const sim = simulatePurchase(params);
  const max = maxPurchase(params);
  const money = (v) => formatAmount(v, { decimals: 0 });
  const pct = (v) => formatPercent(v, { showSign: false, decimals: 0 });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const ok = sim.debtRatio != null && sim.debtRatio <= MAX_DEBT_RATIO;
  const hasHomeGoal = goals.some((g) => g.kind === 'home');

  const pickYears = (y) => {
    Haptics.selectionAsync();
    setYears(y);
    if (!touched.current.rate) setRate(dec(DEFAULT_RATES[y]));
  };

  const field = (key, label, value, setter, { suffix, hint } = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <TextInput
          value={value}
          onChangeText={edit(key, setter)}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.colors.text }]}
          accessibilityLabel={label}
        />
        {!!suffix && <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{suffix}</Text>}
      </View>
      {!!hint && <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{hint}</Text>}
    </View>
  );
  const chip = (key, label, active, onPress) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? theme.colors.primary : theme.colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
  const line = (label, value, color) => (
    <View style={styles.line} key={label}>
      <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: color || theme.colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('homeBuy.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Le résultat d'abord */}
          <View style={cardStyle}>
            <Text style={[styles.cardLabel, { color: theme.colors.textSecondary }]}>{t('homeBuy.monthly')}</Text>
            <Text style={[styles.big, { color: theme.colors.text }]}>{formatAmount(sim.monthlyTotal, { decimals: 0 })}</Text>
            <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{t('homeBuy.monthlySub', { insurance: formatAmount(sim.insurance, { decimals: 0 }), years })}</Text>

            {sim.debtRatio != null ? (
              <>
                <View style={[styles.ratioTrack, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  <View style={[styles.ratioFill, { width: `${Math.min(100, (sim.debtRatio / 50) * 100)}%`, backgroundColor: ok ? theme.colors.success : theme.colors.error }]} />
                  <View style={[styles.ratioMark, { left: `${(MAX_DEBT_RATIO / 50) * 100}%`, backgroundColor: theme.colors.text }]} />
                </View>
                <Text style={[styles.ratioText, { color: ok ? theme.colors.success : theme.colors.error }]}>
                  {t(ok ? 'homeBuy.ratioOk' : 'homeBuy.ratioHigh', { pct: pct(sim.debtRatio), max: MAX_DEBT_RATIO })}
                </Text>
              </>
            ) : (
              <Text style={[styles.hint, { color: theme.colors.warning }]}>{t('homeBuy.noIncome')}</Text>
            )}

            {line(t('homeBuy.notary'), money(sim.notary))}
            {line(t('homeBuy.total'), money(sim.total))}
            {line(t('homeBuy.contributionLine', { pct: pct(sim.contributionPct) }), money(params.contribution))}
            {line(t('homeBuy.loan'), money(sim.loan))}
            {line(t('homeBuy.creditCost'), money(sim.totalCost))}
            {sim.leftToLive != null && line(t('homeBuy.leftToLive'), money(sim.leftToLive), sim.leftToLive < 0 ? theme.colors.error : null)}
            {!sim.coversFees && params.price > 0 && (
              <Text style={[styles.warn, { color: theme.colors.warning }]}>{t('homeBuy.feesWarning', { amount: money(sim.notary) })}</Text>
            )}
          </View>

          {max && (
            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('homeBuy.maxTitle')}</Text>
              <Text style={[styles.big, styles.mid, { color: theme.colors.primary }]}>{money(max.price)}</Text>
              <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                {t('homeBuy.maxSub', { loan: money(max.loan), monthly: money(max.monthlyTotal), years })}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setPrice(String(Math.floor(max.price / 1000) * 1000));
                }}
                style={styles.link}
                accessibilityRole="button"
              >
                <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('homeBuy.useMax')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('homeBuy.projectTitle')}</Text>
            {field('price', t('homeBuy.price'), price, setPrice, { suffix: currencySymbol })}
            <View style={styles.field}>
              <View style={styles.chips}>
                {chip('old', t('homeBuy.old'), kind === 'old', () => setKind('old'))}
                {chip('new', t('homeBuy.new'), kind === 'new', () => setKind('new'))}
              </View>
            </View>
            {field('works', t('homeBuy.works'), works, setWorks, { suffix: currencySymbol })}
            {field('contribution', t('homeBuy.contribution'), contribution, setContribution, {
              suffix: currencySymbol,
              hint: t('homeBuy.contributionHint', { amount: money(spare), months: RESERVE_MONTHS }),
            })}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>{t('homeBuy.duration')}</Text>
              <View style={styles.chips}>
                {YEARS.map((y) => chip(`y${y}`, t('loans.years', { count: y }), years === y, () => pickYears(y)))}
              </View>
            </View>
            {field('rate', t('homeBuy.rate'), rate, setRate, { suffix: '%', hint: t('homeBuy.rateHint') })}
            {field('insurance', t('homeBuy.insurance'), insurance, setInsurance, { suffix: '%', hint: t('homeBuy.insuranceHint') })}
            {field('income', t('homeBuy.income'), income, setIncome, { suffix: `${currencySymbol} / ${t('loans.monthUnit')}`, hint: t('homeBuy.incomeHint') })}
            {field('otherLoans', t('homeBuy.otherLoans'), otherLoans, setOtherLoans, { suffix: `${currencySymbol} / ${t('loans.monthUnit')}` })}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={() => {
              if (!hasHomeGoal && !goalAdded) {
                const d = new Date();
                d.setMonth(d.getMonth() + 24);
                addGoal({ name: t('goals.suggest.home.name'), target: Math.round(Math.max(params.contribution, sim.notary)), date: d.toISOString(), kind: 'home' });
                setGoalAdded(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              navigation.navigate('Goals');
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
              {hasHomeGoal || goalAdded ? t('homeBuy.openGoal') : t('homeBuy.createGoal', { amount: money(Math.max(params.contribution, sim.notary)) })}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('homeBuy.note')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 30, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  mid: { fontSize: 24 },
  ratioTrack: { height: 10, borderRadius: 5, marginTop: 14 },
  ratioFill: { height: 10, borderRadius: 5 },
  ratioMark: { position: 'absolute', top: -3, width: 2, height: 16, marginLeft: -1, borderRadius: 1 },
  ratioText: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel: { flex: 1, fontSize: 14 },
  lineValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  warn: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 8 },
  field: { marginTop: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
  link: { minHeight: 40, justifyContent: 'center', marginTop: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17, marginTop: 12, paddingHorizontal: 4 },
});

export default HomeBuyScreen;
