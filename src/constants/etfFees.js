/**
 * TER connus, en %. Quand l'émetteur et les sites de données ne donnent pas
 * le même chiffre, on garde la fourchette et le calcul prend le milieu. Un TER
 * saisi sur la fiche de l'actif passe toujours devant.
 */
export const KNOWN_TERS = {
  // BNP Paribas Easy S&P 500 : 0,12 % (fiche BNP Paribas AM, 2024) à 0,14 % (finanzen.net, 2026).
  'stock:ESE.PA': { min: 0.12, max: 0.14 },
};
