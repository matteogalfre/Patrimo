/**
 * Revenus passifs : dividendes reçus (par mois, par année, par actif) et
 * intérêts estimés des livrets, avec une projection sur 12 mois.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { BarChart } from '../components/charts';
import AssetLogo from '../components/AssetLogo';
import SegmentedControl from '../components/SegmentedControl';
import { CashRow } from '../components/Portfolio';
import { formatDate, formatPercent } from '../utils/formatters';

const PassiveIncomeScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, locale, formatAmount } = useSettings();
  const { income, cash } = usePortfolio();
  const [view, setView] = useState('months');

  const bars = useMemo(() => {
    const longMonths = t('months.long');
    const shortMonths = t('months.short');
    if (view === 'years') {
      return income.years.map((y) => ({ label: String(y.year), caption: String(y.year), value: y.total }));
    }
    return income.months.map((m) => ({
      // Une lettre par mois : douze libellés tiennent sur un téléphone.
      label: String(shortMonths[m.month] || '').charAt(0).toUpperCase(),
      caption: `${longMonths[m.month]} ${m.year}`,
      value: m.total,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, view, locale]);

  const upcoming = income.upcoming;
  const monthName = (date) => {
    const d = new Date(date);
    return `${t('months.long')[d.getMonth()]} ${d.getFullYear()}`;
  };
  const upcomingBars = useMemo(() => (upcoming?.months || []).map((m) => ({
    label: String(t('months.short')[m.month] || '').charAt(0).toUpperCase(),
    caption: `${t('months.long')[m.month]} ${m.year}`,
    value: m.total,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [upcoming, locale]);

  const interestAccounts = cash.accounts.filter((a) => a.yearlyInterest > 0);
  const isEmpty = income.total <= 0 && income.projectedInterest <= 0;
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('income.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.empty}>
            <Ionicons name="cash-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('income.empty')}</Text>
          </View>
        ) : (
          <>
            <View style={cardStyle}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('income.projected')}</Text>
              <Text style={[styles.big, { color: theme.colors.text }]}>{formatAmount(income.projected, { decimals: 0 })}</Text>
              <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                {t('income.projectedDetail', {
                  dividends: formatAmount(income.projectedDividends, { decimals: 0 }),
                  interest: formatAmount(income.projectedInterest, { decimals: 0 }),
                })}
              </Text>
              {income.projectedDividends > 0 && (
                <View style={styles.yields}>
                  <View style={[styles.yieldBox, { backgroundColor: theme.colors.backgroundSecondary }]}>
                    <Text style={[styles.yieldValue, { color: theme.colors.text }]}>
                      {formatPercent(income.yieldOnCost, { showSign: false, decimals: 2 })}
                    </Text>
                    <Text style={[styles.yieldLabel, { color: theme.colors.textTertiary }]}>{t('income.yieldOnCost')}</Text>
                  </View>
                  <View style={[styles.yieldBox, { backgroundColor: theme.colors.backgroundSecondary }]}>
                    <Text style={[styles.yieldValue, { color: theme.colors.text }]}>
                      {formatPercent(income.currentYield, { showSign: false, decimals: 2 })}
                    </Text>
                    <Text style={[styles.yieldLabel, { color: theme.colors.textTertiary }]}>{t('income.currentYield')}</Text>
                  </View>
                </View>
              )}
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('income.projectionNote')}</Text>
            </View>

            {upcoming?.items.length > 0 && (
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('income.upcomingTitle')}</Text>
                <Text style={[styles.sub, styles.upcomingLead, { color: theme.colors.textSecondary }]}>
                  {t('income.next', {
                    name: upcoming.items[0].name,
                    month: monthName(upcoming.items[0].date),
                    amount: formatAmount(upcoming.items[0].amount, { decimals: 0 }),
                  })}
                </Text>
                <BarChart
                  data={upcomingBars}
                  defaultIndex={Math.max(0, upcomingBars.findIndex((b) => b.value > 0))}
                  color={theme.colors.primary}
                  mutedColor={theme.colors.primaryMuted}
                  textColor={theme.colors.text}
                  labelColor={theme.colors.textTertiary}
                  formatValue={(v) => formatAmount(v, { decimals: 0 })}
                />
                {upcoming.items.map((it, i) => (
                  <TouchableOpacity
                    key={`${it.assetId}-${it.date}`}
                    onPress={() => navigation.navigate('AssetDetail', { assetId: it.assetId })}
                    style={[styles.row, i === 0 && styles.firstRow, i < upcoming.items.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="button"
                  >
                    <AssetLogo assetId={it.assetId} symbol={it.symbol} size={32} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{it.name}</Text>
                      <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
                        {monthName(it.date)} · {t(`accounts.short.${it.account}`)}
                      </Text>
                    </View>
                    <Text style={[styles.rowValue, { color: theme.colors.text }]}>≈ {formatAmount(it.amount, { decimals: 0 })}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('income.upcomingNote')}</Text>
              </View>
            )}

            {income.total > 0 && (
              <View style={cardStyle}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('income.received')}</Text>
                  <SegmentedControl
                    options={['months', 'years'].map((v) => ({ key: v, label: t(`income.views.${v}`) }))}
                    value={view}
                    onChange={setView}
                    variant="inCard"
                    size="sm"
                    accessibilityRole="button"
                  />
                </View>
                <BarChart
                  data={bars}
                  color={theme.colors.primary}
                  mutedColor={theme.colors.primaryMuted}
                  textColor={theme.colors.text}
                  labelColor={theme.colors.textTertiary}
                  formatValue={(v) => formatAmount(v)}
                />
                <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                  {t('income.ttm', { amount: formatAmount(income.ttm) })} · {t('income.allTime', { amount: formatAmount(income.total) })}
                </Text>
              </View>
            )}

            {income.byAsset.length > 0 && (
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, styles.listTitle, { color: theme.colors.text }]}>{t('income.byAsset')}</Text>
                {income.byAsset.map((a, i) => (
                  <TouchableOpacity
                    key={a.assetId || a.symbol}
                    disabled={!a.assetId}
                    onPress={() => navigation.navigate('AssetDetail', { assetId: a.assetId })}
                    style={[styles.row, i < income.byAsset.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="button"
                  >
                    <AssetLogo assetId={a.assetId} symbol={a.symbol} size={32} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
                        {t('income.payments', { count: a.count })} · {t('income.lastPayment', { date: formatDate(a.last, { locale }) })}
                      </Text>
                    </View>
                    <Text style={[styles.rowValue, { color: theme.colors.text }]}>{formatAmount(a.total)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {interestAccounts.length > 0 && (
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, styles.listTitle, { color: theme.colors.text }]}>{t('income.interest')}</Text>
                {interestAccounts.map((a, i) => (
                  <CashRow
                    key={a.id}
                    account={{ ...a, value: a.yearlyInterest }}
                    onPress={() => navigation.navigate('CashAccount', { accountId: a.id })}
                    isLast={i === interestAccounts.length - 1}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '500' },
  big: { fontSize: 30, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 13, marginTop: 4 },
  yields: { flexDirection: 'row', gap: 10, marginTop: 14 },
  yieldBox: { flex: 1, borderRadius: 12, padding: 12 },
  yieldValue: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  yieldLabel: { fontSize: 11, marginTop: 2 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  listTitle: { marginBottom: 4 },
  upcomingLead: { marginBottom: 12 },
  firstRow: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12 },
  rowValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default PassiveIncomeScreen;
