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

const TABLES = { livretA: LIVRET_A, ldds: LIVRET_A, lep: LEP };

export const isRegulated = (kind) => !!TABLES[kind];

/**
 * Taux en vigueur à une date, et depuis quand.
 * @returns {{rate: number, since: string}|null} null hors épargne réglementée
 */
export const officialRate = (kind, date = new Date()) => {
  const table = TABLES[kind];
  if (!table) return null;
  const day = new Date(date).toISOString().slice(0, 10);
  let hit = null;
  table.forEach(([since, rate]) => {
    if (since <= day) hit = { rate, since };
  });
  return hit;
};
