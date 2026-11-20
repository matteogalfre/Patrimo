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

const STEP = 5;
const ceilTo = (v, step) => Math.ceil(v / step) * step;
const roundTo = (v, step) => Math.round(v / step) * step;

/**
 * Règle la part des actions ou de la crypto ; les liquidités prennent le
 * reste. Le total fait donc toujours 100 % : impossible de le dépasser.
 * @param {{stock: number, crypto: number, cash: number}} targets
 * @param {'stock'|'crypto'} bucket
 */
export const setInvestedShare = (targets, bucket, value) => {
  const other = bucket === 'stock' ? 'crypto' : 'stock';
  const share = Math.max(0, Math.min(100 - targets[other], value));
  const next = { ...targets, [bucket]: share };
  next.cash = 100 - next.stock - next.crypto;
  return next;
};

/** Points de départ classiques (en %), à adapter. */
export const PRESETS = Object.freeze({
  prudent: { stock: 30, crypto: 0, cash: 70 },
  balanced: { stock: 60, crypto: 5, cash: 35 },
  dynamic: { stock: 85, crypto: 5, cash: 10 },
});

/**
 * Suggestion d'après l'épargne de précaution : 6 mois de dépenses en
 * liquidités, la crypto plafonnée à 10 %, le reste en actions et ETF.
 * @returns {{stock: number, crypto: number, cash: number}|null}
 */
export const fundBasedTargets = ({ values, monthlyExpenses, months = 6 }) => {
  const sum = total(values);
  if (!(sum > 0) || !(monthlyExpenses > 0)) return null;
  const cash = Math.min(100, Math.max(STEP, ceilTo(((monthlyExpenses * months) / sum) * 100, STEP)));
  const crypto = Math.min(10, roundTo(allocationPct(values).crypto, STEP), 100 - cash);
  return { stock: 100 - cash - crypto, crypto, cash };
};

/**
 * Remarques sur la répartition actuelle, de la plus importante à la plus
 * secondaire. Chaque remarque a ses valeurs ; l'écran se charge du texte.
 */
export const rebalanceInsights = ({ values, monthlyExpenses }) => {
  const out = [];
  const pct = allocationPct(values);
  if (monthlyExpenses > 0) {
    const months = (values.cash || 0) / monthlyExpenses;
    if (months < 3) out.push({ key: 'cashLow', level: 'warning', months });
    else if (months > 12) out.push({ key: 'cashHigh', level: 'info', months, surplus: (values.cash || 0) - monthlyExpenses * 6 });
  }
  if (pct.crypto > 10) out.push({ key: 'cryptoHigh', level: 'warning', pct: pct.crypto });
  return out;
};
