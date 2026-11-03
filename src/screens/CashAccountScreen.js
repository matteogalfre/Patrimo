/**
 * Compte de liquidités : création, mise à jour du solde, historique.
 *
 * On ne suit pas les virements, seulement des soldes datés : mettre à jour un
 * livret une fois par mois suffit pour qu'il apparaisse correctement dans le
 * graphique du patrimoine.
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { ConfirmModal } from '../components';
import DateField from '../components/Transaction/DateField';
import AssetLogo from '../components/AssetLogo';
import { CASH_ICONS, InflationCard } from '../components/Portfolio';
import { CASH_KINDS } from '../core/cash';
import { isRegulated, officialRate } from '../core/regulatedRates';
import { formatDate, formatPercent } from '../utils/formatters';

const parseNum = (s) => {
  const str = String(s ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
};

const CashAccountScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, currency: base, formatAmount } = useSettings();
  const { cash, addCashAccount, updateCashAccount, recordCashBalance, removeCashEntry, deleteCashAccount } = usePortfolio();

  const accountId = route?.params?.accountId || null;
  const account = useMemo(() => cash.accounts.find((a) => a.id === accountId) || null, [cash.accounts, accountId]);
  const isEdit = !!accountId;

  const [kind, setKind] = useState(account?.kind || 'livretA');
  const [name, setName] = useState(account?.name || t('cash.kinds.livretA'));
  const [nameTouched, setNameTouched] = useState(isEdit);
  const [institution, setInstitution] = useState(account?.institution || '');
  const [rate, setRate] = useState(account?.customRate != null ? String(account.customRate).replace('.', locale.startsWith('en') ? '.' : ',') : '');
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(new Date());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const pickKind = (k) => {
    Haptics.selectionAsync();
    setKind(k);
    if (!nameTouched) setName(t(`cash.kinds.${k}`));
  };

  const fail = (e) => {
    setErrors(e);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  // Livret A, LDDS, LEP : taux officiel appliqué d'office, rien à saisir.
  const regulated = isRegulated(kind);

  const create = async () => {
    const amount = parseNum(balance);
    const r = regulated ? null : parseNum(rate);
    const e = {};
    if (!name.trim()) e.name = t('cash.errors.name');
    if (amount === null || Number.isNaN(amount)) e.balance = t('cash.errors.balance');
    if (Number.isNaN(r) || r < 0) e.rate = t('cash.errors.rate');
    if (Object.keys(e).length) return fail(e);
    setSaving(true);
    try {
      await addCashAccount({
        name: name.trim(),
        kind,
        institution: institution.trim() || null,
        currency: base,
        rate: r,
        balance: amount,
        date,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      fail({ balance: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveBalance = async () => {
    const amount = parseNum(balance);
    if (amount === null || Number.isNaN(amount)) return fail({ balance: t('cash.errors.balance') });
    setSaving(true);
    try {
      await recordCashBalance(account.id, amount, date);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBalance('');
      setDate(new Date());
      setErrors({});
    } catch (err) {
      fail({ balance: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveInfo = async () => {
    const r = regulated ? null : parseNum(rate);
    const e = {};
    if (!name.trim()) e.name = t('cash.errors.name');
    if (Number.isNaN(r) || r < 0) e.rate = t('cash.errors.rate');
    if (Object.keys(e).length) return fail(e);
    setSaving(true);
    try {
      await updateCashAccount(account.id, { name: name.trim(), kind, institution: institution.trim() || null, rate: r });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setErrors({});
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    try {
      if (c?.type === 'entry') await removeCashEntry(account.id, c.date);
      if (c?.type === 'account') {
        await deleteCashAccount(account.id);
        navigation.goBack();
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const input = (key, label, value, onChange, opts = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: theme.colors.surface, borderColor: errors[key] ? theme.colors.error : theme.colors.border }]}>
        <TextInput
          value={value}
          onChangeText={(v) => {
            onChange(v);
            if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
          }}
          placeholder={opts.placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType={opts.numeric ? 'decimal-pad' : 'default'}
          style={[styles.input, { color: theme.colors.text }]}
          accessibilityLabel={label}
        />
        {opts.suffix && <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{opts.suffix}</Text>}
      </View>
      {!!errors[key] && <Text style={[styles.error, { color: theme.colors.error }]}>{errors[key]}</Text>}
      {!errors[key] && !!opts.hint && <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{opts.hint}</Text>}
    </View>
  );

  const kindPicker = (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t('cash.kind')}</Text>
      <View style={styles.chips}>
        {CASH_KINDS.map((k) => {
          const active = kind === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => pickKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? theme.colors.primary : theme.colors.textSecondary }]}>
                {t(`cash.kinds.${k}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const primaryButton = (label, onPress) => (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.colors.primary }, saving && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={saving}
      accessibilityRole="button"
    >
      {saving ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
        <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  if (isEdit && !account) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator style={styles.loading} color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  const official = officialRate(kind);
  const rateField = regulated && official ? (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t('cash.rate')}</Text>
      <View style={[styles.officialBox, { backgroundColor: theme.colors.primaryMuted }]}>
        <Text style={[styles.officialRate, { color: theme.colors.text }]}>
          {t('cash.official', { rate: formatPercent(official.rate, { showSign: false, decimals: 2 }), date: formatDate(official.since, { locale }) })}
        </Text>
        <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>{t('cash.officialHint')}</Text>
      </View>
    </View>
  ) : input('rate', t('cash.rate'), rate, setRate, { numeric: true, suffix: '%', placeholder: t('cash.optional'), hint: t('cash.rateHint') });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {isEdit ? account.name : t('cash.newTitle')}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!isEdit ? (
            <>
              <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>{t('cash.intro')}</Text>
              {kindPicker}
              {input('name', t('cash.name'), name, (v) => {
                setNameTouched(true);
                setName(v);
              })}
              {input('institution', t('cash.institution'), institution, setInstitution, { placeholder: t('cash.optional') })}
              {input('balance', t('cash.balance'), balance, setBalance, { numeric: true, suffix: base, placeholder: '0' })}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.colors.text }]}>{t('cash.balanceDate')}</Text>
                <DateField value={date} onChange={setDate} label={t('cash.balanceDate')} />
              </View>
              {rateField}
              {primaryButton(t('cash.create'), create)}
            </>
          ) : (
            <>
              <View style={cardStyle}>
                <View style={styles.balanceHead}>
                  <AssetLogo icon={CASH_ICONS[account.kind] || CASH_ICONS.other} size={40} />
                  <View style={styles.balanceText}>
                    <Text style={[styles.balanceValue, { color: theme.colors.text }]}>{formatAmount(account.value)}</Text>
                    <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
                      {t('cash.lastUpdate', { date: formatDate(account.lastUpdate, { locale }) })}
                      {account.rate > 0 ? ` · ${t('cash.rateShort', { rate: formatPercent(account.rate, { showSign: false, decimals: 2 }) })}` : ''}
                    </Text>
                  </View>
                </View>
                {account.yearlyInterest > 0 && (
                  <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                    {t('cash.accountInterest', { amount: formatAmount(account.yearlyInterest, { decimals: 0 }) })}
                  </Text>
                )}
              </View>

              <InflationCard rate={account.rate || 0} value={account.value} />

              <Text style={[styles.section, { color: theme.colors.text }]}>{t('cash.updateTitle')}</Text>
              {input('balance', t('cash.newBalance'), balance, setBalance, { numeric: true, suffix: account.currency, placeholder: '0' })}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.colors.text }]}>{t('cash.balanceDate')}</Text>
                <DateField value={date} onChange={setDate} label={t('cash.balanceDate')} />
              </View>
              {primaryButton(t('cash.saveBalance'), saveBalance)}

              <Text style={[styles.section, { color: theme.colors.text }]}>{t('cash.history')}</Text>
              <View style={cardStyle}>
                {[...account.history].reverse().map((h, i, arr) => (
                  <View
                    key={h.date}
                    style={[styles.historyRow, i < arr.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  >
                    <Text style={[styles.historyDate, { color: theme.colors.textSecondary }]}>{formatDate(h.date, { locale })}</Text>
                    <Text style={[styles.historyValue, { color: theme.colors.text }]}>{formatAmount(h.balance)}</Text>
                    {account.history.length > 1 && (
                      <TouchableOpacity
                        onPress={() => setConfirm({ type: 'entry', date: h.date })}
                        style={styles.trash}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.delete')}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              <Text style={[styles.section, { color: theme.colors.text }]}>{t('cash.info')}</Text>
              {kindPicker}
              {input('name', t('cash.name'), name, setName)}
              {input('institution', t('cash.institution'), institution, setInstitution, { placeholder: t('cash.optional') })}
              {rateField}
              {primaryButton(t('common.save'), saveInfo)}

              <TouchableOpacity
                onPress={() => setConfirm({ type: 'account' })}
                style={[styles.delete, { borderColor: theme.colors.error }]}
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                <Text style={[styles.deleteText, { color: theme.colors.error }]}>{t('cash.delete')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.type === 'account' ? t('cash.deleteTitle', { name: account?.name || '' }) : t('cash.deleteEntryTitle')}
        message={confirm?.type === 'account' ? t('cash.deleteMessage') : t('cash.deleteEntryMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        icon="warning-outline"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  officialBox: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  officialRate: { fontSize: 15, fontWeight: '600' },
  error: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  balanceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceText: { flex: 1 },
  balanceValue: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  historyDate: { flex: 1, fontSize: 14 },
  historyValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  trash: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 12, borderWidth: 1, marginTop: 24 },
  deleteText: { fontSize: 14, fontWeight: '700' },
});

export default CashAccountScreen;
