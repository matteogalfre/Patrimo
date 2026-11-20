/**
 * Banques reliées par GoCardless : connexion, choix du compte Patrimo que
 * chaque compte bancaire alimente, relecture des soldes.
 *
 * Les liens restent sur le téléphone (AsyncStorage, hors sauvegarde : un
 * accord bancaire ne se transporte pas) ; les clés GoCardless restent dans
 * le coffre sécurisé. Un solde lu devient une saisie de solde du compte de
 * liquidités, comme si on l'avait tapée.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

import { STORAGE_KEYS } from '../constants';
import { usePortfolio } from './PortfolioContext';
import gocardless, { accountFingerprint, BANK_REDIRECT } from '../services/gocardless';
import {
  accountName,
  dueAccounts,
  isCardAccount,
  kindFromAccount,
  linkedCashIds,
  matchInstitution,
  needsAutoSync,
  nextSyncAt,
  pickBalance,
  SYNC_INTERVAL_MS,
  suggestTarget,
  uniqueName,
  validUntil,
} from '../core/bankSync';

const BankContext = createContext(null);

const INSTITUTIONS_TTL = 7 * 24 * 60 * 60 * 1000;
// Statuts GoCardless d'une connexion encore en cours côté banque.
const IN_PROGRESS = ['GC', 'UA', 'SA', 'GA'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Juste après l'accord, certaines banques répondent « compte en cours de
// préparation » (409) pendant quelques secondes : on patiente un peu.
const whenReady = async (fn) => {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err?.statusCode !== 409 || i >= 3) throw err;
      await sleep(2500 * (i + 1));
    }
  }
};

/** Le message de GoCardless (« Access has expired »…), pour comprendre un refus. */
const errorDetail = (err) => {
  const text = String(err?.message || '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  try {
    const body = JSON.parse(text.slice(start));
    return String(body.summary || body.detail || '').slice(0, 140) || null;
  } catch {
    return null;
  }
};

export const BankProvider = ({ children }) => {
  const { cashAccounts, addCashAccount, recordCashBalance, demo, isLoading } = usePortfolio();
  const [links, setLinks] = useState([]);
  const [hasKeys, setHasKeys] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const linksRef = useRef([]);
  const institutionsRef = useRef(null);
  const autoDone = useRef(0);
  const connecting = useRef(false);

  const persist = useCallback(async (next) => {
    linksRef.current = next;
    setLinks(next);
    await AsyncStorage.setItem(STORAGE_KEYS.BANK_LINKS, JSON.stringify(next)).catch(() => {});
  }, []);

  const patchLink = useCallback((id, fn) => persist(linksRef.current.map((l) => (l.id === id ? fn(l) : l))), [persist]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.BANK_LINKS);
        const list = raw ? JSON.parse(raw) : [];
        linksRef.current = Array.isArray(list) ? list : [];
        setLinks(linksRef.current);
        setHasKeys(await gocardless.hasCredentials());
      } catch {
        // Rien de relié : l'écran le montrera.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const saveKeys = useCallback(async (secretId, secretKey) => {
    await gocardless.saveCredentials(secretId, secretKey);
    setHasKeys(true);
  }, []);

  const removeKeys = useCallback(async () => {
    await gocardless.clearCredentials();
    setHasKeys(false);
  }, []);

  /** Banques françaises disponibles (gardées une semaine). */
  const loadInstitutions = useCallback(async () => {
    if (institutionsRef.current) return institutionsRef.current;
    try {
      const cached = JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.BANK_INSTITUTIONS)) || 'null');
      if (cached?.ts && Date.now() - cached.ts < INSTITUTIONS_TTL && cached.list?.length) {
        institutionsRef.current = cached.list;
        return cached.list;
      }
    } catch {
      // Cache illisible : on relit.
    }
    const raw = await gocardless.listInstitutions('FR');
    const list = (Array.isArray(raw) ? raw : [])
      .map((i) => ({
        id: i.id,
        name: i.name,
        logo: i.logo || null,
        days: Number(i.max_access_valid_for_days) || 90,
        history: Number(i.transaction_total_days) || 90,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    institutionsRef.current = list;
    AsyncStorage.setItem(STORAGE_KEYS.BANK_INSTITUTIONS, JSON.stringify({ ts: Date.now(), list })).catch(() => {});
    return list;
  }, []);

  /**
   * Lit les comptes d'une connexion acceptée par la banque : nom, type,
   * solde. Pour un renouvellement, les comptes déjà connus reprennent leur
   * compte Patrimo ; les autres attendent qu'on choisisse.
   */
  const readAccounts = useCallback(async (link, accountIds) => {
    const previous = link.replaces ? linksRef.current.find((l) => l.id === link.replaces) : null;
    const now = new Date().toISOString();
    const accounts = [];
    for (const id of accountIds) {
      const [{ account = {} } = {}, balances] = await Promise.all([
        whenReady(() => gocardless.getAccountDetails(id)).catch(() => ({})),
        whenReady(() => gocardless.getAccountBalances(id)).catch(() => null),
      ]);
      const kind = kindFromAccount(account);
      const balance = pickBalance(balances?.balances);
      const currency = String(account.currency || balance?.currency || 'EUR').toUpperCase();
      // Deux poches de devises différentes ne doivent pas porter le même nom.
      const base = accountName(account);
      const name = base && currency !== 'EUR' && !base.toUpperCase().includes(currency) ? `${base} ${currency}` : base;
      const fingerprint = await accountFingerprint({ iban: account.iban, resourceId: account.resourceId, name, currency });
      const known = previous?.accounts?.find((a) => a.fingerprint === fingerprint);
      accounts.push({
        id,
        fingerprint,
        name,
        kind,
        currency,
        balance: balance?.amount ?? null,
        balanceAt: balance ? now : null,
        lastSync: balance ? now : null,
        card: isCardAccount(account),
        state: known && known.state !== 'new' ? known.state : 'new',
        cashId: known?.state === 'linked' ? known.cashId : null,
      });
    }
    return accounts;
  }, []);

  /**
   * Où en est une connexion lancée : reliée (comptes lus), encore en cours
   * côté banque, ou abandonnée (on l'oublie).
   * @returns {Promise<'linked'|'pending'|'cancelled'>}
   */
  const inflight = useRef({});
  const resolveOnce = useCallback(async (id, { wait = false } = {}) => {
    let requisition = await gocardless.getRequisition(id);
    // Retour de la banque un peu en avance : on lui laisse quelques secondes.
    for (let i = 0; wait && i < 3 && IN_PROGRESS.includes(requisition.status); i += 1) {
      await sleep(1500);
      requisition = await gocardless.getRequisition(id);
    }
    const link = linksRef.current.find((l) => l.id === id);
    if (!link) return 'cancelled';
    if (requisition.status === 'LN' && requisition.accounts?.length) {
      const accounts = await readAccounts(link, requisition.accounts);
      const linkedAt = new Date().toISOString();
      // Soldes des comptes déjà rangés (renouvellement) : enregistrés tout de suite.
      for (const a of accounts) {
        if (a.state === 'linked' && a.balance !== null && cashAccounts.some((c) => c.id === a.cashId)) {
          await recordCashBalance(a.cashId, a.balance).catch(() => {});
        }
      }
      const done = { ...link, status: 'linked', linkedAt, validUntil: validUntil(linkedAt, link.validDays), accounts };
      const rest = linksRef.current.filter((l) => l.id !== id && l.id !== link.replaces);
      await persist([...rest, done]);
      if (link.replaces) gocardless.deleteRequisition(link.replaces);
      return 'linked';
    }
    if (IN_PROGRESS.includes(requisition.status)) return 'pending';
    // Refusée, expirée, ou jamais commencée : rien à garder.
    gocardless.deleteRequisition(id);
    await persist(linksRef.current.filter((l) => l.id !== id));
    return 'cancelled';
  }, [cashAccounts, persist, readAccounts, recordCashBalance]);

  // Une seule lecture à la fois par connexion (retour de la banque et retour
  // dans l'app arrivent ensemble) : chaque lecture de compte compte dans le quota.
  const resolveLink = useCallback((id, opts) => {
    if (!inflight.current[id]) {
      inflight.current[id] = resolveOnce(id, opts).finally(() => { delete inflight.current[id]; });
    }
    return inflight.current[id];
  }, [resolveOnce]);

  /**
   * Ouvre la page de la banque pour donner l'accord (ou le renouveler).
   * @returns {Promise<'linked'|'pending'|'cancelled'>}
   */
  const connect = useCallback(async (institution, { language = 'fr', replaces = null } = {}) => {
    const { requisitionId, link: url, validDays } = await gocardless.startConnection(
      { id: institution.id, max_access_valid_for_days: institution.days, transaction_total_days: institution.history },
      { language },
    );
    const pending = {
      id: requisitionId,
      institutionId: institution.id,
      institutionName: institution.name,
      logo: institution.logo || null,
      institution: matchInstitution(institution.name),
      status: 'pending',
      createdAt: new Date().toISOString(),
      validDays,
      ...(replaces ? { replaces } : {}),
      accounts: [],
    };
    await persist([...linksRef.current.filter((l) => l.id !== requisitionId), pending]);
    connecting.current = true;
    try {
      await WebBrowser.openAuthSessionAsync(url, BANK_REDIRECT);
    } finally {
      connecting.current = false;
    }
    return resolveLink(requisitionId, { wait: true });
  }, [persist, resolveLink]);

  /** Renouvelle l'accord d'une banque : mêmes comptes, nouvelle durée. */
  const renew = useCallback(async (linkId, opts = {}) => {
    const link = linksRef.current.find((l) => l.id === linkId);
    if (!link) throw new Error('NOT_FOUND');
    const known = (await loadInstitutions().catch(() => [])).find((i) => i.id === link.institutionId);
    return connect(known || { id: link.institutionId, name: link.institutionName, logo: link.logo, days: link.validDays }, { ...opts, replaces: linkId });
  }, [connect, loadInstitutions]);

  /**
   * Range les comptes d'une banque fraîchement reliée.
   * @param {string} linkId
   * @param {Object<string, string>} choices - par compte bancaire : 'new', 'skip' ou l'id d'un compte Patrimo
   * @param {(kind: string) => string} kindLabel
   */
  const assignAccounts = useCallback(async (linkId, choices, kindLabel) => {
    const link = linksRef.current.find((l) => l.id === linkId);
    if (!link) throw new Error('NOT_FOUND');
    const names = cashAccounts.map((c) => c.name);
    const accounts = [];
    // Comptes existants d'abord, créations ensuite : une création recharge le portefeuille.
    const ordered = [...link.accounts].sort((a, b) => (choices[a.id] === 'new') - (choices[b.id] === 'new'));
    for (let a of ordered) {
      const choice = a.state === 'new' ? choices[a.id] : null;
      if (!choice) { accounts.push(a); continue; }
      if (choice === 'skip') { accounts.push({ ...a, state: 'ignored', cashId: null }); continue; }
      // Solde pas encore lu à la connexion (banque lente) : une nouvelle tentative.
      if (a.balance === null) {
        const read = pickBalance((await whenReady(() => gocardless.getAccountBalances(a.id)).catch(() => null))?.balances);
        if (read) a = { ...a, balance: read.amount, balanceAt: new Date().toISOString(), lastSync: new Date().toISOString() };
      }
      if (choice === 'new') {
        const name = uniqueName(a.name || `${kindLabel(a.kind)} · ${link.institutionName}`, names);
        names.push(name);
        const record = await addCashAccount({
          name,
          kind: a.kind,
          institution: link.institution,
          currency: a.currency,
          balance: a.balance ?? 0, // relu à la prochaine mise à jour si la banque n'a rien donné
        });
        accounts.push({ ...a, state: 'linked', cashId: record.id });
        continue;
      }
      if (a.balance !== null) await recordCashBalance(choice, a.balance);
      accounts.push({ ...a, state: 'linked', cashId: choice });
    }
    const byId = new Map(accounts.map((a) => [a.id, a]));
    await patchLink(linkId, (l) => ({ ...l, accounts: l.accounts.map((a) => byId.get(a.id) || a) }));
  }, [addCashAccount, cashAccounts, patchLink, recordCashBalance]);

  /**
   * L'accord de la banque tient-il encore ? Lire la connexion ne compte pas
   * dans le quota des comptes. true : valide, false : expiré ou révoqué,
   * null : on ne sait pas (réseau), donc on ne conclut rien.
   */
  const consentAlive = useCallback(async (linkId) => {
    try {
      return (await gocardless.getRequisition(linkId)).status === 'LN';
    } catch (err) {
      if (err?.code === 'AUTH') throw err;
      return err?.statusCode === 404 ? false : null;
    }
  }, []);

  /**
   * Relit les soldes dus (une fois toutes les 6 h par compte au plus).
   * @returns {Promise<{updated: number, failed: number, nextAt: number|null}>}
   */
  const syncAll = useCallback(async () => {
    if (demo || !hasKeys) return { updated: 0, failed: 0, nextAt: null };
    setSyncing(true);
    let updated = 0;
    let failed = 0;
    try {
      const existing = new Set(cashAccounts.map((c) => c.id));
      const consent = {};
      for (const link of linksRef.current) {
        const due = dueAccounts(link);
        if (!due.length) continue;
        const patches = {};
        let expired = false;
        for (const a of due) {
          // Compte Patrimo supprimé : rien à écrire. L'écran propose de le reranger.
          if (!existing.has(a.cashId)) continue;
          try {
            const balance = pickBalance((await gocardless.getAccountBalances(a.id))?.balances);
            const now = new Date().toISOString();
            if (balance) {
              await recordCashBalance(a.cashId, balance.amount);
              updated += 1;
            }
            patches[a.id] = { lastSync: now, balance: balance?.amount ?? a.balance, balanceAt: balance ? now : a.balanceAt, lastError: null, lastErrorDetail: null };
          } catch (err) {
            if (err?.code === 'AUTH') throw err;
            failed += 1;
            const status = err?.statusCode;
            const refused = status === 401 || status === 403;
            // Un refus sur UN compte (souvent une carte) ne veut pas dire que
            // l'accord est fini : on le vérifie sur la connexion elle-même.
            if (refused) {
              if (consent[link.id] === undefined) consent[link.id] = await consentAlive(link.id);
              if (consent[link.id] === false) { expired = true; break; }
            }
            const wait = status === 429 ? 2 * SYNC_INTERVAL_MS : refused ? 4 * SYNC_INTERVAL_MS : 0;
            patches[a.id] = {
              lastError: status ? String(status) : 'NETWORK',
              lastErrorDetail: errorDetail(err),
              ...(wait ? { blockedUntil: new Date(Date.now() + wait).toISOString() } : {}),
            };
          }
        }
        await patchLink(link.id, (l) => ({
          ...l,
          ...(expired ? { status: 'expired' } : {}),
          accounts: l.accounts.map((a) => (patches[a.id] ? { ...a, ...patches[a.id] } : a)),
        }));
      }
    } finally {
      setSyncing(false);
    }
    const waits = linksRef.current.flatMap((l) => (l.accounts || []).filter((a) => a.cashId).map(nextSyncAt)).filter((t) => t > Date.now());
    return { updated, failed, nextAt: waits.length ? Math.min(...waits) : null };
  }, [cashAccounts, consentAlive, demo, hasKeys, patchLink, recordCashBalance]);

  /** Change le sort d'un compte bancaire : 'new' (à reranger) ou 'ignored' (ne plus suivre). */
  const setAccountState = useCallback((linkId, accountId, state) => patchLink(linkId, (l) => ({
    ...l,
    accounts: l.accounts.map((a) => (a.id === accountId ? { ...a, state, cashId: null, lastError: null, lastErrorDetail: null } : a)),
  })), [patchLink]);
  const unassign = useCallback((linkId, accountId) => setAccountState(linkId, accountId, 'new'), [setAccountState]);
  const ignore = useCallback((linkId, accountId) => setAccountState(linkId, accountId, 'ignored'), [setAccountState]);

  /** Oublie une banque. Les comptes Patrimo restent, avec leur historique. */
  const disconnect = useCallback(async (linkId) => {
    if (hasKeys) gocardless.deleteRequisition(linkId);
    await persist(linksRef.current.filter((l) => l.id !== linkId));
  }, [hasKeys, persist]);

  // À l'ouverture (et au retour dans l'app) : connexions restées en suspens,
  // puis soldes de plus de 12 h. Pas en mode exemple.
  const syncRef = useRef(syncAll);
  syncRef.current = syncAll;
  const resolveRef = useRef(resolveLink);
  resolveRef.current = resolveLink;
  const consentRef = useRef(consentAlive);
  consentRef.current = consentAlive;
  const patchRef = useRef(patchLink);
  patchRef.current = patchLink;
  useEffect(() => {
    if (!ready || !hasKeys || demo || isLoading) return undefined;
    const run = async () => {
      if (connecting.current || Date.now() - autoDone.current < 60 * 1000) return;
      autoDone.current = Date.now();
      for (const l of linksRef.current.filter((x) => x.status === 'pending')) {
        await resolveRef.current(l.id).catch(() => {});
      }
      // Accord marqué expiré par erreur (refus sur un seul compte) alors que
      // la banque le tient pour valide : on le rétablit.
      const now = Date.now();
      for (const l of linksRef.current.filter((x) => x.status === 'expired' && x.validUntil && new Date(x.validUntil).getTime() > now)) {
        if (await consentRef.current(l.id).catch(() => null)) await patchRef.current(l.id, (x) => ({ ...x, status: 'linked' }));
      }
      if (needsAutoSync(linksRef.current)) await syncRef.current().catch(() => {});
    };
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => sub.remove();
  }, [ready, hasKeys, demo, isLoading]);

  const value = useMemo(() => ({
    ready,
    links,
    hasKeys,
    syncing,
    linkedIds: linkedCashIds(links.filter((l) => l.status !== 'pending')),
    saveKeys,
    removeKeys,
    loadInstitutions,
    connect,
    renew,
    resolveLink,
    assignAccounts,
    syncAll,
    disconnect,
    unassign,
    ignore,
    suggestFor: (account, link, used) => suggestTarget({ ...account, institution: link.institution }, cashAccounts, used),
  }), [ready, links, hasKeys, syncing, saveKeys, removeKeys, loadInstitutions, connect, renew, resolveLink, assignAccounts, syncAll, disconnect, unassign, ignore, cashAccounts]);

  return <BankContext.Provider value={value}>{children}</BankContext.Provider>;
};

export const useBank = () => {
  const context = useContext(BankContext);
  if (!context) throw new Error('useBank must be used within a BankProvider');
  return context;
};

export default BankContext;
