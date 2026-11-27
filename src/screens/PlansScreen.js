/**
 * Investissements programmés : un montant fixe sur un actif, chaque mois à
 * un jour donné. L'app ne passe aucun ordre : elle rappelle le jour venu et
 * pré-remplit l'opération à valider après l'achat chez le courtier.
 */

import React, { useEffect, useState } from 'react';
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
import AssetLogo from '../components/AssetLogo';
import Toggle from '../components/Toggle';
import AssetSearchModal from '../components/Transaction/AssetSearchModal';
import { accountsForType } from '../core/assets';
import { budgetPlanSuggestions } from '../core/plans';
import AccountInstitution from '../components/Portfolio/AccountInstitution';
import { normalizeNumber } from '../utils/parseNumber';

const parseNum = (s) => {
  const n = Number(normalizeNumber(s ?? ''));
  return Number.isFinite(n) ? n : null;
};

const EMPTY_FORM = { id: null, asset: null, account: null, amount: '', day: 5 };

const PlansScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, formatAmount, currencySymbol } = useSettings();
  const { assets, transactions } = usePortfolio();
  const { plans, addPlan, updatePlan, removePlan, reminders, setReminders, accountInstitutions, budget } = usePlanning();

  const [form, setForm] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState(null);

  const monthlyTotal = plans.filter((p) => p.active).reduce((s, p) => s + p.amount, 0);
  // Les investissements du budget pas encore programmés, en un toucher.
  const fromBudget = budgetPlanSuggestions({ budget, plans, assets, transactions });
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const accountOptions = form?.asset ? accountsForType(form.asset.assetType) : [];

  const openNew = () => {
    setError(null);
    setForm(EMPTY_FORM);
  };

  const openEdit = (plan) => {
    setError(null);
    setForm({
      id: plan.id,
      asset: { assetId: plan.assetId, assetType: plan.assetType, symbol: plan.symbol, name: plan.name },
      account: plan.account,
      amount: String(plan.amount),
      day: plan.day,
    });
  };

  const pickAsset = (a) => {
    setSearchOpen(false);
    const options = accountsForType(a.assetType);
    const held = assets.find((x) => x.assetId === a.assetId && x.isHeld)?.accounts?.find((acc) => options.includes(acc));
    // Sinon une de tes enveloppes : établissement indiqué ou déjà des opérations.
    const used = new Set(transactions.map((x) => x.account));
    const owned = options.find((acc) => accountInstitutions?.[acc] || used.has(acc));
    setForm((f) => ({ ...f, asset: a, account: held || owned || options[0] }));
  };

  // Ouvert depuis un autre écran (Marchés…) : le formulaire arrive pré-rempli.
  const prefill = route?.params?.prefill;
  useEffect(() => {
    if (!prefill) return;
    setError(null);
    setForm({ ...EMPTY_FORM, amount: prefill.amount ? String(prefill.amount) : '' });
    if (prefill.asset) pickAsset(prefill.asset);
    else setSearchOpen(true);
    navigation.setParams?.({ prefill: undefined });
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const amount = parseNum(form.amount);
    if (!form.asset || !form.account || !(amount > 0)) {
      setError(t('plans.errors.form'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const plan = {
      assetId: form.asset.assetId,
      assetType: form.asset.assetType,
      symbol: form.asset.symbol,
      name: form.asset.name,
      account: form.account,
      amount,
      day: form.day,
    };
    if (form.id) updatePlan(form.id, plan);
    else addPlan(plan);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setForm(null);
  };

  const remove = () => {
    if (form?.id) removePlan(form.id);
    setForm(null);
  };

  const stepDay = (delta) => {
    Haptics.selectionAsync();
    setForm((f) => ({ ...f, day: Math.max(1, Math.min(28, f.day + delta)) }));
  };

  const reminderRow = (key, title, subtitle) => (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={() => {
        Haptics.selectionAsync();
        setReminders({ [key]: !reminders[key] });
      }}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: !!reminders[key] }}
    >
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.small, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Toggle value={!!reminders[key]} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('plans.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>{t('plans.intro')}</Text>

          {fromBudget.length > 0 && !form && (
            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('plans.fromBudgetTitle')}</Text>
              <Text style={[styles.small, { color: theme.colors.textSecondary }]}>{t('plans.fromBudgetSub')}</Text>
              {fromBudget.map((line) => (
                <View key={line.id} style={styles.budgetRow}>
                  {line.asset
                    ? <AssetLogo assetId={line.asset.assetId} symbol={line.asset.symbol} size={30} />
                    : <View style={[styles.budgetDot, { backgroundColor: theme.colors.backgroundSecondary }]}><Ionicons name="search" size={14} color={theme.colors.textTertiary} /></View>}
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {line.label} · {t('plans.perMonth', { amount: formatAmount(line.amount, { decimals: 0, reveal: true }) })}
                    </Text>
                    <Text style={[styles.small, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                      {line.asset ? line.asset.name || line.asset.symbol : t('plans.fromBudgetPick')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setError(null);
                      setForm({ ...EMPTY_FORM, amount: String(line.amount) });
                      if (line.asset) pickAsset({ assetId: line.asset.assetId, assetType: line.asset.assetType, symbol: line.asset.symbol, name: line.asset.name });
                      else setSearchOpen(true);
                    }}
                    style={[styles.budgetBtn, { borderColor: theme.colors.primary }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.budgetBtnText, { color: theme.colors.primary }]}>{t('plans.fromBudgetAdd')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {plans.length > 0 && (
            <View style={cardStyle}>
              {plans.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => openEdit(p)}
                  style={[styles.plan, i < plans.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  accessibilityRole="button"
                  accessibilityLabel={p.name || p.symbol}
                >
                  <AssetLogo assetId={p.assetId} symbol={p.symbol} size={36} />
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, { color: p.active ? theme.colors.text : theme.colors.textTertiary }]} numberOfLines={1}>
                      {p.name || p.symbol}
                    </Text>
                    <Text style={[styles.small, { color: theme.colors.textSecondary }]}>
                      {t('plans.line', { amount: formatAmount(p.amount, { decimals: 0, reveal: true }), day: p.day, account: t(`accounts.short.${p.account}`) })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      updatePlan(p.id, { active: !p.active });
                    }}
                    hitSlop={8}
                    accessibilityRole="switch"
                    accessibilityLabel={t('plans.active')}
                    accessibilityState={{ checked: !!p.active }}
                  >
                    <Toggle value={!!p.active} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              <Text style={[styles.total, { color: theme.colors.text }]}>
                {t('plans.total', { amount: formatAmount(monthlyTotal, { decimals: 0, reveal: true }) })}
              </Text>
            </View>
          )}

          {form ? (
            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{form.id ? t('plans.editTitle') : t('plans.newTitle')}</Text>

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('plans.asset')}</Text>
              <TouchableOpacity
                onPress={() => setSearchOpen(true)}
                style={[styles.inputRow, styles.assetPick, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                accessibilityRole="button"
                accessibilityLabel={t('plans.asset')}
              >
                {form.asset ? (
                  <>
                    <AssetLogo assetId={form.asset.assetId} symbol={form.asset.symbol} size={28} />
                    <Text style={[styles.assetName, { color: theme.colors.text }]} numberOfLines={1}>{form.asset.name}</Text>
                  </>
                ) : (
                  <Text style={[styles.assetName, { color: theme.colors.textTertiary }]}>{t('plans.pickAsset')}</Text>
                )}
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>

              {accountOptions.length > 1 && (
                <>
                  <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('plans.account')}</Text>
                  <View style={styles.chips}>
                    {accountOptions.map((acc) => {
                      const on = form.account === acc;
                      return (
                        <TouchableOpacity
                          key={acc}
                          onPress={() => setForm((f) => ({ ...f, account: acc }))}
                          style={[styles.chip, { borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primaryMuted : 'transparent' }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <View style={styles.accountChip}>
                            <Text style={[styles.chipText, { color: on ? theme.colors.primary : theme.colors.text }]}>{t(`accounts.${acc}`)}</Text>
                            <AccountInstitution account={acc} size={16} showName={false} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('plans.amount')}</Text>
              <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                <TextInput
                  value={form.amount}
                  onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.colors.textTertiary}
                  style={[styles.input, { color: theme.colors.text }]}
                  accessibilityLabel={t('plans.amount')}
                />
                <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol} / {t('projection.perMonth')}</Text>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{t('plans.day')}</Text>
              <View style={styles.dayRow}>
                <TouchableOpacity onPress={() => stepDay(-1)} style={[styles.step, { borderColor: theme.colors.border }]} accessibilityRole="button" accessibilityLabel="−">
                  <Ionicons name="remove" size={18} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={[styles.dayValue, { color: theme.colors.text }]}>{t('plans.dayValue', { day: form.day })}</Text>
                <TouchableOpacity onPress={() => stepDay(1)} style={[styles.step, { borderColor: theme.colors.border }]} accessibilityRole="button" accessibilityLabel="+">
                  <Ionicons name="add" size={18} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}

              <View style={styles.actions}>
                {form.id ? (
                  <TouchableOpacity onPress={remove} style={styles.secondary} accessibilityRole="button">
                    <Text style={[styles.secondaryText, { color: theme.colors.error }]}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setForm(null)} style={styles.secondary} accessibilityRole="button">
                    <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={save} style={[styles.primary, { backgroundColor: theme.colors.primary }]} accessibilityRole="button">
                  <Text style={[styles.primaryText, { color: theme.colors.onPrimary }]}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={openNew}
              style={[styles.addBtn, { borderColor: theme.colors.primary }]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={theme.colors.primary} />
              <Text style={[styles.addText, { color: theme.colors.primary }]}>{t('plans.add')}</Text>
            </TouchableOpacity>
          )}

          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('plans.remindersTitle')}</Text>
            {reminderRow('plans', t('plans.reminderPlans'), t('plans.reminderPlansSub'))}
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            {reminderRow('cash', t('plans.reminderCash'), t('plans.reminderCashSub'))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AssetSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={pickAsset}
        ownedAssets={assets}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  budgetDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  budgetBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  budgetBtnText: { fontSize: 13, fontWeight: '700' },
  accountChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  total: { fontSize: 14, fontWeight: '700', marginTop: 12, fontVariant: ['tabular-nums'] },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  assetPick: { paddingLeft: 12, paddingVertical: 10, gap: 10 },
  assetName: { flex: 1, fontSize: 15, fontWeight: '600' },
  input: { flex: 1, fontSize: 17, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 14, fontWeight: '600' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayValue: { minWidth: 120, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  error: { fontSize: 13, marginTop: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 18 },
  secondary: { paddingHorizontal: 14, paddingVertical: 12 },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  primary: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  primaryText: { fontSize: 15, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 14, marginBottom: 12 },
  addText: { fontSize: 15, fontWeight: '600' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { height: StyleSheet.hairlineWidth },
});

export default PlansScreen;
