/**
 * Un bien immobilier : sa saisie, puis sa valeur estimée (à mettre à jour de
 * temps en temps, comme le solde d'un livret), la plus-value face au prix
 * payé (frais et travaux compris) et le crédit qu'il reste à rembourser.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { ConfirmModal } from '../components';
import DateField from '../components/Transaction/DateField';
import { NOTARY_RATES, PROPERTY_KINDS } from '../core/realEstate';
import { formatDate, formatPercent } from '../utils/formatters';
import { normalizeNumber } from '../utils/parseNumber';

const parseNum = (s) => {
  const n = Number(normalizeNumber(s ?? ''));
  return Number.isFinite(n) ? n : null;
};

const PropertyScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, formatAmount, currencySymbol } = useSettings();
  const { properties, realEstate, addProperty, updateProperty, recordPropertyValue, deleteProperty } = usePortfolio();
  const propertyId = route?.params?.propertyId || null;
  const property = properties.find((p) => p.id === propertyId) || null;
  const item = realEstate.items.find((p) => p.id === propertyId) || null;
  const isEdit = !!property;
  const str = (v) => (v == null || v === 0 ? '' : String(v).replace('.', locale.startsWith('en') ? '.' : ','));

  const [kind, setKind] = useState(property?.kind || 'main');
  const [name, setName] = useState(property?.name || t('property.kinds.main'));
  const [nameTouched, setNameTouched] = useState(isEdit);
  const [city, setCity] = useState(property?.city || '');
  const [price, setPrice] = useState(str(property?.purchasePrice));
  const [purchaseDate, setPurchaseDate] = useState(property?.purchaseDate ? new Date(property.purchaseDate) : new Date());
  const [fees, setFees] = useState(str(property?.fees));
  const [works, setWorks] = useState(str(property?.works));
  const [share, setShare] = useState(String(property?.share ?? 100));
  const [rent, setRent] = useState(str(property?.rent));
  const [charges, setCharges] = useState(str(property?.charges));
  const [estimate, setEstimate] = useState('');
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const money = (v) => formatAmount(v, { decimals: 0 });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const notaryGuess = parseNum(price) > 0 ? Math.round((parseNum(price) * NOTARY_RATES.old) / 100) : null;

  const pickKind = (k) => {
    Haptics.selectionAsync();
    setKind(k);
    if (!nameTouched) setName(t(`property.kinds.${k}`));
  };

  const save = async () => {
    const purchasePrice = parseNum(price);
    if (!name.trim() || !(purchasePrice > 0)) {
      setError(t('property.errors.form'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const fields = {
      name: name.trim(), kind, city: city.trim() || null, purchasePrice, purchaseDate: purchaseDate.toISOString(),
      fees: parseNum(fees) || 0, works: parseNum(works) || 0, share: parseNum(share) || 100,
      rent: kind === 'rental' ? parseNum(rent) || 0 : 0, charges: parseNum(charges) || 0,
    };
    try {
      if (isEdit) await updateProperty(property.id, fields);
      else await addProperty({ ...fields, history: [] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      setError(t('property.errors.save'));
    }
  };

  const saveEstimate = async () => {
    const value = parseNum(estimate);
    if (!(value > 0)) return;
    await recordPropertyValue(property.id, value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEstimate('');
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
  const line = (label, value, color) => (
    <View style={styles.line} key={label}>
      <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: color || theme.colors.text }]}>{value}</Text>
    </View>
  );
  const lastEstimate = property?.history?.length ? property.history[property.history.length - 1] : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{isEdit ? property.name : t('property.newTitle')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {item && (
            <View style={cardStyle}>
              <Text style={[styles.cardLabel, { color: theme.colors.textSecondary }]}>
                {property.share < 100 ? t('property.valueShare', { pct: property.share }) : t('property.value')}
              </Text>
              <Text style={[styles.big, { color: theme.colors.text }]}>{money(item.value)}</Text>
              <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
                {lastEstimate ? t('property.estimatedOn', { date: formatDate(lastEstimate.date, { locale }) }) : t('property.noEstimate')}
              </Text>
              {line(t('property.cost'), money(item.cost))}
              {line(t('property.gain'), `${item.gain >= 0 ? '+' : ''}${money(item.gain)}`, item.gain >= 0 ? theme.colors.success : theme.colors.error)}
              {item.debt > 0 && line(t('property.debt'), `−${money(item.debt)}`, theme.colors.error)}
              {item.debt > 0 && line(t('property.equity'), money(item.equity))}
              {property.kind === 'rental' && property.rent > 0 && line(
                t('property.yield'),
                formatPercent((((property.rent - property.charges) * 12) / (property.purchasePrice + property.fees + property.works)) * 100, { showSign: false, decimals: 1 }),
              )}

              {field(t('property.newEstimate'), estimate, setEstimate, { suffix: currencySymbol, placeholder: String(Math.round(item.fullValue)), hint: t('property.estimateHint') })}
              <TouchableOpacity style={[styles.smallButton, { borderColor: theme.colors.primary, opacity: parseNum(estimate) > 0 ? 1 : 0.5 }]} onPress={saveEstimate} disabled={!(parseNum(estimate) > 0)} accessibilityRole="button">
                <Text style={[styles.smallText, { color: theme.colors.primary }]}>{t('property.saveEstimate')}</Text>
              </TouchableOpacity>

              {item.loans.length === 0 ? (
                <TouchableOpacity onPress={() => navigation.navigate('Loan', { propertyId: property.id })} accessibilityRole="button" style={styles.link}>
                  <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('property.addLoan')}</Text>
                </TouchableOpacity>
              ) : item.loans.map((l) => (
                <TouchableOpacity key={l.id} onPress={() => navigation.navigate('Loan', { loanId: l.id })} accessibilityRole="button" style={styles.link}>
                  <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('property.openLoan', { name: l.name })}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{isEdit ? t('property.editTitle') : t('property.formTitle')}</Text>
            <View style={styles.chips}>
              {PROPERTY_KINDS.map((k) => {
                const active = kind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => pickKind(k)}
                    style={[styles.chip, { backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, { color: active ? theme.colors.primary : theme.colors.textSecondary }]}>{t(`property.kinds.${k}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {field(t('property.name'), name, (v) => { setNameTouched(true); setName(v); }, { numeric: false })}
            {field(t('property.city'), city, setCity, { numeric: false, placeholder: t('property.cityPlaceholder') })}
            {field(t('property.price'), price, setPrice, { suffix: currencySymbol, placeholder: '200000' })}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>{t('property.purchaseDate')}</Text>
              <DateField value={purchaseDate} onChange={setPurchaseDate} label={t('property.purchaseDate')} />
            </View>
            {field(t('property.fees'), fees, setFees, {
              suffix: currencySymbol,
              placeholder: notaryGuess ? String(notaryGuess) : '',
              hint: notaryGuess ? t('property.feesHint', { amount: money(notaryGuess) }) : null,
            })}
            {field(t('property.works'), works, setWorks, { suffix: currencySymbol, placeholder: '0' })}
            {field(t('property.share'), share, setShare, { suffix: '%', hint: t('property.shareHint') })}
            {kind === 'rental' && field(t('property.rent'), rent, setRent, { suffix: `${currencySymbol} / ${t('loans.monthUnit')}` })}
            {field(t('property.charges'), charges, setCharges, { suffix: `${currencySymbol} / ${t('loans.monthUnit')}`, hint: t('property.chargesHint') })}
            {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={save} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{isEdit ? t('common.save') : t('property.add')}</Text>
            </TouchableOpacity>
            {isEdit && (
              <TouchableOpacity style={styles.delete} onPress={() => setConfirm(true)} accessibilityRole="button">
                <Text style={[styles.deleteText, { color: theme.colors.error }]}>{t('property.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirm}
        title={t('property.deleteTitle')}
        message={t('property.deleteMsg')}
        confirmText={t('common.delete')}
        destructive
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await deleteProperty(property.id);
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
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel: { fontSize: 14 },
  lineValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  field: { marginTop: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  smallButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', marginTop: 10 },
  smallText: { fontSize: 13, fontWeight: '700' },
  link: { minHeight: 40, justifyContent: 'center', marginTop: 6 },
  linkText: { fontSize: 14, fontWeight: '600' },
  error: { fontSize: 13, fontWeight: '600', marginTop: 12 },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  deleteText: { fontSize: 14, fontWeight: '600' },
});

export default PropertyScreen;
