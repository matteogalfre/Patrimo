/**
 * Context du patrimoine.
 *
 * Il charge les opérations, les cours et les taux de change, puis délègue tous
 * les calculs au moteur (src/core/engine.js), qui travaille dans la devise de
 * référence choisie dans les réglages. Les écrans ne refont aucun calcul
 * financier : ils lisent `positions`, `assets`, `totals`, `cash` et
 * `overview` (investissements + liquidités).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useSettings } from './SettingsContext';
import { transactionsRepo, dividendsRepo, cashRepo, historyCache, demoMode, loansRepo, propertiesRepo } from '../services/storage';
import { buildDemoData, DEMO_ASSETS } from '../core/demoData';
import { marketData } from '../services/marketData';
import { fxService } from '../services/fxService';
import { DUST, computeInvestedSeries, computePortfolio, computePeaStats, computeValueSeries } from '../core/engine';
import { createFxConverter, rateAt } from '../core/fx';
import { ACCOUNTS, positionKey } from '../core/assets';
import { cashValueSeries, computeCash, normalizeCashAccount, withBalance } from '../core/cash';
import { computeIncome } from '../core/income';
import { computeDebts } from '../core/loans';
import { computeRealEstate, withEstimate } from '../core/realEstate';
import { formatDateKey } from '../utils/formatters';
import { MONTHS_SHORT_FR } from '../constants';

const PortfolioContext = createContext(undefined);

// Délai au-delà duquel l'écran s'affiche sans attendre le réseau.
const NETWORK_DEADLINE = 5000;
const LATE = Symbol('late');
const withDeadline = (promise, ms = NETWORK_DEADLINE) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), ms); }),
  ]).finally(() => clearTimeout(timer));
};

const DAY = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = { '7D': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365, ALL: null };

/** Nombre de jours couverts par une période ; YTD = depuis le 1er janvier. */
const periodDays = (period, today) => {
  if (period === 'YTD') return Math.max(1, Math.round((today - new Date(today.getFullYear(), 0, 1, 12)) / DAY));
  return PERIOD_DAYS[period];
};
const CHART_POINTS = 60;
const CHART_LABELS = 5;

const EMPTY_FX = { base: null, latest: {}, history: {} };
const EMPTY_HISTORIES = { series: {}, currencies: {} };

/** Actifs distincts d'une liste d'opérations. */
const uniqueAssets = (transactions) => {
  const map = new Map();
  transactions.forEach((t) => {
    if (!map.has(t.assetId)) {
      map.set(t.assetId, { assetId: t.assetId, assetType: t.assetType, symbol: t.symbol, name: t.name });
    }
  });
  return [...map.values()];
};

/** Les actifs encore détenus : seuls eux ont besoin d'un cours du jour. */
const heldAssets = (transactions) => {
  const qty = new Map();
  transactions.forEach((t) => qty.set(t.assetId, (qty.get(t.assetId) || 0) + (t.side === 'sell' ? -t.quantity : t.quantity)));
  return uniqueAssets(transactions).filter((a) => qty.get(a.assetId) > DUST);
};

const earliestDate = (transactions, dividends, cashAccounts = []) => {
  let min = null;
  [...transactions, ...dividends, ...cashAccounts.map((a) => a.history[0])].forEach((x) => {
    if (x && (!min || x.date < min)) min = x.date;
  });
  return min ? new Date(min) : new Date();
};

export const PortfolioProvider = ({ children }) => {
  const { currency: baseCurrency, pea: peaSettings } = useSettings();

  const [transactions, setTransactions] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [properties, setProperties] = useState([]);
  const [quotes, setQuotes] = useState({});
  const quotesRef = useRef({});
  quotesRef.current = quotes;
  const [fxRates, setFxRates] = useState(EMPTY_FX);
  const [histories, setHistories] = useState(EMPTY_HISTORIES);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [demo, setDemoState] = useState(false);

  const isMounted = useRef(true);
  const loadingRef = useRef(false);
  // Une demande de rechargement pendant un chargement n'est pas perdue : on
  // relance une fois le premier terminé (sinon une opération tout juste
  // ajoutée pourrait ne pas apparaître).
  const reloadQueued = useRef(null);
  const baseRef = useRef(baseCurrency);
  baseRef.current = baseCurrency;

  /**
   * Historiques de cours (graphique) et complétion des prix manquants.
   * En arrière-plan : l'écran s'affiche sans attendre.
   */
  const loadHistories = useCallback(async (tx, assets, fromDate) => {
    try {
      if (!assets.length) {
        if (isMounted.current) setHistories(EMPTY_HISTORIES);
        return;
      }
      const fromKey = formatDateKey(fromDate);
      const ids = assets.map((a) => a.assetId);
      const cached = await historyCache.read();
      let result;

      if (historyCache.isUsable(cached, ids, fromKey)) {
        result = { series: cached.series, currencies: cached.currencies || {} };
      } else {
        // On ne retélécharge que ce qui manque : les derniers jours d'un actif
        // déjà en cache (avec une semaine de recouvrement), tout l'historique
        // d'un actif nouveau.
        const coversStart = cached && (!cached.from || cached.from <= fromKey);
        const since = {};
        if (coversStart) {
          ids.forEach((id) => {
            const keys = Object.keys(cached.series[id] || {}).sort();
            if (keys.length) since[id] = new Date(new Date(`${keys[keys.length - 1]}T12:00:00`).getTime() - 7 * DAY);
          });
        }
        const fresh = await marketData.getHistories(assets, fromDate, since);
        result = { series: {}, currencies: { ...(cached?.currencies || {}), ...fresh.currencies } };
        ids.forEach((id) => {
          // Un actif dont la source a échoué garde son ancien historique.
          result.series[id] = { ...(since[id] ? cached.series[id] : {}), ...(fresh.series[id] || {}) };
          if (!Object.keys(result.series[id]).length && cached?.series?.[id]) result.series[id] = cached.series[id];
        });
        historyCache.write({ ...result, from: coversStart && cached.from ? cached.from : fromKey });
      }
      if (!isMounted.current) return;
      setHistories(result);

      // Prix d'opération inconnu : on prend la clôture du jour de l'opération,
      // jamais une date antérieure à la cotation (on ne devine pas).
      const patches = [];
      tx.filter((t) => !(t.unitPrice > 0)).forEach((t) => {
        const series = result.series[t.assetId];
        const cur = result.currencies[t.assetId];
        if (!series || !cur) return;
        const keys = Object.keys(series).sort();
        const key = formatDateKey(t.date);
        if (!keys.length || key < keys[0]) return;
        const price = rateAt(series, key, keys);
        if (price > 0) patches.push({ id: t.id, unitPrice: price, currency: cur, priceSource: 'market' });
      });
      if (!patches.length) return;

      await Promise.all(patches.map(({ id, ...patch }) => transactionsRepo.update(id, patch)));
      if (!isMounted.current) return;
      const byId = new Map(patches.map((p) => [p.id, p]));
      setTransactions((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t)));
    } catch (err) {
      if (__DEV__) console.warn('[Portfolio] historiques indisponibles:', err.message);
    }
  }, []);

  const loadData = useCallback(async ({ force = false, silent = false } = {}) => {
    if (loadingRef.current) {
      reloadQueued.current = { force: force || !!reloadQueued.current?.force, silent: true };
      return;
    }
    loadingRef.current = true;
    if (!silent) setIsRefreshing(true);
    setError(null);

    try {
      const [{ data: tx, error: txError }, { data: dv }, { data: cash }, isDemo, { data: ln }, { data: pr }] = await Promise.all([
        transactionsRepo.getAll(),
        dividendsRepo.getAll(),
        cashRepo.getAll(),
        demoMode.isOn(),
        loansRepo.getAll(),
        propertiesRepo.getAll(),
      ]);
      if (txError) throw txError;
      if (isMounted.current) setDemoState(isDemo);

      const assets = uniqueAssets(tx);
      const fromDate = earliestDate(tx, dv, cash);
      const base = baseRef.current;

      // Un service qui ne répond pas ne doit pas bloquer l'écran : passé le
      // délai, on affiche avec les derniers cours et taux connus, et on met à
      // jour quand la réponse arrive.
      const held = heldAssets(tx);
      const quotesP = held.length ? marketData.getQuotes(held, { force }).catch(() => ({})) : Promise.resolve({});
      let q = await withDeadline(quotesP);
      if (q === LATE) {
        q = quotesRef.current;
        quotesP.then((fresh) => isMounted.current && Object.keys(fresh).length && setQuotes(fresh));
      }
      const currencies = [
        ...tx.map((t) => t.currency),
        ...dv.map((d) => d.currency),
        ...cash.map((a) => a.currency),
        ...Object.values(q).map((x) => x.currency),
      ];
      const ratesP = fxService
        .loadRates(base, currencies, fromDate)
        .catch(() => ({ latest: {}, history: {} }));
      // Des taux déjà en cache (même d'hier) suffisent pour afficher tout de
      // suite ; les frais arrivent en arrière-plan.
      const cachedFx = await fxService.cachedRates(base, currencies);
      let rates = cachedFx.complete ? LATE : await withDeadline(ratesP);
      if (rates === LATE) {
        rates = { latest: cachedFx.latest, history: cachedFx.history };
        ratesP.then((fresh) => isMounted.current && baseRef.current === base && setFxRates({ base, ...fresh }));
      }

      if (!isMounted.current) return;
      setTransactions(tx);
      setDividends(dv);
      setCashAccounts(cash);
      setLoans(ln);
      setProperties(pr);
      setQuotes(q);
      setFxRates({ base, ...rates });
      setLastUpdated(new Date());

      loadHistories(tx, assets, earliestDate(tx, dv));
    } catch (err) {
      if (isMounted.current) setError(err.message || 'Loading error');
    } finally {
      loadingRef.current = false;
      if (isMounted.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
      const queued = reloadQueued.current;
      reloadQueued.current = null;
      if (queued && isMounted.current) loadData(queued);
    }
  }, [loadHistories]);

  useEffect(() => {
    isMounted.current = true;
    loadData({ silent: true });
    return () => {
      isMounted.current = false;
    };
  }, [loadData]);

  // Changement de devise de référence : il faut d'autres taux.
  const firstBase = useRef(true);
  useEffect(() => {
    if (firstBase.current) {
      firstBase.current = false;
      return;
    }
    loadData({ silent: true });
  }, [baseCurrency, loadData]);

  // Retour au premier plan : les cours ont bougé. Le cache de cotations évite
  // l'appel réseau si le dernier chargement date de moins d'une minute.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isMounted.current) loadData({ silent: true });
    });
    return () => sub.remove();
  }, [loadData]);

  const refresh = useCallback(() => loadData({ force: true }), [loadData]);
  const reload = useCallback(() => loadData({ silent: true }), [loadData]);

  /**
   * Mode démo : un petit patrimoine d'exemple remplace l'affichage, les
   * vraies données restent intactes et reviennent quand on le quitte.
   */
  const setDemo = useCallback(async (on) => {
    if (on) {
      const from = new Date();
      from.setMonth(from.getMonth() - 21);
      const { series } = await marketData.getHistories(DEMO_ASSETS, from).catch(() => ({ series: {} }));
      await demoMode.enable(buildDemoData({ series }));
    } else {
      await demoMode.disable();
    }
    await loadData({ force: true });
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Calculs
  // ---------------------------------------------------------------------------

  // Tant que les taux de la nouvelle devise ne sont pas arrivés, on n'utilise
  // pas ceux de l'ancienne : ils donneraient des montants faux.
  const fx = useMemo(
    () => createFxConverter({
      base: baseCurrency,
      ...(fxRates.base === baseCurrency ? fxRates : EMPTY_FX),
    }),
    [baseCurrency, fxRates],
  );

  const computed = useMemo(
    () => computePortfolio({ transactions, dividends, quotes, fx }),
    [transactions, dividends, quotes, fx],
  );

  const { positions, totals, warnings } = computed;

  const { assets } = computed;

  const cash = useMemo(() => computeCash({ accounts: cashAccounts, fx }), [cashAccounts, fx]);

  const income = useMemo(
    () => computeIncome({ dividends, transactions, fx, positions, cashYearlyInterest: cash.yearlyInterest }),
    [dividends, transactions, fx, positions, cash.yearlyInterest],
  );

  // Crédits et immobilier : ta part, à la date du jour.
  const debts = useMemo(() => computeDebts(loans), [loans]);
  const realEstate = useMemo(() => computeRealEstate({ properties, loans }), [properties, loans]);

  /**
   * Patrimoine : `value` reste le patrimoine financier (placements et
   * liquidités), celui des courbes et des performances ; `netWorth` y ajoute
   * l'immobilier et retire ce qu'il reste à rembourser sur tous les crédits.
   */
  const overview = useMemo(() => {
    const value = totals.value + cash.total;
    const previous = value - totals.dailyChange;
    return {
      ...totals,
      value,
      investedValue: totals.value,
      cashValue: cash.total,
      realEstateValue: realEstate.value,
      debt: debts.remaining,
      netWorth: value + realEstate.value - debts.remaining,
      dailyChangePct: previous > 0 ? (totals.dailyChange / previous) * 100 : 0,
    };
  }, [totals, cash.total, realEstate.value, debts.remaining]);

  const pea = useMemo(
    // En mode démo, la date d'ouverture et les versements saisis du vrai PEA ne
    // s'appliquent pas à l'exemple.
    () => computePeaStats({ transactions, fx, settings: demo ? {} : peaSettings || {} }),
    [transactions, fx, peaSettings, demo],
  );

  const sortedHistoryKeys = useMemo(() => {
    const out = {};
    Object.entries(histories.series).forEach(([id, s]) => {
      out[id] = Object.keys(s || {}).sort();
    });
    return out;
  }, [histories]);

  /**
   * Valeur du patrimoine dans le temps.
   * @param {string} period - '1M' | '3M' | '6M' | '1Y' | 'ALL'
   * @param {{account?: string, assetId?: string, monthNames?: string[], todayLabel?: string}} [opts]
   * @returns {{labels: string[], datasets: Array<{data: number[]}>}}
   */
  const getChartData = useCallback((period = '6M', opts = {}) => {
    const { account = null, assetId = null, monthNames = MONTHS_SHORT_FR, todayLabel = null } = opts;
    const empty = { labels: [], datasets: [{ data: [] }] };
    const onlyCash = account === ACCOUNTS.CASH;
    const tx = onlyCash ? [] : transactions.filter(
      (t) => (!account || t.account === account) && (!assetId || t.assetId === assetId),
    );
    // Les liquidités comptent dans la vue globale et dans leur propre vue.
    const cashList = (!account && !assetId) || onlyCash ? cashAccounts : [];
    if (!tx.length && !cashList.length) return empty;

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const first = earliestDate(tx, [], cashList);
    first.setHours(12, 0, 0, 0);
    const days = periodDays(period, today);
    const start = days ? new Date(Math.max(first.getTime(), today.getTime() - days * DAY)) : first;
    const span = Math.max(1, Math.round((today - start) / DAY));
    const step = Math.max(1, Math.ceil(span / CHART_POINTS));

    const dates = [];
    for (let d = 0; d < span; d += step) dates.push(new Date(start.getTime() + d * DAY));
    dates.push(today);

    const todayKey = formatDateKey(today);
    const priceAt = (id, key) => {
      if (key === todayKey && quotes[id]?.price > 0) return quotes[id].price;
      return rateAt(histories.series[id], key, sortedHistoryKeys[id]);
    };
    const currencyOf = (id) => quotes[id]?.currency || histories.currencies[id];
    const values = computeValueSeries({ transactions: tx, dates, priceAt, currencyOf, fx });
    const cashSeries = cashValueSeries({ accounts: cashList, dates, fx });
    const data = values.map((v, i) => v + cashSeries[i]);
    // Argent placé : les liquidités comptent pour leur montant, sans plus-value.
    const placed = computeInvestedSeries({ transactions: tx, dates, fx });
    const invested = onlyCash ? null : placed.map((v, i) => v + cashSeries[i]);

    // Étiquettes : quelques dates réparties, et « aujourd'hui » au bout.
    const labelEvery = Math.max(1, Math.ceil(dates.length / CHART_LABELS));
    const showYear = span > 300;
    const labels = dates.map((d, i) => {
      if (i === dates.length - 1) return todayLabel || '';
      if (i % labelEvery !== 0 || dates.length - 1 - i < labelEvery / 2) return '';
      const m = monthNames[d.getMonth()] || '';
      return showYear ? `${m} '${String(d.getFullYear()).slice(-2)}` : `${d.getDate()} ${m}`;
    });

    return { labels, dates, datasets: [{ data }, ...(invested ? [{ data: invested }] : [])] };
  }, [transactions, cashAccounts, quotes, histories, sortedHistoryKeys, fx]);

  /** Valeur des investissements (hors liquidités) à plusieurs dates. */
  const getValuesAt = useCallback((dates, { account = null } = {}) => {
    const tx = transactions.filter((t) => !account || t.account === account);
    const todayKey = formatDateKey(new Date());
    const priceAt = (id, key) => {
      if (key === todayKey && quotes[id]?.price > 0) return quotes[id].price;
      return rateAt(histories.series[id], key, sortedHistoryKeys[id]);
    };
    const currencyOf = (id) => quotes[id]?.currency || histories.currencies[id];
    return computeValueSeries({ transactions: tx, dates, priceAt, currencyOf, fx });
  }, [transactions, quotes, histories, sortedHistoryKeys, fx]);

  /** Historique quotidien déjà chargé pour un actif (depuis sa première opération). */
  const getAssetHistory = useCallback((assetId) => ({
    series: histories.series[assetId] || null,
    keys: sortedHistoryKeys[assetId] || [],
    currency: histories.currencies[assetId] || quotes[assetId]?.currency || null,
  }), [histories, sortedHistoryKeys, quotes]);

  /** Cours de clôture d'un actif à une date, dans sa devise de cotation. */
  const getPriceAtDate = useCallback((assetId, date) => {
    const price = rateAt(histories.series[assetId], formatDateKey(date), sortedHistoryKeys[assetId]);
    const currency = histories.currencies[assetId] || quotes[assetId]?.currency;
    return price > 0 && currency ? { price, currency } : null;
  }, [histories, sortedHistoryKeys, quotes]);

  /** Derniers cours de clôture d'un actif (mini-courbes), cours actuel au bout. */
  const getSparkline = useCallback((assetId, points = 30) => {
    const series = histories.series[assetId] || {};
    const values = (sortedHistoryKeys[assetId] || []).slice(-points).map((k) => series[k]);
    if (quotes[assetId]?.price > 0) values.push(quotes[assetId].price);
    return values;
  }, [histories, sortedHistoryKeys, quotes]);

  // ---------------------------------------------------------------------------
  // Écritures
  // ---------------------------------------------------------------------------

  const addTransaction = useCallback(async (input) => {
    const { data: record, error: err } = await transactionsRepo.add(input);
    if (err) throw err;
    setTransactions((prev) => [...prev, record]);
    reload();
    return record;
  }, [reload]);

  const updateTransaction = useCallback(async (id, patch) => {
    const { data: record, error: err } = await transactionsRepo.update(id, patch);
    if (err) throw err;
    setTransactions((prev) => prev.map((t) => (t.id === id ? record : t)));
    reload();
    return record;
  }, [reload]);

  const deleteTransactions = useCallback(async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    const { error: err } = await transactionsRepo.remove(list);
    if (err) throw err;
    const drop = new Set(list);
    setTransactions((prev) => prev.filter((t) => !drop.has(t.id)));
  }, []);

  /** Supprime une position (un actif dans une enveloppe), ou l'actif partout. */
  const deletePosition = useCallback(async (assetId, account = null) => {
    const txIds = transactions
      .filter((t) => t.assetId === assetId && (!account || t.account === account))
      .map((t) => t.id);
    const divIds = dividends
      .filter((d) => d.assetId === assetId && (!account || d.account === account))
      .map((d) => d.id);
    if (txIds.length) await deleteTransactions(txIds);
    if (divIds.length) {
      await dividendsRepo.remove(divIds);
      const drop = new Set(divIds);
      setDividends((prev) => prev.filter((d) => !drop.has(d.id)));
    }
  }, [transactions, dividends, deleteTransactions]);

  const addDividend = useCallback(async (input) => {
    const { data: record, error: err } = await dividendsRepo.add(input);
    if (err) throw err;
    setDividends((prev) => [...prev, record]);
    reload();
    return record;
  }, [reload]);

  const updateDividend = useCallback(async (id, patch) => {
    const { data: record, error: err } = await dividendsRepo.update(id, patch);
    if (err) throw err;
    setDividends((prev) => prev.map((d) => (d.id === id ? record : d)));
    reload();
    return record;
  }, [reload]);

  const deleteDividends = useCallback(async (ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    const { error: err } = await dividendsRepo.remove(list);
    if (err) throw err;
    const drop = new Set(list);
    setDividends((prev) => prev.filter((d) => !drop.has(d.id)));
  }, []);

  /**
   * Nouveau compte de liquidités, avec son premier solde.
   * @param {{name: string, kind: string, institution?: string, currency: string, rate?: number, balance: number, date?: Date}} input
   */
  const addCashAccount = useCallback(async ({ balance, date = new Date(), ...fields }) => {
    const { data: record, error: err } = await cashRepo.add({
      ...fields,
      history: [{ date: new Date(date).toISOString(), balance }],
    });
    if (err) throw err;
    setCashAccounts((prev) => [...prev, record]);
    reload();
    return record;
  }, [reload]);

  const updateCashAccount = useCallback(async (id, patch) => {
    const { data: record, error: err } = await cashRepo.update(id, patch);
    if (err) throw err;
    setCashAccounts((prev) => prev.map((a) => (a.id === id ? record : a)));
    return record;
  }, []);

  /** Nouveau solde à une date (remplace celui du même jour). */
  const recordCashBalance = useCallback(async (id, balance, date = new Date()) => {
    const account = cashAccounts.find((a) => a.id === id);
    if (!account) throw new Error('NOT_FOUND');
    return updateCashAccount(id, { history: withBalance(account, balance, date).history });
  }, [cashAccounts, updateCashAccount]);

  /** Retire une saisie de solde ; refusé s'il ne resterait plus rien. */
  const removeCashEntry = useCallback(async (id, date) => {
    const account = cashAccounts.find((a) => a.id === id);
    if (!account) throw new Error('NOT_FOUND');
    const history = account.history.filter((h) => h.date !== date);
    if (!history.length || !normalizeCashAccount({ ...account, history })) throw new Error('LAST_ENTRY');
    return updateCashAccount(id, { history });
  }, [cashAccounts, updateCashAccount]);

  const deleteCashAccount = useCallback(async (id) => {
    const { error: err } = await cashRepo.remove(id);
    if (err) throw err;
    setCashAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Crédits et biens immobiliers : saisis à la main, sans cours à charger.
  const addLoan = useCallback(async (fields) => {
    const { data: record, error: err } = await loansRepo.add(fields);
    if (err) throw err;
    setLoans((prev) => [...prev, record]);
    return record;
  }, []);
  const updateLoan = useCallback(async (id, patch) => {
    const { data: record, error: err } = await loansRepo.update(id, patch);
    if (err) throw err;
    setLoans((prev) => prev.map((x) => (x.id === id ? record : x)));
    return record;
  }, []);
  const deleteLoan = useCallback(async (id) => {
    const { error: err } = await loansRepo.remove(id);
    if (err) throw err;
    setLoans((prev) => prev.filter((x) => x.id !== id));
  }, []);
  const addProperty = useCallback(async (fields) => {
    const { data: record, error: err } = await propertiesRepo.add(fields);
    if (err) throw err;
    setProperties((prev) => [...prev, record]);
    return record;
  }, []);
  const updateProperty = useCallback(async (id, patch) => {
    const { data: record, error: err } = await propertiesRepo.update(id, patch);
    if (err) throw err;
    setProperties((prev) => prev.map((x) => (x.id === id ? record : x)));
    return record;
  }, []);
  /** Nouvelle estimation de la valeur d'un bien (remplace celle du même jour). */
  const recordPropertyValue = useCallback(async (id, value, date = new Date()) => {
    const property = properties.find((x) => x.id === id);
    if (!property) throw new Error('NOT_FOUND');
    return updateProperty(id, { history: withEstimate(property, value, date).history });
  }, [properties, updateProperty]);
  const deleteProperty = useCallback(async (id) => {
    const { error: err } = await propertiesRepo.remove(id);
    if (err) throw err;
    setProperties((prev) => prev.filter((x) => x.id !== id));
    // Un crédit lié reste : il ne pointe plus vers rien.
    const linked = loans.filter((l) => l.propertyId === id);
    await Promise.all(linked.map((l) => loansRepo.update(l.id, { propertyId: null })));
    if (linked.length) setLoans((prev) => prev.map((l) => (l.propertyId === id ? { ...l, propertyId: null } : l)));
  }, [loans]);

  // ---------------------------------------------------------------------------
  // Lectures pratiques pour les écrans
  // ---------------------------------------------------------------------------

  const getAsset = useCallback((assetId) => assets.find((a) => a.assetId === assetId) || null, [assets]);

  const getPosition = useCallback(
    (assetId, account) => positions.find((p) => p.key === positionKey(assetId, account)) || null,
    [positions],
  );

  const getTransactionsFor = useCallback(
    (assetId, account = null) => transactions
      .filter((t) => t.assetId === assetId && (!account || t.account === account))
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions],
  );

  const getDividendsFor = useCallback(
    (assetId, account = null) => dividends
      .filter((d) => d.assetId === assetId && (!account || d.account === account))
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [dividends],
  );

  /** Quantité détenue d'un actif dans une enveloppe à une date (contrôle des ventes). */
  const getHeldQuantity = useCallback((assetId, account, atDate = new Date(), excludeId = null) => {
    const end = new Date(atDate);
    return transactions.reduce((sum, t) => {
      if (t.assetId !== assetId || t.account !== account || t.id === excludeId) return sum;
      if (new Date(t.date) > end) return sum;
      return sum + (t.side === 'sell' ? -t.quantity : t.quantity);
    }, 0);
  }, [transactions]);

  const value = useMemo(() => ({
    baseCurrency,
    transactions,
    dividends,
    quotes,
    fx,
    positions,
    assets,
    totals,
    overview,
    cash,
    cashAccounts,
    income,
    warnings,
    pea,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refresh,
    reload,
    demo,
    setDemo,
    getChartData,
    getSparkline,
    getPriceAtDate,
    getAssetHistory,
    getValuesAt,
    addTransaction,
    updateTransaction,
    deleteTransactions,
    deletePosition,
    addDividend,
    updateDividend,
    deleteDividends,
    getAsset,
    getPosition,
    getTransactionsFor,
    getDividendsFor,
    getHeldQuantity,
    addCashAccount,
    updateCashAccount,
    recordCashBalance,
    removeCashEntry,
    deleteCashAccount,
    loans,
    properties,
    debts,
    realEstate,
    addLoan,
    updateLoan,
    deleteLoan,
    addProperty,
    updateProperty,
    recordPropertyValue,
    deleteProperty,
  }), [
    baseCurrency, transactions, dividends, quotes, fx, positions, assets, totals,
    warnings, pea, isLoading, isRefreshing, lastUpdated, error, refresh, reload, demo, setDemo,
    getChartData, getSparkline, getPriceAtDate, getAssetHistory, getValuesAt, addTransaction, updateTransaction, deleteTransactions,
    deletePosition, addDividend, updateDividend, deleteDividends, getAsset,
    getPosition, getTransactionsFor, getDividendsFor, getHeldQuantity,
    overview, cash, cashAccounts, income, addCashAccount, updateCashAccount,
    recordCashBalance, removeCashEntry, deleteCashAccount,
    loans, properties, debts, realEstate, addLoan, updateLoan, deleteLoan,
    addProperty, updateProperty, recordPropertyValue, deleteProperty,
  ]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
};

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error('usePortfolio must be used within a PortfolioProvider');
  return context;
};

export default PortfolioContext;
