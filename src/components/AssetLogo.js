/**
 * Logo d'un actif : vrai logo quand la source en a un, sinon monogramme sobre.
 *
 *  - cryptos : icônes CoinCap ;
 *  - actions et ETF : logos Financial Modeling Prep (ticker Yahoo, ex. MC.PA).
 *
 * Ces services voient quels logos sont demandés, comme Yahoo et Binance
 * voient quels cours le sont. Une image qui échoue n'est pas retentée avant
 * le prochain lancement.
 */

import React, { memo, useState } from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/theme';
import { ASSET_TYPES, parseAssetId } from '../core/assets';

const failed = new Set();

export const logoUrl = (assetId) => {
  const { type, symbol } = parseAssetId(assetId);
  if (!symbol) return null;
  if (type === ASSET_TYPES.CRYPTO) return `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`;
};

const initials = (symbol) => String(symbol || '?').split('.')[0].replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';

/**
 * @param {{assetId?: string, symbol?: string, icon?: string, size?: number}} props
 *   `icon` : nom Ionicons pour ce qui n'a pas de logo (comptes de liquidités).
 */
const AssetLogo = memo(({ assetId, symbol, icon, size = 36 }) => {
  const theme = useTheme();
  const uri = !icon && assetId ? logoUrl(assetId) : null;
  const [broken, setBroken] = useState(() => !uri || failed.has(uri));
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (icon || broken) {
    return (
      <View style={[styles.fallback, box, { backgroundColor: theme.colors.backgroundSecondary }]}>
        {icon ? (
          <Ionicons name={icon} size={size * 0.5} color={theme.colors.textSecondary} />
        ) : (
          <Text style={[styles.initials, { color: theme.colors.textSecondary, fontSize: size * 0.36 }]}>
            {initials(symbol || parseAssetId(assetId).symbol)}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[box, styles.frame, { backgroundColor: '#FFFFFF', borderColor: theme.colors.border }]}>
      <Image
        source={{ uri }}
        style={{ width: size * 0.78, height: size * 0.78 }}
        resizeMode="contain"
        onError={() => {
          failed.add(uri);
          setBroken(true);
        }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
});

AssetLogo.displayName = 'AssetLogo';

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700', letterSpacing: 0.3 },
  frame: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});

export default AssetLogo;
