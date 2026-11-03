/**
 * Portefeuille : les positions, filtrables par enveloppe, et les liquidités.
 *
 * « Tout » regroupe un même actif détenu dans plusieurs enveloppes ; un filtre
 * d'enveloppe montre les positions de cette seule enveloppe. Les positions
 * soldées restent consultables : leur plus-value réalisée compte dans le
 * total.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/theme';
import { usePortfolio } from '../context/PortfolioContext';
import { useSettings } from '../context/SettingsContext';
import { CryptoCardSkeleton, PortfolioHeaderSkeleton } from '../components';
import { AssetRow, CashRow, AccountFilter } from '../components/Portfolio';
import ChangeBadge from '../components/ChangeBadge';
import { ErrorBanner } from '../components/NetworkStatus';
import { ACCOUNTS } from '../core/assets';

const PortfolioScreen = ({ navigation }) => {
  const theme = useTheme();
  const { t, formatAmount, privacyMode, togglePrivacyMode } = useSettings();
  const { assets, positions, totals, overview, cash, isLoading, isRefreshing, refresh, error } = usePortfolio();

  const [account, setAccount] = useState(null);
  const [query, setQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const isCash = account === ACCOUNTS.CASH;
  const availableAccounts = useMemo(
    () => [...Object.keys(totals.byAccount || {}), ...(cash.accounts.length ? [ACCOUNTS.CASH] : [])],
    [totals.byAccount, cash.accounts.length],
  );

  const summary = useMemo(() => {
    if (!account) return overview;
    if (isCash) return { value: cash.total };
    return totals.byAccount?.[account] || null;
  }, [account, isCash, overview, totals.byAccount, cash.total]);

  const items = useMemo(() => {
    if (isCash) return { held: [], closed: [] };
    const list = account ? positions.filter((p) => p.account === account) : assets;
    const q = query.trim().toUpperCase();
    const filtered = q
      ? list.filter((x) => x.symbol.toUpperCase().includes(q) || (x.name || '').toUpperCase().includes(q))
      : list;
    return {
      held: filtered.filter((x) => x.isHeld).sort((a, b) => b.value - a.value),
      closed: filtered.filter((x) => !x.isHeld).sort((a, b) => (b.lastDate > a.lastDate ? 1 : -1)),
    };
  }, [account, isCash, positions, assets, query]);

  const cashAccounts = useMemo(() => {
    if (account && !isCash) return [];
    const q = query.trim().toUpperCase();
    return q ? cash.accounts.filter((a) => a.name.toUpperCase().includes(q)) : cash.accounts;
  }, [account, isCash, cash.accounts, query]);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
  }, [refresh]);

  const openAsset = useCallback((item) => {
    Haptics.selectionAsync();
    navigation.navigate('AssetDetail', { assetId: item.assetId, account: item.account || null });
  }, [navigation]);

  const openCash = useCallback((acc) => {
    Haptics.selectionAsync();
    navigation.navigate('CashAccount', acc ? { accountId: acc.id } : {});
  }, [navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.skeletonTitle, { backgroundColor: theme.colors.surface }]} />
          </View>
          <PortfolioHeaderSkeleton style={{ marginHorizontal: 16 }} />
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <CryptoCardSkeleton />
            <CryptoCardSkeleton />
            <CryptoCardSkeleton />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const isEmpty = !assets.length && !cash.accounts.length;
  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];
  const showInvestments = !isCash && (items.held.length > 0 || items.closed.length > 0 || query);
  const showCash = !account || isCash;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{t('portfolio.title')}</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            togglePrivacyMode();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: privacyMode }}
          accessibilityLabel={t('privacy.toggle')}
          style={styles.iconBtn}
        >
          <Ionicons name={privacyMode ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <AccountFilter value={account} onChange={setAccount} available={availableAccounts} style={styles.filter} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {error && <ErrorBanner message={error} onRetry={onRefresh} t={t} />}

        {isEmpty ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>{t('portfolio.empty')}</Text>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{t('portfolio.emptySubtitle')}</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}
              accessibilityRole="button"
              onPress={() => navigation.navigate('Add')}
            >
              <Text style={[styles.primaryBtnText, { color: theme.colors.onPrimary }]}>{t('portfolio.addFirst')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} accessibilityRole="button" onPress={() => openCash(null)}>
              <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('cash.add')}</Text>
            </TouchableOpacity>
            {/* Après un changement de téléphone : restaurer sa sauvegarde. */}
            <TouchableOpacity style={styles.linkBtn} accessibilityRole="button" onPress={() => navigation.navigate('Settings')}>
              <Text style={[styles.linkText, { color: theme.colors.primary }]}>{t('settings.importBackup')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {summary && (
              <View style={styles.summary}>
                <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                  {account ? t(`accounts.${account}`) : t('portfolio.totalValue')}
                </Text>
                <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {formatAmount(summary.value, { decimals: 0 })}
                </Text>
                {!isCash && Number.isFinite(summary.totalPnL) && (
                  <View style={styles.summaryRow}>
                    <ChangeBadge value={summary.roi} />
                    <Text style={[styles.summarySub, { color: theme.colors.textSecondary }]}>
                      {formatAmount(summary.totalPnL, { decimals: 0, showSign: true })} · {t('portfolio.netInvested')}{' '}
                      {formatAmount(summary.netInvested, { decimals: 0 })}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {assets.length + cash.accounts.length > 5 && (
              <View style={[styles.search, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('portfolio.searchPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  autoCorrect={false}
                  accessibilityLabel={t('portfolio.searchPlaceholder')}
                />
                {!!query && (
                  <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showInvestments && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {t('portfolio.holdings')} <Text style={{ color: theme.colors.textTertiary }}>{items.held.length}</Text>
                </Text>
                {items.held.length > 0 ? (
                  <View style={cardStyle}>
                    {items.held.map((item, i) => (
                      <AssetRow key={item.key || item.assetId} item={item} onPress={openAsset} isLast={i === items.held.length - 1} />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.noResults, { color: theme.colors.textSecondary }]}>
                    {t('portfolio.noResultsHint', { query })}
                  </Text>
                )}

                {items.closed.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={styles.closedToggle}
                      onPress={() => setShowClosed((v) => !v)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showClosed }}
                    >
                      <Text style={[styles.closedToggleText, { color: theme.colors.textSecondary }]}>
                        {showClosed ? t('portfolio.hideClosed') : t('portfolio.showClosed', { count: items.closed.length })}
                      </Text>
                      <Ionicons name={showClosed ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    {showClosed && (
                      <View style={cardStyle}>
                        {items.closed.map((item, i) => (
                          <AssetRow key={item.key || item.assetId} item={item} onPress={openAsset} isLast={i === items.closed.length - 1} />
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {showCash && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, styles.sectionTitleInline, { color: theme.colors.text }]}>
                    {t('cash.title')} <Text style={{ color: theme.colors.textTertiary }}>{cashAccounts.length || ''}</Text>
                  </Text>
                  <TouchableOpacity onPress={() => openCash(null)} accessibilityRole="button" style={styles.addLink}>
                    <Ionicons name="add" size={18} color={theme.colors.primary} />
                    <Text style={[styles.addLinkText, { color: theme.colors.primary }]}>{t('cash.addShort')}</Text>
                  </TouchableOpacity>
                </View>
                {cashAccounts.length > 0 ? (
                  <View style={cardStyle}>
                    {cashAccounts.map((a, i) => (
                      <CashRow key={a.id} account={a} onPress={openCash} isLast={i === cashAccounts.length - 1} />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.cashHint, { color: theme.colors.textTertiary }]}>{t('cash.emptyHint')}</Text>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, paddingTop: 4, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filter: { marginTop: 4, marginBottom: 6 },
  summary: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  summaryLabel: { fontSize: 13, fontWeight: '500' },
  summaryValue: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  summarySub: { fontSize: 13 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 12, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, marginBottom: 10 },
  sectionTitleInline: { paddingHorizontal: 0 },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 8, marginBottom: 10 },
  addLinkText: { fontSize: 14, fontWeight: '600' },
  cashHint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 20, marginBottom: 12 },
  closedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, marginBottom: 4 },
  closedToggleText: { fontSize: 13, fontWeight: '600' },
  noResults: { textAlign: 'center', paddingVertical: 16, paddingHorizontal: 24, fontSize: 14 },
  emptyState: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  primaryBtn: { minHeight: 50, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600' },
  skeletonTitle: { width: 140, height: 28, borderRadius: 8, marginVertical: 8 },
});

export default PortfolioScreen;
