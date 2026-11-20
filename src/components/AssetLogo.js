/**
 * Logo d'un actif : vrai logo quand la source en a un, sinon monogramme sobre.
 *
 *  - cryptos : icônes CoinCap, sinon Binance (pour les plus récentes) ;
 *  - actions et ETF : logos Financial Modeling Prep (ticker Yahoo, ex. MC.PA) ;
 *  - banques et courtiers : favicon public de leur site (service de Google),
 *    ou leurs initiales dans la couleur de la marque.
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
import { institutionLogoUrl } from '../core/institutions';

const failed = new Set();

// Grandes valeurs américaines cotées en Allemagne sous un autre ticker
// (AMZ pour Amazon) : la source de logos n'a pas, ou a un mauvais logo,
// pour ces cotations. On prend celui de la cotation d'origine.
const GERMAN_LISTINGS = Object.freeze({
  AMZ: 'AMZN', APC: 'AAPL', MSF: 'MSFT', NVD: 'NVDA', FB2A: 'META', ABEA: 'GOOGL', ABEC: 'GOOG',
  TL0: 'TSLA', '1YD': 'AVGO', NFC: 'NFLX', ORC: 'ORCL', ADB: 'ADBE', CCC3: 'KO', MDO: 'MCD',
  NKE: 'NKE', WDP: 'DIS', UT8: 'UBER', '3V64': 'V', M4I: 'MA', AMD: 'AMD', PTX: 'PLTR',
  INL: 'INTC', CIS: 'CSCO', LLY: 'LLY', JNJ: 'JNJ', CMC: 'JPM', XONA: 'XOM', CTO: 'COST',
  WMT: 'WMT', PEP: 'PEP',
});
const GERMAN_PLACES = ['DE', 'F', 'BE', 'DU', 'HM', 'HA', 'MU', 'SG'];
// Places qui reprennent le ticker américain tel quel (Milan, Mexico, Vienne…).
const SAME_TICKER_PLACES = ['MI', 'MX', 'VI', 'SW'];
const US_TICKERS = new Set(Object.values(GERMAN_LISTINGS));

/** Le ticker dont on affiche le logo : celui de la cotation d'origine si on le connaît. */
export const logoSymbol = (assetId) => {
  const { type, symbol } = parseAssetId(assetId);
  if (!symbol || type === ASSET_TYPES.CRYPTO) return symbol || null;
  const dot = symbol.lastIndexOf('.');
  if (dot < 0) return symbol;
  const base = symbol.slice(0, dot).toUpperCase();
  const place = symbol.slice(dot + 1).toUpperCase();
  if (GERMAN_PLACES.includes(place) && GERMAN_LISTINGS[base]) return GERMAN_LISTINGS[base];
  if (SAME_TICKER_PLACES.includes(place) && US_TICKERS.has(base)) return base;
  return symbol;
};

/**
 * Logos blancs sur fond transparent, faits pour un fond sombre : sur notre
 * rond blanc, il ne resterait que le sourire d'Amazon. On leur donne le fond
 * de leur marque.
 */
const LOGO_BACKGROUNDS = Object.freeze({ AMZN: '#232F3E', DIS: '#0F2E8A', NKE: '#111111', UBER: '#000000', V: '#1A1F71' });

/** Sources possibles du logo d'un actif, dans l'ordre d'essai. */
export const logoUrls = (assetId) => {
  const { type, symbol } = parseAssetId(assetId);
  if (!symbol) return [];
  if (type === ASSET_TYPES.CRYPTO) {
    return [
      `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`,
      `https://bin.bnbstatic.com/static/assets/logos/${encodeURIComponent(symbol.toUpperCase())}.png`,
    ];
  }
  const ticker = logoSymbol(assetId);
  return [...new Set([ticker, symbol])].map((s) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`);
};

const initials = (symbol) => String(symbol || '?').split('.')[0].replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';

/** « BNP Paribas » → BNP, « Bourse Direct » → BD. */
const institutionInitials = (name) => {
  const words = String(name || '?').replace(/[^A-Za-z0-9\u00C0-\u00FF ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words[0] && words[0].length <= 4 && words[0] === words[0].toUpperCase()) return words[0];
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
};
// Agrandissement des icônes crypto, rondes avec une marge d'environ 4 %.
const COIN_ZOOM = 1.1;
// Le service renvoie une petite icône par défaut (16 px) quand le site n'a pas de logo.
const MIN_LOGO_SIZE = 32;

/**
 * @param {{assetId?: string, symbol?: string, icon?: string, institution?: object, size?: number}} props
 *   `icon` : nom Ionicons pour ce qui n'a pas de logo (comptes de liquidités) ;
 *   `institution` : banque ou courtier reconnu (voir core/institutions).
 */
const AssetLogo = memo(({ assetId, symbol, icon, institution, size = 36 }) => {
  const theme = useTheme();
  const sources = (institution ? [institutionLogoUrl(institution)] : !icon && assetId ? logoUrls(assetId) : []).filter(Boolean);
  // Première source qui n'a pas déjà échoué ; une erreur passe à la suivante.
  const [index, setIndex] = useState(() => sources.findIndex((u) => !failed.has(u)));
  const uri = index >= 0 ? sources[index] : null;
  const broken = !uri;
  const coin = !institution && parseAssetId(assetId).type === ASSET_TYPES.CRYPTO;
  const fail = () => {
    failed.add(uri);
    setIndex((i) => sources.findIndex((u, k) => k > i && !failed.has(u)));
  };
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (institution && broken) {
    return (
      <View style={[styles.fallback, box, { backgroundColor: institution.color }]}>
        <Text style={[styles.initials, { color: '#FFFFFF', fontSize: size * 0.32 }]}>{institutionInitials(institution.name)}</Text>
      </View>
    );
  }

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
    <View
      style={[
        box,
        styles.frame,
        // Une icône crypto est une pièce ronde : ni fond blanc ni contour autour.
        coin ? styles.coin : { backgroundColor: (!institution && LOGO_BACKGROUNDS[logoSymbol(assetId)]) || '#FFFFFF', borderColor: theme.colors.border },
      ]}
    >
      <Image
        key={uri}
        source={{ uri }}
        // Beaucoup de logos sont des carrés pleins (LVMH, BNP, Solana, SG) : ils
        // remplissent tout le rond, comme une icône d'app, au lieu d'un carré
        // posé dedans. Un logo rond (Bitcoin) épouse le cercle.
        // Les pièces ont une petite marge transparente : un peu plus grandes que
        // le rond, elles le remplissent sans liseré.
        style={coin ? { width: size * COIN_ZOOM, height: size * COIN_ZOOM } : { width: size, height: size }}
        resizeMode="cover"
        onError={fail}
        onLoad={(e) => {
          const w = e?.nativeEvent?.source?.width;
          if (institution && w && w < MIN_LOGO_SIZE) fail();
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
  coin: { borderWidth: 0, backgroundColor: 'transparent' },
});

export default AssetLogo;
