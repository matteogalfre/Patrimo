/**
 * Un crédit : sa saisie, puis où il en est (capital restant dû, intérêts
 * payés et à venir, date de fin) et ce que changerait un remboursement
 * anticipé.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { ConfirmModal } from '../components';
import DateField from '../components/Transaction/DateField';
import { earlyRepayment, LOAN_KINDS, loanStatus, monthlyPayment, normalizeLoan } from '../core/loans';
import { formatDate } from '../utils/formatters';
import { normalizeNumber } from '../utils/parseNumber';

const parseNum = (s) => {
  const n = Number(normalizeNumber(s ?? ''));
  return Number.isFinite(n) ? n : null;
};
const DURATIONS = [5, 10, 15, 20, 25];

const LoanScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, formatAmount, currencySymbol } = useSettings();
  const { loans, properties, addLoan, updateLoan, deleteLoan } = usePortfolio();
  const loanId = route?.params?.loanId || null;
  const loan = loans.find((l) => l.id === loanId) || null;
  const isEdit = !!loan;
  const str = (v) => (v == null ? '' : String(v).replace('.', locale.startsWith('en') ? '.' : ','));

  const [kind, setKind] = useState(loan?.kind || 'mortgage');
  const [name, setName] = useState(loan?.name || t('loans.kinds.mortgage'));
  const [nameTouched, setNameTouched] = useState(isEdit);
  const [institution, setInstitution] = useState(loan?.institution || '');
  const [amount, setAmount] = useState(str(loan?.amount));
  const [rate, setRate] = useState(str(loan?.rate));
  const [months, setMonths] = useState(loan ? String(loan.months) : '');
  const [startDate, setStartDate] = useState(loan ? new Date(loan.startDate) : new Date());
  const [insurance, setInsurance] = useState(str(loan?.insurance || ''));
  const [monthly, setMonthly] = useState(str(loan?.monthly));
  const [share, setShare] = useState(String(loan?.share ?? 100));
  const [propertyId, setPropertyId] = useState(loan?.propertyId || route?.params?.propertyId || null);
  const [extra, setExtra] = useState('');
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const draft = useMemo(() => normalizeLoan({
    name: name || 'x', kind, amount: parseNum(amount), rate: parseNum(rate), months: parseNum(months),
    startDate, insurance: parseNum(insurance), monthly: parseNum(monthly), share: parseNum(share),
  }), [name, kind, amount, rate, months, startDate, insurance, monthly, share]);
  const status = loan ? loanStatus(loan) : null;
  const early = loan && parseNum(extra) > 0 ? earlyRepayment(loan, parseNum(extra)) : null;
  const money = (v) => formatAmount(v, { decimals: 0 });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  const pickKind = (k) => {
    Haptics.selectionAsync();
    setKind(k);
    if (!nameTouched) setName(t(`loans.kinds.${k}`));
    if (k === 'zeroRate') setRate('0');
  };

  const save = async () => {
    if (!draft) {
      setError(t('loans.errors.form'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const fields = {
      name: name.trim(), kind, institution: institution.trim() || null, amount: draft.amount, rate: draft.rate,
      months: draft.months, startDate: draft.startDate, insurance: draft.insurance, monthly: draft.monthly, share: draft.share, propertyId,
    };
    try {
      if (isEdit) await updateLoan(loan.id, fields);
      else await addLoan(fields);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      setError(t('loans.errors.save'));
    }
  };

  const field = (label, value, onChange, { suffix, placeholder, numeric = true, hint } = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
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
  const computed = draft ? monthlyPayment(draft) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{isEdit ? loan.name : t('loans.newTitle')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {status && (
            <View style={cardStyle}>
              <Text style={[styles.cardLabel, { color: theme.colors.textSecondary }]}>{t('loans.remaining')}</Text>
              <Text style={[styles.big, { color: theme.colors.text }]}>{money(status.remaining)}</Text>
              <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                <View style={[styles.fill, { width: `${Math.round(status.progress * 100)}%`, backgroundColor: theme.colors.success }]} />
              </View>
              <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
                {t('loans.progress', { count: status.paid, pct: Math.round(status.progress * 100), paid: status.paid, total: loan.months })}
              </Text>
              {line(t('loans.monthlyTotal'), formatAmount(status.monthlyTotal))}
              {line(t('loans.end'), formatDate(status.endDate, { locale }))}
              {line(t('loans.interestPaid'), money(status.interestPaid))}
              {line(t('loans.interestLeft'), money(status.interestLeft))}
              {line(t('loans.totalCost'), money(status.totalCost))}
              {loan.share < 100 && <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{t('loans.shareNote', { pct: loan.share })}</Text>}
            </View>
          )}

          {status && !status.done && (
            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('loans.earlyTitle')}</Text>
              {field(t('loans.earlyAmount'), extra, setExtra, { suffix: currencySymbol, placeholder: '10000' })}
              {early && (
                <>
                  <Text style={[styles.result, { color: theme.colors.text }]}>
                    {t('loans.earlyShorter', { months: early.shorter.months, saved: money(early.shorter.interestSaved) })}
                  </Text>
                  <Text style={[styles.result, { color: theme.colors.text }]}>
                    {t('loans.earlyLower', { payment: formatAmount(early.lower.payment), saved: money(early.lower.interestSaved) })}
                  </Text>
                </>
              )}
              <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{t('loans.earlyNote')}</Text>
            </View>
          )}

          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{isEdit ? t('loans.editTitle') : t('loans.formTitle')}</Text>
            <View style={styles.chips}>
              {LOAN_KINDS.map((k) => chip(k, t(`loans.kinds.${k}`), kind === k, () => pickKind(k)))}
            </View>
            {field(t('loans.name'), name, (v) => { setNameTouched(true); setName(v); }, { numeric: false })}
            {field(t('loans.institution'), institution, setInstitution, { numeric: false, placeholder: t('loans.institutionPlaceholder') })}
            {field(t('loans.amount'), amount, setAmount, { suffix: currencySymbol, placeholder: '200000' })}
            {field(t('loans.rate'), rate, setRate, { suffix: '%', placeholder: '3,7', hint: t('loans.rateHint') })}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>{t('loans.duration')}</Text>
              <View style={styles.chips}>
                {DURATIONS.map((y) => chip(`d${y}`, t('loans.years', { count: y }), parseNum(months) === y * 12, () => { Haptics.selectionAsync(); setMonths(String(y * 12)); }))}
              </View>
              <View style={[styles.inputRow, styles.spaced, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <TextInput value={months} onChangeText={setMonths} keyboardType="number-pad" placeholder="300" placeholderTextColor={theme.colors.textTertiary} style={[styles.input, { color: theme.colors.text }]} accessibilityLabel={t('loans.duration')} />
                <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{t('loans.monthsUnit')}</Text>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>{t('loans.start')}</Text>
              <DateField value={startDate} onChange={setStartDate} label={t('loans.start')} anyDate />
            </View>
            {field(t('loans.insurance'), insurance, setInsurance, { suffix: `${currencySymbol} / ${t('loans.monthUnit')}`, placeholder: '0' })}
            {field(t('loans.monthly'), monthly, setMonthly, {
              suffix: currencySymbol,
              placeholder: computed ? String(Math.round(computed)) : '',
              hint: computed ? t('loans.monthlyHint', { amount: formatAmount(computed) }) : null,
            })}
            {field(t('loans.share'), share, setShare, { suffix: '%', hint: t('loans.shareHint') })}
            {properties.length > 0 && (
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.colors.text }]}>{t('loans.property')}</Text>
                <View style={styles.chips}>
                  {chip('none', t('loans.noProperty'), !propertyId, () => setPropertyId(null))}
                  {properties.map((p) => chip(p.id, p.name, propertyId === p.id, () => setPropertyId(p.id)))}
                </View>
              </View>
            )}
            {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={save} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{isEdit ? t('common.save') : t('loans.add')}</Text>
            </TouchableOpacity>
            {isEdit && (
              <TouchableOpacity style={styles.delete} onPress={() => setConfirm(true)} accessibilityRole="button">
                <Text style={[styles.deleteText, { color: theme.colors.error }]}>{t('loans.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirm}
        title={t('loans.deleteTitle')}
        message={t('loans.deleteMsg')}
        confirmText={t('common.delete')}
        destructive
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await deleteLoan(loan.id);
          navigation.goBack();
        }}
      />
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
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 28, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  fill: { height: 8, borderRadius: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel: { fontSize: 14 },
  lineValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  result: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  field: { marginTop: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  spaced: { marginTop: 10 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13, fontWeight: '600', marginTop: 12 },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  deleteText: { fontSize: 14, fontWeight: '600' },
});

export default LoanScreen;
