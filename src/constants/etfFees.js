import { REFERENCE_ETFS } from './etfBenchmarks';

/**
 * TER connus, en %. Quand l'émetteur et les sites de données ne donnent pas
 * le même chiffre, on garde la fourchette et le calcul prend le milieu. Un TER
 * saisi sur la fiche de l'actif passe toujours devant.
 *
 * Les ETF de référence (constants/etfBenchmarks), sur toutes leurs cotations.
 * BNP Paribas Easy S&P 500 : 0,14 %, comme les « coûts liés au produit »
 * affichés par Bourse Direct avant chaque ordre (novembre 2026).
 */
export const KNOWN_TERS = Object.fromEntries(
  Object.values(REFERENCE_ETFS).flat().flatMap((etf) => [etf.ticker, ...(etf.alt || [])]
    .map((ticker) => [`stock:${ticker}`, { min: etf.ter, max: etf.ter }])),
);
