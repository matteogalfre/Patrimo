/**
 * Indépendance financière (fonctions pures) : le capital qui suffit à vivre
 * de ses revenus, et quand on l'atteint.
 *
 * Capital visé = revenu annuel voulu ÷ taux de retrait. La « règle des 4 % »
 * vient de l'étude Trinity (1998) sur des retraites de 30 ans aux
 * États-Unis ; pour une rente plus longue, on prend souvent 3 à 3,5 %.
 *
 * Tout est en euros d'aujourd'hui : les rendements sont réels (après
 * inflation), le revenu visé garde donc son pouvoir d'achat.
 *
 * Le chemin se simule 1 000 fois (Monte-Carlo) : chaque année tire un
 * rendement au hasard autour de la moyenne attendue, avec la volatilité du
 * portefeuille. On obtient une probabilité plutôt qu'une date unique.
 */

/**
 * Hypothèses réelles par classe d'actifs, en % par an. Actions mondiales :
 * environ 5 % au-dessus de l'inflation sur longue période, 16 % de
 * volatilité. Crypto : très volatile, on lui prête le même rendement que
 * les actions, pas plus. Liquidités : le Livret A suit l'inflation.
 */
export const ASSUMPTIONS = Object.freeze({
  stock: { mu: 5, sigma: 16 },
  crypto: { mu: 5, sigma: 60 },
  cash: { mu: 0, sigma: 1 },
});

// Corrélation entre actions et crypto ; les liquidités ne bougent pas avec.
const RHO_STOCK_CRYPTO = 0.3;

export const WITHDRAWAL_RATES = Object.freeze([3, 3.5, 4]);

export const targetCapital = (monthlyIncome, withdrawalRate) => (
  monthlyIncome > 0 && withdrawalRate > 0 ? (monthlyIncome * 12) / (withdrawalRate / 100) : 0
);

/**
 * Rendement et volatilité attendus d'après la répartition.
 * @param {{stock: number, crypto: number, cash: number}} values - montants par classe
 * @returns {{mu: number, sigma: number}} en %
 */
export const portfolioAssumptions = ({ stock = 0, crypto = 0, cash = 0 }) => {
  const total = stock + crypto + cash;
  if (!(total > 0)) return { ...ASSUMPTIONS.stock };
  const w = { stock: stock / total, crypto: crypto / total, cash: cash / total };
  const mu = w.stock * ASSUMPTIONS.stock.mu + w.crypto * ASSUMPTIONS.crypto.mu + w.cash * ASSUMPTIONS.cash.mu;
  const s = w.stock * ASSUMPTIONS.stock.sigma;
  const c = w.crypto * ASSUMPTIONS.crypto.sigma;
  const k = w.cash * ASSUMPTIONS.cash.sigma;
  return { mu, sigma: Math.sqrt(s * s + c * c + k * k + 2 * RHO_STOCK_CRYPTO * s * c) };
};

// Générateur pseudo-aléatoire à graine : le même calcul donne le même résultat.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const normal = (rand) => {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

/**
 * @param {{start: number, monthly: number, target: number, mu: number, sigma: number, years?: number, paths?: number, seed?: number}} params
 *   mu, sigma : rendement réel moyen et volatilité, en % par an
 * @returns {{
 *   reachedBy: number[],          // part des chemins arrivés au but, fin de chaque année (index 0 = aujourd'hui)
 *   p10: number[], p50: number[], p90: number[],
 *   medianYears: number|null,     // années pour qu'un chemin sur deux y soit
 *   likelyYears: number|null,     // années pour 80 % des chemins
 * }}
 */
export const simulateIndependence = ({ start = 0, monthly = 0, target, mu, sigma, years = 40, paths = 1000, seed = 42 }) => {
  const rand = mulberry32(seed);
  // Rendements log-normaux de moyenne `mu` : jamais de perte au-delà de 100 %.
  const m = 1 + mu / 100;
  const s2 = Math.log(1 + (sigma / 100) ** 2 / (m * m));
  const drift = Math.log(m) - s2 / 2;
  const vol = Math.sqrt(s2);
  const yearly = monthly * 12;

  const values = Array.from({ length: years + 1 }, () => new Float64Array(paths));
  const reached = new Array(years + 1).fill(0);
  for (let p = 0; p < paths; p += 1) {
    let v = start;
    let done = v >= target;
    values[0][p] = v;
    if (done) reached[0] += 1;
    for (let y = 1; y <= years; y += 1) {
      const r = Math.exp(drift + vol * normal(rand)) - 1;
      // Les versements de l'année sont investis en moyenne à mi-année.
      v = v * (1 + r) + yearly * (1 + r / 2);
      values[y][p] = v;
      if (!done && v >= target) done = true;
      if (done) reached[y] += 1;
    }
  }
  const sorted = values.map((row) => Array.from(row).sort((a, b) => a - b));
  const reachedBy = reached.map((n) => n / paths);
  const firstYear = (share) => {
    const i = reachedBy.findIndex((x) => x >= share);
    return i >= 0 ? i : null;
  };
  return {
    reachedBy,
    p10: sorted.map((row) => quantile(row, 0.1)),
    p50: sorted.map((row) => quantile(row, 0.5)),
    p90: sorted.map((row) => quantile(row, 0.9)),
    medianYears: firstYear(0.5),
    likelyYears: firstYear(0.8),
  };
};
