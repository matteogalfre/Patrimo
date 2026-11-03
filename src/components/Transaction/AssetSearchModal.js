/**
 * Recherche d'un actif, toutes classes confondues : actions et ETF (Yahoo),
 * cryptos (Binance). Sans saisie, on propose d'abord les actifs déjà détenus,
 * puis quelques valeurs courantes chez les investisseurs français.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/theme';
import { useSettings } from '../../context/SettingsContext';
import { marketData, rankResults } from '../../services/marketData';
import { ASSET_TYPES, makeAssetId } from '../../core/assets';
import AssetLogo from '../AssetLogo';

const SEARCH_DELAY = 350;

const popular = (assetType, symbol, name, quoteType) => ({
  assetType,
  assetId: makeAssetId(assetType, symbol),
  symbol,
  name,
  quoteType,
  exchange: assetType === ASSET_TYPES.CRYPTO ? 'Binance' : 'Paris',
});

const POPULAR = [
  popular(ASSET_TYPES.STOCK, 'WPEA.PA', 'iShares MSCI World Swap PEA', 'ETF'),
  popular(ASSET_TYPES.STOCK, 'CW8.PA', 'Amundi MSCI World', 'ETF'),
  popular(ASSET_TYPES.STOCK, 'ESE.PA', 'BNP Paribas Easy S&P 500', 'ETF'),
  popular(ASSET_TYPES.STOCK, 'AI.PA', 'Air Liquide', 'EQUITY'),
  popular(ASSET_TYPES.STOCK, 'MC.PA', 'LVMH', 'EQUITY'),
  popular(ASSET_TYPES.STOCK, 'TTE.PA', 'TotalEnergies', 'EQUITY'),
  popular(ASSET_TYPES.CRYPTO, 'BTC', 'Bitcoin', 'CRYPTO'),
  popular(ASSET_TYPES.CRYPTO, 'ETH', 'Ethereum', 'CRYPTO'),
  popular(ASSET_TYPES.CRYPTO, 'SOL', 'Solana', 'CRYPTO'),
];

const AssetSearchModal = ({ visible, onClose, onSelect, ownedAssets = [], stocksOnly = false }) => {
  const theme = useTheme();
  const { t } = useSettings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      // Chaque source s'affiche dès qu'elle répond.
      const parts = marketData.searchParts(q);
      const found = [[], []];
      parts.forEach((p, i) => p.then((list) => {
        if (id !== requestId.current) return;
        found[i] = list;
        setResults(rankResults([...found[0], ...found[1]], q));
      }));
      Promise.all(parts).finally(() => {
        if (id === requestId.current) setSearching(false);
      });
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [query]);

  const keep = (a) => !stocksOnly || a.assetType === ASSET_TYPES.STOCK;

  const sections = useMemo(() => {
    if (query.trim()) return results.filter(keep).map((r) => ({ ...r, key: r.assetId }));
    const owned = ownedAssets.filter(keep);
    const ownedIds = new Set(owned.map((a) => a.assetId));
    const rows = [];
    if (owned.length) {
      rows.push({ header: t('search.owned'), key: 'h-owned' });
      owned.forEach((a) => rows.push({ ...a, key: `o-${a.assetId}` }));
    }
    const pop = POPULAR.filter((p) => keep(p) && !ownedIds.has(p.assetId));
    if (pop.length) {
      rows.push({ header: t('search.popular'), key: 'h-popular' });
      pop.forEach((a) => rows.push({ ...a, key: `p-${a.assetId}` }));
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results, ownedAssets, stocksOnly, t]);

  const typeLabel = (item) => {
    if (item.assetType === ASSET_TYPES.CRYPTO) return t('search.types.crypto');
    if (item.quoteType === 'ETF') return t('search.types.etf');
    if (item.quoteType === 'MUTUALFUND') return t('search.types.fund');
    // Actif déjà détenu : on ne sait pas toujours si c'est une action ou un ETF.
    return item.quoteType ? t('search.types.stock') : null;
  };

  const renderItem = ({ item }) => {
    if (item.header) {
      return <Text style={[styles.header, { color: theme.colors.textSecondary }]}>{item.header}</Text>;
    }
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.colors.border }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSelect({
            assetId: item.assetId,
            assetType: item.assetType,
            symbol: item.symbol,
            name: item.name || item.symbol,
            exchange: item.exchange,
            quoteType: item.quoteType,
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.name} ${item.symbol}`}
      >
        <AssetLogo assetId={item.assetId} symbol={item.symbol} />
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{item.name || item.symbol}</Text>
          <Text style={[styles.meta, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            {item.symbol}{item.exchange ? ` · ${item.exchange}` : ''}
          </Text>
        </View>
        {!!typeLabel(item) && (
          <View style={[styles.badge, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <Text style={[styles.badgeText, { color: theme.colors.textSecondary }]}>{typeLabel(item)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const empty = () => {
    if (!query.trim()) return null;
    if (searching) return <ActivityIndicator style={styles.spinner} color={theme.colors.primary} />;
    return (
      <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
        {t('search.noResults', { query: query.trim() })}
      </Text>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{t('search.title')}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
            <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={[styles.inputWrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={stocksOnly ? t('search.placeholderStocks') : t('search.placeholder')}
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.input, { color: theme.colors.text }]}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && !!query && <ActivityIndicator size="small" color={theme.colors.primary} />}
        </View>
        <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{t('search.hint')}</Text>
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  hint: { fontSize: 11, marginHorizontal: 20, marginTop: 6, marginBottom: 4 },
  list: { paddingBottom: 32 },
  header: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  spinner: { marginTop: 32 },
  empty: { textAlign: 'center', marginTop: 32, paddingHorizontal: 24, fontSize: 14 },
});

export default AssetSearchModal;
