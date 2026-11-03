/**
 * Rendement historique d'un actif (fonctions pures), à partir de ses cours
 * de clôture : rendement moyen par an sur plusieurs durées et performance de
 * chaque année civile.
 *
 * C'est l'évolution du cours, dans la devise de cotation. Pour un ETF
 * capitalisant, les dividendes réinvestis sont déjà dans le cours ; pour une
 * action ou un ETF distribuant, ils viennent en plus.
 */

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365.25 * DAY;
// Un historique qui démarre quelques jours après la date visée suffit.
const TOLERANCE = 10 * DAY;

export const HORIZONS = [1, 3, 5, 10, 20, 30];

/**
 * @param {Array<{key: string, price: number}>} points - cours par jour ('YYYY-MM-DD'), triés
 * @param {{today?: Date}} [opts]
 * @returns {{horizons: Array<{years: number, pct: number}>, since: {year: number, years: number, pct: number}|null, calendar: Array<{year: number, pct: number, partial: boolean}>}|null}
 */
export const historicalReturns = (points = [], { today = new Date() } = {}) => {
  const list = points
    .filter((p) => p.price > 0)
    .map((p) => ({ t: new Date(`${p.key}T12:00:00`).getTime(), v: p.price }));
  if (list.length < 2) return null;
  const first = list[0];
  const last = list[list.length - 1];

  /** Cours le plus proche d'une date, s'il en est assez proche (week-ends, jours fériés). */
  const near = (time) => {
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (list[mid].t < time) lo = mid + 1;
      else hi = mid;
    }
    // À égalité, le cours d'avant : la clôture connue à cette date.
    const candidates = [list[lo - 1], list[lo]].filter(Boolean);
    const best = candidates.reduce((a, b) => (Math.abs(b.t - time) < Math.abs(a.t - time) ? b : a));
    return Math.abs(best.t - time) <= TOLERANCE ? best : null;
  };
  /** Dernière clôture à une date (celle du dernier jour de cotation de l'année, par exemple). */
  const onOrBefore = (time) => {
    let found = null;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].t <= time) {
        found = list[i];
        break;
      }
    }
    return found && time - found.t <= TOLERANCE ? found : null;
  };
  // Rendement moyen par an entre deux cours, sur la durée exacte qui les sépare.
  const cagr = (start, end) => ((end.v / start.v) ** (YEAR / (end.t - start.t)) - 1) * 100;

  const horizons = HORIZONS
    .map((years) => {
      const start = near(last.t - years * YEAR);
      return start ? { years, pct: cagr(start, last) } : null;
    })
    .filter(Boolean);

  const span = (last.t - first.t) / YEAR;
  const since = span >= 1 ? { year: new Date(first.t).getFullYear(), years: span, pct: cagr(first, last) } : null;

  const calendar = [];
  for (let year = new Date(first.t).getFullYear(); year <= new Date(last.t).getFullYear(); year += 1) {
    // Un historique qui démarre dans les premiers jours de janvier compte pour l'année entière.
    const start = onOrBefore(new Date(year - 1, 11, 31, 23, 59).getTime()) || (new Date(first.t).getFullYear() === year && first.t - new Date(year, 0, 1).getTime() <= TOLERANCE ? first : null);
    if (!start) continue;
    const partial = year === today.getFullYear();
    const end = partial ? last : onOrBefore(new Date(year, 11, 31, 23, 59).getTime());
    if (end && end.t > start.t) calendar.push({ year, pct: (end.v / start.v - 1) * 100, partial });
  }

  return { horizons, since, calendar };
};
