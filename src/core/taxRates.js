/**
 * Taux de la fiscalité des placements en France (fonctions pures).
 *
 * Flat tax (PFU) : 12,8 % d'impôt sur le revenu et les prélèvements sociaux,
 * passés de 17,2 % à 18,6 % sur les revenus du capital en 2026 (hausse de la
 * CSG votée dans la loi de financement de la sécurité sociale 2026), soit
 * 31,4 % au total. Au barème, les dividendes ont un abattement de 40 % et une
 * part de la CSG (6,8 %) est déductible du revenu de l'année suivante.
 * L'assurance-vie, les PEL et CEL gardent un régime à part (17,2 %).
 */

export const PFU_INCOME_TAX = 12.8;
export const DIVIDEND_ALLOWANCE = 40;
export const DEDUCTIBLE_CSG = 6.8;

/** Prélèvements sociaux sur les dividendes et plus-values d'une année, en %. */
export const socialRate = (year) => (year >= 2026 ? 18.6 : 17.2);

/** Flat tax complète d'une année, en %. */
export const flatTaxRate = (year) => PFU_INCOME_TAX + socialRate(year);

/**
 * Dividende d'une société française sur un compte-titres : la banque retient
 * l'acompte de 12,8 % et les prélèvements sociaux avant de verser.
 */
export const netFrenchDividend = (gross, year) => gross * (1 - flatTaxRate(year) / 100);
export const grossFromNetDividend = (net, year) => net / (1 - flatTaxRate(year) / 100);

/**
 * Flat tax ou barème pour les dividendes et plus-values d'un compte-titres :
 * l'impôt sur le revenu dans les deux cas (les prélèvements sociaux sont les
 * mêmes). L'option pour le barème vaut pour tous les revenus du capital de
 * l'année. Une estimation, pas un calcul d'impôt.
 * @param {{gains: number, dividends: number, tmi: number, year: number}} params
 *   dividends : bruts ; tmi : tranche marginale en %
 * @returns {{pfu: number, scale: number, better: 'pfu'|'scale', saving: number, social: number}|null}
 */
export const flatTaxOrScale = ({ gains = 0, dividends = 0, tmi, year }) => {
  if (tmi == null || !Number.isFinite(Number(tmi))) return null;
  const g = Math.max(0, Number(gains) || 0);
  const d = Math.max(0, Number(dividends) || 0);
  if (g + d <= 0) return null;
  const rate = Number(tmi) / 100;
  const pfu = ((g + d) * PFU_INCOME_TAX) / 100;
  const taxable = g + d * (1 - DIVIDEND_ALLOWANCE / 100);
  const csgRelief = (g + d) * (DEDUCTIBLE_CSG / 100) * rate;
  const scale = Math.max(0, taxable * rate - csgRelief);
  return { pfu, scale, better: scale < pfu ? 'scale' : 'pfu', saving: Math.abs(pfu - scale), social: ((g + d) * socialRate(year)) / 100 };
};
