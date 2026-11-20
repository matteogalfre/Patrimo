/**
 * Dividendes probablement reçus mais pas encore saisis (voir dueDividends) :
 * « Saisir » ouvre le dividende pré-rempli, « Pas reçu » l'écarte.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { usePlanning } from '../../context/PlanningContext';
import AssetLogo from '../AssetLogo';
import { dueDividends } from '../../core/income';
import { ASSET_TYPES } from '../../core/assets';
import { formatDate } from '../../utils/formatters';

const DueDividendsCard = ({ navigation }) => {
  const theme = useTheme();
  const { t, locale, formatPrice } = useSettings();
  const { dividends, transactions } = usePortfolio();
  const { dismissedDividends, dismissDividend } = usePlanning();
  const due = useMemo(
    () => dueDividends({ dividends, transactions, dismissed: dismissedDividends }),
    [dividends, transactions, dismissedDividends],
  );
  if (!due.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.secondary }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('income.due.title')}</Text>
      {due.map((d) => (
        <View key={d.key} style={styles.row}>
          <AssetLogo assetId={d.assetId} symbol={d.symbol} size={32} />
          <View style={styles.main}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{d.name}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t('income.due.line', { amount: formatPrice(d.amount, d.currency), date: formatDate(d.date, { locale }) })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => dismissDividend(d.key)} style={styles.skip} accessibilityRole="button">
            <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>{t('income.due.dismiss')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate('TransactionForm', {
                mode: 'dividend',
                asset: { assetId: d.assetId, assetType: ASSET_TYPES.STOCK, symbol: d.symbol, name: d.name },
                account: d.account,
                dividendAmount: d.amount,
                date: d.date,
              });
            }}
            style={[styles.go, { backgroundColor: theme.colors.secondary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.goText, { color: '#FFFFFF' }]}>{t('income.due.enter')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12 },
  skip: { minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' },
  skipText: { fontSize: 13, fontWeight: '600' },
  go: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  goText: { fontSize: 13, fontWeight: '700' },
});

export default DueDividendsCard;
