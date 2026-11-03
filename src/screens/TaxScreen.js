/**
 * Récapitulatif fiscal d'une année : compte-titres (2074), cryptos (2086),
 * PEA. Une aide pour préparer et vérifier la déclaration, pas un conseil :
 * l'écran renvoie toujours à l'IFU du courtier et aux notices officielles.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { ResultModal } from '../components';
import SegmentedControl from '../components/SegmentedControl';
import { computeCryptoTax, computeCtoTax, taxYears, CRYPTO_EXEMPTION_THRESHOLD } from '../core/tax';
import { buildTaxCsv, shareTaxCsv } from '../services/taxExport';
import { formatDate, formatQuantity } from '../utils/formatters';

const TaxScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, locale, formatAmount, currency } = useSettings();
  const { transactions, dividends, fx, pea, totals, getPriceAtDate } = usePortfolio();

  const years = useMemo(() => {
    const list = taxYears({ transactions, dividends });
    const current = new Date().getFullYear();
    return list.includes(current) ? list : [current, ...list];
  }, [transactions, dividends]);
  const [year, setYear] = useState(years[0]);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);

  const cto = useMemo(() => computeCtoTax({ transactions, dividends, fx, year }), [transactions, dividends, fx, year]);
  const crypto = useMemo(
    () => computeCryptoTax({ transactions, fx, priceAt: getPriceAtDate, year }),
    [transactions, fx, getPriceAtDate, year],
  );
  const peaStats = totals.byAccount?.PEA;

  const colorOf = (v) => (v >= 0 ? theme.colors.success : theme.colors.error);
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = buildTaxCsv({
        year,
        currency,
        cto,
        crypto,
        labels: {
          title: t('tax.csv.title'),
          ctoSection: t('tax.cto.title'),
          cryptoSection: t('tax.crypto.title'),
          date: t('tax.csv.date'),
          asset: t('tax.csv.asset'),
          quantity: t('tax.csv.quantity'),
          proceeds: t('tax.csv.proceeds'),
          cost: t('tax.csv.cost'),
          gain: t('tax.csv.gain'),
          portfolioValue: t('tax.csv.portfolioValue'),
          acquisitionShare: t('tax.csv.acquisitionShare'),
          total: t('tax.csv.total'),
          dividends: t('tax.cto.dividends'),
          disclaimer: t('tax.disclaimer'),
        },
      });
      await shareTaxCsv(csv, year);
    } catch (err) {
      setResult({ success: false, message: err.message });
    } finally {
      setExporting(false);
    }
  };

  const saleRow = (s, i, list, sub) => (
    <View
      key={s.id}
      style={[styles.row, i < list.length - 1 && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {s.name || s.symbol}
          {(s.estimated || s.approximate) ? ' *' : ''}
        </Text>
        <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>{sub}</Text>
      </View>
      <Text style={[styles.rowValue, { color: colorOf(s.gain) }]}>{formatAmount(s.gain, { showSign: true })}</Text>
    </View>
  );

  const line = (label, value, color) => (
    <View style={styles.line} key={label}>
      <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: color || theme.colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('tax.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SegmentedControl
          options={years.map((y) => ({ key: y, label: String(y) }))}
          value={year}
          onChange={setYear}
          scrollable
          style={styles.years}
        />
        <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>{t('tax.intro', { year, next: year + 1 })}</Text>

        {/* Compte-titres */}
        <View style={cardStyle}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('tax.cto.title')}</Text>
          <Text style={[styles.form, { color: theme.colors.textTertiary }]}>{t('tax.cto.form')}</Text>
          {cto.sales.length === 0 && cto.dividends === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textTertiary }]}>{t('tax.cto.empty', { year })}</Text>
          ) : (
            <>
              <Text style={[styles.big, { color: colorOf(cto.net) }]}>{formatAmount(cto.net, { showSign: true })}</Text>
              {line(t('tax.cto.proceeds'), formatAmount(cto.proceeds))}
              {line(t('tax.cto.cost'), formatAmount(cto.cost))}
              {cto.losses < 0 && line(t('tax.cto.losses'), formatAmount(cto.losses, { showSign: true }), theme.colors.error)}
              {cto.dividends > 0 && line(t('tax.cto.dividends'), formatAmount(cto.dividends))}
              {cto.sales.length > 0 && (
                <View style={[styles.list, { borderTopColor: theme.colors.borderLight }]}>
                  {cto.sales.map((s, i, list) => saleRow(
                    s, i, list,
                    `${formatDate(s.date, { locale })} · ${formatQuantity(s.quantity, 'stock', locale)} · ${formatAmount(s.proceeds)}`,
                  ))}
                </View>
              )}
              <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('tax.cto.note')}</Text>
            </>
          )}
        </View>

        {/* Crypto */}
        <View style={cardStyle}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('tax.crypto.title')}</Text>
          <Text style={[styles.form, { color: theme.colors.textTertiary }]}>{t('tax.crypto.form')}</Text>
          {crypto.sales.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textTertiary }]}>{t('tax.crypto.empty', { year })}</Text>
          ) : (
            <>
              <Text style={[styles.big, { color: colorOf(crypto.net) }]}>{formatAmount(crypto.net, { showSign: true })}</Text>
              {crypto.exempt && (
                <View style={[styles.badge, { backgroundColor: theme.colors.successBg }]}>
                  <Text style={[styles.badgeText, { color: theme.colors.success }]}>
                    {t('tax.crypto.exempt', { amount: formatAmount(CRYPTO_EXEMPTION_THRESHOLD, { decimals: 0, reveal: true }) })}
                  </Text>
                </View>
              )}
              {line(t('tax.crypto.proceeds'), formatAmount(crypto.proceeds))}
              {line(t('tax.crypto.remaining'), formatAmount(crypto.remainingAcquisition))}
              <View style={[styles.list, { borderTopColor: theme.colors.borderLight }]}>
                {crypto.sales.map((s, i, list) => saleRow(
                  s, i, list,
                  `${formatDate(s.date, { locale })} · ${formatAmount(s.proceeds)} · ${t('tax.crypto.portfolioShort', { amount: formatAmount(s.portfolioValue, { decimals: 0 }) })}`,
                ))}
              </View>
              <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('tax.crypto.formula')}</Text>
              <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('tax.crypto.note')}</Text>
            </>
          )}
        </View>

        {/* PEA */}
        {(pea || peaStats) && (
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{t('tax.pea.title')}</Text>
            <Text style={[styles.peaText, { color: theme.colors.textSecondary }]}>
              {pea?.isMature ? t('tax.pea.mature') : t('tax.pea.young', { date: pea?.maturityDate ? formatDate(pea.maturityDate, { locale }) : '…' })}
            </Text>
            {peaStats && line(t('tax.pea.latent'), formatAmount(peaStats.unrealized + peaStats.realized + peaStats.dividends, { showSign: true }))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.export, { backgroundColor: theme.colors.primary }, exporting && { opacity: 0.6 }]}
          onPress={exportCsv}
          disabled={exporting || (cto.sales.length === 0 && crypto.sales.length === 0 && cto.dividends === 0)}
          accessibilityRole="button"
        >
          {exporting ? <ActivityIndicator color={theme.colors.onPrimary} /> : (
            <>
              <Ionicons name="share-outline" size={18} color={theme.colors.onPrimary} />
              <Text style={[styles.exportText, { color: theme.colors.onPrimary }]}>{t('tax.export')}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: theme.colors.textTertiary }]}>{t('tax.disclaimer')}</Text>
      </ScrollView>

      <ResultModal
        visible={!!result}
        onClose={() => setResult(null)}
        success={result?.success}
        message={result?.message}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  years: { gap: 4, marginBottom: 8 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 12, paddingHorizontal: 4 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  form: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  empty: { fontSize: 13, lineHeight: 18 },
  big: { fontSize: 26, fontWeight: '700', marginBottom: 8, fontVariant: ['tabular-nums'] },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  lineLabel: { fontSize: 13, flex: 1, paddingRight: 8 },
  lineValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  list: { borderTopWidth: 1, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 11 },
  rowValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { fontSize: 11, lineHeight: 15, marginTop: 8 },
  peaText: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 6 },
  export: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 12, marginTop: 4 },
  exportText: { fontSize: 15, fontWeight: '700' },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 14, paddingHorizontal: 4 },
});

export default TaxScreen;
