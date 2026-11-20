/**
 * Objectifs de patrimoine et épargne de précaution (fonctions pures).
 */

import { projectPortfolio } from './projection';

const MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** Nombre de mois (arrondi) entre aujourd'hui et une date. */
export const monthsUntil = (date, today = new Date()) => Math.max(0, Math.round((new Date(date) - today) / MONTH));

/**
 * Où en est un objectif : progression, valeur projetée à l'échéance et
 * épargne mensuelle nécessaire pour l'atteindre.
 * @param {object} params
 * @param {{target: number, date: string}} params.goal
 * @param {{invested: number, cash: number, cashRate: number, annualRate: number, monthly: number}} params.base
 */
export const goalStatus = ({ goal, base, today = new Date() }) => {
  const current = base.invested + base.cash;
  const months = monthsUntil(goal.date, today);
  const years = months / 12;
  const project = (monthly) => projectPortfolio({ ...base, monthly, years: Math.max(0, Math.ceil(years)) }).final;
  // Projection au mois près : on interpole entre deux années entières.
  const projectAt = (monthly) => {
    if (months <= 0) return current;
    const lo = projectPortfolio({ ...base, monthly, years: Math.floor(years) }).final;
    const hi = project(monthly);
    const frac = years - Math.floor(years);
    return lo + (hi - lo) * frac;
  };
  const projected = projectAt(base.monthly);
  let needed = 0;
  if (projected < goal.target && months > 0) {
    let lo = base.monthly;
    let hi = Math.max(base.monthly * 2, 100);
    while (projectAt(hi) < goal.target && hi < 1e7) hi *= 2;
    for (let i = 0; i < 50; i += 1) {
      const mid = (lo + hi) / 2;
      if (projectAt(mid) >= goal.target) hi = mid;
      else lo = mid;
    }
    needed = hi;
  }
  return {
    progress: goal.target > 0 ? Math.min(100, (current / goal.target) * 100) : 0,
    reached: current >= goal.target,
    onTrack: current >= goal.target || projected >= goal.target,
    projected,
    months,
    neededMonthly: needed,
  };
};

/**
 * Épargne de précaution : combien de mois de dépenses les liquidités
 * couvrent. Repère courant : 3 à 6 mois.
 */
export const emergencyFund = ({ cash, monthlyExpenses, target = 3 }) => {
  if (!(monthlyExpenses > 0)) return null;
  const months = cash / monthlyExpenses;
  // Zone conseillée : de `target` mois (3 d'habitude, 6 pour des revenus
  // irréguliers) à 3 mois de plus, au moins 6.
  const low = target;
  const high = Math.max(6, target + 3);
  const level = months < low ? 'low' : months <= high ? 'ok' : 'high';
  return {
    months,
    level,
    low,
    high,
    surplus: level === 'high' ? cash - high * monthlyExpenses : 0,
    shortfall: level === 'low' ? low * monthlyExpenses - cash : 0,
  };
};
