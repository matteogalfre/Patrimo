import { useMemo } from 'react';

import { usePortfolio } from '../context/PortfolioContext';
import { computeInvestedSeries } from '../core/engine';
import { cashValueSeries } from '../core/cash';
import { averageMonthlySavings } from '../core/projection';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Épargne mensuelle moyenne des 12 derniers mois : argent placé net, plus la
 * variation des livrets. Le premier solde d'un livret saisi récemment existait
 * déjà : seule sa variation depuis compte. 0 si rien n'a été épargné.
 */
export const useSuggestedMonthly = () => {
  const { transactions, cashAccounts, fx } = usePortfolio();
  return useMemo(() => {
    const now = new Date();
    const dates = [new Date(now.getTime() - 365 * DAY), now];
    const invested = computeInvestedSeries({ transactions, dates, fx });
    const cashDelta = cashAccounts.reduce((sum, a) => {
      const firstDate = new Date(a.history[0].date);
      const from = firstDate > dates[0] ? firstDate : dates[0];
      const [start, end] = cashValueSeries({ accounts: [a], dates: [from, now], fx });
      return sum + (end - start);
    }, 0);
    return averageMonthlySavings(invested[0], invested[1] + cashDelta);
  }, [transactions, cashAccounts, fx]);
};

export default useSuggestedMonthly;
