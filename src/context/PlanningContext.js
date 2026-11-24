/**
 * Planification : objectifs, épargne de précaution, répartition cible,
 * investissements programmés, frais des ETF, classement des actifs
 * (diversification) et rappels.
 *
 * Tout est persisté en AsyncStorage et inclus dans les sauvegardes, sauf le
 * mot de passe des sauvegardes, qui vit dans le trousseau sécurisé
 * (expo-secure-store) et reste propre au téléphone.
 *
 * En mode démo, une planification d'exemple, sous une autre clé, remplace la
 * vraie : profil, budget et objectifs fictifs, la vraie n'est ni lue ni
 * modifiée. Les rappels mensuels restent ceux des vrais achats programmés.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

import { STORAGE_KEYS } from '../constants';
import { useSettings } from './SettingsContext';
import { usePortfolio } from './PortfolioContext';
import { demoMode, DEMO_PLANNING_KEY } from '../services/storage';
import { buildDemoPlanning } from '../core/demoData';
import { syncMonthlyReminders } from '../services/notifications';
import { markHandled } from '../core/plans';
import { ruleForInstitution, tariffOf } from '../core/brokerFees';
import { budgetTotals } from '../core/budget';

const PlanningContext = createContext(undefined);

const PASSWORD_KEY = 'patrimo.backup.password';

const DEFAULT = {
  goals: [],
  monthlyExpenses: null,
  targets: null,
  plans: [],
  fees: {},
  exposure: {},
  dismissedDividends: [],
  brokerRules: {},
  accountInstitutions: {},
  ttf: true,
  reminders: { plans: true, cash: false },
  // Profil d'investisseur : réponses au questionnaire et date.
  profile: null,
  // Budget du mois : revenus, investissements et dépenses par catégorie.
  budget: null,
  // Accueil de la première ouverture déjà proposé.
  onboarded: false,
  // Plan anti-panique : « si l'indice passe à −X %, préviens-moi pour investir Y € ».
  marketRules: {},
};

/** Ce qui est persisté et part dans les sauvegardes. */
const exportable = (state) => ({
  goals: state.goals,
  monthlyExpenses: state.monthlyExpenses,
  targets: state.targets,
  plans: state.plans,
  fees: state.fees,
  exposure: state.exposure,
  dismissedDividends: state.dismissedDividends,
  brokerRules: state.brokerRules,
  accountInstitutions: state.accountInstitutions,
  ttf: state.ttf,
  reminders: state.reminders,
  marketRules: state.marketRules,
  profile: state.profile,
  budget: state.budget,
  onboarded: state.onboarded,
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
  const { demo } = usePortfolio();
  const [isDemo, setIsDemo] = useState(false);
  // Clé où écrire : celle de l'exemple en mode démo. Elle change en même temps
  // que l'état, pour qu'une écriture ne mélange jamais l'exemple et le vrai.
  const keyRef = useRef(STORAGE_KEYS.PLANNING);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  // Relue au lancement et à chaque bascule du mode démo.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const onDemo = await demoMode.isOn();
        const key = onDemo ? DEMO_PLANNING_KEY : STORAGE_KEYS.PLANNING;
        const raw = await AsyncStorage.getItem(key);
        let parsed = raw ? JSON.parse(raw) : null;
        if (onDemo && !parsed) {
          parsed = buildDemoPlanning({ labels: tRef.current('budget.defaults'), goalName: tRef.current('goals.suggest.home.name') });
          await AsyncStorage.setItem(key, JSON.stringify(parsed)).catch(() => {});
        }
        if (!onDemo) AsyncStorage.removeItem(DEMO_PLANNING_KEY).catch(() => {});
        parsed = parsed || {};
        if (alive) {
          keyRef.current = key;
          setIsDemo(onDemo);
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
  }, [demo]);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      AsyncStorage.setItem(keyRef.current, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // --- Objectifs et épargne de précaution -----------------------------------
  const addGoal = useCallback((goal) => update((p) => ({ goals: [...p.goals, { ...goal, id: newId('goal') }] })), [update]);
  const removeGoal = useCallback((id) => update((p) => ({ goals: p.goals.filter((g) => g.id !== id) })), [update]);
  const setMonthlyExpenses = useCallback((v) => update({ monthlyExpenses: v > 0 ? v : null }), [update]);

  // --- Répartition cible ----------------------------------------------------
  const setTargets = useCallback((targets) => update({ targets }), [update]);

  // --- Plan anti-panique (marchés) ------------------------------------------
  /** Règle d'un marché, ou null pour la retirer. */
  const setMarketRule = useCallback((id, rule) => update((p) => {
    const marketRules = { ...(p.marketRules || {}) };
    if (rule) marketRules[id] = rule;
    else delete marketRules[id];
    return { marketRules };
  }), [update]);

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

  /** Dividende attendu mais pas reçu : on ne le propose plus. */
  const dismissDividend = useCallback((key) => update((p) => ({
    dismissedDividends: [...new Set([...(p.dismissedDividends || []), key])].slice(-50),
  })), [update]);

  // --- Frais de courtage : règle par enveloppe, TTF ---------------------------
  const setBrokerRule = useCallback((account, rule) => update((p) => {
    const brokerRules = { ...p.brokerRules };
    if (rule && rule.type !== 'none') brokerRules[account] = rule;
    else delete brokerRules[account];
    return { brokerRules };
  }), [update]);
  const setTtf = useCallback((ttf) => update({ ttf: !!ttf }), [update]);

  /**
   * Établissement d'une enveloppe. Sa grille de frais connue s'applique si
   * aucune règle n'est choisie, ou si la règle était la grille de l'ancien
   * établissement : une règle saisie à la main n'est jamais écrasée.
   */
  const setAccountInstitution = useCallback((account, id) => update((p) => {
    const accountInstitutions = { ...p.accountInstitutions };
    const previous = accountInstitutions[account];
    if (id) accountInstitutions[account] = id;
    else delete accountInstitutions[account];
    const known = id ? ruleForInstitution(id, account) : null;
    const current = p.brokerRules?.[account];
    const replaceable = !current || (previous && tariffOf(current)?.institution === previous);
    const brokerRules = known && replaceable ? { ...p.brokerRules, [account]: known } : p.brokerRules;
    return { accountInstitutions, brokerRules };
  }), [update]);

  const setReminders = useCallback((patch) => update((p) => ({ reminders: { ...p.reminders, ...patch } })), [update]);

  const setOnboarded = useCallback(() => update({ onboarded: true }), [update]);

  /** Budget du mois ; ses dépenses deviennent celles de l'épargne de précaution. */
  const setBudget = useCallback((budget) => update((p) => {
    const expenses = budget ? budgetTotals(budget).expenses : 0;
    return { budget, monthlyExpenses: expenses > 0 ? expenses : p.monthlyExpenses };
  }), [update]);

  /** Questionnaire terminé : les réponses, et les dépenses mensuelles qu'il a demandées. */
  const setProfile = useCallback((answers) => update(answers
    ? { profile: { answers, completedAt: new Date().toISOString() }, monthlyExpenses: answers.expenses > 0 ? answers.expenses : null }
    : { profile: null }), [update]);

  // Rappels mensuels : un par plan actif, plus la mise à jour des livrets. En
  // mode démo, on n'y touche pas : ceux des vrais plans restent programmés.
  useEffect(() => {
    if (!hydrated || isDemo) return;
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
  }, [hydrated, isDemo, state.plans, state.reminders, t]);

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
    setMarketRule,
    addPlan,
    updatePlan,
    removePlan,
    handlePlan,
    setFee,
    setExposure,
    dismissDividend,
    setBrokerRule,
    setTtf,
    setAccountInstitution,
    setReminders,
    setProfile,
    setBudget,
    setOnboarded,
    setBackupPassword,
    getBackupPassword,
    backupSettings,
    applyImported,
  }), [
    state, hydrated, hasPassword, addGoal, removeGoal, setMonthlyExpenses, setTargets, setMarketRule,
    addPlan, updatePlan, removePlan, handlePlan, setFee, setExposure, dismissDividend, setBrokerRule, setTtf, setAccountInstitution, setReminders,
    setProfile, setBudget, setOnboarded, setBackupPassword, getBackupPassword, backupSettings, applyImported,
  ]);

  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
};

export const usePlanning = () => {
  const context = useContext(PlanningContext);
  if (!context) throw new Error('usePlanning must be used within a PlanningProvider');
  return context;
};

export default PlanningContext;
