/**
 * Tableau de bord : le patrimoine en un coup d'œil.
 *
 * Mise en page volontairement sobre : un chiffre principal, sa courbe, puis
 * des cartes unies. Le filtre d'enveloppe agit sur tout l'écran ; « Tout »
 * inclut les liquidités.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { LineChartSkia, Sparkline, toLineChartData } from '../components/charts';
import { useTheme } from '../theme/theme';
import { ACCOUNT_ORDER, ACCOUNTS, ASSET_TYPES } from '../core/assets';
import { ACCOUNT_COLORS, CLASS_COLORS, OTHERS_COLOR, paletteColor } from '../utils/assetColors';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { useBank } from '../context/BankContext';
import { useMarketWatch } from '../hooks/useMarketWatch';
import { scoreProfile } from '../core/profile';
import { findInstitution } from '../core/institutions';
import { budgetTotals } from '../core/budget';
import { MetricCardSkeleton, ChartSkeleton } from '../components';
import AllocationChart from '../components/AllocationChart';
import AssetLogo from '../components/AssetLogo';
import ChangeBadge from '../components/ChangeBadge';
import SegmentedControl from '../components/SegmentedControl';
import PeaCard from '../components/PeaCard';
import ToolsCard from '../components/Dashboard/ToolsCard';
import DuePlansCard from '../components/Dashboard/DuePlansCard';
import DueDividendsCard from '../components/Dashboard/DueDividendsCard';
import YearlyPerformanceCard from '../components/Dashboard/YearlyPerformanceCard';
import { annualizedReturn } from '../core/performance';
import { averageCashRate } from '../core/projection';
import { computeExposure } from '../core/exposure';
import { AccountFilter, CashRow, InflationCard } from '../components/Portfolio';
import NetworkStatus, { ErrorBanner, SyncStatus } from '../components/NetworkStatus';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import { useInflation } from '../hooks/useInflation';
import { formatDate, formatPercent } from '../utils/formatters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32 - 24;
const PERIODS = ['7D', '1M', '3M', 'YTD', '1Y', 'ALL'];
// Au-delà, les petites lignes sont regroupées : un anneau à 25 parts est illisible.
const MAX_SLICES = 7;

const DashboardScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount, language, locale, privacyMode, togglePrivacyMode } = useSettings();
  const {
    assets,
    positions,
    totals,
    overview,
    cash,
    warnings,
    pea,
    isLoading,
    isRefreshing,
    refresh,
    error,
    lastUpdated,
    getChartData,
    getSparkline,
    income,
    transactions,
    dividends,
    fx,
    demo,
    debts,
    realEstate,
  } = usePortfolio();
  const { isOffline } = useNetworkStatus();

  const [account, setAccount] = useState(null);
  const [period, setPeriod] = useState('1Y');
  const [allocationBy, setAllocationBy] = useState('asset');
  // Point du graphique sous le doigt (null quand on ne touche pas la courbe).
  const [scrubIndex, setScrubIndex] = useState(null);
  // Ligne « argent investi » sur demande : deux courbes proches se chevauchent.
  const [showInvested, setShowInvested] = useState(false);
  const onScrub = useCallback((i) => setScrubIndex(i >= 0 ? i : null), []);

  const isCash = account === ACCOUNTS.CASH;
  const availableAccounts = useMemo(
    () => [...Object.keys(totals.byAccount || {}), ...(cash.accounts.length ? [ACCOUNTS.CASH] : [])],
    [totals.byAccount, cash.accounts.length],
  );

  const summary = useMemo(() => {
    if (!account) return overview;
    if (isCash) return { value: cash.total, dailyChange: 0, dailyChangePct: 0 };
    return totals.byAccount?.[account] || overview;
  }, [account, isCash, overview, totals.byAccount, cash.total]);

  const chartData = useMemo(
    () => getChartData(period, { account, monthNames: t('months.short'), todayLabel: t('common.today') }),
    // `language` change les libellés renvoyés par `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getChartData, period, account, language],
  );

  const allocation = useMemo(() => {
    if (!account && allocationBy === 'class') {
      return [
        ...Object.values(ASSET_TYPES).map((type) => ({
          name: t(`classes.${type}`),
          value: totals.byClass?.[type]?.value || 0,
          color: CLASS_COLORS[type],
        })),
        { name: t('classes.cash'), value: cash.total, color: CLASS_COLORS.cash },
      ].filter((s) => s.value > 0);
    }
    if (!account && allocationBy === 'account') {
      return ACCOUNT_ORDER
        .map((acc) => ({
          name: t(`accounts.${acc}`),
          value: acc === ACCOUNTS.CASH ? cash.total : totals.byAccount?.[acc]?.value || 0,
          color: ACCOUNT_COLORS[acc],
        }))
        .filter((s) => s.value > 0);
    }
    // Deux comptes du même nom (« Compte courant » chez deux banques) : on précise la banque.
    const sameName = (a) => cash.accounts.filter((x) => x.name === a.name).length > 1;
    const cashItem = (a) => ({
      key: a.id,
      name: sameName(a) && a.institution ? `${a.name} · ${findInstitution(a.institution)?.name || a.institution}` : a.name,
      value: a.value,
    });
    let items;
    if (isCash) items = cash.accounts.map(cashItem);
    else if (account) {
      items = positions.filter((p) => p.account === account && p.isHeld).map((p) => ({ name: p.symbol, value: p.value }));
    } else {
      items = [
        ...assets.filter((a) => a.isHeld).map((a) => ({ name: a.symbol, value: a.value })),
        ...cash.accounts.map(cashItem),
      ];
    }
    items.sort((a, b) => b.value - a.value);
    const slices = items.slice(0, MAX_SLICES).map((x, i) => ({ ...x, color: paletteColor(i) }));
    const rest = items.slice(MAX_SLICES).reduce((s, x) => s + x.value, 0);
    if (rest > 0) slices.push({ name: t('dashboard.others'), value: rest, color: OTHERS_COLOR });
    return slices.filter((s) => s.value > 0);
  }, [allocationBy, account, isCash, totals, cash, assets, positions, t]);

  const performers = useMemo(() => {
    if (isCash) return [];
    const list = account
      ? positions.filter((p) => p.account === account && p.isHeld)
      : assets.filter((a) => a.isHeld);
    return [...list].sort((a, b) => b.value - a.value).slice(0, 10);
  }, [account, isCash, positions, assets]);

  const scrub = useMemo(() => {
    if (scrubIndex == null) return null;
    const value = chartData.datasets[0].data[scrubIndex];
    if (!Number.isFinite(value)) return null;
    const invested = chartData.datasets[1]?.data[scrubIndex];
    return { value, invested, date: chartData.dates?.[scrubIndex] };
  }, [scrubIndex, chartData]);

  const shownValue = useTweenedNumber(scrub ? scrub.value : summary.value, scrub ? 0 : 450);

  // Rendement annualisé des placements du périmètre affiché (hors liquidités),
  // et le même en pouvoir d'achat quand l'indice des prix est disponible.
  const inflation = useInflation();
  const { annualized, annualizedReal } = useMemo(() => {
    if (isCash) return { annualized: null, annualizedReal: null };
    const scope = account ? totals.byAccount?.[account] : totals;
    const params = {
      transactions: transactions.filter((x) => !account || x.account === account),
      dividends: dividends.filter((d) => !account || d.account === account),
      fx,
      value: scope?.value || 0,
    };
    return {
      annualized: annualizedReturn(params),
      annualizedReal: inflation ? annualizedReturn({ ...params, toToday: (time) => inflation.toToday(time) }) : null,
    };
  }, [isCash, account, totals, transactions, dividends, fx, inflation]);

  // Résumé de la diversification pour l'accès « Planifier » : premier pays, premier secteur.
  const { exposure: exposureOverrides, profile, budget, hydrated, onboarded, setOnboarded } = usePlanning();
  const diversificationSummary = useMemo(() => {
    const e = computeExposure(assets.filter((a) => a.isHeld), exposureOverrides);
    const country = e.countries.find((x) => x.key !== 'OTHER');
    const sector = e.sectors[0];
    if (!country || !sector) return t('diversification.entrySubtitle');
    return t('diversification.summary', {
      country: `${formatPercent(country.pct, { showSign: false, decimals: 0 })} ${t(`countries.${country.key}`)}`,
      sector: `${formatPercent(sector.pct, { showSign: false, decimals: 0 })} ${t(`sectors.${sector.key}`)}`,
    });
  }, [assets, exposureOverrides, t]);

  // Deux cartes : ce qui analyse le patrimoine actuel, ce qui prépare la suite.
  // Marchés : une carte quand le S&P 500 ou le Bitcoin reculent nettement,
  // et le plan anti-panique vérifié à l'ouverture.
  const marketStates = useMarketWatch();
  const marketAlerts = Object.entries(marketStates)
    // Une chute récente (la séance ou la semaine), pas une baisse installée depuis des mois.
    .filter(([mid, m]) => (mid === 'btc'
      ? m.state.change1d <= -0.05 || m.state.change5d <= -0.1
      : m.state.change1d <= -0.02 || m.state.change5d <= -0.04))
    .map(([mid, m]) => ({ id: mid, ...m }));

  const analyzeTools = useMemo(() => [
    { route: 'Markets', icon: 'pulse-outline', title: t('markets.title'), subtitle: t('markets.entrySubtitle') },
    {
      route: 'PassiveIncome',
      icon: 'cash-outline',
      title: t('income.title'),
      subtitle: income.upcoming?.items.length
        ? t('income.nextShort', { name: income.upcoming.items[0].name, month: t('months.long')[new Date(income.upcoming.items[0].date).getMonth()] })
        : income.projected > 0 ? t('income.summary', { amount: formatAmount(income.projected, { decimals: 0 }) }) : null,
    },
    { route: 'Diversification', icon: 'globe-outline', title: t('diversification.title'), subtitle: diversificationSummary },
    { route: 'Fees', icon: 'receipt-outline', title: t('fees.title'), subtitle: t('fees.entrySubtitle') },
    { route: 'Benchmark', icon: 'git-compare-outline', title: t('benchmark.title'), subtitle: t('benchmark.entrySubtitle') },
    { route: 'Tax', icon: 'document-text-outline', title: t('tax.title'), subtitle: t('tax.entrySubtitle') },
  ], [t, income.projected, income.upcoming, formatAmount, diversificationSummary]);

  const planTools = useMemo(() => [
    {
      route: 'Profile',
      icon: 'compass-outline',
      title: t('profile.title'),
      subtitle: profile ? t('profile.entryDone', { name: t(`profile.names.${scoreProfile(profile.answers).profile}`) }) : t('profile.entrySubtitle'),
    },
    {
      route: 'Budget',
      icon: 'git-network-outline',
      title: t('budget.title'),
      subtitle: budget
        ? t('budget.entryRate', { rate: formatPercent(budgetTotals(budget).savingsRate, { showSign: false, decimals: 0 }) })
        : t('budget.entrySubtitle'),
    },
    { route: 'Projection', icon: 'trending-up', title: t('projection.title'), subtitle: t('projection.entrySubtitle') },
    { route: 'Independence', icon: 'sunny-outline', title: t('independence.title'), subtitle: t('independence.entrySubtitle') },
    { route: 'Goals', icon: 'flag-outline', title: t('goals.title'), subtitle: t('goals.entrySubtitle') },
    { route: 'Rebalance', icon: 'pie-chart-outline', title: t('rebalance.title'), subtitle: t('rebalance.entrySubtitle') },
    { route: 'Plans', icon: 'repeat-outline', title: t('plans.title'), subtitle: t('plans.entrySubtitle') },
    { route: 'Wealth', icon: 'home-outline', title: t('wealth.title'), subtitle: t('wealth.entrySubtitle') },
    { route: 'HomeBuy', icon: 'calculator-outline', title: t('homeBuy.title'), subtitle: t('homeBuy.entrySubtitle') },
  ], [t, profile, budget]);

  const missingSymbols = useMemo(
    () => warnings.missingQuotes.map((id) => id.split(':')[1]).join(', '),
    [warnings.missingQuotes],
  );

  // Tirer pour rafraîchir relit aussi les banques reliées (quota de 6 h respecté).
  const { syncAll: syncBanks } = useBank();
  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([refresh(), syncBanks().catch(() => null)]);
  }, [refresh, syncBanks]);

  const openAsset = useCallback((item) => {
    Haptics.selectionAsync();
    navigation.navigate('AssetDetail', { assetId: item.assetId, account: item.account || null });
  }, [navigation]);

  const openCash = useCallback((acc) => {
    Haptics.selectionAsync();
    navigation.navigate('CashAccount', acc ? { accountId: acc.id } : {});
  }, [navigation]);

  // Première ouverture, rien de saisi : l'accueil et le questionnaire, une
  // seule fois. Quelqu'un qui a déjà des données ne le voit jamais.
  useEffect(() => {
    if (!hydrated || isLoading || onboarded) return;
    if (transactions.length || cash.accounts.length || profile || demo) setOnboarded();
    else navigation.navigate('Profile', { onboarding: true });
  }, [hydrated, isLoading, onboarded, transactions.length, cash.accounts.length, profile, demo, setOnboarded, navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.skeletonTitle, { backgroundColor: theme.colors.surface }]} />
          </View>
          <ChartSkeleton height={320} style={{ marginHorizontal: 16, marginBottom: 12 }} />
          <View style={styles.statsRow}>
            <MetricCardSkeleton style={{ flex: 1 }} />
            <MetricCardSkeleton style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const colorOf = (v) => (v >= 0 ? theme.colors.success : theme.colors.error);
  const hasDaily = !isCash && Number.isFinite(summary.dailyChange) && Math.abs(summary.dailyChange) > 0.005;
  const showPea = pea && (!account || account === ACCOUNTS.PEA);
  const chartPoints = chartData.datasets[0].data;
  const hasAnything = totals.heldCount > 0 || cash.accounts.length > 0;
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{t('dashboard.title')}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                togglePrivacyMode();
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: privacyMode }}
              accessibilityLabel={t('privacy.toggle')}
              style={styles.iconBtn}
            >
              <Ionicons name={privacyMode ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel={t('nav.settings')}
              accessibilityRole="button"
              style={styles.iconBtn}
            >
              <Ionicons name="settings-outline" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <NetworkStatus isOffline={isOffline} t={t} />
        {error && <ErrorBanner message={error} onRetry={onRefresh} t={t} />}
        <SyncStatus isSyncing={isRefreshing} lastUpdated={lastUpdated} t={t} language={language} />

        {demo && (
          <TouchableOpacity
            style={[styles.notice, { backgroundColor: theme.colors.primaryMuted }]}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
          >
            <Ionicons name="flask-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.noticeText, { color: theme.colors.text }]}>{t('demo.banner')}</Text>
          </TouchableOpacity>
        )}

        {warnings.missingQuotes.length > 0 && (
          <View style={[styles.notice, { backgroundColor: theme.colors.warningBg }]} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
            <Text style={[styles.noticeText, { color: theme.colors.text }]}>
              {t('dashboard.priceUnavailable', { symbols: missingSymbols })}
            </Text>
          </View>
        )}
        {warnings.pendingPrices.length > 0 && (
          <View style={[styles.notice, { backgroundColor: theme.colors.warningBg }]}>
            <Ionicons name="time-outline" size={16} color={theme.colors.warning} />
            <Text style={[styles.noticeText, { color: theme.colors.text }]}>
              {t('dashboard.pendingPrices', { count: warnings.pendingPrices.length })}
            </Text>
          </View>
        )}

        {/* Les plans sont les tiens : rien à rappeler sur l'exemple. */}
        {!demo && <DuePlansCard navigation={navigation} />}
        <DueDividendsCard navigation={navigation} />

        <AccountFilter value={account} onChange={setAccount} available={availableAccounts} style={styles.filter} />

        {/* Valeur et courbe */}
        <View style={cardStyle}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {scrub?.date
              ? formatDate(scrub.date, { locale })
              : account ? t(`accounts.${account}`) : t('dashboard.totalValue')}
          </Text>
          <Text style={[styles.heroValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatAmount(shownValue, { decimals: 0 })}
          </Text>
          {scrub && Number.isFinite(scrub.invested) ? (
            <View style={styles.dailyRow}>
              <ChangeBadge value={scrub.invested > 0 ? ((scrub.value - scrub.invested) / scrub.invested) * 100 : 0} />
              <Text style={[styles.dailyText, { color: theme.colors.textSecondary }]}>
                {t('dashboard.investedAt', { amount: formatAmount(scrub.invested, { decimals: 0 }) })}
              </Text>
            </View>
          ) : scrub ? (
            <View style={styles.dailyRow} />
          ) : hasDaily ? (
            <View style={styles.dailyRow}>
              <ChangeBadge value={summary.dailyChangePct} />
              <Text style={[styles.dailyText, { color: theme.colors.textSecondary }]}>
                {formatAmount(summary.dailyChange, { decimals: 0, showSign: true })} {t('dashboard.today')}
              </Text>
            </View>
          ) : (
            <View style={styles.dailyRow} />
          )}

          {chartPoints.filter((v) => v > 0).length > 1 ? (
            (() => {
              const { data, xLabels } = toLineChartData(
                showInvested ? chartData : { ...chartData, datasets: [chartData.datasets[0]] },
              );
              return (
                <LineChartSkia
                  data={data}
                  xLabels={xLabels}
                  width={CHART_WIDTH}
                  height={190}
                  color={theme.colors.primary}
                  theme={theme}
                  yTickCount={4}
                  formatYLabel={(v) => formatAmount(v, { decimals: 0, compact: true })}
                  onScrub={onScrub}
                />
              );
            })()
          ) : (
            <View style={styles.noData}>
              <Text style={[styles.noDataText, { color: theme.colors.textTertiary }]}>
                {hasAnything ? t('dashboard.chartLoading') : t('dashboard.noData')}
              </Text>
            </View>
          )}

          {chartData.datasets[1] && chartPoints.length > 1 && (
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: theme.colors.primary }]} />
              <Text style={[styles.legendText, { color: theme.colors.textTertiary }]}>{t('dashboard.legendValue')}</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowInvested((v) => !v);
                }}
                style={[
                  styles.legendToggle,
                  { backgroundColor: showInvested ? theme.colors.backgroundSecondary : 'transparent', borderColor: theme.colors.border },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: showInvested }}
              >
                <View style={[styles.legendDash, { borderColor: showInvested ? theme.colors.textSecondary : theme.colors.textTertiary }]} />
                <Text style={[styles.legendText, { color: showInvested ? theme.colors.text : theme.colors.textTertiary }]}>
                  {t('dashboard.legendInvested')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <SegmentedControl
            options={PERIODS.map((p) => ({ key: p, label: t(`dashboard.chartPeriods.${p}`) }))}
            value={period}
            onChange={setPeriod}
            variant="inCard"
            size="sm"
            fill
            style={styles.periods}
            accessibilityRole="button"
          />
        </View>

        {!isCash && totals.grossInvested > 0 && (
          <View style={styles.statsRow}>
            <View style={[styles.stat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('dashboard.netInvested')}</Text>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {formatAmount(summary.netInvested, { decimals: 0 })}
              </Text>
            </View>
            <View style={[styles.stat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('dashboard.totalPnl')}</Text>
              <Text style={[styles.statValue, { color: privacyMode ? theme.colors.text : colorOf(summary.totalPnL) }]}>
                {formatAmount(summary.totalPnL, { decimals: 0, showSign: true })}
              </Text>
              <ChangeBadge value={summary.roi} />
            </View>
          </View>
        )}

        {/* Ma performance : une carte par actif, avec sa courbe sur un mois */}
        {performers.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('dashboard.myAssets')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {performers.map((item) => {
                const spark = getSparkline(item.assetId);
                const sparkUp = spark.length > 1 ? spark[spark.length - 1] >= spark[0] : true;
                return (
                  <TouchableOpacity
                    key={item.key || item.assetId}
                    onPress={() => openAsset(item)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    style={[styles.perfCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  >
                    <View style={styles.perfHead}>
                      <AssetLogo assetId={item.assetId} symbol={item.symbol} size={28} />
                      <View style={styles.perfNames}>
                        <Text style={[styles.perfName, { color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.perfSymbol, { color: theme.colors.textTertiary }]} numberOfLines={1}>{item.symbol}</Text>
                      </View>
                    </View>
                    <Text style={[styles.perfValue, { color: theme.colors.text }]}>{formatAmount(item.value, { decimals: 0 })}</Text>
                    <View style={styles.perfFoot}>
                      <ChangeBadge value={item.roi} />
                      <Sparkline values={spark} width={56} height={22} color={sparkUp ? theme.colors.success : theme.colors.error} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Liquidités, dans leur propre vue */}
        {isCash && (
          <View style={cardStyle}>
            {cash.accounts.map((a, i) => (
              <CashRow key={a.id} account={a} onPress={openCash} isLast={i === cash.accounts.length - 1} />
            ))}
            {cash.yearlyInterest > 0 && (
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                {t('cash.yearlyInterest', { amount: formatAmount(cash.yearlyInterest, { decimals: 0 }) })}
              </Text>
            )}
          </View>
        )}
        {isCash && (
          <View style={styles.inset}>
            <InflationCard rate={averageCashRate(cash.total, cash.yearlyInterest)} value={cash.total} />
          </View>
        )}

        {/* Répartition */}
        {allocation.length > 0 && (
          <View style={cardStyle}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('dashboard.allocation')}</Text>
              {!account && (
                <SegmentedControl
                  options={['asset', 'class', 'account'].map((by) => ({ key: by, label: t(`dashboard.allocationBy.${by}`) }))}
                  value={allocationBy}
                  onChange={setAllocationBy}
                  variant="inCard"
                  size="sm"
                  accessibilityRole="button"
                />
              )}
            </View>
            <AllocationChart data={allocation} theme={theme} formatAmount={formatAmount} t={t} />
          </View>
        )}

        {showPea && <PeaCard pea={pea} onPress={() => navigation.navigate('Settings', { section: 'pea' })} />}

        {/* D'où vient la performance : la somme doit se recouper à l'écran. */}
        {!isCash && totals.grossInvested > 0 && (
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, styles.breakdownTitle, { color: theme.colors.text }]}>{t('dashboard.pnlDetail')}</Text>
            {[
              ['priceEffect', summary.priceEffect],
              ...(Math.abs(summary.fxEffect) >= 0.5 ? [['fxEffect', summary.fxEffect]] : []),
              ['realizedPnl', summary.realized],
              ...(summary.dividends > 0 ? [['dividends', summary.dividends]] : []),
            ].map(([key, val]) => (
              <View key={key} style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.colors.textSecondary }]}>{t(`dashboard.${key}`)}</Text>
                <Text style={[styles.breakdownValue, { color: privacyMode ? theme.colors.text : colorOf(val) }]}>
                  {formatAmount(val, { decimals: 0, showSign: true })}
                </Text>
              </View>
            ))}
            <View style={[styles.breakdownRow, styles.breakdownTotal, { borderTopColor: theme.colors.borderLight }]}>
              <Text style={[styles.breakdownLabel, styles.strong, { color: theme.colors.text }]}>{t('dashboard.totalPnl')}</Text>
              <Text style={[styles.breakdownValue, styles.strong, { color: privacyMode ? theme.colors.text : colorOf(summary.totalPnL) }]}>
                {formatAmount(summary.totalPnL, { decimals: 0, showSign: true })}
              </Text>
            </View>
            {annualized != null && (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.colors.textSecondary }]}>{t('performance.annualized')}</Text>
                <Text style={[styles.breakdownValue, { color: colorOf(annualized) }]}>
                  {t('performance.perYear', { value: formatPercent(annualized) })}
                </Text>
              </View>
            )}
            {annualized != null && annualizedReal != null && (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.colors.textSecondary }]}>{t('performance.real')}</Text>
                <Text style={[styles.breakdownValue, { color: colorOf(annualizedReal) }]}>
                  {t('performance.perYear', { value: formatPercent(annualizedReal) })}
                </Text>
              </View>
            )}
            {summary.feesPaid > 0 && (
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                {t('dashboard.feesIncluded', { amount: formatAmount(summary.feesPaid, { decimals: 0 }) })}
              </Text>
            )}
          </View>
        )}

        {!isCash && <YearlyPerformanceCard account={account} />}
        {/* Planifier sert dès le premier jour (profil, budget) ; Analyser, une fois des placements saisis. */}
        {/* Les marchés reculent : ce que dit l'histoire, ce que ça représente pour toi */}
        {!account && marketAlerts.length > 0 && (
          <TouchableOpacity
            style={[styles.netCard, { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warning }]}
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate('Markets', { market: marketAlerts[0].id });
            }}
            accessibilityRole="button"
          >
            <View style={styles.netHead}>
              <Text style={[styles.netLabel, { color: theme.colors.text }]}>{t('markets.alertTitle')}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </View>
            {marketAlerts.map((m) => (
              <Text key={m.id} style={[styles.marketLine, { color: theme.colors.text }]}>
                {t(m.partialHigh ? 'markets.alertLineYear' : 'markets.alertLine', {
                  market: t(`markets.names.${m.id}`),
                  day: formatPercent(m.state.change1d * 100, { decimals: 1 }),
                  high: formatPercent(m.state.drawdown * 100, { decimals: 1 }),
                })}
              </Text>
            ))}
            <Text style={[styles.netSub, { color: theme.colors.textSecondary }]}>{t('markets.alertSub')}</Text>
          </TouchableOpacity>
        )}

        {/* Patrimoine net : dès qu'un bien ou un crédit est saisi */}
        {!account && (debts.items.length > 0 || realEstate.items.length > 0) && (
          <TouchableOpacity
            style={[styles.netCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate('Wealth');
            }}
            accessibilityRole="button"
          >
            <View style={styles.netHead}>
              <Text style={[styles.netLabel, { color: theme.colors.textSecondary }]}>{t('wealth.netWorth')}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </View>
            <Text style={[styles.netValue, { color: theme.colors.text }]}>{formatAmount(overview.netWorth, { decimals: 0 })}</Text>
            <Text style={[styles.netSub, { color: theme.colors.textTertiary }]}>
              {t('wealth.dashboardLine', {
                financial: formatAmount(overview.value, { decimals: 0, compact: true }),
                realEstate: formatAmount(realEstate.value, { decimals: 0, compact: true }),
                debts: formatAmount(debts.remaining, { decimals: 0, compact: true }),
              })}
            </Text>
          </TouchableOpacity>
        )}

        {!account && <ToolsCard title={t('tools.plan')} items={planTools} navigation={navigation} />}
        {!account && hasAnything && <ToolsCard title={t('tools.analyze')} items={analyzeTools} navigation={navigation} />}

        {!hasAnything && (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.navigate('Add')}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={20} color={theme.colors.onPrimary} />
            <Text style={[styles.ctaText, { color: theme.colors.onPrimary }]}>{t('portfolio.addFirst')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  netCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  netHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netLabel: { fontSize: 13, fontWeight: '600' },
  netValue: { fontSize: 24, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  netSub: { fontSize: 12, marginTop: 4 },
  marketLine: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, paddingTop: 4, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 16 },
  filter: { marginTop: 4, marginBottom: 10 },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  inset: { marginHorizontal: 16 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  heroValue: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, marginTop: 6, marginBottom: 10 },
  dailyText: { fontSize: 13 },
  noData: { height: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  noDataText: { fontSize: 13, textAlign: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 4 },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  legendToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6, paddingHorizontal: 8, minHeight: 28, borderRadius: 14, borderWidth: 1 },
  legendText: { fontSize: 11 },
  periods: { marginTop: 10 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  stat: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  statValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, marginBottom: 10 },
  carousel: { paddingHorizontal: 16, gap: 10 },
  perfCard: { width: 156, borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  perfHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perfNames: { flex: 1 },
  perfName: { fontSize: 13, fontWeight: '600' },
  perfSymbol: { fontSize: 11 },
  perfValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  perfFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  breakdownTitle: { marginBottom: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  breakdownLabel: { fontSize: 14 },
  breakdownValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700' },
  breakdownTotal: { borderTopWidth: 1, marginTop: 6, paddingTop: 10 },
  footnote: { fontSize: 12, marginTop: 8, lineHeight: 16 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, minHeight: 52, borderRadius: 14 },
  ctaText: { fontSize: 15, fontWeight: '700' },
  skeletonTitle: { width: 160, height: 28, borderRadius: 8, marginVertical: 8 },
});

export default DashboardScreen;
