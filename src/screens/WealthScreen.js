/**
 * Immobilier et crédits : le patrimoine net (placements et liquidités, plus
 * l'immobilier, moins ce qu'il reste à rembourser), tes biens, tes crédits,
 * et l'accès au simulateur d'achat.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { formatDate } from '../utils/formatters';

const LOAN_ICONS = { mortgage: 'home-outline', consumer: 'cart-outline', car: 'car-outline', student: 'school-outline', works: 'hammer-outline', zeroRate: 'pricetag-outline', other: 'document-text-outline' };
const PROPERTY_ICONS = { main: 'home-outline', rental: 'key-outline', secondary: 'sunny-outline', parking: 'car-outline', other: 'business-outline' };

const WealthScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount, locale } = useSettings();
  const { overview, debts, realEstate } = usePortfolio();
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const money = (v) => formatAmount(v, { decimals: 0 });
  const go = (route, params) => {
    Haptics.selectionAsync();
    navigation.navigate(route, params);
  };
  const empty = !debts.items.length && !realEstate.items.length;

  const row = (label, value, color) => (
    <View style={styles.sumRow} key={label}>
      <Text style={[styles.sumLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.sumValue, { color: color || theme.colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('wealth.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={cardStyle}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{t('wealth.netWorth')}</Text>
          <Text style={[styles.big, { color: theme.colors.text }]}>{money(overview.netWorth)}</Text>
          {row(t('wealth.financial'), money(overview.value))}
          {row(t('wealth.realEstate'), money(realEstate.value))}
          {row(t('wealth.debts'), debts.remaining > 0 ? `−${money(debts.remaining)}` : money(0), debts.remaining > 0 ? theme.colors.error : null)}
          {debts.monthly > 0 && <Text style={[styles.note, { color: theme.colors.textTertiary }]}>{t('wealth.monthly', { amount: money(debts.monthly) })}</Text>}
          {empty && <Text style={[styles.note, { color: theme.colors.textSecondary }]}>{t('wealth.empty')}</Text>}
        </View>

        {/* Biens */}
        <Text style={[styles.section, { color: theme.colors.text }]}>{t('wealth.propertiesTitle')}</Text>
        {realEstate.items.map((p) => (
          <TouchableOpacity key={p.id} style={cardStyle} onPress={() => go('Property', { propertyId: p.id })} accessibilityRole="button">
            <View style={styles.itemHead}>
              <View style={[styles.icon, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name={PROPERTY_ICONS[p.kind] || PROPERTY_ICONS.other} size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>{p.name}</Text>
                {/* Le type, sauf s'il sert déjà de nom ; la ville et ta part s'il y a lieu. */}
                {(() => {
                  const sub = [
                    p.name !== t(`property.kinds.${p.kind}`) ? t(`property.kinds.${p.kind}`) : null,
                    p.city,
                    p.share < 100 ? t('wealth.share', { pct: p.share }) : null,
                  ].filter(Boolean).join(' · ');
                  return sub ? <Text style={[styles.itemSub, { color: theme.colors.textTertiary }]} numberOfLines={1}>{sub}</Text> : null;
                })()}
              </View>
              <Text style={[styles.itemValue, { color: theme.colors.text }]}>{money(p.value)}</Text>
            </View>
            {p.debt > 0 && (
              <Text style={[styles.itemLine, { color: theme.colors.textSecondary }]}>
                {t('wealth.propertyDebt', { debt: money(p.debt), equity: money(p.equity) })}
              </Text>
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.add, { borderColor: theme.colors.border }]} onPress={() => go('Property')} accessibilityRole="button">
          <Ionicons name="add" size={18} color={theme.colors.primary} />
          <Text style={[styles.addText, { color: theme.colors.primary }]}>{t('wealth.addProperty')}</Text>
        </TouchableOpacity>

        {/* Crédits */}
        <Text style={[styles.section, { color: theme.colors.text }]}>{t('wealth.loansTitle')}</Text>
        {debts.items.map((l) => (
          <TouchableOpacity key={l.id} style={cardStyle} onPress={() => go('Loan', { loanId: l.id })} accessibilityRole="button">
            <View style={styles.itemHead}>
              <View style={[styles.icon, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name={LOAN_ICONS[l.kind] || LOAN_ICONS.other} size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>{l.name}</Text>
                <Text style={[styles.itemSub, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                  {l.status.done
                    ? t('wealth.loanDone')
                    : t('wealth.loanLine', { monthly: money(l.status.monthlyTotal), end: formatDate(l.status.endDate, { locale, format: 'short' }) })}
                </Text>
              </View>
              <Text style={[styles.itemValue, { color: l.status.done ? theme.colors.textTertiary : theme.colors.text }]}>{money((l.status.remaining * l.share) / 100)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <View style={[styles.fill, { width: `${Math.round(l.status.progress * 100)}%`, backgroundColor: theme.colors.success }]} />
            </View>
            <Text style={[styles.itemLine, { color: theme.colors.textTertiary }]}>{t('wealth.loanProgress', { pct: Math.round(l.status.progress * 100) })}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.add, { borderColor: theme.colors.border }]} onPress={() => go('Loan')} accessibilityRole="button">
          <Ionicons name="add" size={18} color={theme.colors.primary} />
          <Text style={[styles.addText, { color: theme.colors.primary }]}>{t('wealth.addLoan')}</Text>
        </TouchableOpacity>

        {/* Simulateur */}
        <TouchableOpacity style={[...cardStyle, styles.simulate]} onPress={() => go('HomeBuy')} accessibilityRole="button">
          <View style={[styles.icon, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="calculator-outline" size={18} color={theme.colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.itemName, { color: theme.colors.text }]}>{t('homeBuy.title')}</Text>
            <Text style={[styles.itemSub, { color: theme.colors.textSecondary }]}>{t('homeBuy.entrySubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 30, fontWeight: '800', marginTop: 4, marginBottom: 10, fontVariant: ['tabular-nums'] },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  sumLabel: { fontSize: 14 },
  sumValue: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 10, marginLeft: 4 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemSub: { fontSize: 12, marginTop: 2 },
  itemValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  itemLine: { fontSize: 12, marginTop: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  fill: { height: 6, borderRadius: 3 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', minHeight: 48, marginBottom: 6 },
  addText: { fontSize: 14, fontWeight: '700' },
  simulate: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
});

export default WealthScreen;
