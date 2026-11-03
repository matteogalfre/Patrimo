/**
 * Context des alertes de prix.
 *
 * Une alerte = { id, assetId, symbol, targetPrice, currency, direction:
 * 'above'|'below', enabled, triggered, createdAt }. Le seuil est exprimé dans
 * la devise de cotation de l'actif (dollars pour une crypto, euros pour une
 * action parisienne) : c'est le cours que l'utilisateur suit. Les alertes sont
 * persistées en AsyncStorage.
 *
 * L'évaluation se fait en réaction aux mises à jour de `quotes` du
 * PortfolioContext : dès qu'une alerte active et non déclenchée voit sa
 * condition satisfaite, on présente une notification locale puis on la marque
 * `triggered` (one-shot) pour ne pas spammer l'utilisateur à chaque refresh.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../constants';
import { usePortfolio } from './PortfolioContext';
import { useSettings } from './SettingsContext';
import { presentLocalNotification, ensureNotificationPermission } from '../services/notifications';

const AlertsContext = createContext(undefined);

const genId = () =>
  `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;


export const AlertsProvider = ({ children }) => {
  const { quotes } = usePortfolio();
  const { t, formatPrice } = useSettings();

  const [alerts, setAlerts] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  // Garde-fou contre le double déclenchement entre deux persistances async.
  const firingRef = useRef(new Set());

  // Chargement initial
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.PRICE_ALERTS);
        const parsed = raw ? JSON.parse(raw) : [];
        if (alive && Array.isArray(parsed)) setAlerts(parsed.filter((a) => a && a.assetId));
      } catch {
        // Données corrompues : on repart d'une liste vide.
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next) => {
    AsyncStorage.setItem(STORAGE_KEYS.PRICE_ALERTS, JSON.stringify(next)).catch(() => {});
  }, []);

  const updateAlerts = useCallback(
    (updater) => {
      setAlerts((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const addAlert = useCallback(
    ({ assetId, symbol, currency, targetPrice, direction }) => {
      const alert = {
        id: genId(),
        assetId,
        symbol,
        currency,
        targetPrice: Number(targetPrice),
        direction,
        enabled: true,
        triggered: false,
        createdAt: new Date().toISOString(),
      };
      updateAlerts((prev) => [alert, ...prev]);
      ensureNotificationPermission();
      return alert;
    },
    [updateAlerts],
  );

  const removeAlert = useCallback(
    (id) => {
      // Libère le garde-fou anti-rebond pour que l'id puisse être réutilisé.
      firingRef.current.delete(id);
      updateAlerts((prev) => prev.filter((a) => a.id !== id));
    },
    [updateAlerts],
  );

  const toggleAlert = useCallback(
    (id) => {
      // On réinitialise `triggered` ET le garde-fou en réactivant, sinon une
      // alerte déjà sonnée ne pourrait plus jamais re-sonner avant un
      // redémarrage de l'app (firingRef la bloquerait).
      firingRef.current.delete(id);
      updateAlerts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, enabled: !a.enabled, ...(!a.enabled ? { triggered: false } : {}) }
            : a,
        ),
      );
    },
    [updateAlerts],
  );

  // Évaluation des alertes à chaque changement de prix.
  useEffect(() => {
    if (!hydrated || !quotes || Object.keys(quotes).length === 0) return;

    const toFire = alerts.filter((a) => {
      if (!a.enabled || a.triggered) return false;
      if (firingRef.current.has(a.id)) return false;
      const quote = quotes[a.assetId];
      const current = quote?.price;
      if (typeof current !== 'number' || current <= 0) return false;
      // Un seuil saisi dans une autre devise que la cotation ne se compare pas.
      if (a.currency && quote.currency && a.currency !== quote.currency) return false;
      return a.direction === 'above'
        ? current >= a.targetPrice
        : current <= a.targetPrice;
    });

    if (toFire.length === 0) return;

    toFire.forEach((a) => firingRef.current.add(a.id));

    toFire.forEach((a) => {
      const current = quotes[a.assetId].price;
      const dirLabel =
        a.direction === 'above' ? t('alerts.reachedAbove') : t('alerts.reachedBelow');
      presentLocalNotification({
        title: t('alerts.notificationTitle', { symbol: a.symbol }),
        body: `${a.symbol} ${dirLabel} ${formatPrice(a.targetPrice, a.currency)} (${formatPrice(current, a.currency)})`,
      });
    });

    updateAlerts((prev) =>
      prev.map((a) => (toFire.some((f) => f.id === a.id) ? { ...a, triggered: true } : a)),
    );
  }, [quotes, alerts, hydrated, t, formatPrice, updateAlerts]);

  const value = useMemo(
    () => ({
      alerts,
      addAlert,
      removeAlert,
      toggleAlert,
      getAlertsFor: (assetId) => alerts.filter((a) => a.assetId === assetId),
    }),
    [alerts, addAlert, removeAlert, toggleAlert],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
};

export const useAlerts = () => {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
};

export default AlertsContext;
