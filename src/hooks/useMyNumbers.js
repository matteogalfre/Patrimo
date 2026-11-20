import { useMemo } from 'react';

import { usePlanning } from '../context/PlanningContext';
import { householdNumbers } from '../core/budget';
import { useSuggestedMonthly } from './useSuggestedMonthly';

/**
 * Tes chiffres du mois (revenus, dépenses, épargne, âge), les mêmes dans
 * tous les écrans : saisis une fois dans le budget ou le questionnaire,
 * repris partout (voir core/budget, householdNumbers).
 */
export const useMyNumbers = () => {
  const { budget, profile, monthlyExpenses, plans } = usePlanning();
  const measured = useSuggestedMonthly();
  return useMemo(
    () => householdNumbers({ budget, answers: profile?.answers, monthlyExpenses, plans, measured }),
    [budget, profile, monthlyExpenses, plans, measured],
  );
};

export default useMyNumbers;
