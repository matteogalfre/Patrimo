/**
 * Onglet « Outils » : tout ce qui analyse le patrimoine actuel ou prépare la
 * suite, au même endroit. Le tableau de bord reste centré sur les chiffres.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import ToolsCard from '../components/Dashboard/ToolsCard';
import { computeExposure } from '../core/exposure';
import { scoreProfile } from '../core/profile';
import { budgetTotals } from '../core/budget';
import { formatPercent } from '../utils/formatters';

const ToolsScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount } = useSettings();
  const { assets, income, totals, cash } = usePortfolio();
  const { exposure: exposureOverrides, profile, budget } = usePlanning();
  const hasAnything = totals.heldCount > 0 || cash.accounts.length > 0;

  // Premier pays, premier secteur : un aperçu sans ouvrir l'outil.
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]} accessibilityRole="header">{t('nav.tools')}</Text>
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Analyser n'a de sens qu'avec un patrimoine ; planifier, dès le départ. */}
        {hasAnything && <ToolsCard title={t('tools.analyze')} items={analyzeTools} navigation={navigation} />}
        <ToolsCard title={t('tools.plan')} items={planTools} navigation={navigation} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  content: { paddingBottom: 32 },
});

export default ToolsScreen;
