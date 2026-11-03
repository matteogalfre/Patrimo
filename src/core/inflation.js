/**
 * Inflation (fonctions pures) : indice des prix mensuel, pour exprimer les
 * rendements en pouvoir d'achat.
 *
 * Source : indice des prix à la consommation harmonisé (IPCH) de la France,
 * publié par Eurostat chaque mois. L'indice d'un mois sert pour toutes les
 * dates de ce mois ; au-delà du dernier mois publié (un ou deux mois de
 * décalage), on garde le dernier indice connu.
 */

/** 'YYYY-MM' d'une date ou d'un horodatage. */
export const monthOf = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Série { 'YYYY-MM': indice } à partir d'une réponse JSON-stat d'Eurostat.
 * Prend l'indice en base 2025 s'il est là, sinon celui en base 2015.
 * @returns {Object<string, number>|null}
 */
export const parseEurostatIndex = (json) => {
  if (!json?.id || !json?.size || !json?.value || !json?.dimension?.time) return null;
  const { id, size } = json;
  const strides = id.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const labelsOf = (dim) => {
    const index = json.dimension[dim]?.category?.index || {};
    const out = [];
    Object.entries(index).forEach(([label, pos]) => { out[pos] = label; });
    return out;
  };
  const times = labelsOf('time');
  const units = id.includes('unit') ? labelsOf('unit') : [null];
  const wanted = ['I25', 'I15'].find((u) => units.includes(u)) || units[0];
  const series = {};
  Object.entries(json.value).forEach(([key, value]) => {
    const flat = Number(key);
    const pos = id.map((_, i) => Math.floor(flat / strides[i]) % size[i]);
    const unit = id.includes('unit') ? units[pos[id.indexOf('unit')]] : null;
    if (unit !== wanted || !(value > 0)) return;
    series[times[pos[id.indexOf('time')]]] = value;
  });
  return Object.keys(series).length ? series : null;
};

/**
 * Outils de calcul sur une série.
 * @param {Object<string, number>} series
 */
export const createInflation = (series) => {
  const months = Object.keys(series || {}).sort();
  if (!months.length) return null;
  const first = months[0];
  const last = months[months.length - 1];

  /** Indice du mois d'une date (borné à la période publiée). */
  const at = (date) => {
    const m = monthOf(date);
    if (m >= last) return series[last];
    if (m <= first) return series[first];
    if (series[m]) return series[m];
    // Mois manquant : le précédent connu.
    for (let i = months.length - 1; i >= 0; i -= 1) if (months[i] < m) return series[months[i]];
    return series[first];
  };

  return {
    lastMonth: last,
    at,
    /** Coefficient qui convertit des euros d'une date en euros d'aujourd'hui. */
    toToday: (date, today = new Date()) => at(today) / at(date),
    /** Inflation sur les 12 derniers mois publiés, en %. */
    lastTwelveMonths: () => {
      const [y, m] = last.split('-').map(Number);
      const before = `${y - 1}-${String(m).padStart(2, '0')}`;
      if (before < first) return null;
      return { pct: (series[last] / at(new Date(y - 1, m - 1, 15)) - 1) * 100, month: last };
    },
    /** Inflation d'une année civile en % (depuis janvier pour l'année en cours). */
    ofYear: (year, today = new Date()) => {
      const end = year >= today.getFullYear() ? today : new Date(year, 11, 15);
      const start = new Date(year - 1, 11, 15);
      if (monthOf(start) < first || monthOf(end) <= monthOf(start)) return null;
      return (at(end) / at(start) - 1) * 100;
    },
  };
};

/** Rendement réel en % : ce que gagne le pouvoir d'achat. */
export const realRate = (nominalPct, inflationPct) =>
  ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
