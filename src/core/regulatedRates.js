/**
 * Taux de l'épargne réglementée (fonctions pures). Fixés par l'État, les
 * mêmes pour tout le monde : l'app les applique d'office au Livret A, au
 * LDDS et au LEP, sans rien demander.
 *
 * La Banque de France publie ces séries, mais leur API demande une clé
 * personnelle : la table vit donc ici, mise à jour avec l'app. Les taux ne
 * changent qu'au 1er février et au 1er août (rarement entre les deux).
 * Source : arrêtés publiés au Journal officiel.
 */

const LIVRET_A = [
  ['2020-02-01', 0.5],
  ['2022-02-01', 1],
  ['2022-08-01', 2],
  ['2023-02-01', 3],
  ['2025-02-01', 2.4],
  ['2025-08-01', 1.7],
  ['2026-02-01', 1.5],
  ['2026-08-01', 1.7],
];

const LEP = [
  ['2020-02-01', 1],
  ['2022-02-01', 2.2],
  ['2022-08-01', 4.6],
  ['2023-02-01', 6.1],
  ['2023-08-01', 6],
  ['2024-02-01', 5],
  ['2024-08-01', 4],
  ['2025-02-01', 3.5],
  ['2025-08-01', 2.7],
  ['2026-02-01', 2.5],
];

// CEL : deux tiers du taux du Livret A, arrondis au quart de point le plus
// proche (arrêté du 27 janvier 2021).
const CEL = [
  ['2020-02-01', 0.25],
  ['2022-02-01', 0.75],
  ['2022-08-01', 1.25],
  ['2023-02-01', 2],
  ['2025-02-01', 1.5],
  ['2025-08-01', 1.25],
  ['2026-02-01', 1],
  ['2026-08-01', 1.25],
];

// PEL : taux fixé à l'ouverture, pour toute la vie du plan (hors prime
// d'État pour les plans d'avant 2018). [ouvert à partir du, taux]
// Source : service-public.gouv.fr (F16140) et avis au Journal officiel.
const PEL = [
  ['2003-08-01', 2.5],
  ['2015-02-01', 2],
  ['2016-02-01', 1.5],
  ['2016-08-01', 1],
  ['2023-01-01', 2],
  ['2024-01-01', 2.25],
  ['2025-01-01', 1.75],
  ['2026-01-01', 2],
];

const TABLES = { livretA: LIVRET_A, ldds: LIVRET_A, lep: LEP, cel: CEL };

const lookup = (table, date) => {
  const day = new Date(date).toISOString().slice(0, 10);
  let hit = null;
  table.forEach(([since, rate]) => {
    if (since <= day) hit = { rate, since };
  });
  return hit;
};

export const isRegulated = (kind) => !!TABLES[kind] || kind === 'pel';

/**
 * Taux en vigueur à une date, et depuis quand. Pour un PEL, le taux de sa
 * génération : celui en vigueur le jour de son ouverture (`openedAt`).
 * @returns {{rate: number, since: string}|null} null hors épargne réglementée
 */
export const officialRate = (kind, date = new Date(), { openedAt } = {}) => {
  if (kind === 'pel') return openedAt ? lookup(PEL, openedAt) : null;
  const table = TABLES[kind];
  return table ? lookup(table, date) : null;
};

/** Taux plancher : le Livret Jeune rapporte au moins autant que le Livret A. */
export const minimumRate = (kind, date = new Date()) => (kind === 'livretJeune' ? lookup(LIVRET_A, date) : null);
