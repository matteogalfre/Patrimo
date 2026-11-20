/**
 * Frais : tout ce que coûtent les placements, en euros. Les frais des ETF
 * (TER, prélevés chaque jour dans le cours, donc invisibles) et le courtage
 * payé à chaque ordre, situés face aux repères du marché : les ETF du même
 * indice, un fonds actif, et les mêmes ordres chez les autres courtiers.
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
import { BROKERAGE_LEVELS, compareBrokers, levelOf, nextPurchasesCost, peerComparison, savingsVersus, TER_LEVELS } from '../core/feeInsights';
import { useMyNumbers } from '../hooks/useMyNumbers';
import { classify } from '../core/exposure';
import { institutionById } from '../core/institutions';
import { normalizeRule } from '../core/brokerFees';
import { tariffLabel } from '../constants/brokerTariffs';
import { ACTIVE_FUND_TER, REFERENCE_ETFS } from '../constants/etfBenchmarks';
import { ACCOUNTS } from '../core/assets';
import { formatDate, formatPercent } from '../utils/formatters';

const HIGH_TER = 0.5;

const FeesScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const { t, locale, formatAmount } = useSettings();
  const { assets, positions, transactions, fx, overview, totals } = usePortfolio();
  const { fees, brokerRules, ttf, accountInstitutions, plans } = usePlanning();
  const monthlyInvest = useMyNumbers().invest || 0;
  const account = route?.params?.account || null;

  const held = useMemo(
    () => (account ? positions.filter((p) => p.account === account && p.isHeld) : assets.filter((a) => a.isHeld)),
    [account, assets, positions],
  );

  const scan = useMemo(() => scanFees({
    assets: held,
    fees: effectiveTers(fees),
    transactions: transactions.filter((x) => !account || x.account === account),
    fx,
    totalValue: account ? totals.byAccount?.[account]?.value || 0 : overview.value,
  }), [account, held, transactions, fx, fees, overview.value, totals.byAccount]);

  // Les mêmes ordres chez les autres courtiers, enveloppe par enveloppe.
  const comparisons = useMemo(
    () => [ACCOUNTS.PEA, ACCOUNTS.CTO, ACCOUNTS.CRYPTO]
      .filter((a) => !account || a === account)
      .map((a) => compareBrokers({ transactions, fx, account: a, ttf }))
      .filter((c) => c && c.paid > 0 && c.options.length > 1),
    [account, transactions, fx, ttf],
  );

  // Tes achats des 12 prochains mois chez chaque courtier : achats programmés, sinon le budget.
  const upcoming = useMemo(() => {
    const rules = Object.fromEntries(Object.entries(brokerRules || {}).map(([k, v]) => [k, normalizeRule(v)]).filter(([, v]) => v && v.type !== 'none'));
    const res = nextPurchasesCost({ plans, transactions, monthlyInvest, fx, ttf, rules });
    return res ? { ...res, accounts: res.accounts.filter((a) => !account || a.account === account) } : null;
  }, [plans, transactions, monthlyInvest, fx, ttf, brokerRules, account]);

  const terLevel = scan.ter.averageTer > 0 ? levelOf(scan.ter.averageTer, TER_LEVELS) : null;
  const brokerageLevel = scan.brokerage.last12.amount > 0 && scan.brokerage.last12.fees > 0
    ? levelOf(scan.brokerage.last12.pct, BROKERAGE_LEVELS)
    : null;
  const vsActive = ACTIVE_FUND_TER ? savingsVersus(scan.ter, held, ACTIVE_FUND_TER.value) : null;
  const levelColor = (level) => ({ veryLow: theme.colors.success, low: theme.colors.success, average: theme.colors.warning, high: theme.colors.error }[level]);
  const peersOf = (assetId) => {
    const a = assets.find((x) => x.assetId === assetId);
    const profile = a ? classify(a).profile : null;
    return profile && REFERENCE_ETFS[profile] ? { profile, peers: REFERENCE_ETFS[profile] } : null;
  };

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
              {(terLevel || brokerageLevel) && (
                <View style={styles.verdicts}>
                  {terLevel && (
                    <View style={styles.verdictRow}>
                      <View style={[styles.verdictDot, { backgroundColor: levelColor(terLevel) }]} />
                      <Text style={[styles.verdictText, { color: theme.colors.text }]}>
                        <Text style={{ fontWeight: '700' }}>{t(`fees.levels.${terLevel}`)}</Text>
                        {' '}{t('fees.terVerdict', { value: formatPercent(scan.ter.averageTer, { showSign: false, decimals: 2 }) })}
                      </Text>
                    </View>
                  )}
                  {brokerageLevel && (
                    <View style={styles.verdictRow}>
                      <View style={[styles.verdictDot, { backgroundColor: levelColor(brokerageLevel) }]} />
                      <Text style={[styles.verdictText, { color: theme.colors.text }]}>
                        <Text style={{ fontWeight: '700' }}>{t(`fees.levels.${brokerageLevel}`)}</Text>
                        {' '}{t('fees.brokerageVerdict', { value: formatPercent(scan.brokerage.last12.pct, { showSign: false, decimals: 2 }) })}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {vsActive && (
                <Text style={[styles.good, { color: theme.colors.success }]}>
                  {t('fees.vsActive', {
                    ter: formatPercent(ACTIVE_FUND_TER.value, { showSign: false, decimals: 1 }),
                    amount: formatAmount(vsActive.saving, { decimals: 0 }),
                  })}
                </Text>
              )}
              {/* Le manque à gagner ne parle que quand les frais pèsent vraiment. */}
              {scan.overYears > 0 && (terLevel === 'high' || brokerageLevel === 'high') && (
                <Text style={[styles.loss, { color: theme.colors.error }]}>
                  {t('fees.lossLine', { amount: formatAmount(scan.overYears, { decimals: 0 }), count: scan.years })}
                </Text>
              )}
              <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                {t('fees.scanNote')}{ACTIVE_FUND_TER ? ` ${t('fees.activeSource', { source: ACTIVE_FUND_TER.label })}` : ''}
              </Text>
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
                      {(() => {
                        const ref = peersOf(l.assetId);
                        const cmp = ref ? peerComparison(l.ter, ref.peers) : null;
                        if (!cmp) return null;
                        // Un ETF éligible au PEA se compare aussi aux autres ETF éligibles.
                        const symbol = symbolOf(l.assetId);
                        const own = ref.peers.find((p) => p.ticker === symbol || p.alt?.includes(symbol));
                        const pea = own?.pea && cmp.cheapestPea && cmp.cheapestPea.ter < l.ter ? cmp.cheapestPea : null;
                        return (
                          <>
                            <Text style={[styles.rowSub, { color: cmp.rank === 'priciest' ? theme.colors.warning : theme.colors.textSecondary }]}>
                              {t(`fees.peer.${cmp.rank}`, {
                                index: t(`indices.${ref.profile}`),
                                min: formatPercent(cmp.min, { showSign: false, decimals: 2 }),
                                max: formatPercent(cmp.max, { showSign: false, decimals: 2 }),
                              })}
                            </Text>
                            {pea && (
                              <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                                {t('fees.peerPea', { name: pea.name, ter: formatPercent(pea.ter, { showSign: false, decimals: 2 }) })}
                                {l.ter - pea.ter <= 0.05 ? ` ${t('fees.peerPeaSmall')}` : ''}
                              </Text>
                            )}
                          </>
                        );
                      })()}
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

            {/* Tes ordres chez les autres courtiers */}
            {comparisons.map((c) => {
              const current = normalizeRule(brokerRules?.[c.account]);
              const currentId = current?.type === 'tariff' ? current.id : null;
              const best = c.options[0];
              const shown = c.options.slice(0, 5);
              if (currentId && !shown.some((o) => o.tariff.id === currentId)) {
                const mine = c.options.find((o) => o.tariff.id === currentId);
                if (mine) shown.push(mine);
              }
              const top = Math.max(c.paid, ...shown.map((o) => o.total), 0.01);
              const cheaper = c.paid - best.total;
              return (
                <View key={c.account} style={cardStyle}>
                  <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('fees.compareTitle', { account: t(`accounts.${c.account}`) })}</Text>
                  <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                    {t(c.period === 'last12' ? 'fees.compareSub' : 'fees.compareSubAll', { count: c.orders, amount: formatAmount(c.amount, { decimals: 0 }) })}
                  </Text>
                  <View style={styles.shares}>
                    <View style={styles.shareRow}>
                      <Text style={[styles.brokerName, { color: theme.colors.text, fontWeight: '700' }]} numberOfLines={1}>{t('fees.comparePaid')}</Text>
                      <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                        <View style={[styles.fill, { width: `${Math.max(3, (c.paid / top) * 100)}%`, backgroundColor: theme.colors.primary }]} />
                      </View>
                      <Text style={[styles.shareValue, { color: theme.colors.text }]}>{formatAmount(c.paid, { decimals: 0 })}</Text>
                    </View>
                    {shown.map((o) => {
                      const inst = institutionById(o.tariff.institution);
                      const isCurrent = o.tariff.id === currentId || (!currentId && o.tariff.institution === accountInstitutions?.[c.account]);
                      return (
                        <View key={o.tariff.id} style={styles.shareRow}>
                          <View style={styles.brokerCell}>
                            {inst && <AssetLogo institution={inst} size={18} />}
                            <Text style={[styles.brokerName, { color: theme.colors.textSecondary, fontWeight: isCurrent ? '700' : '400' }]} numberOfLines={1}>
                              {tariffLabel(o.tariff)}
                            </Text>
                          </View>
                          <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                            <View style={[styles.fill, { width: `${Math.max(o.total > 0 ? 3 : 0, (o.total / top) * 100)}%`, backgroundColor: o === best ? theme.colors.success : theme.colors.secondary }]} />
                          </View>
                          <Text style={[styles.shareValue, { color: theme.colors.text }]}>{formatAmount(o.total, { decimals: 0 })}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[styles.sub, { color: cheaper > 1 ? theme.colors.text : theme.colors.success, marginTop: 12 }]}>
                    {cheaper > 1
                      ? t('fees.compareCheaper', { broker: tariffLabel(best.tariff), amount: formatAmount(cheaper, { decimals: 0 }) })
                      : t('fees.compareBest')}
                  </Text>
                  <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('fees.compareNote')}</Text>
                </View>
              );
            })}

            {/* Tes achats des 12 prochains mois, chez chaque courtier */}
            {upcoming?.accounts.map((c) => {
              const current = normalizeRule(brokerRules?.[c.account]);
              const currentId = current?.type === 'tariff' ? current.id : null;
              const best = c.options[0];
              const shown = c.options.slice(0, 5);
              const mine = currentId ? c.options.find((o) => o.tariff.id === currentId) : null;
              if (mine && !shown.includes(mine)) shown.push(mine);
              const top = Math.max(c.current || 0, ...shown.map((o) => o.total), 0.01);
              const saving = c.current != null ? c.current - best.total : null;
              return (
                <View key={`next-${c.account}`} style={cardStyle}>
                  <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('fees.nextTitle', { account: t(`accounts.${c.account}`) })}</Text>
                  <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                    {t(upcoming.source === 'plans' ? 'fees.nextFromPlans' : 'fees.nextFromBudget', { amount: formatAmount(c.monthly, { decimals: 0 }) })}
                  </Text>
                  <View style={styles.shares}>
                    {c.current != null && !mine && (
                      <View style={styles.shareRow}>
                        <Text style={[styles.brokerName, { color: theme.colors.text, fontWeight: '700' }]} numberOfLines={1}>{t('fees.nextCurrent')}</Text>
                        <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                          <View style={[styles.fill, { width: `${Math.max(c.current > 0 ? 3 : 0, (c.current / top) * 100)}%`, backgroundColor: theme.colors.primary }]} />
                        </View>
                        <Text style={[styles.shareValue, { color: theme.colors.text }]}>{formatAmount(c.current, { decimals: 0 })}</Text>
                      </View>
                    )}
                    {shown.map((o) => {
                      const inst = institutionById(o.tariff.institution);
                      const isCurrent = o === mine;
                      return (
                        <View key={o.tariff.id} style={styles.shareRow}>
                          <View style={styles.brokerCell}>
                            {inst && <AssetLogo institution={inst} size={18} />}
                            <Text style={[styles.brokerName, { color: isCurrent ? theme.colors.text : theme.colors.textSecondary, fontWeight: isCurrent ? '700' : '400' }]} numberOfLines={1}>
                              {tariffLabel(o.tariff)}{o.viaPlan ? ` · ${t('fees.nextViaPlan')}` : ''}
                            </Text>
                          </View>
                          <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
                            <View style={[styles.fill, { width: `${Math.max(o.total > 0 ? 3 : 0, (o.total / top) * 100)}%`, backgroundColor: o === best ? theme.colors.success : isCurrent ? theme.colors.primary : theme.colors.secondary }]} />
                          </View>
                          <Text style={[styles.shareValue, { color: theme.colors.text }]}>{formatAmount(o.total, { decimals: 0 })}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[styles.sub, { color: saving != null && saving > 1 ? theme.colors.text : theme.colors.success, marginTop: 12 }]}>
                    {saving != null && saving > 1
                      ? t('fees.nextCheaper', { broker: tariffLabel(best.tariff), amount: formatAmount(saving, { decimals: 0 }) })
                      : saving != null
                        ? t('fees.nextBest')
                        : t('fees.nextCheapest', { broker: tariffLabel(best.tariff), amount: formatAmount(best.total, { decimals: 0 }) })}
                  </Text>
                  <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>{t('fees.nextNote')}</Text>
                </View>
              );
            })}
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
  good: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 12 },
  verdicts: { marginTop: 16, gap: 8 },
  verdictRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  verdictDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  verdictText: { flex: 1, fontSize: 14, lineHeight: 20 },
  brokerCell: { width: 120, flexDirection: 'row', alignItems: 'center', gap: 6 },
  brokerName: { flexShrink: 1, fontSize: 13 },
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
