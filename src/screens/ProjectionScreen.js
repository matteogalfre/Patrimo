/**
 * Patrimoine futur : où mène l'épargne actuelle, selon trois rendements
 * moyens. Part du patrimoine réel : les placements au rendement choisi, les
 * liquidités au taux de leurs livrets. L'épargne mensuelle proposée est la
 * moyenne des 12 derniers mois.
 *
 * « Et si j'investissais mes liquidités ? » compare ce scénario à celui où
 * une part des liquidités rejoint les placements, d'un coup ou sur 12 mois,
 * et montre aussi ce que cette part pourrait perdre sur une mauvaise année.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { LineChartSkia } from '../components/charts';
import SegmentedControl from '../components/SegmentedControl';
import Slider from '../components/Slider';
import { averageCashRate, projectPortfolio, realRate, SCENARIOS } from '../core/projection';
import { useMyNumbers } from '../hooks/useMyNumbers';
import { formatPercent } from '../utils/formatters';
import { normalizeNumber } from '../utils/parseNumber';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32 - 32;
const HORIZONS = [10, 20, 30];
// Épargne de précaution conseillée avant d'investir ses liquidités.
const SAFETY_MONTHS = 3;

const ProjectionScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount, currencySymbol } = useSettings();
  const { overview, cash } = usePortfolio();
  const { monthlyExpenses } = usePlanning();

  // Ce qui part chaque mois : avec un budget, ce qui est investi va aux
  // placements et ce qui reste dort sur les comptes ; sinon les achats
  // programmés, le questionnaire ou ce que l'app mesure.
  const numbers = useMyNumbers();
  const split = numbers.fromBudget && numbers.invest != null;
  const suggestedMonthly = Math.round((split ? numbers.invest : numbers.invest || numbers.savings) || (split ? 0 : 250));
  const suggestedKept = split ? Math.round(numbers.kept || 0) : 0;
  let monthlyHint = null;
  if (split) monthlyHint = t('projection.hintBudget', { invest: formatAmount(suggestedMonthly, { decimals: 0, reveal: true }), kept: formatAmount(suggestedKept, { decimals: 0, reveal: true }) });
  else if (numbers.investFrom === 'plans') monthlyHint = t('projection.hintPlans');
  else if (numbers.savingsFrom === 'answers') monthlyHint = t('projection.hintAnswers');
  else if (numbers.savingsFrom === 'measured') monthlyHint = t('projection.monthlyHint', { amount: formatAmount(suggestedMonthly, { decimals: 0, reveal: true }) });

  const [monthlyInput, setMonthlyInput] = useState(String(suggestedMonthly));
  const [keptInput, setKeptInput] = useState(String(suggestedKept));
  // Avec ton âge (questionnaire), un horizon de plus : tes 64 ans, choisi d'office.
  const retireIn = numbers.age && 64 - numbers.age >= 5 && 64 - numbers.age <= 45 ? 64 - numbers.age : null;
  const retirementYears = retireIn && !HORIZONS.includes(retireIn) ? retireIn : null;
  const horizons = retirementYears ? [...HORIZONS, retirementYears].sort((a, b) => a - b) : HORIZONS;
  const [years, setYears] = useState(retireIn || 20);
  // Tes chiffres arrivent parfois après l'ouverture de l'écran : tant que tu
  // n'as rien touché, les champs suivent ton budget et ton âge.
  const touched = useRef({ monthly: false, kept: false, years: false });
  useEffect(() => {
    if (!touched.current.monthly) setMonthlyInput(String(suggestedMonthly));
    if (!touched.current.kept) setKeptInput(String(suggestedKept));
    if (!touched.current.years && retireIn) setYears(retireIn);
  }, [suggestedMonthly, suggestedKept, retireIn]);
  const edit = (key, setter) => (v) => {
    touched.current[key] = true;
    setter(v);
  };
  const [scenario, setScenario] = useState('median');
  // Liquidités : part investie (en %) et horizon propres à la simulation.
  const [share, setShare] = useState(50);
  const [cashYears, setCashYears] = useState(10);
  const [spread, setSpread] = useState(12);
  const [showCashSim, setShowCashSim] = useState(false);

  const monthly = Math.max(0, Number(normalizeNumber(monthlyInput)) || 0);
  const monthlyCash = Math.max(0, Number(normalizeNumber(keptInput)) || 0);
  const start = Math.max(0, overview.value);
  const invested = Math.max(0, overview.investedValue ?? overview.value - cash.total);
  // Taux affiché : celui des livrets. Taux projeté : après inflation, comme les placements.
  const cashRate = averageCashRate(cash.total, cash.yearlyInterest);
  const base = { invested, cash: cash.total, monthly, monthlyCash, years, cashRate: realRate(cashRate) };

  const results = useMemo(() => Object.fromEntries(
    Object.entries(SCENARIOS).map(([key, rate]) => [key, projectPortfolio({ ...base, annualRate: rate })]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [invested, cash.total, monthly, monthlyCash, years, cashRate]);

  // Liquidités : sans rien changer, puis avec une part investie, sur leur propre horizon.
  const keep = useMemo(() => Object.fromEntries(
    Object.entries(SCENARIOS).map(([key, rate]) => [key, projectPortfolio({ ...base, years: cashYears, annualRate: rate })]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [invested, cash.total, monthly, monthlyCash, cashYears, cashRate]);
  const allocated = useMemo(() => Object.fromEntries(
    Object.entries(SCENARIOS).map(([key, rate]) => [
      key,
      projectPortfolio({ ...base, years: cashYears, annualRate: rate, share: share / 100, spreadMonths: spread }),
    ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [invested, cash.total, monthly, monthlyCash, cashYears, cashRate, share, spread]);

  const current = results[scenario];
  const moved = allocated.median.moved;
  const missed = allocated.median.final - keep.median.final;
  // Gain de l'argent investi par rapport à « sans rien changer », pour chaque taux.
  const gapChart = allocated.median.points.map((p, i) => ({
    x: i,
    y: p.value - keep.median.points[i].value,
    prudent: allocated.prudent.points[i].value - keep.prudent.points[i].value,
    optimistic: allocated.optimistic.points[i].value - keep.optimistic.points[i].value,
  }));
  const cashXLabels = keep.median.points.map((p, i, arr) => (i === 0 || i === arr.length - 1 || (arr.length > 12 && p.year % 5 === 0) ? String(new Date().getFullYear() + p.year) : ''));
  // Garder quelques mois de dépenses : au-delà, le curseur investit l'épargne de précaution.
  const safety = monthlyExpenses > 0 ? monthlyExpenses * SAFETY_MONTHS : 0;
  const maxSafeShare = cash.total > 0 && safety > 0 ? Math.max(0, Math.floor(((cash.total - safety) / cash.total) * 20) * 5) : null;
  // Les trois scénarios sur la même échelle : le choisi en plein, les autres en fin.
  // Sinon chaque courbe remplirait tout le cadre et elles auraient l'air identiques.
  const otherScenarios = Object.keys(SCENARIOS).filter((k) => k !== scenario);
  const chartData = current.points.map((p, i) => ({
    x: i,
    y: p.value,
    y2: p.contributed,
    ...Object.fromEntries(otherScenarios.map((k) => [k, results[k].points[i].value])),
  }));
  const thisYear = new Date().getFullYear();
  const xLabels = current.points.map((p, i) => (i === 0 || i === current.points.length - 1 || p.year % 5 === 0 ? String(thisYear + p.year) : ''));
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const scenarioColors = { prudent: theme.colors.textTertiary, median: theme.colors.primary, optimistic: theme.colors.success };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('projection.title')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={cardStyle}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              {t('projection.inYears', { count: years })}
              {numbers.age ? ` · ${t('projection.atAge', { age: numbers.age + years })}` : ''}
            </Text>
            <Text style={[styles.big, { color: theme.colors.text }]}>{formatAmount(current.final, { decimals: 0 })}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t('projection.range', {
                low: formatAmount(results.prudent.final, { decimals: 0, compact: true }),
                high: formatAmount(results.optimistic.final, { decimals: 0, compact: true }),
              })}
            </Text>

            <View style={styles.chart}>
              <LineChartSkia
                data={chartData}
                xLabels={xLabels}
                width={CHART_WIDTH}
                height={180}
                color={scenarioColors[scenario]}
                series={otherScenarios.map((k) => ({ key: k, color: `${scenarioColors[k]}80`, width: 1.25 }))}
                curve="monotoneX"
                theme={theme}
                yTickCount={4}
                formatYLabel={(v) => formatAmount(v, { decimals: 0, compact: true })}
              />
            </View>
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: scenarioColors[scenario] }]} />
              <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('projection.legendValue')}</Text>
              <View style={[styles.legendDash, { borderColor: theme.colors.textTertiary }]} />
              <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('projection.legendContributed')}</Text>
            </View>

            <SegmentedControl
              options={Object.keys(SCENARIOS).map((key) => ({
                key,
                label: `${t(`projection.scenarios.${key}`)} ${formatPercent(SCENARIOS[key], { showSign: false, decimals: 0 })}`,
              }))}
              value={scenario}
              onChange={setScenario}
              variant="track"
              size="sm"
              fill
              accessibilityRole="button"
            />
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.stat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('projection.contributed')}</Text>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>{formatAmount(current.contributed, { decimals: 0 })}</Text>
            </View>
            <View style={[styles.stat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('projection.gains')}</Text>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>
                {formatAmount(current.gains, { decimals: 0, showSign: true })}
              </Text>
            </View>
          </View>

          <View style={cardStyle}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>{split ? t('projection.investedMonthly') : t('projection.monthly')}</Text>
            <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <TextInput
                value={monthlyInput}
                onChangeText={edit('monthly', setMonthlyInput)}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.colors.text }]}
                accessibilityLabel={split ? t('projection.investedMonthly') : t('projection.monthly')}
              />
              <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol} / {t('projection.perMonth')}</Text>
            </View>
            {split && (
              <>
                <Text style={[styles.fieldLabel, styles.spaced, { color: theme.colors.text }]}>{t('projection.kept')}</Text>
                <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                  <TextInput
                    value={keptInput}
                    onChangeText={edit('kept', setKeptInput)}
                    keyboardType="decimal-pad"
                    style={[styles.input, { color: theme.colors.text }]}
                    accessibilityLabel={t('projection.kept')}
                  />
                  <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{currencySymbol} / {t('projection.perMonth')}</Text>
                </View>
              </>
            )}
            {!!monthlyHint && <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{monthlyHint}</Text>}

            <Text style={[styles.fieldLabel, styles.spaced, { color: theme.colors.text }]}>{t('projection.horizon')}</Text>
            <SegmentedControl
              options={horizons.map((h) => ({ key: h, label: h === retirementYears ? t('projection.atAgeOption', { age: 64 }) : t('projection.years', { count: h }) }))}
              value={years}
              onChange={edit('years', setYears)}
              variant="track"
              fill
              accessibilityRole="button"
            />
          </View>

          {cash.total > 0 && (
            <View style={cardStyle}>
              <TouchableOpacity
                style={styles.cashHead}
                onPress={() => setShowCashSim((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showCashSim }}
              >
                <Text style={[styles.cardTitle, styles.cashTitle, { color: theme.colors.text }]}>{t('projection.cash.title')}</Text>
                <Ionicons name={showCashSim ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
              <Text style={[styles.sub, styles.cardIntro, { color: theme.colors.textSecondary }]}>
                {cashRate > 0
                  ? t('projection.cash.intro', {
                    amount: formatAmount(cash.total, { decimals: 0 }),
                    rate: formatPercent(cashRate, { showSign: false, decimals: 2 }),
                  })
                  : t('projection.cash.introNoRate', { amount: formatAmount(cash.total, { decimals: 0 }) })}
              </Text>

              {/* Un second simulateur, ouvert seulement si on le demande. */}
              {showCashSim && (<>
              {moved > 0 ? (
                <>
                  <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                    {t('projection.cash.missed', { amount: formatAmount(moved, { decimals: 0 }), count: cashYears })}
                  </Text>
                  <Text style={[styles.big, { color: missed >= 0 ? theme.colors.success : theme.colors.error }]}>
                    {formatAmount(missed, { decimals: 0, showSign: true })}
                  </Text>
                </>
              ) : (
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('projection.cash.zero')}</Text>
              )}

              {/* Ce que rapporte l'argent investi en plus, année après année, pour chaque taux. */}
              <View style={styles.chart}>
                <LineChartSkia
                  data={gapChart}
                  xLabels={cashXLabels}
                  width={CHART_WIDTH}
                  height={170}
                  color={scenarioColors.median}
                  series={[
                    { key: 'prudent', color: scenarioColors.prudent },
                    { key: 'optimistic', color: scenarioColors.optimistic },
                  ]}
                  theme={theme}
                  yTickCount={3}
                  curve="monotoneX"
                  formatYLabel={(v) => formatAmount(v, { decimals: 0, compact: true })}
                />
              </View>
              <View style={styles.scenarioRows}>
                {['optimistic', 'median', 'prudent'].map((key) => (
                  <View key={key} style={styles.scenarioRow}>
                    <View style={styles.scenarioName}>
                      <View style={[styles.scenarioDot, { backgroundColor: scenarioColors[key] }]} />
                      <Text style={[styles.scenarioLabel, { color: key === 'median' ? theme.colors.text : theme.colors.textSecondary }]}>
                        {t(`projection.scenarios.${key}`)} {formatPercent(SCENARIOS[key], { showSign: false, decimals: 0 })}
                      </Text>
                    </View>
                    <Text style={[styles.scenarioValue, { color: key === 'median' ? theme.colors.text : theme.colors.textSecondary }]}>
                      {formatAmount(allocated[key].final - keep[key].final, { decimals: 0, showSign: true })}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={[styles.sliderHead, styles.spaced]}>
                <Text style={[styles.fieldLabel, styles.noMargin, { color: theme.colors.text }]}>{t('projection.cash.share')}</Text>
                <Text style={[styles.sliderValue, { color: theme.colors.text }]}>
                  {t('projection.cash.shareValue', {
                    pct: formatPercent(share, { showSign: false, decimals: 0 }),
                    amount: formatAmount(moved, { decimals: 0 }),
                  })}
                </Text>
              </View>
              <Slider
                value={share}
                min={0}
                max={100}
                step={5}
                onChange={setShare}
                accessibilityLabel={t('projection.cash.share')}
                formatValue={(v) => formatPercent(v, { showSign: false, decimals: 0 })}
              />
              {maxSafeShare != null && (
                <Text style={[styles.hint, styles.noTop, { color: share > maxSafeShare ? theme.colors.warning : theme.colors.textTertiary }]}>
                  {t('projection.cash.keepFund', {
                    amount: formatAmount(safety, { decimals: 0 }),
                    pct: formatPercent(maxSafeShare, { showSign: false, decimals: 0 }),
                  })}
                </Text>
              )}

              <View style={[styles.sliderHead, styles.spaced]}>
                <Text style={[styles.fieldLabel, styles.noMargin, { color: theme.colors.text }]}>{t('projection.cash.horizon')}</Text>
                <Text style={[styles.sliderValue, { color: theme.colors.text }]}>{t('projection.years', { count: cashYears })}</Text>
              </View>
              <Slider
                value={cashYears}
                min={1}
                max={40}
                step={1}
                onChange={setCashYears}
                accessibilityLabel={t('projection.cash.horizon')}
                formatValue={(v) => t('projection.years', { count: v })}
              />

              <Text style={[styles.fieldLabel, styles.spaced, { color: theme.colors.text }]}>{t('projection.cash.pace')}</Text>
              <SegmentedControl
                options={[
                  { key: 0, label: t('projection.cash.once') },
                  { key: 12, label: t('projection.cash.spread') },
                ]}
                value={spread}
                onChange={setSpread}
                variant="track"
                size="sm"
                fill
                accessibilityRole="button"
              />

              {moved > 0 && (
                <View style={[styles.risk, styles.spaced, { backgroundColor: theme.colors.warningBg }]}>
                  <Text style={[styles.riskText, { color: theme.colors.text }]}>
                    {t('projection.cash.risk', {
                      amount: formatAmount(moved, { decimals: 0 }),
                      loss: formatAmount(moved * 0.3, { decimals: 0 }),
                    })}
                  </Text>
                </View>
              )}
              <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{t('projection.cash.safety')}</Text>
              </>)}
            </View>
          )}

          <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
            {t('projection.note', { start: formatAmount(start, { decimals: 0 }) })}
          </Text>
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
  cashHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cashTitle: { flex: 1 },
  cardIntro: { marginBottom: 14, lineHeight: 18 },
  scenarioRows: { marginTop: 4, gap: 4 },
  scenarioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scenarioName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scenarioDot: { width: 10, height: 3, borderRadius: 2 },
  scenarioLabel: { fontSize: 13 },
  scenarioValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  risk: { borderRadius: 12, padding: 12, marginTop: 8 },
  riskText: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '500' },
  big: { fontSize: 30, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 13, marginTop: 4 },
  chart: { marginTop: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 12, paddingLeft: 4 },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', marginLeft: 8 },
  legendText: { fontSize: 11 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stat: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  statValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  noMargin: { marginBottom: 0 },
  noTop: { marginTop: 0 },
  sliderHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  sliderValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spaced: { marginTop: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 18, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});

export default ProjectionScreen;
