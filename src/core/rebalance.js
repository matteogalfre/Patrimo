/**
 * Rééquilibrage vers une répartition cible (fonctions pures).
 *
 * Trois poches : actions et ETF, crypto, liquidités. Le plus simple et le
 * moins coûteux fiscalement est d'orienter les nouveaux versements vers les
 * poches en retard plutôt que de vendre : c'est ce que propose
 * `splitContribution`. `fullRebalance` donne, pour information, les achats
 * et ventes qui ramèneraient pile à la cible.
 */

export const BUCKETS = Object.freeze(['stock', 'crypto', 'cash']);

const total = (values) => BUCKETS.reduce((s, b) => s + Math.max(0, values[b] || 0), 0);

/** Répartition actuelle en %. */
export const allocationPct = (values) => {
  const sum = total(values);
  return Object.fromEntries(BUCKETS.map((b) => [b, sum > 0 ? (Math.max(0, values[b] || 0) / sum) * 100 : 0]));
};

/** Cibles valides : positives et dont la somme fait 100. */
export const targetsValid = (targets) =>
  !!targets && BUCKETS.every((b) => Number.isFinite(targets[b]) && targets[b] >= 0)
  && Math.abs(BUCKETS.reduce((s, b) => s + targets[b], 0) - 100) < 0.01;

/**
 * Répartit un versement pour se rapprocher de la cible sans rien vendre :
 * d'abord combler les poches en retard, le reste selon la cible.
 * @returns {Object<string, number>} montant par poche
 */
export const splitContribution = ({ values, targets, amount }) => {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  if (!(amount > 0) || !targetsValid(targets)) return out;
  const after = total(values) + amount;
  const gaps = Object.fromEntries(BUCKETS.map((b) => [b, Math.max(0, (targets[b] / 100) * after - (values[b] || 0))]));
  const gapSum = BUCKETS.reduce((s, b) => s + gaps[b], 0);
  if (gapSum >= amount) {
    BUCKETS.forEach((b) => { out[b] = (amount * gaps[b]) / gapSum; });
    return out;
  }
  const rest = amount - gapSum;
  BUCKETS.forEach((b) => { out[b] = gaps[b] + (rest * targets[b]) / 100; });
  return out;
};

/** Achats (+) et ventes (−) qui donneraient exactement la cible. */
export const fullRebalance = ({ values, targets }) => {
  const sum = total(values);
  return Object.fromEntries(BUCKETS.map((b) => [b, targetsValid(targets) ? (targets[b] / 100) * sum - (values[b] || 0) : 0]));
};
