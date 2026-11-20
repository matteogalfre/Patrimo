/**
 * Marchés (fonctions pures) : où en est un indice, et ce qui s'est passé
 * les autres fois qu'il était dans la même situation.
 *
 * Tout est calculé sur l'historique quotidien de l'indice (S&P 500 depuis
 * 1950, Bitcoin depuis 2014) : rien n'est écrit en dur. Les cours sont des
 * clôtures en dollars, sans les dividendes. Le passé ne dit pas l'avenir :
 * l'écran montre toujours le pire cas à côté de la médiane.
 *
 * Un historique est une liste de [jour 'YYYY-MM-DD', clôture], du plus
 * ancien au plus récent. Les variations sont des fractions (−0,05 = −5 %).
 */

export const MARKETS = Object.freeze({
  sp500: {
    id: 'sp500',
    symbol: '^GSPC',
    since: '1950-01-01',
    currency: 'USD',
    // Paliers de baisse depuis le plus haut, et de baisse en une séance, en %.
    drawdownSteps: [5, 10, 15, 20, 30, 40, 50],
    dropSteps: [2, 3, 4, 5, 7],
    ruleSteps: [10, 15, 20, 30],
    fear: 'vix',
    exposure: 'sp500',
  },
  btc: {
    id: 'btc',
    symbol: 'BTC-USD',
    since: '2014-09-17',
    currency: 'USD',
    drawdownSteps: [10, 20, 30, 40, 50, 60, 70, 80],
    dropSteps: [5, 8, 10, 15],
    ruleSteps: [30, 50, 70],
    fear: 'crypto',
    assetId: 'crypto:BTC',
  },
});

const DAY = 24 * 60 * 60 * 1000;
const timeOf = (key) => new Date(`${key}T12:00:00Z`).getTime();

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** { 'YYYY-MM-DD': clôture } → [[jour, clôture]] trié, sans valeur vide. */
export const toPoints = (series) => Object.entries(series || {})
  .filter(([, v]) => Number(v) > 0)
  .map(([d, v]) => [d, Number(v)])
  .sort((a, b) => (a[0] < b[0] ? -1 : 1));

/** Variation entre un jour et le premier jour coté au moins `days` jours plus tard. */
const changeAfter = (points, i, days) => {
  const target = timeOf(points[i][0]) + days * DAY;
  for (let j = i; j < points.length; j += 1) {
    if (timeOf(points[j][0]) >= target) return points[j][1] / points[i][1] - 1;
  }
  return null;
};

/** Le plus haut historique et son jour. */
export const allTimeHigh = (points) => points.reduce(
  (best, [date, value]) => (value > best.value ? { date, value } : best),
  { date: null, value: 0 },
);

/** Moyenne mobile sur `n` séances, alignée sur les points (null tant qu'il en manque). */
export const movingAverage = (points, n) => {
  const out = new Array(points.length).fill(null);
  let sum = 0;
  points.forEach(([, v], i) => {
    sum += v;
    if (i >= n) sum -= points[i - n][1];
    if (i >= n - 1) out[i] = sum / n;
  });
  return out;
};

/**
 * Où en est l'indice : dernier cours, variations du jour et de la semaine,
 * écart au plus haut historique et aux moyennes mobiles 50 et 200 jours.
 * @param {Array} points - au moins quelques séances récentes
 * @param {{date: string, value: number}|null} ath - plus haut connu de tout l'historique
 */
export const marketState = (points, ath = null) => {
  const n = points.length;
  if (n < 2) return null;
  const [date, close] = points[n - 1];
  const high = [ath, allTimeHigh(points)].filter(Boolean).reduce((a, b) => (b.value > a.value ? b : a));
  const ma50 = movingAverage(points, 50)[n - 1];
  const ma200 = movingAverage(points, 200)[n - 1];
  return {
    date,
    close,
    change1d: close / points[n - 2][1] - 1,
    change5d: close / points[Math.max(0, n - 6)][1] - 1,
    high: high.value,
    highDate: high.date,
    drawdown: close / high.value - 1,
    ma50,
    ma200,
    distMa50: ma50 ? close / ma50 - 1 : null,
    distMa200: ma200 ? close / ma200 - 1 : null,
  };
};

/**
 * Chaque fois que l'indice est passé à `threshold` sous son plus haut (une
 * seule fois par cycle, jusqu'au plus haut suivant) : jusqu'où il est
 * descendu ensuite, et où il était 1 an et 3 ans plus tard.
 */
export const drawdownEvents = (points, threshold) => {
  const out = [];
  let peak = 0;
  let armed = true;
  for (let i = 0; i < points.length; i += 1) {
    const v = points[i][1];
    if (v > peak) {
      peak = v;
      armed = true;
    } else if (armed && v <= peak * (1 - threshold)) {
      let low = v;
      for (let j = i; j < points.length && points[j][1] <= peak; j += 1) low = Math.min(low, points[j][1]);
      out.push({ date: points[i][0], trough: low / peak - 1, fwd1y: changeAfter(points, i, 365), fwd3y: changeAfter(points, i, 365 * 3) });
      armed = false;
    }
  }
  return out;
};

/** Les séances en baisse d'au moins `threshold`, et l'indice un an plus tard. */
export const dropDayEvents = (points, threshold) => {
  const out = [];
  for (let i = 1; i < points.length; i += 1) {
    const change = points[i][1] / points[i - 1][1] - 1;
    if (change <= -threshold) out.push({ date: points[i][0], change, fwd1y: changeAfter(points, i, 365) });
  }
  return out;
};

const forward = (list) => (list.length
  ? { n: list.length, up: list.filter((x) => x > 0).length, median: median(list), worst: Math.min(...list) }
  : null);

/** Résumé d'une liste d'épisodes : combien, jusqu'où, et la suite à 1 et 3 ans. */
export const summarize = (events, threshold) => ({
  count: events.length,
  troughMedian: events.some((e) => e.trough != null) ? median(events.filter((e) => e.trough != null).map((e) => e.trough)) : null,
  troughWorst: events.some((e) => e.trough != null) ? Math.min(...events.filter((e) => e.trough != null).map((e) => e.trough)) : null,
  // Épisodes où la baisse a continué d'au moins 10 points.
  deeper: events.filter((e) => e.trough != null && e.trough <= -(threshold + 0.1)).length,
  fwd1y: forward(events.map((e) => e.fwd1y).filter((v) => v != null)),
  fwd3y: forward(events.map((e) => e.fwd3y).filter((v) => v != null)),
  recent: events.slice(-3).map((e) => e.date),
});

/**
 * Étaler un achat sur `months` mois à partir du début de la baisse, plutôt
 * que tout acheter ce jour-là : le prix moyen obtenu était-il meilleur ?
 * (Même somme chaque mois : le prix moyen est la moyenne harmonique.)
 */
export const spreadVersusLump = (points, events, months = 6) => {
  const results = [];
  const indexOf = new Map(events.length ? points.map(([d], idx) => [d, idx]) : []);
  events.forEach((e) => {
    const i = indexOf.get(e.date) ?? -1;
    if (i < 0) return;
    const prices = [];
    let j = i;
    for (let k = 0; k < months; k += 1) {
      const target = timeOf(e.date) + k * 30 * DAY;
      while (j < points.length && timeOf(points[j][0]) < target) j += 1;
      if (j >= points.length) return;
      prices.push(points[j][1]);
    }
    const average = months / prices.reduce((s, p) => s + 1 / p, 0);
    results.push(points[i][1] / average - 1);
  });
  return results.length ? { n: results.length, better: results.filter((x) => x > 0).length, median: median(results) } : null;
};

/** Toutes les statistiques d'un indice, pour chaque palier (calculées une fois, gardées une semaine). */
export const computeMarketStats = (points, market) => {
  const drawdown = {};
  const spread = {};
  market.drawdownSteps.forEach((step) => {
    const events = drawdownEvents(points, step / 100);
    drawdown[step] = summarize(events, step / 100);
    spread[step] = spreadVersusLump(points, events, 6);
  });
  const drops = {};
  market.dropSteps.forEach((step) => {
    drops[step] = summarize(dropDayEvents(points, step / 100).map((e) => ({ ...e, trough: null, fwd3y: null })), step / 100);
  });
  return { drawdown, drops, spread, since: points[0]?.[0] || null };
};

/** Le palier franchi : le plus grand pas inférieur ou égal à la baisse (en %), ou null. */
export const stepFor = (drop, steps) => {
  const pct = Math.abs(drop) * 100;
  return [...steps].reverse().find((s) => pct >= s) ?? null;
};

/**
 * Niveau de peur. VIX (volatilité attendue du S&P 500) : sous 15 calme,
 * 15 à 20 normal, 20 à 30 inquiétude, 30 à 40 peur, au-delà panique.
 * Indice Fear & Greed crypto (alternative.me), de 0 à 100.
 */
export const fearLevel = (kind, value) => {
  if (!Number.isFinite(value)) return null;
  if (kind === 'vix') {
    if (value < 15) return 'calm';
    if (value < 20) return 'normal';
    if (value < 30) return 'worry';
    if (value < 40) return 'fear';
    return 'panic';
  }
  if (value < 25) return 'panic';
  if (value < 45) return 'fear';
  if (value < 56) return 'normal';
  if (value < 75) return 'greed';
  return 'euphoria';
};

/**
 * Ce que tu pourrais investir sans toucher à ta réserve ni dépasser ta
 * cible : le plus petit de l'épargne au-delà de la réserve et de ce qu'il
 * manque pour atteindre ta répartition cible. Un calcul, pas un conseil.
 * @returns {{surplus: number, gap: number|null, amount: number|null, perMonth: number}}
 */
export const opportunity = ({ available = 0, reserve = 0, targetPct = null, current = 0, total = 0, months = 6 }) => {
  const surplus = Math.max(0, available - reserve);
  const gap = targetPct == null ? null : (targetPct / 100) * total - current;
  if (gap == null) return { surplus, gap: null, amount: null, perMonth: 0 };
  const amount = Math.max(0, Math.floor(Math.min(surplus, gap) / 100) * 100);
  return { surplus, gap, amount, perMonth: amount > 0 ? Math.round(amount / months) : 0 };
};

/** Une règle « si l'indice passe à −X %, préviens-moi » est-elle à déclencher ? Une fois par cycle. */
export const ruleTriggered = (rule, state) => {
  if (!rule?.threshold || !state) return null;
  if (-state.drawdown * 100 < rule.threshold) return null;
  const key = `${state.highDate}:${rule.threshold}`;
  return rule.notifiedFor === key ? null : key;
};
