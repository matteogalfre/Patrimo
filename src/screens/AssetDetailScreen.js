/**
 * Fiche d'un actif : cours et historique, positions par enveloppe, et toutes
 * les opérations (modifiables, supprimables). Les achats et ventes sont
 * marqués sur le graphique.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { useAlerts } from '../context/AlertsContext';
import { usePlanning } from '../context/PlanningContext';
import { BarChart, LineChartSkia } from '../components/charts';
import { ConfirmModal, InputSheet, OptionSheet } from '../components';
import AlertsModal from '../components/Alerts/AlertsModal';
import { marketData } from '../services/marketData';
import { ACCOUNT_ORDER, ASSET_TYPES, parseAssetId } from '../core/assets';
import AssetLogo from '../components/AssetLogo';
import AccountInstitution from '../components/Portfolio/AccountInstitution';
import ChangeBadge from '../components/ChangeBadge';
import SegmentedControl from '../components/SegmentedControl';
import { formatDate, formatDateKey, formatPercent } from '../utils/formatters';
import { classify } from '../core/exposure';
import { terInfo } from '../core/fees';
import { historicalReturns } from '../core/assetReturns';
import { sincePurchase } from '../core/performance';
import { COUNTRIES, INDEX_HISTORY, INDEX_KEYS, SECTORS } from '../constants/exposureData';
import { normalizeNumber } from '../utils/parseNumber';

const DAY = 24 * 60 * 60 * 1000;
const PERIODS = [
  { key: '1M', days: 30 },
  { key: '3M', days: 91 },
  { key: '1Y', days: 365 },
  { key: '5Y', days: 1826 },
  { key: 'MAX', days: 5000 },
];
const MAX_POINTS = 120;
const LONG_HISTORY_DAYS = 5000;

const AssetDetailScreen = ({ route, navigation }) => {
  const theme = useTheme();
  const { t, locale, formatAmount, formatPrice, formatQty } = useSettings();
  const {
    getAsset,
    positions,
    quotes,
    getTransactionsFor,
    getDividendsFor,
    getAssetHistory,
    deleteTransactions,
    deleteDividends,
    deletePosition,
    fx,
  } = usePortfolio();
  const { getAlertsFor } = useAlerts();
  const { fees, setFee, exposure, setExposure } = usePlanning();

  const { assetId, account: focusAccount = null } = route.params || {};
  const asset = getAsset(assetId);
  const parsed = parseAssetId(assetId);
  const symbol = asset?.symbol || parsed.symbol;
  const assetType = asset?.assetType || parsed.type;
  const quote = quotes[assetId];
  const color = theme.colors.primary;

  const assetPositions = useMemo(
    () => positions
      .filter((p) => p.assetId === assetId)
      .sort((a, b) => ACCOUNT_ORDER.indexOf(a.account) - ACCOUNT_ORDER.indexOf(b.account)),
    [positions, assetId],
  );
  const transactions = getTransactionsFor(assetId);
  const dividends = getDividendsFor(assetId);
  const operations = useMemo(
    () => [
      ...transactions.map((x) => ({ ...x, kind: 'tx' })),
      ...dividends.map((x) => ({ ...x, kind: 'div' })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions, dividends],
  );

  const [period, setPeriod] = useState('1Y');
  const [history, setHistory] = useState({ points: [], currency: null });
  const [loadingChart, setLoadingChart] = useState(true);
  const [selected, setSelected] = useState(null);
  const [scrubIndex, setScrubIndex] = useState(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [editFee, setEditFee] = useState(false);
  // Classement pour la diversification : 'profile' | 'country' | 'sector'.
  const [exposurePick, setExposurePick] = useState(null);

  const activeAlerts = getAlertsFor(assetId).filter((a) => a.enabled && !a.triggered).length;

  // Rendement moyen : cours quotidiens sur ~13 ans (précis, année par année),
  // complétés pour une action plus ancienne par l'historique hebdomadaire complet (20, 30 ans).
  const [returns, setReturns] = useState(null);
  const [showReturnsInfo, setShowReturnsInfo] = useState(false);
  useEffect(() => {
    let alive = true;
    const from = new Date(Date.now() - LONG_HISTORY_DAYS * DAY);
    (async () => {
      const { series, currencies } = await marketData.getHistories([{ assetId, assetType, symbol }], from);
      const s = series[assetId] || {};
      const keys = Object.keys(s).sort();
      const r = historicalReturns(keys.map((k) => ({ key: k, price: s[k] })));
      if (!r) return null;
      const older = assetType === ASSET_TYPES.STOCK && keys[0] <= formatDateKey(new Date(from.getTime() + 30 * DAY));
      if (older) {
        const long = historicalReturns(await marketData.getWeeklyHistory(symbol).catch(() => []));
        if (long) {
          r.horizons = [...r.horizons, ...long.horizons.filter((h) => h.years > 10)];
          r.since = long.since;
        }
      }
      return { ...r, currency: currencies[assetId] || null };
    })()
      .then((value) => alive && setReturns(value))
      .catch(() => alive && setReturns(null));
    return () => {
      alive = false;
    };
  }, [assetId, assetType, symbol]);

  const hasReturns = !!returns && (returns.horizons.length > 0 || !!returns.since);

  // Pour un ETF reconnu : la moyenne de son indice sur plusieurs décennies.
  const trackedIndex = assetType === ASSET_TYPES.STOCK ? classify({ symbol, name: asset?.name || symbol }, exposure[assetId]) : null;
  const indexKey = trackedIndex?.kind === 'etf' && INDEX_HISTORY[trackedIndex.profile] ? trackedIndex.profile : null;
  const [indexReturns, setIndexReturns] = useState(null);
  useEffect(() => {
    if (!indexKey) {
      setIndexReturns(null);
      return undefined;
    }
    let alive = true;
    marketData
      .getWeeklyHistory(INDEX_HISTORY[indexKey].symbol)
      .then((points) => alive && setIndexReturns(historicalReturns(points)))
      .catch(() => alive && setIndexReturns(null));
    return () => {
      alive = false;
    };
  }, [indexKey]);

  useEffect(() => {
    let alive = true;
    setLoadingChart(true);
    setSelected(null);
    const days = PERIODS.find((p) => p.key === period)?.days || 365;
    const from = new Date(Date.now() - days * DAY);
    const fromKey = formatDateKey(from);
    // L'historique chargé pour le portefeuille suffit s'il couvre la période
    // et s'arrête il y a moins de 5 jours : pas de nouvelle requête.
    const cached = getAssetHistory(assetId);
    if (cached.series && cached.keys.length && cached.keys[0] <= fromKey && cached.keys[cached.keys.length - 1] >= formatDateKey(Date.now() - 5 * DAY)) {
      setHistory({ points: cached.keys.filter((k) => k >= fromKey).map((k) => ({ key: k, price: cached.series[k] })), currency: cached.currency });
      setLoadingChart(false);
      return undefined;
    }
    marketData
      .getHistories([{ assetId, assetType, symbol }], from)
      .then(({ series, currencies }) => {
        if (!alive) return;
        const s = series[assetId] || {};
        const points = Object.keys(s).sort().filter((k) => k >= fromKey).map((k) => ({ key: k, price: s[k] }));
        setHistory({ points, currency: currencies[assetId] || null });
      })
      .catch(() => alive && setHistory({ points: [], currency: null }))
      .finally(() => alive && setLoadingChart(false));
    return () => {
      alive = false;
    };
    // L'historique en cache n'est relu qu'au changement d'actif ou de période.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, assetType, symbol, period]);

  const chart = useMemo(() => {
    const all = history.points;
    if (all.length < 2) return null;
    const txDays = new Map();
    const addOp = (k, op) => {
      if (!txDays.has(k)) txDays.set(k, []);
      txDays.get(k).push(op);
    };
    transactions.forEach((tx) => addOp(formatDateKey(tx.date), { ...tx, kind: 'tx' }));
    // Un dividende versé un jour sans cotation se place sur la séance précédente.
    dividends.forEach((d) => {
      const k = formatDateKey(d.date);
      let at = null;
      for (let i = all.length - 1; i >= 0; i -= 1) {
        if (all[i].key <= k) {
          at = all[i].key;
          break;
        }
      }
      if (at) addOp(at, { ...d, kind: 'div' });
    });
    // Échantillonnage, en gardant les jours d'opération.
    const step = Math.max(1, Math.ceil(all.length / MAX_POINTS));
    const sampled = all.filter((p, i) => i % step === 0 || i === all.length - 1 || txDays.has(p.key));
    const markers = {};
    const markerOps = {};
    sampled.forEach((p, i) => {
      const ops = txDays.get(p.key);
      if (!ops) return;
      const trades = ops.filter((o) => o.kind === 'tx');
      if (trades.length) {
        const net = trades.reduce((s, o) => s + (o.side === 'sell' ? -o.quantity : o.quantity), 0);
        markers[i] = { radius: 6, isSell: net < 0, accessibilityLabel: `${t(`transaction.modes.${net < 0 ? 'sell' : 'buy'}`)} ${p.key}` };
      } else {
        // Dividende : point plein, pour le distinguer des achats et ventes.
        markers[i] = {
          radius: 4.5,
          fill: theme.colors.secondary,
          stroke: theme.colors.secondary,
          accessibilityLabel: `${t('transaction.modes.dividend')} ${p.key}`,
        };
      }
      markerOps[i] = ops;
    });
    const span = all.length > 300;
    const labelEvery = Math.max(1, Math.ceil(sampled.length / 5));
    const months = t('months.short');
    const xLabels = sampled.map((p, i) => {
      if (i % labelEvery !== 0 && i !== sampled.length - 1) return '';
      const d = new Date(`${p.key}T12:00:00`);
      return span ? `${months[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}` : `${d.getDate()} ${months[d.getMonth()]}`;
    });
    const kinds = Object.values(markerOps).flat();
    return {
      data: sampled.map((p, i) => ({ x: i, y: p.price })),
      keys: sampled.map((p) => p.key),
      xLabels,
      markers,
      markerOps,
      // Légende : seulement ce qui apparaît sur la période.
      legend: [
        kinds.some((o) => o.kind === 'tx' && o.side !== 'sell') && 'buy',
        kinds.some((o) => o.kind === 'tx' && o.side === 'sell') && 'sell',
        kinds.some((o) => o.kind === 'div') && 'dividend',
      ].filter(Boolean),
      first: sampled[0].price,
      last: sampled[sampled.length - 1].price,
    };
  }, [history, transactions, dividends, t, theme]);

  const quoteCurrency = quote?.currency || history.currency || asset?.quoteCurrency;
  const currentPrice = quote?.price || chart?.last || null;
  // Cours et date du point touché sur la courbe.
  const scrubPoint = chart && scrubIndex != null && chart.data[scrubIndex]
    ? { price: chart.data[scrubIndex].y, date: chart.keys[scrubIndex] }
    : null;
  const periodChange = chart && chart.first > 0 ? ((chart.last - chart.first) / chart.first) * 100 : null;

  const askDelete = useCallback((op) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setConfirm({ type: 'op', op });
  }, []);

  const runConfirm = useCallback(async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    try {
      if (c.type === 'op') {
        if (c.op.kind === 'div') await deleteDividends(c.op.id);
        else await deleteTransactions(c.op.id);
      } else if (c.type === 'asset') {
        await deletePosition(assetId);
        navigation.goBack();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [confirm, deleteDividends, deleteTransactions, deletePosition, assetId, navigation]);

  const editOp = (op) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('TransactionForm', op.kind === 'div' ? { dividendId: op.id } : { transactionId: op.id });
  };

  const addOp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('TransactionForm', {
      asset: { assetId, assetType, symbol, name: asset?.name || symbol },
      account: focusAccount || assetPositions.find((p) => p.isHeld)?.account || null,
    });
  };

  const width = Dimensions.get('window').width - 32;
  const colorOf = (v) => (v >= 0 ? theme.colors.success : theme.colors.error);

  // Moyenne de l'indice suivi sur longue période (10, 20, 30 ans, depuis le début).
  // Indice suivi par l'ETF : sa plus longue moyenne, sur une seule ligne.
  const indexLine = (() => {
    if (!indexKey || !indexReturns) return null;
    const top = indexReturns.horizons.filter((h) => h.years >= 10).pop();
    if (!top) return null;
    const info = INDEX_HISTORY[indexKey];
    return {
      index: t(`indices.${indexKey}`),
      years: top.years,
      pct: top.pct,
      note: t(info.total ? 'returns.indexNoteTotal' : 'returns.indexNotePrice', { currency: info.currency }),
    };
  })();
  const selectedOps = selected != null ? chart?.markerOps[selected] : null;

  const statRow = (label, value, valueColor) => (
    <View style={styles.statRow} key={label}>
      <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor || theme.colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <AssetLogo assetId={assetId} symbol={symbol} size={36} />
        <View style={styles.titleBox}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{asset?.name || symbol}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {symbol} · {assetType === ASSET_TYPES.CRYPTO ? t('classes.crypto') : t('classes.stock')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAlerts(true)}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('alerts.title', { symbol })}
        >
          <Ionicons name={activeAlerts ? 'notifications' : 'notifications-outline'} size={22} color={theme.colors.primary} />
          {activeAlerts > 0 && (
            <View style={[styles.dot, { backgroundColor: theme.colors.accent }]}>
              <Text style={styles.dotText}>{activeAlerts}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={addOp} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('detail.addOperation')}>
          <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Cours */}
        <View style={styles.priceBlock}>
          <Text style={[styles.price, { color: theme.colors.text }]}>
            {formatPrice(scrubPoint ? scrubPoint.price : currentPrice, quoteCurrency)}
          </Text>
          <View style={styles.priceChanges}>
            {scrubPoint && (
              <Text style={[styles.change, { color: theme.colors.textSecondary }]}>
                {formatDate(`${scrubPoint.date}T12:00:00`, { locale })}
              </Text>
            )}
            {!scrubPoint && Number.isFinite(quote?.changePct) && (
              <ChangeBadge value={quote.changePct} label={t('dashboard.today')} />
            )}
            {!scrubPoint && periodChange != null && (
              <Text style={[styles.change, { color: colorOf(periodChange) }]}>
                {formatPercent(periodChange)} {t(`detail.periodLabel.${period}`)}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          {loadingChart ? (
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : chart ? (
            <LineChartSkia
              data={chart.data}
              xLabels={chart.xLabels}
              width={width - 24}
              height={200}
              color={color}
              theme={theme}
              yTickCount={4}
              formatYLabel={(v) => (v >= 100 ? formatPrice(Math.round(v), quoteCurrency).replace(/[.,]00(?=\D*$)/, '') : formatPrice(v, quoteCurrency))}
              markers={chart.markers}
              onScrub={(i) => setScrubIndex(i >= 0 ? i : null)}
              selectedIndex={selected}
              onMarkerPress={(i) => {
                Haptics.selectionAsync();
                setSelected((s) => (s === i ? null : i));
              }}
            />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Text style={[styles.muted, { color: theme.colors.textSecondary }]}>{t('detail.noHistory')}</Text>
            </View>
          )}

          {!!chart?.legend.length && !selectedOps && (
            <View style={styles.legend}>
              {chart.legend.map((k) => {
                const tint = k === 'dividend' ? theme.colors.secondary : k === 'sell' ? theme.colors.error : theme.colors.success;
                return (
                  <View key={k} style={styles.legendItem}>
                    <View style={[styles.legendDot, k === 'dividend' ? { backgroundColor: tint } : { borderColor: tint, borderWidth: 2 }]} />
                    <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>{t(`transaction.modes.${k}`)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {selectedOps && (
            <View style={[styles.selected, { borderTopColor: theme.colors.border }]}>
              {selectedOps.map((op) => (op.kind === 'div' ? (
                <Text key={op.id} style={[styles.selectedText, { color: theme.colors.text }]}>
                  {formatDate(op.date, { locale })} · {t('transaction.modes.dividend')}{' '}
                  <Text style={{ color: theme.colors.secondary, fontWeight: '700' }}>{formatPrice(op.amount, op.currency)}</Text>
                </Text>
              ) : (
                <View key={op.id}>
                  <Text style={[styles.selectedText, { color: theme.colors.text }]}>
                    {formatDate(op.date, { locale })} · {t(`transaction.modes.${op.side}`)}{' '}
                    {formatQty(op.quantity, assetType)}
                    {op.unitPrice ? ` × ${formatPrice(op.unitPrice, op.currency)}` : ''}
                  </Text>
                  {/* Un achat : ce qu'il a rapporté depuis, au cours d'aujourd'hui. */}
                  {op.side !== 'sell' && (() => {
                    const since = sincePurchase(op, { price: currentPrice, currency: quoteCurrency, fx });
                    if (!since) return null;
                    const tint = since.gain >= 0 ? theme.colors.success : theme.colors.error;
                    return (
                      <Text style={[styles.sinceText, { color: theme.colors.textSecondary }]}>
                        {t('detail.sinceBuy')}{' '}
                        <Text style={{ color: tint, fontWeight: '700' }}>
                          {formatAmount(since.gain, { showSign: true })} ({formatPercent(since.pct)})
                        </Text>
                      </Text>
                    );
                  })()}
                </View>
              )))}
            </View>
          )}

          <SegmentedControl
            options={PERIODS.map((p) => ({ key: p.key, label: t(`detail.periods.${p.key}`) }))}
            value={period}
            onChange={setPeriod}
            variant="inCard"
            size="sm"
            fill
            style={styles.periods}
            accessibilityRole="button"
          />
        </View>

        {/* Positions, une par enveloppe */}
        {assetPositions.map((p) => (
          <View
            key={p.key}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: focusAccount === p.account ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <View style={styles.cardTitleRow}>
              <View style={styles.accountTitle}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t(`accounts.${p.account}`)}</Text>
                <AccountInstitution account={p.account} />
              </View>
              {!p.isHeld && <Text style={[styles.closed, { color: theme.colors.textTertiary }]}>{t('portfolio.closed')}</Text>}
            </View>
            {p.isHeld && statRow(t('detail.quantity'), formatQty(p.quantity, assetType))}
            {p.isHeld && statRow(t('detail.value'), formatAmount(p.value))}
            {p.isHeld && statRow(t('detail.avgCost'), formatAmount(p.avgCost, { decimals: p.avgCost < 10 ? 4 : 2 }))}
            {p.isHeld && statRow(t('detail.costBasis'), formatAmount(p.costBasis))}
            {p.isHeld && statRow(t('detail.unrealized'), `${formatAmount(p.unrealized, { showSign: true })} (${formatPercent(p.unrealizedPct)})`, colorOf(p.unrealized))}
            {p.isHeld && Math.abs(p.fxEffect) >= 0.5 && statRow(t('detail.fxEffect'), formatAmount(p.fxEffect, { showSign: true }), colorOf(p.fxEffect))}
            {Math.abs(p.realized) >= 0.005 && statRow(t('detail.realized'), formatAmount(p.realized, { showSign: true }), colorOf(p.realized))}
            {p.dividends > 0 && statRow(t('detail.dividends'), formatAmount(p.dividends, { showSign: true }), theme.colors.success)}
            <View style={[styles.totalRow, { borderTopColor: theme.colors.border }]}>
              {statRow(t('detail.totalPnl'), `${formatAmount(p.totalPnL, { showSign: true })} (${formatPercent(p.roi)})`, colorOf(p.totalPnL))}
            </View>
            {p.pricePending && (
              <Text style={[styles.note, { color: theme.colors.warning }]}>{t('detail.pricePending')}</Text>
            )}
          </View>
        ))}

        {/* Rendement moyen par an : un chiffre, les autres durées en petit, les années en barres */}
        {(hasReturns || indexLine) && (() => {
          const longest = hasReturns ? returns.horizons[returns.horizons.length - 1] : null;
          const lead = hasReturns ? longest || { years: Math.max(1, Math.round(returns.since.years)), pct: returns.since.pct } : null;
          const others = hasReturns ? returns.horizons.filter((h) => h !== longest) : [];
          const calendar = hasReturns ? returns.calendar : [];
          const short = calendar.length > 8;
          return (
            <View style={[styles.card, styles.returnsCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.returnsHead}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('returns.title')}</Text>
                <TouchableOpacity
                  onPress={() => setShowReturnsInfo((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('returns.info')}
                  accessibilityState={{ expanded: showReturnsInfo }}
                >
                  <Ionicons name={showReturnsInfo ? 'information-circle' : 'information-circle-outline'} size={20} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {lead && (
                <View style={styles.returnsLeadRow}>
                  <Text style={[styles.returnsBig, { color: colorOf(lead.pct) }]}>{t('returns.perYear', { value: formatPercent(lead.pct) })}</Text>
                  <Text style={[styles.returnsOver, { color: theme.colors.textSecondary }]}>{t('returns.over', { count: lead.years })}</Text>
                </View>
              )}
              {others.length > 0 && (
                <Text style={[styles.returnsOthers, { color: theme.colors.textTertiary }]}>
                  {others.map((h, i) => (
                    <Text key={h.years}>
                      {i > 0 ? '  ·  ' : ''}
                      {t('returns.years', { count: h.years })}{' '}
                      <Text style={{ color: colorOf(h.pct), fontWeight: '600' }}>{formatPercent(h.pct)}</Text>
                    </Text>
                  ))}
                </Text>
              )}
              {calendar.length > 1 && (
                <View style={styles.returnsChart}>
                  <BarChart
                    data={calendar.map((c) => ({
                      label: short ? `'${String(c.year).slice(-2)}` : String(c.year),
                      caption: c.partial ? t('performance.ytd', { year: c.year }) : String(c.year),
                      value: c.pct,
                    }))}
                    height={110}
                    color={theme.colors.success}
                    mutedColor={theme.colors.successBg}
                    negativeColor={theme.colors.error}
                    negativeMutedColor={theme.colors.errorBg}
                    baselineColor={theme.colors.border}
                    textColor={theme.colors.text}
                    labelColor={theme.colors.textTertiary}
                    formatValue={(v) => formatPercent(v)}
                  />
                </View>
              )}
              {indexLine && (
                <Text style={[styles.indexLine, { color: theme.colors.textSecondary, borderTopColor: theme.colors.borderLight }]}>
                  {t('returns.indexLine', { index: indexLine.index, count: indexLine.years })}{' '}
                  <Text style={{ color: colorOf(indexLine.pct), fontWeight: '700' }}>{t('returns.perYear', { value: formatPercent(indexLine.pct) })}</Text>
                </Text>
              )}
              {showReturnsInfo && (
                <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
                  {hasReturns ? t('returns.note', { currency: returns.currency || quoteCurrency || '' }) : ''}
                  {hasReturns && indexLine ? '\n\n' : ''}
                  {indexLine ? indexLine.note : ''}
                </Text>
              )}
            </View>
          );
        })()}

        {/* Frais annuels (TER) : actions et ETF seulement */}
        {assetType === ASSET_TYPES.STOCK && (() => {
          const info = terInfo(assetId, fees);
          const ter = info?.value;
          const heldValue = assetPositions.filter((p) => p.isHeld).reduce((sum, p) => sum + p.value, 0);
          return (
            <TouchableOpacity
              onPress={() => setEditFee(true)}
              style={[styles.card, styles.feeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={t('fees.ter')}
            >
              <View style={styles.feeMain}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('fees.ter')}</Text>
                <Text style={[styles.opSub, { color: theme.colors.textTertiary }]}>
                  {!info && t('fees.terHint')}
                  {info?.source === 'manual' && t('fees.terLine', { value: formatPercent(ter, { showSign: false, decimals: 2 }), amount: formatAmount((heldValue * ter) / 100, { decimals: 0 }) })}
                  {info?.source === 'known' && t('fees.terRangeLine', {
                    range: `${info.min.toLocaleString(locale, { minimumFractionDigits: 2 })}–${formatPercent(info.max, { showSign: false, decimals: 2 })}`,
                    amount: formatAmount((heldValue * ter) / 100, { decimals: 0 }),
                  })}
                </Text>
              </View>
              <Ionicons name={ter > 0 ? 'create-outline' : 'add'} size={18} color={theme.colors.primary} />
            </TouchableOpacity>
          );
        })()}

        {/* Diversification : indice suivi (ETF), pays et secteur (action) */}
        {assetType === ASSET_TYPES.STOCK && (() => {
          const c = classify({ symbol, name: asset?.name || symbol }, exposure[assetId]);
          const rows = c.kind === 'etf'
            ? [['profile', t('diversification.index'), c.profile ? t(`indices.${c.profile}`) : null]]
            : [
              ['country', t('diversification.country'), c.country ? t(`countries.${c.country}`) : null],
              ['sector', t('diversification.sector'), c.sector ? t(`sectors.${c.sector}`) : null],
              ['profile', t('diversification.isEtf'), t('diversification.notEtf')],
            ];
          return (
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('diversification.title')}</Text>
              </View>
              {rows.map(([key, label, value]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setExposurePick(key)}
                  style={styles.exposureRow}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text style={[styles.statLabel, styles.exposureLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
                  <Text style={[styles.statValue, styles.exposureValue, { color: value ? theme.colors.text : theme.colors.primary }]} numberOfLines={1}>
                    {value || t('diversification.choose')}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}

        {/* Opérations */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('detail.operations')} ({operations.length})</Text>
            <TouchableOpacity onPress={addOp} accessibilityRole="button" style={styles.addLink}>
              <Ionicons name="add" size={18} color={theme.colors.primary} />
              <Text style={[styles.addLinkText, { color: theme.colors.primary }]}>{t('detail.addOperation')}</Text>
            </TouchableOpacity>
          </View>
          {operations.map((op) => {
            const isDiv = op.kind === 'div';
            const isSell = op.side === 'sell';
            const iconName = isDiv ? 'cash-outline' : isSell ? 'arrow-up' : 'arrow-down';
            const iconColor = isDiv ? theme.colors.secondary : isSell ? theme.colors.error : theme.colors.success;
            const total = isDiv
              ? formatPrice(op.amount, op.currency)
              : op.unitPrice
                ? formatPrice(op.quantity * op.unitPrice + (isSell ? -op.fees : op.fees), op.currency)
                : t('detail.pricePendingShort');
            return (
              <TouchableOpacity
                key={op.id}
                style={[styles.opRow, { borderBottomColor: theme.colors.border }]}
                onPress={() => editOp(op)}
                onLongPress={() => askDelete(op)}
                accessibilityRole="button"
                accessibilityHint={t('detail.opHint')}
              >
                <View style={[styles.opIcon, { backgroundColor: `${iconColor}22` }]}>
                  <Ionicons name={iconName} size={16} color={iconColor} />
                </View>
                <View style={styles.opMain}>
                  <Text style={[styles.opTitle, { color: theme.colors.text }]}>
                    {isDiv ? t('transaction.modes.dividend') : t(`transaction.modes.${op.side}`)}
                    {!isDiv ? ` · ${formatQty(op.quantity, assetType)}` : ''}
                  </Text>
                  <Text style={[styles.opSub, { color: theme.colors.textTertiary }]}>
                    {formatDate(op.date, { locale })} · {t(`accounts.short.${op.account}`)}
                    {!isDiv && op.unitPrice ? ` · ${formatPrice(op.unitPrice, op.currency)}` : ''}
                  </Text>
                </View>
                <Text style={[styles.opTotal, { color: theme.colors.text }]}>{total}</Text>
                <TouchableOpacity
                  onPress={() => askDelete(op)}
                  style={styles.trash}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                >
                  <Ionicons name="trash-outline" size={17} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>

        {operations.length > 0 && (
          <TouchableOpacity
            onPress={() => setConfirm({ type: 'asset' })}
            style={[styles.deleteAll, { borderColor: theme.colors.error }]}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
            <Text style={[styles.deleteAllText, { color: theme.colors.error }]}>{t('detail.deleteAsset', { symbol })}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <AlertsModal
        visible={showAlerts}
        onClose={() => setShowAlerts(false)}
        assetId={assetId}
        symbol={symbol}
        currentPrice={currentPrice}
        currency={quoteCurrency}
        theme={theme}
        t={t}
      />

      <OptionSheet
        visible={!!exposurePick}
        onClose={() => setExposurePick(null)}
        title={exposurePick === 'country' ? t('diversification.country') : exposurePick === 'sector' ? t('diversification.sector') : t('diversification.index')}
        message={exposurePick === 'profile' ? t('diversification.indexHelp') : null}
        options={[
          ...(exposurePick === 'country' ? COUNTRIES.map((k) => ({ key: k, label: t(`countries.${k}`) }))
            : exposurePick === 'sector' ? SECTORS.map((k) => ({ key: k, label: t(`sectors.${k}`) }))
              : INDEX_KEYS.map((k) => ({ key: k, label: t(`indices.${k}`) }))),
          { key: null, label: t('diversification.auto') },
        ]}
        value={exposurePick ? exposure[assetId]?.[exposurePick] ?? null : null}
        onSelect={(key) => {
          setExposure(assetId, { [exposurePick]: key });
          setExposurePick(null);
        }}
      />

      <InputSheet
        visible={editFee}
        onClose={() => setEditFee(false)}
        title={t('fees.ter')}
        message={t('fees.terHelp')}
        fields={[{ key: 'ter', keyboardType: 'decimal-pad', placeholder: '0,20', suffix: '%' }]}
        initialValues={{ ter: fees[assetId] ? fees[assetId].toLocaleString(locale, { maximumFractionDigits: 3, useGrouping: false }) : '' }}
        confirmText={t('common.save')}
        secondaryText={fees[assetId] ? t('common.delete') : null}
        onSecondary={() => {
          setFee(assetId, 0);
          setEditFee(false);
        }}
        onSubmit={({ ter }) => {
          const n = Number(normalizeNumber(ter || ''));
          if (!Number.isFinite(n) || n < 0 || n > 5) return t('fees.terError');
          setFee(assetId, n);
          setEditFee(false);
          return null;
        }}
      />

      <ConfirmModal
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.type === 'asset' ? t('detail.deleteAssetTitle', { symbol }) : t('detail.deleteOpTitle')}
        message={confirm?.type === 'asset'
          ? t('detail.deleteAssetMessage', { count: operations.length, symbol })
          : t('detail.deleteOpMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        icon="warning-outline"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12 },
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, marginLeft: 4 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 1 },
  dot: { position: 'absolute', top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  priceBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  price: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  priceChanges: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  change: { fontSize: 13, fontWeight: '600' },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 12 },
  feeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  returnsCard: { paddingHorizontal: 16, paddingVertical: 14 },
  returnsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  returnsLeadRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, marginTop: 8 },
  returnsBig: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  returnsOver: { fontSize: 13 },
  returnsOthers: { fontSize: 12, marginTop: 6, fontVariant: ['tabular-nums'] },
  returnsChart: { marginTop: 14, marginBottom: 2 },
  indexLine: { fontSize: 13, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  exposureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 4 },
  exposureLabel: { flex: 1 },
  exposureValue: { maxWidth: '60%' },
  feeMain: { flex: 1, gap: 2 },
  chartPlaceholder: { height: 200, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13 },
  selected: { borderTopWidth: 1, marginTop: 8, paddingTop: 8, gap: 2 },
  selectedText: { fontSize: 12 },
  sinceText: { fontSize: 13, marginTop: 2, marginBottom: 4 },
  periods: { marginTop: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 },
  accountTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  closed: { fontSize: 12, fontWeight: '600' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 4 },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 13, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, marginTop: 4, paddingTop: 4 },
  note: { fontSize: 12, marginTop: 6, paddingHorizontal: 4 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  addLinkText: { fontSize: 13, fontWeight: '700' },
  opRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 4, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  opIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  opMain: { flex: 1 },
  opTitle: { fontSize: 14, fontWeight: '600' },
  opSub: { fontSize: 11, marginTop: 2 },
  opTotal: { fontSize: 13, fontWeight: '600' },
  trash: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  deleteAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 4,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteAllText: { fontSize: 14, fontWeight: '700' },
});

export default AssetDetailScreen;
