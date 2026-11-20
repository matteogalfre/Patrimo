/**
 * Budget du mois : revenus, investissements et dépenses, en diagramme de
 * Sankey. On voit où part chaque euro, son taux d'épargne et ce qui reste.
 * Pré-rempli avec le revenu et les dépenses du profil, et les achats
 * programmés comme investissements ; tout se modifie.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, useWindowDimensions, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useTheme } from '../theme/theme';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { usePortfolio } from '../context/PortfolioContext';
import { SankeyChart } from '../components/charts';
import { shareSankeyImage } from '../components/charts/sankeyImage';
import SegmentedControl from '../components/SegmentedControl';
import { budgetTotals, defaultBudget, groupTotal, newBudgetId, realInvesting } from '../core/budget';
import { formatPercent } from '../utils/formatters';

const TABS = ['income', 'invest', 'expense'];
const SAVE_DELAY = 400;

// Un budget se compte en euros ronds.
const parseAmount = (v) => {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const BudgetScreen = ({ navigation }) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { t, formatAmount } = useSettings();
  const { budget: saved, setBudget, profile, plans } = usePlanning();

  // Premier passage : un budget d'exemple tiré du profil et des achats programmés.
  const [budget, setLocal] = useState(() => saved || defaultBudget({
    labels: t('budget.defaults'),
    income: profile?.answers?.income,
    expenses: profile?.answers?.expenses,
    plans: plans.filter((p) => p.active && p.amount > 0).map((p) => ({ name: p.name || p.symbol, amount: p.amount })),
  }));
  const [tab, setTab] = useState('expense');
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Enregistré un instant après la dernière frappe, pas à chaque chiffre. Le
  // budget d'exemple ne l'est qu'une fois modifié : il ne doit pas passer
  // pour tes vraies dépenses dans les autres écrans.
  const timer = useRef(null);
  const touched = useRef(!!saved);
  useEffect(() => {
    if (!touched.current) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBudget(budget), SAVE_DELAY);
    return () => clearTimeout(timer.current);
  }, [budget, setBudget]);

  const totals = useMemo(() => budgetTotals(budget), [budget]);
  // Prévu face au réel : ce que tes opérations disent des 3 derniers mois.
  const { transactions, fx, debts } = usePortfolio();
  const real = useMemo(() => realInvesting({ transactions, fx }), [transactions, fx]);
  // Tes crédits en cours : leurs mensualités (ta part), à mettre dans le budget en un toucher.
  const loanLines = debts.items
    .filter((l) => !l.status.done)
    .map((l) => ({ id: newBudgetId('it'), label: l.name, amount: Math.round((l.status.monthlyTotal * l.share) / 100) }))
    .filter((x) => x.amount > 0);
  const hasLoanGroup = budget.groups.some((g) => g.source === 'loans');
  const money = (v) => formatAmount(v, { decimals: 0 });
  const pct = (v) => formatPercent(v, { showSign: false, decimals: 0 });
  const toInput = (v) => (v ? String(Math.round(v)) : '');

  // --- Modifications ----------------------------------------------------------
  const edit = (fn) => {
    touched.current = true;
    setLocal((b) => fn(JSON.parse(JSON.stringify(b))));
  };
  const addLoans = () => edit((b) => {
    b.groups = [...b.groups, { id: newBudgetId('grp'), kind: 'expense', source: 'loans', label: t('budget.loansGroup'), items: loanLines }];
    return b;
  });
  const setIncome = (id, patch) => edit((b) => {
    b.incomes = b.incomes.map((x) => (x.id === id ? { ...x, ...patch } : x));
    return b;
  });
  const addIncome = () => {
    Haptics.selectionAsync();
    edit((b) => {
      b.incomes.push({ id: newBudgetId('in'), label: t('budget.newIncome'), amount: 0 });
      return b;
    });
  };
  const removeIncome = (id) => edit((b) => {
    b.incomes = b.incomes.filter((x) => x.id !== id);
    return b;
  });
  const setItem = (groupId, id, patch) => edit((b) => {
    const g = b.groups.find((x) => x.id === groupId);
    g.items = g.items.map((x) => (x.id === id ? { ...x, ...patch } : x));
    return b;
  });
  const addItem = (groupId) => {
    Haptics.selectionAsync();
    edit((b) => {
      const g = b.groups.find((x) => x.id === groupId);
      g.items.push({ id: newBudgetId('it'), label: t(g.kind === 'invest' ? 'budget.newInvestment' : 'budget.newExpense'), amount: 0 });
      return b;
    });
  };
  const removeItem = (groupId, id) => edit((b) => {
    const g = b.groups.find((x) => x.id === groupId);
    g.items = g.items.filter((x) => x.id !== id);
    return b;
  });
  const setGroupLabel = (groupId, label) => edit((b) => {
    b.groups.find((x) => x.id === groupId).label = label;
    return b;
  });
  const addGroup = (kind) => {
    Haptics.selectionAsync();
    edit((b) => {
      b.groups.push({ id: newBudgetId('grp'), kind, label: t('budget.newCategory'), items: [{ id: newBudgetId('it'), label: t(kind === 'invest' ? 'budget.newInvestment' : 'budget.newExpense'), amount: 0 }] });
      return b;
    });
  };
  const removeGroup = (groupId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    edit((b) => {
      b.groups = b.groups.filter((x) => x.id !== groupId);
      return b;
    });
  };

  // Le diagramme entier en image, à partager (messagerie, galerie…).
  const exportImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExporting(true);
    try {
      await shareSankeyImage({
        budget,
        title: t('budget.exportTitle'),
        subtitle: t('budget.exportSubtitle', { rate: pct(totals.savingsRate), income: money(totals.income), available: money(totals.available) }),
        footer: t('budget.exportFooter'),
        labels: { budget: t('budget.title'), available: t('budget.stats.available') },
        formatAmount,
        dark: theme.isDark,
      });
    } catch {
      Alert.alert(t('budget.exportError'));
    } finally {
      setExporting(false);
    }
  };

  // --- Rendu ------------------------------------------------------------------
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  // Le diagramme va d'un bord à l'autre de la carte et se fait glisser.
  const chartWidth = width - 32;

  const row = ({ key, label, amount, onLabel, onAmount, onRemove }) => (
    <Animated.View key={key} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={LinearTransition} style={[styles.row, { borderBottomColor: theme.colors.borderLight }]}>
      <TextInput
        value={label}
        onChangeText={onLabel}
        style={[styles.rowLabel, { color: theme.colors.text }]}
        placeholderTextColor={theme.colors.textTertiary}
        accessibilityLabel={t('budget.labelField')}
      />
      <View style={[styles.amountBox, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <TextInput
          value={toInput(amount)}
          onChangeText={onAmount}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.colors.textTertiary}
          style={[styles.amountInput, { color: theme.colors.text }]}
          accessibilityLabel={t('budget.amountField', { name: label })}
        />
        <Text style={[styles.currency, { color: theme.colors.textTertiary }]}>€</Text>
      </View>
      <TouchableOpacity onPress={onRemove} style={styles.trash} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
        <Ionicons name="trash-outline" size={16} color={theme.colors.textTertiary} />
      </TouchableOpacity>
    </Animated.View>
  );

  const addButton = (label, onPress) => (
    <TouchableOpacity onPress={onPress} style={styles.add} accessibilityRole="button">
      <Ionicons name="add" size={18} color={theme.colors.primary} />
      <Text style={[styles.addText, { color: theme.colors.primary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const tip = totals.income <= 0 ? null
    : totals.available < 0 ? { key: 'over', color: theme.colors.error, icon: 'alert-circle', params: { amount: money(-totals.available) } }
      : totals.savingsRate < 10 && totals.available > 0 ? { key: 'low', color: theme.colors.warning, icon: 'bulb-outline', params: { amount: money(totals.available) } }
        : totals.available > totals.income * 0.15 ? { key: 'idle', color: theme.colors.primary, icon: 'bulb-outline', params: { amount: money(totals.available) } }
          : { key: 'good', color: theme.colors.success, icon: 'checkmark-circle', params: { rate: pct(totals.savingsRate) } };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('budget.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Les chiffres clés */}
        <Animated.View entering={FadeInDown.duration(350)} style={cardStyle}>
          <View style={styles.rates}>
            <View style={styles.rate}>
              <Text style={[styles.rateLabel, { color: theme.colors.textSecondary }]}>{t('budget.savingsRate')}</Text>
              <Text style={[styles.rateValue, { color: theme.colors.text }]}>{pct(totals.savingsRate)}</Text>
            </View>
            <View style={[styles.rateDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.rate}>
              <Text style={[styles.rateLabel, { color: theme.colors.textSecondary }]}>{t('budget.possibleRate')}</Text>
              <Text style={[styles.rateValue, { color: theme.colors.text }]}>{pct(totals.possibleRate)}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            {[
              ['income', totals.income, theme.colors.text],
              ['expenses', totals.expenses, theme.colors.text],
              ['invest', totals.invest, theme.colors.text],
              ['available', totals.available, totals.available < 0 ? theme.colors.error : theme.colors.success],
            ].map(([k, v, color]) => (
              <View key={k} style={[styles.stat, { backgroundColor: theme.colors.backgroundSecondary }]}>
                <Text style={[styles.statLabel, { color: theme.colors.textTertiary }]}>{t(`budget.stats.${k}`)}</Text>
                <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{money(v)}</Text>
              </View>
            ))}
          </View>
          {real && totals.invest > 0 && (() => {
            const gap = real.perMonth - totals.invest;
            const ratio = real.perMonth / totals.invest;
            const level = ratio >= 0.9 && ratio <= 1.1 ? 'onTrack' : gap < 0 ? 'below' : 'above';
            const color = { onTrack: theme.colors.success, below: theme.colors.warning, above: theme.colors.primary }[level];
            return (
              <View style={[styles.real, { borderTopColor: theme.colors.border }]}>
                <View style={styles.realHead}>
                  <Text style={[styles.realTitle, { color: theme.colors.textSecondary }]}>{t('budget.real.title')}</Text>
                  <Text style={[styles.realValue, { color }]}>{money(Math.max(0, real.perMonth))}</Text>
                </View>
                <View style={[styles.realTrack, { backgroundColor: theme.colors.backgroundSecondary }]}>
                  <View style={[styles.realFill, { width: `${Math.min(100, Math.max(0, ratio) * 100)}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.realText, { color: theme.colors.textSecondary }]}>
                  {t('budget.real.line', { count: real.months, planned: money(totals.invest) })}{' '}
                  <Text style={{ color, fontWeight: '600' }}>
                    {level === 'onTrack' ? t('budget.real.onTrack') : t(`budget.real.${level}`, { amount: money(Math.abs(gap)) })}
                  </Text>
                </Text>
              </View>
            );
          })()}
          {loanLines.length > 0 && !hasLoanGroup && (
            <View style={[styles.loanTip, { backgroundColor: theme.colors.warningBg }]}>
              <Ionicons name="home-outline" size={16} color={theme.colors.warning} />
              <View style={styles.loanTipBody}>
                <Text style={[styles.tipText, { color: theme.colors.text }]}>
                  {t('budget.loansTip', { amount: money(loanLines.reduce((sum, x) => sum + x.amount, 0)) })}
                </Text>
                <TouchableOpacity onPress={addLoans} accessibilityRole="button" style={styles.loanTipBtn}>
                  <Text style={[styles.loanTipBtnText, { color: theme.colors.primary }]}>{t('budget.loansAdd')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {tip && (
            <View style={styles.tip}>
              <Ionicons name={tip.icon} size={16} color={tip.color} />
              <Text style={[styles.tipText, { color: theme.colors.text }]}>{t(`budget.tips.${tip.key}`, tip.params)}</Text>
            </View>
          )}
        </Animated.View>

        {/* Le diagramme */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)} style={cardStyle}>
          <View style={styles.flowHead}>
            <Text style={[styles.cardTitle, styles.flowTitle, { color: theme.colors.text }]}>{t('budget.flowTitle')}</Text>
            {(totals.income > 0 || totals.expenses > 0) && (
              <TouchableOpacity
                onPress={exportImage}
                disabled={exporting}
                style={[styles.exportBtn, { borderColor: theme.colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={t('budget.export')}
              >
                {exporting
                  ? <ActivityIndicator size="small" color={theme.colors.primary} />
                  : <Ionicons name="share-outline" size={16} color={theme.colors.primary} />}
                <Text style={[styles.exportText, { color: theme.colors.primary }]}>{t('budget.export')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{t('budget.flowHint')}</Text>
          <View style={styles.chart}>
            {totals.income > 0 || totals.expenses > 0 ? (
              <SankeyChart
                budget={budget}
                width={chartWidth}
                theme={theme}
                formatAmount={formatAmount}
                labels={{ budget: t('budget.title'), available: t('budget.stats.available') }}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <Text style={[styles.hint, styles.emptyChart, { color: theme.colors.textSecondary }]}>{t('budget.empty')}</Text>
            )}
          </View>
        </Animated.View>

        {/* La saisie */}
        <SegmentedControl
          options={TABS.map((k) => ({ key: k, label: t(`budget.tabs.${k}`) }))}
          value={tab}
          onChange={setTab}
          variant="track"
          fill
          style={styles.tabs}
        />

        {tab === 'income' && (
          <Animated.View key="income" entering={FadeIn.duration(200)} style={cardStyle}>
            {budget.incomes.map((x) => row({
              key: x.id,
              label: x.label,
              amount: x.amount,
              onLabel: (v) => setIncome(x.id, { label: v }),
              onAmount: (v) => setIncome(x.id, { amount: parseAmount(v) }),
              onRemove: () => removeIncome(x.id),
            }))}
            {addButton(t('budget.addIncome'), addIncome)}
          </Animated.View>
        )}

        {tab !== 'income' && (
          <Animated.View key={tab} entering={FadeIn.duration(200)}>
            {budget.groups.filter((g) => g.kind === tab).map((g) => (
              <Animated.View key={g.id} layout={LinearTransition} style={cardStyle}>
                <View style={styles.groupHead}>
                  <TextInput
                    value={g.label}
                    onChangeText={(v) => setGroupLabel(g.id, v)}
                    style={[styles.groupLabel, { color: theme.colors.text }]}
                    accessibilityLabel={t('budget.categoryField')}
                  />
                  <Text style={[styles.groupTotal, { color: theme.colors.textSecondary }]}>{money(groupTotal(g))}</Text>
                  <TouchableOpacity onPress={() => removeGroup(g.id)} style={styles.trash} accessibilityRole="button" accessibilityLabel={t('budget.removeCategory')}>
                    <Ionicons name="close-circle-outline" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                {g.items.map((it) => row({
                  key: it.id,
                  label: it.label,
                  amount: it.amount,
                  onLabel: (v) => setItem(g.id, it.id, { label: v }),
                  onAmount: (v) => setItem(g.id, it.id, { amount: parseAmount(v) }),
                  onRemove: () => removeItem(g.id, it.id),
                }))}
                {addButton(t(tab === 'invest' ? 'budget.addInvestment' : 'budget.addExpense'), () => addItem(g.id))}
              </Animated.View>
            ))}
            <TouchableOpacity onPress={() => addGroup(tab)} style={[styles.addGroup, { borderColor: theme.colors.border }]} accessibilityRole="button">
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.addText, { color: theme.colors.primary }]}>{t('budget.addCategory')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('budget.note')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loanTip: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12, marginTop: 12 },
  loanTipBody: { flex: 1 },
  loanTipBtn: { minHeight: 32, justifyContent: 'center', marginTop: 4 },
  loanTipBtnText: { fontSize: 14, fontWeight: '700' },
  real: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 12 },
  realHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  realTitle: { fontSize: 13, fontWeight: '600' },
  realValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  realTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  realFill: { height: 6, borderRadius: 3 },
  realText: { fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 48 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  rates: { flexDirection: 'row', alignItems: 'center' },
  rate: { flex: 1, alignItems: 'center', gap: 2 },
  rateDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  rateLabel: { fontSize: 12, fontWeight: '600' },
  rateValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { flexBasis: '47%', flexGrow: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tip: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  flowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flowTitle: { flex: 1 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  exportText: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  // La carte a 16 de marge : le diagramme les reprend pour glisser jusqu'aux bords.
  chart: { marginTop: 14, marginHorizontal: -16 },
  emptyChart: { paddingHorizontal: 16 },
  tabs: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1, fontSize: 15, paddingVertical: 8 },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, minWidth: 96 },
  amountInput: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'right', paddingVertical: 8, fontVariant: ['tabular-nums'] },
  currency: { fontSize: 14, marginLeft: 4 },
  trash: { minWidth: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 2 },
  addText: { fontSize: 14, fontWeight: '600' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  groupLabel: { flex: 1, fontSize: 16, fontWeight: '700', paddingVertical: 4 },
  groupTotal: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  addGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  note: { fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
});

export default BudgetScreen;
