/**
 * Couleurs des graphiques de répartition.
 *
 * Une palette courte et désaturée, attribuée par RANG (la plus grosse ligne
 * prend la première couleur) : deux parts voisines ne se ressemblent jamais,
 * et l'identité de chaque actif passe par son logo, pas par sa couleur.
 */

import { ACCOUNTS, ASSET_TYPES } from '../core/assets';

export const CHART_PALETTE = [
  '#5B8DEF', // bleu
  '#E58FB8', // rose
  '#9381E3', // lavande
  '#F2A65A', // abricot
  '#4FB59B', // vert d'eau
  '#E5C15D', // ocre
  '#7FB3D5', // bleu clair
  '#C9A08A', // sable
];

export const OTHERS_COLOR = '#B8BCC4';

export const paletteColor = (index) => CHART_PALETTE[index % CHART_PALETTE.length];

export const ACCOUNT_COLORS = {
  [ACCOUNTS.PEA]: '#5B8DEF',
  [ACCOUNTS.CTO]: '#9381E3',
  [ACCOUNTS.CRYPTO]: '#F2A65A',
  [ACCOUNTS.CASH]: '#4FB59B',
};

export const CLASS_COLORS = {
  [ASSET_TYPES.STOCK]: '#5B8DEF',
  [ASSET_TYPES.CRYPTO]: '#F2A65A',
  cash: '#4FB59B',
};
