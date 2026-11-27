/**
 * Projection du patrimoine : intérêts composés mensuels avec un versement
 * fixe chaque mois (fonctions pures).
 *
 * Tout est en euros d'aujourd'hui, comme l'écran Indépendance : les
 * rendements sont réels (après inflation, avant impôts). Le scénario moyen
 * reprend l'hypothèse des actions mondiales d'Indépendance (5 % au-dessus de
 * l'inflation) : les deux écrans racontent le même avenir.
 */

export const SCENARIOS = Object.freeze({
  prudent: 2,
  median: 5,
  optimistic: 7,
});

/** Inflation supposée pour passer un taux de livret en rendement réel. */
export const INFLATION_ASSUMPTION = 2;

/** Taux réel d'un livret : son taux moins l'inflation (le Livret A la suit à peu près). */
export const realRate = (nominal) => nominal - INFLATION_ASSUMPTION;

/**
 * @param {{start: number, monthly: number, years: number, annualRate: number}} params
 * @returns {{points: Array<{year: number, value: number, contributed: number}>, final: number, contributed: number, gains: number}}
 */
export const projectWealth = ({ start = 0, monthly = 0, years = 10, annualRate = 5 }) => {
  const r = (1 + annualRate / 100) ** (1 / 12) - 1;
  let value = Math.max(0, start);
  let contributed = value;
  const points = [{ year: 0, value, contributed }];
  for (let m = 1; m <= years * 12; m += 1) {
    value = value * (1 + r) + monthly;
    contributed += monthly;
    if (m % 12 === 0) points.push({ year: m / 12, value, contributed });
  }
  return { points, final: value, contributed, gains: value - contributed };
};

/**
 * Épargne mensuelle moyenne des 12 derniers mois, arrondie à 10 près :
 * sert de valeur de départ au simulateur.
 */
export const averageMonthlySavings = (investedYearAgo, investedNow) => {
  const monthly = (investedNow - investedYearAgo) / 12;
  return monthly > 0 ? Math.round(monthly / 10) * 10 : 0;
};

/**
 * Projection en deux poches : les placements au rendement du scénario, les
 * liquidités au taux des livrets. `share` (0 à 1) des liquidités peut être
 * investie, d'un coup ou répartie sur `spreadMonths` mois ; l'épargne
 * mensuelle va toujours aux placements. Avec `share` à 0, c'est le scénario
 * « je ne change rien ».
 *
 * @returns {{points: Array<{year: number, value: number, contributed: number}>, final: number, contributed: number, gains: number, moved: number}}
 */
export const projectPortfolio = ({
  invested = 0, cash = 0, monthly = 0, monthlyCash = 0, years = 10, annualRate = 5, cashRate = 0, share = 0, spreadMonths = 0,
}) => {
  const r = (1 + annualRate / 100) ** (1 / 12) - 1;
  const rc = (1 + cashRate / 100) ** (1 / 12) - 1;
  const moved = Math.max(0, cash) * Math.min(1, Math.max(0, share));
  const perMonth = spreadMonths > 0 ? moved / spreadMonths : 0;
  let inv = Math.max(0, invested) + (spreadMonths > 0 ? 0 : moved);
  let liquid = Math.max(0, cash) - (spreadMonths > 0 ? 0 : moved);
  let contributed = Math.max(0, invested) + Math.max(0, cash);
  const points = [{ year: 0, value: inv + liquid, contributed }];
  for (let m = 1; m <= years * 12; m += 1) {
    const transfer = m <= spreadMonths ? Math.min(perMonth, liquid) : 0;
    inv = (inv + transfer) * (1 + r) + monthly;
    // Ce qui reste chaque mois sans être investi dort sur les comptes, au taux des livrets.
    liquid = (liquid - transfer) * (1 + rc) + Math.max(0, monthlyCash);
    contributed += monthly + Math.max(0, monthlyCash);
    if (m % 12 === 0) points.push({ year: m / 12, value: inv + liquid, contributed });
  }
  const final = inv + liquid;
  return { points, final, contributed, gains: final - contributed, moved };
};

/** Taux moyen des liquidités, pondéré par les soldes (en %). */
export const averageCashRate = (cashTotal, yearlyInterest) => (cashTotal > 0 ? (yearlyInterest / cashTotal) * 100 : 0);
