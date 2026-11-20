/**
 * Diversification : où est vraiment investi l'argent placé en actions et
 * ETF, par pays, par secteur et par société. Les ETF sont décomposés selon
 * l'indice qu'ils suivent ; ce qui n'est pas classé est listé pour être
 * corrigé. La vue « Titres » montre les sociétés qu'on détient à travers
 * ses ETF et les doublons entre ETF.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { usePlanning } from '../context/PlanningContext';
import AllocationChart from '../components/AllocationChart';
import AssetLogo from '../components/AssetLogo';
import SegmentedControl from '../components/SegmentedControl';
import { computeExposure, diversificationInsights } from '../core/exposure';
import { EXPOSURE_AS_OF } from '../constants/exposureData';
import { HOLDINGS_AS_OF } from '../constants/indexHoldings';
import { etfPairs, underlyingCompanies } from '../core/overlap';
import { OTHERS_COLOR, paletteColor } from '../utils/assetColors';
import { formatDate, formatPercent } from '../utils/formatters';

const MAX_SLICES = 8;
const INSIGHT_ICONS = { warning: 'alert-circle', info: 'information-circle', good: 'checkmark-circle' };

const DiversificationScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, locale, formatAmount } = useSettings();
  const { assets, overview } = usePortfolio();
  const { exposure: overrides } = usePlanning();
  const [view, setView] = useState('countries');

  const exposure = useMemo(() => computeExposure(assets.filter((a) => a.isHeld), overrides), [assets, overrides]);
  const insights = useMemo(() => diversificationInsights(exposure), [exposure]);
  const companies = useMemo(
    () => underlyingCompanies(assets.filter((a) => a.isHeld), { overrides, total: overview.value }),
    [assets, overrides, overview.value],
  );
  const pairs = useMemo(() => etfPairs(assets.filter((a) => a.isHeld), overrides), [assets, overrides]);
  const isHoldings = view === 'holdings';
  const labelOf = (key) => (view === 'countries' ? t(`countries.${key}`) : t(`sectors.${key}`));
  // La vue « Titres » garde les répartitions par pays pour le reste de l'écran.
  const list = exposure[isHoldings ? 'countries' : view];
  const unknown = exposure.unknown[isHoldings ? 'countries' : view];

  const slices = useMemo(() => {
    const top = list.filter((x) => x.key !== 'OTHER').slice(0, MAX_SLICES);
    const rest = list.filter((x) => !top.includes(x)).reduce((s, x) => s + x.value, 0) + unknown.value;
    const out = top.map((x, i) => ({ name: labelOf(x.key), value: x.value, color: paletteColor(i) }));
    if (rest > 0) out.push({ name: unknown.value > 0 && rest === unknown.value ? t('diversification.unknown') : t('dashboard.others'), value: rest, color: OTHERS_COLOR });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, unknown.value, view, locale]);

  const leader = list.find((x) => x.key !== 'OTHER');
  const isMissing = (a) => (a.kind === 'etf' ? !a.profile : !(view === 'sectors' ? a.sector : a.country));
  const toFix = exposure.assets.filter(isMissing);
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const levelColor = { warning: theme.colors.warning, info: theme.colors.textTertiary, good: theme.colors.success };
  const pct = (v) => formatPercent(v, { showSign: false, decimals: 0 });

  // Texte d'un constat : les valeurs brutes deviennent noms et pourcentages.
  const insightText = (it) => t(`diversification.insights.${it.key}`, {
    name: it.country ? t(`countries.${it.country}`) : it.sector ? t(`sectors.${it.sector}`) : '',
    pct: it.pct != null ? pct(it.pct) : '',
    world: it.world != null ? pct(it.world) : '',
    sp: it.sp != null ? pct(it.sp) : '',
    count: it.count,
    names: (it.sectors || []).map((k) => t(`sectors.${k}`).toLowerCase()).join(', '),
  });

  const describe = (a) => {
    if (a.kind === 'etf') return a.profile ? t('diversification.tracks', { index: t(`indices.${a.profile}`) }) : t('diversification.etfUnknown');
    const parts = [a.country ? t(`countries.${a.country}`) : null, a.sector ? t(`sectors.${a.sector}`) : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : t('diversification.stockUnknown');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('diversification.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {exposure.total <= 0 ? (
          <View style={styles.empty}>
            <Ionicons name="globe-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('diversification.empty')}</Text>
          </View>
        ) : (
          <>
            <SegmentedControl
              options={['countries', 'sectors', 'holdings'].map((k) => ({ key: k, label: t(`diversification.views.${k}`) }))}
              value={view}
              onChange={setView}
              variant="track"
              fill
            />

            {isHoldings ? (
              <>
                <View style={[cardStyle, styles.first]}>
                  {companies.length > 0 ? (
                    <>
                      <Text style={[styles.lead, { color: theme.colors.text }]}>
                        {t('diversification.holdingsLead', { name: companies[0].name, pct: formatPercent(companies[0].pct, { showSign: false, decimals: 1 }) })}
                      </Text>
                      {companies.map((c, i) => {
                        const via = [...new Set(c.sources.filter((x) => !x.direct).map((x) => x.name))];
                        const direct = c.sources.some((x) => x.direct);
                        return (
                          <View
                            key={c.ticker}
                            style={[styles.row, i < companies.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                          >
                            <AssetLogo assetId={`stock:${c.ticker}`} symbol={c.ticker} size={32} />
                            <View style={styles.rowMain}>
                              <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{c.name}</Text>
                              <Text style={[styles.rowSub, { color: direct && via.length ? theme.colors.warning : theme.colors.textTertiary }]} numberOfLines={2}>
                                {[via.length ? t('diversification.via', { names: via.join(', ') }) : null, direct ? t('diversification.direct') : null].filter(Boolean).join(' + ')}
                              </Text>
                            </View>
                            <View style={styles.rowRight}>
                              <Text style={[styles.rowValue, { color: theme.colors.text }]}>{formatPercent(c.pct, { showSign: false, decimals: 1 })}</Text>
                              <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>{formatAmount(c.value, { decimals: 0 })}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  ) : (
                    <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>{t('diversification.holdingsEmpty')}</Text>
                  )}
                  <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                    {t('diversification.holdingsSource', { date: formatDate(HOLDINGS_AS_OF, { locale }) })}
                  </Text>
                </View>

                {pairs.length > 0 && (
                  <View style={cardStyle}>
                    <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('diversification.overlapTitle')}</Text>
                    {pairs.map((p) => (
                      <View key={`${p.a.assetId}-${p.b.assetId}`} style={styles.insight}>
                        <Ionicons
                          name={p.overlap >= 50 ? INSIGHT_ICONS.warning : INSIGHT_ICONS.info}
                          size={18}
                          color={p.overlap >= 50 ? theme.colors.warning : theme.colors.textTertiary}
                          style={styles.insightIcon}
                        />
                        <Text style={[styles.insightText, { color: theme.colors.text }]}>
                          {t(p.overlap >= 99.5 ? 'diversification.overlapSame' : 'diversification.overlapLine', {
                            a: p.a.name,
                            b: p.b.name,
                            pct: formatPercent(p.overlap, { showSign: false, decimals: 0 }),
                          })}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={[cardStyle, styles.first]}>
                {leader && (
                  <Text style={[styles.lead, { color: theme.colors.text }]}>
                    {t('diversification.lead', { pct: pct(leader.pct), name: labelOf(leader.key) })}
                  </Text>
                )}
                <View style={styles.chart}>
                  <AllocationChart data={slices} theme={theme} formatAmount={formatAmount} />
                </View>
                <Text style={[styles.footnote, { color: theme.colors.textTertiary }]}>
                  {t('diversification.scope', { amount: formatAmount(exposure.total, { decimals: 0 }) })}
                </Text>
              </View>
            )}

            {!isHoldings && insights[view].length > 0 && (
              <View style={cardStyle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('diversification.insightsTitle')}</Text>
                {insights[view].map((it) => (
                  <View key={it.key} style={styles.insight}>
                    <Ionicons name={INSIGHT_ICONS[it.level]} size={18} color={levelColor[it.level]} style={styles.insightIcon} />
                    <Text style={[styles.insightText, { color: theme.colors.text }]}>{insightText(it)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={cardStyle}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('diversification.assetsTitle')}</Text>
              {exposure.assets.map((a, i) => {
                const missing = toFix.includes(a);
                return (
                  <TouchableOpacity
                    key={a.assetId}
                    onPress={() => navigation.navigate('AssetDetail', { assetId: a.assetId })}
                    style={[styles.row, i < exposure.assets.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="button"
                  >
                    <AssetLogo assetId={a.assetId} symbol={a.symbol} size={32} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[styles.rowSub, { color: missing ? theme.colors.primary : theme.colors.textTertiary }]} numberOfLines={1}>
                        {describe(a)}{a.source === 'manual' ? ` · ${t('diversification.manual')}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>
                      {formatPercent((a.value / exposure.total) * 100, { showSign: false, decimals: 0 })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.source, { color: theme.colors.textTertiary }]}>
              {t('diversification.source', { date: formatDate(EXPOSURE_AS_OF, { locale }) })}
            </Text>
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
  first: { marginTop: 12 },
  lead: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  insight: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  insightIcon: { marginTop: 1 },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  chart: { marginTop: 16 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12 },
  rowValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  source: { fontSize: 11, lineHeight: 15, marginTop: 4, paddingHorizontal: 4 },
});

export default DiversificationScreen;
