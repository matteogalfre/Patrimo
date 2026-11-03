/**
 * Achats programmés du mois à saisir. L'app ne passe aucun ordre : elle
 * ouvre l'opération pré-remplie, à valider après l'achat chez le courtier.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import { usePlanning } from '../../context/PlanningContext';
import AssetLogo from '../AssetLogo';
import { duePlans } from '../../core/plans';

const DuePlansCard = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount } = useSettings();
  const { plans, handlePlan } = usePlanning();
  const due = duePlans(plans);
  if (!due.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t('plans.dueTitle')}</Text>
      {due.map((p) => (
        <View key={p.id} style={styles.row}>
          <AssetLogo assetId={p.assetId} symbol={p.symbol} size={32} />
          <View style={styles.main}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{p.name || p.symbol}</Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {formatAmount(p.amount, { decimals: 0, reveal: true })} · {t(`accounts.short.${p.account}`)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handlePlan(p.id)}
            style={styles.skip}
            accessibilityRole="button"
          >
            <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>{t('plans.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate('TransactionForm', {
                asset: { assetId: p.assetId, assetType: p.assetType, symbol: p.symbol, name: p.name },
                account: p.account,
                amount: p.amount,
                planId: p.id,
              });
            }}
            style={[styles.go, { backgroundColor: theme.colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.goText, { color: theme.colors.onPrimary }]}>{t('plans.enter')}</Text>
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

export default DuePlansCard;
