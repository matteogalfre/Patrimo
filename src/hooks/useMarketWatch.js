import { useEffect, useState } from 'react';

import { usePlanning } from '../context/PlanningContext';
import { useSettings } from '../context/SettingsContext';
import { marketsService } from '../services/markets';
import { presentLocalNotification } from '../services/notifications';
import { MARKETS, marketState, ruleTriggered, stepFor } from '../core/markets';

/**
 * À l'ouverture de l'app : où en sont le S&P 500 et le Bitcoin (cours du
 * cache, complétés au plus toutes les 6 heures), et le plan anti-panique.
 * Une règle franchie envoie une notification, une seule fois par épisode
 * de baisse.
 * @returns {Object<string, {state: object, partialHigh: boolean}>}
 */
export const useMarketWatch = () => {
  const { marketRules, setMarketRule, hydrated } = usePlanning();
  const { t, formatAmount } = useSettings();
  const [states, setStates] = useState({});

  useEffect(() => {
    if (!hydrated) return undefined;
    let alive = true;
    (async () => {
      for (const id of Object.keys(MARKETS)) {
        try {
          const entry = await marketsService.load(id, { light: true });
          const state = marketState(entry.points, entry.ath);
          if (!alive || !state) return;
          setStates((s) => ({ ...s, [id]: { state, partialHigh: !!entry.partialHigh } }));
          const rule = marketRules?.[id];
          const key = ruleTriggered(rule, state);
          if (key) {
            const name = t(`markets.names.${id}`);
            const hist = entry.stats?.drawdown?.[stepFor(state.drawdown, MARKETS[id].drawdownSteps)];
            await presentLocalNotification({
              title: t('markets.notifTitle', { market: name, step: rule.threshold }),
              body: [
                t('markets.notifBody', { amount: formatAmount(rule.amount, { decimals: 0, reveal: true }) }),
                hist?.fwd3y ? t('markets.notifHistory', { up: hist.fwd3y.up, n: hist.fwd3y.n }) : null,
              ].filter(Boolean).join(' '),
            });
            setMarketRule(id, { ...rule, notifiedFor: key });
          }
        } catch {
          // Pas de réseau : rien à dire, on réessaiera à la prochaine ouverture.
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  return states;
};

export default useMarketWatch;
