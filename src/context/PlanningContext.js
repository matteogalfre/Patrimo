/**
 * Planification : objectifs, épargne de précaution, répartition cible,
 * investissements programmés, frais des ETF, classement des actifs
 * (diversification) et rappels.
 *
 * Tout est persisté en AsyncStorage et inclus dans les sauvegardes, sauf le
 * mot de passe des sauvegardes, qui vit dans le trousseau sécurisé
 * (expo-secure-store) et reste propre au téléphone.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

import { STORAGE_KEYS } from '../constants';
import { useSettings } from './SettingsContext';
import { syncMonthlyReminders } from '../services/notifications';
import { markHandled } from '../core/plans';

const PlanningContext = createContext(undefined);

const PASSWORD_KEY = 'patrimo.backup.password';

const DEFAULT = {
  goals: [],
  monthlyExpenses: null,
  targets: null,
  plans: [],
  fees: {},
  exposure: {},
  reminders: { plans: true, cash: false },
};

/** Ce qui est persisté et part dans les sauvegardes. */
const exportable = (state) => ({
  goals: state.goals,
  monthlyExpenses: state.monthlyExpenses,
  targets: state.targets,
  plans: state.plans,
  fees: state.fees,
  exposure: state.exposure,
  reminders: state.reminders,
});

const newId = (prefix) => {
  try {
    return `${prefix}_${Crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
};

export const PlanningProvider = ({ children }) => {
  const { t, currency, settings } = useSettings();
  const [state, setState] = useState(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.PLANNING);
        const parsed = raw ? JSON.parse(raw) : {};
        if (alive) {
          setState({
            ...exportable({ ...DEFAULT, ...parsed }),
            reminders: { ...DEFAULT.reminders, ...(parsed.reminders || {}) },
          });
        }
        const pwd = await SecureStore.getItemAsync(PASSWORD_KEY).catch(() => null);
        if (alive) setHasPassword(!!pwd);
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      AsyncStorage.setItem(STORAGE_KEYS.PLANNING, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // --- Objectifs et épargne de précaution -----------------------------------
  const addGoal = useCallback((goal) => update((p) => ({ goals: [...p.goals, { ...goal, id: newId('goal') }] })), [update]);
  const removeGoal = useCallback((id) => update((p) => ({ goals: p.goals.filter((g) => g.id !== id) })), [update]);
  const setMonthlyExpenses = useCallback((v) => update({ monthlyExpenses: v > 0 ? v : null }), [update]);

  // --- Répartition cible ----------------------------------------------------
  const setTargets = useCallback((targets) => update({ targets }), [update]);

  // --- Investissements programmés -------------------------------------------
  const addPlan = useCallback((plan) => update((p) => ({ plans: [...p.plans, { ...plan, id: newId('plan'), active: true, handled: [] }] })), [update]);
  const updatePlan = useCallback((id, patch) => update((p) => ({ plans: p.plans.map((x) => (x.id === id ? { ...x, ...patch } : x)) })), [update]);
  const removePlan = useCallback((id) => update((p) => ({ plans: p.plans.filter((x) => x.id !== id) })), [update]);
  /** Le mois est réglé : opération saisie ou volontairement ignorée. */
  const handlePlan = useCallback((id) => update((p) => ({ plans: p.plans.map((x) => (x.id === id ? markHandled(x) : x)) })), [update]);

  // --- Frais des ETF ---------------------------------------------------------
  const setFee = useCallback((assetId, ter) => update((p) => {
    const fees = { ...p.fees };
    if (ter > 0) fees[assetId] = ter;
    else delete fees[assetId];
    return { fees };
  }), [update]);

  // --- Diversification : indice suivi (ETF), pays et secteur (action) --------
  const setExposure = useCallback((assetId, patch) => update((p) => {
    const next = { ...(p.exposure[assetId] || {}), ...patch };
    Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
    const exposure = { ...p.exposure };
    if (Object.keys(next).length) exposure[assetId] = next;
    else delete exposure[assetId];
    return { exposure };
  }), [update]);

  const setReminders = useCallback((patch) => update((p) => ({ reminders: { ...p.reminders, ...patch } })), [update]);

  // Rappels mensuels : un par plan actif, plus la mise à jour des livrets.
  useEffect(() => {
    if (!hydrated) return;
    const list = [];
    if (state.reminders.plans) {
      state.plans.filter((p) => p.active).forEach((p) => list.push({
        id: p.id,
        day: p.day,
        title: t('plans.notificationTitle'),
        body: t('plans.notificationBody', { name: p.name || p.symbol }),
      }));
    }
    if (state.reminders.cash) {
      list.push({ id: 'cash', day: 1, title: t('plans.cashReminderTitle'), body: t('plans.cashReminderBody') });
    }
    syncMonthlyReminders(list);
  }, [hydrated, state.plans, state.reminders, t]);

  // --- Sauvegarde ------------------------------------------------------------
  const backupSettings = useCallback(
    () => ({ currency, pea: settings.pea, planning: exportable(state) }),
    [currency, settings.pea, state],
  );

  const setBackupPassword = useCallback(async (password) => {
    if (password) await SecureStore.setItemAsync(PASSWORD_KEY, password);
    else await SecureStore.deleteItemAsync(PASSWORD_KEY).catch(() => {});
    setHasPassword(!!password);
  }, []);

  const getBackupPassword = useCallback(() => SecureStore.getItemAsync(PASSWORD_KEY).catch(() => null), []);

  /** Restaure la planification d'une sauvegarde (import en remplacement). */
  const applyImported = useCallback((planning) => {
    if (!planning || typeof planning !== 'object') return;
    update((p) => exportable({ ...p, ...planning }));
  }, [update]);

  const value = useMemo(() => ({
    ...state,
    hydrated,
    hasPassword,
    addGoal,
    removeGoal,
    setMonthlyExpenses,
    setTargets,
    addPlan,
    updatePlan,
    removePlan,
    handlePlan,
    setFee,
    setExposure,
    setReminders,
    setBackupPassword,
    getBackupPassword,
    backupSettings,
    applyImported,
  }), [
    state, hydrated, hasPassword, addGoal, removeGoal, setMonthlyExpenses, setTargets,
    addPlan, updatePlan, removePlan, handlePlan, setFee, setExposure, setReminders,
    setBackupPassword, getBackupPassword, backupSettings, applyImported,
  ]);

  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
};

export const usePlanning = () => {
  const context = useContext(PlanningContext);
  if (!context) throw new Error('usePlanning must be used within a PlanningProvider');
  return context;
};

export default PlanningContext;
