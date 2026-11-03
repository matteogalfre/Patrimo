/**
 * Frais : tout ce que coûtent les placements, en euros. Les frais des ETF
 * (TER, prélevés chaque jour dans le cours, donc invisibles) et le courtage
 * payé à chaque ordre, par an et en manque à gagner sur 20 ans.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import { BarChart } from '../components/charts';
import AssetLogo from '../components/AssetLogo';
import { effectiveTers, scanFees, terInfo } from '../core/fees';
import { formatDate, formatPercent } from '../utils/formatters';

const HIGH_TER = 0.5;

const FeesScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, formatAmount } = useSettings();
  const { assets, positions, transactions, fx, overview, totals } = usePortfolio();
  const { fees } = usePlanning();
  const account = route?.params?.account || null;

  const scan = useMemo(() => {
    const held = account ? positions.filter((p) => p.account === account && p.isHeld) : assets.filter((a) => a.isHeld);
    return scanFees({
      assets: held,
      fees: effectiveTers(fees),
      transactions: transactions.filter((x) => !account || x.account === account),
      fx,
      totalValue: account ? totals.byAccount?.[account]?.value || 0 : overview.value,
    });
  }, [account, assets, positions, transactions, fx, fees, overview.value, totals.byAccount]);

  const nameOf = (assetId) => assets.find((a) => a.assetId === assetId)?.name || assetId.split(':')[1];
  const symbolOf = (assetId) => assetId.split(':')[1];
  // « 0,12–0,14 % » quand le TER n'est connu qu'à une fourchette près.
  const terText = (assetId, ter) => {
    const info = terInfo(assetId, fees);
    if (info && info.min !== info.max) {
      return `${info.min.toLocaleString(locale, { minimumFractionDigits: 2 })}–${formatPercent(info.max, { showSign: false, decimals: 2 })}`;
    }
    return formatPercent(ter, { showSign: false, decimals: 2 });
  };
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const { ter, brokerage } = scan;
  const max = Math.max(ter.yearly, brokerage.last12.fees, 1);
  const empty = scan.yearly <= 0 && !scan.missingTer.length && !brokerage.byYear.some((y) => y.fees > 0);

  const share = (label, value, color) => (
    <View style={styles.shareRow}>
      <Text style={[styles.shareLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <View style={[styles.fill, { width: `${Math.max(value > 0 ? 3 : 0, (value / max) * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.shareValue, { color: theme.colors.text }]}>{formatAmount(value, { decimals: 0 })}</Text>
    </View>
  );

  const openAsset = (assetId) => navigation.navigate('AssetDetail', { assetId });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('fees.title')}{account ? ` · ${t(`accounts.short.${account}`)}` : ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {empty ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('fees.empty')}</Text>
          </View>
        ) : (
          <>
            {/* Bilan */}
            <View style={cardStyle}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('fees.yearlyTotal')}</Text>
              <Text style={[styles.big, { color: theme.colors.text }]}>{formatAmount(scan.yearly, { decimals: 0 })}</Text>
              {scan.pctOfWealth > 0 && (
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                  {t('fees.ofWealth', { value: formatPercent(scan.pctOfWealth, { showSign: false, decimals: 2 }) })}
                </Text>
              )}
              <View style={styles.shares}>
                {share(t('fees.terTitle'), ter.yearly, theme.colors.primary)}
                {share(t('fees.brokerageTitle'), brokerage.last12.fees, theme.colors.secondary)}
              </View>
              {scan.overYears > 0 && (
                <Text style={[styles.loss, { color: theme.colors.error }]}>
                  {t('fees.lossLine', { amount: formatAmount(scan.overYears, { decimals: 0 }), count: scan.years })}
                </Text>
              )}
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('fees.scanNote')}</Text>
            </View>

            {/* ETF et fonds */}
            {(ter.lines.length > 0 || scan.missingTer.length > 0) && (
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('fees.terTitle')}</Text>
                {ter.lines.map((l, i) => (
                  <TouchableOpacity
                    key={l.assetId}
                    onPress={() => openAsset(l.assetId)}
                    style={[styles.row, (i < ter.lines.length - 1 || scan.missingTer.length > 0) && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="button"
                  >
                    <AssetLogo assetId={l.assetId} symbol={symbolOf(l.assetId)} size={32} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{nameOf(l.assetId)}</Text>
                      <Text style={[styles.rowSub, { color: l.ter > HIGH_TER ? theme.colors.warning : theme.colors.textTertiary }]}>
                        {t('fees.terShort', { value: terText(l.assetId, l.ter) })}
                        {l.ter > HIGH_TER ? ` · ${t('fees.high')}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rowValue, { color: theme.colors.text }]}>{t('fees.amountPerYear', { amount: formatAmount(l.yearly, { decimals: 0 }) })}</Text>
                  </TouchableOpacity>
                ))}
                {scan.missingTer.map((a, i) => (
                  <TouchableOpacity
                    key={a.assetId}
                    onPress={() => openAsset(a.assetId)}
                    style={[styles.row, i < scan.missingTer.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="button"
                  >
                    <AssetLogo assetId={a.assetId} symbol={symbolOf(a.assetId)} size={32} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[styles.rowSub, { color: theme.colors.primary }]}>{t('fees.terMissing')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Courtage */}
            {brokerage.byYear.some((y) => y.fees > 0) && (
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('fees.brokerageTitle')}</Text>
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                  {t('fees.brokerageLast12', {
                    amount: formatAmount(brokerage.last12.fees, { decimals: 2 }),
                    pct: formatPercent(brokerage.last12.pct, { showSign: false, decimals: 2 }),
                  })}
                </Text>
                {brokerage.byAccount.map((a) => (
                  <View key={a.account} style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>{t(`accounts.${a.account}`)}</Text>
                    <Text style={[styles.lineValue, { color: theme.colors.text }]}>
                      {formatAmount(a.fees, { decimals: 2 })} · {formatPercent(a.pct, { showSign: false, decimals: 2 })}
                    </Text>
                  </View>
                ))}
                {brokerage.byYear.length > 1 && (
                  <View style={styles.chart}>
                    <BarChart
                      data={brokerage.byYear.map((y) => ({ label: String(y.year), caption: String(y.year), value: y.fees, pct: y.pct }))}
                      height={120}
                      color={theme.colors.primary}
                      mutedColor={theme.colors.primaryMuted}
                      textColor={theme.colors.text}
                      labelColor={theme.colors.textTertiary}
                      formatValue={(v, d) => `${formatAmount(v, { decimals: 2 })} (${formatPercent(d.pct, { showSign: false, decimals: 2 })})`}
                    />
                  </View>
                )}
                {brokerage.expensiveOrders.length > 0 && (
                  <>
                    <Text style={[styles.subTitle, { color: theme.colors.text }]}>{t('fees.expensiveTitle')}</Text>
                    {brokerage.expensiveOrders.map((o) => (
                      <TouchableOpacity
                        key={o.tx.id}
                        onPress={() => openAsset(o.tx.assetId)}
                        style={styles.orderRow}
                        accessibilityRole="button"
                      >
                        <View style={styles.rowMain}>
                          <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{o.tx.name || o.tx.symbol}</Text>
                          <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
                            {formatDate(o.tx.date, { locale })} · {t('fees.orderLine', { amount: formatAmount(o.amount, { decimals: 0 }), fees: formatAmount(o.fees, { decimals: 2 }) })}
                          </Text>
                        </View>
                        <Text style={[styles.rowValue, { color: theme.colors.warning }]}>{formatPercent(o.pct, { showSign: false, decimals: 1 })}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('fees.expensiveNote')}</Text>
                  </>
                )}
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
  sub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  shares: { marginTop: 14, gap: 8 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareLabel: { width: 120, fontSize: 13 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  shareValue: { width: 64, textAlign: 'right', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  loss: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 14 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  subTitle: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12 },
  rowValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineLabel: { fontSize: 14 },
  lineValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chart: { marginTop: 12 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});

export default FeesScreen;
