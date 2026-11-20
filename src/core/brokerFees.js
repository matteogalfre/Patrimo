/**
 * Frais de courtage estimés selon la règle de l'enveloppe (fonctions pures).
 * Ils pré-remplissent le champ « Frais » d'une opération, qui reste
 * modifiable : l'avis d'opéré du courtier fait foi.
 *
 * Règles :
 *  - `tariff` : la grille d'un courtier, tirée du catalogue (`id`) ;
 *  - `percent` : un pourcentage du montant, avec un minimum (et un maximum) ;
 *  - `fixed` : un montant fixe par ordre.
 * L'ancienne règle `bourseDirect` vaut la grille Bourse Direct du catalogue.
 *
 * Sur un PEA, la loi plafonne le courtage d'un ordre passé en ligne à 0,5 %
 * de son montant (décret 2020-95) : 0,77 € et non 0,99 € pour 153,20 €.
 *
 * Taxe sur les transactions financières (TTF) : à l'achat d'actions de
 * grandes sociétés françaises (capitalisation de plus d'un milliard d'euros).
 * 0,2 % jusqu'en 2016, 0,3 % jusqu'au 31 mars 2025, 0,4 % depuis. La liste
 * officielle compte environ 120 sociétés et change chaque année : on
 * l'applique aux valeurs du CAC 40, toutes concernées.
 */

import { STOCK_SECTORS } from '../constants/exposureData';
import { BROKER_TARIFFS } from '../constants/brokerTariffs';

export const RULE_TYPES = ['none', 'tariff', 'percent', 'fixed'];

/** Plafond légal du courtage sur PEA, en % de l'ordre. */
export const PEA_FEE_CAP = 0.5;

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Courtage d'un ordre selon un barème : un forfait par tranche de montant
 * (`tiers`, [{ upTo, fee }]), sinon une partie fixe (`fee`) plus un
 * pourcentage (`pct`), borné par `min` et `max`.
 */
export const scheduleFee = (schedule, amount) => {
  if (!schedule || !(amount > 0)) return 0;
  const tier = schedule.tiers?.find((t) => amount <= t.upTo);
  if (tier) return round2(tier.fee);
  let fee = (Number(schedule.fee) || 0) + (amount * (Number(schedule.pct) || 0)) / 100;
  if (schedule.min != null) fee = Math.max(Number(schedule.min) || 0, fee);
  if (schedule.max != null) fee = Math.min(Number(schedule.max), fee);
  return round2(fee);
};

export const tariffById = (id) => BROKER_TARIFFS.find((x) => x.id === id) || null;

/** Les grilles proposées pour une enveloppe (celles de son établissement d'abord). */
export const tariffsFor = (account, institutionId) => {
  const list = BROKER_TARIFFS.filter((x) => x.accounts.includes(account));
  return [...list.filter((x) => x.institution === institutionId), ...list.filter((x) => x.institution !== institutionId)];
};

/** La règle stockée, ramenée aux types actuels. */
export const normalizeRule = (rule) => (rule?.type === 'bourseDirect' ? { type: 'tariff', id: 'boursedirect' } : rule || null);

/** La grille du catalogue derrière une règle, s'il y en a une. */
export const tariffOf = (rule) => {
  const r = normalizeRule(rule);
  return r?.type === 'tariff' ? tariffById(r.id) : null;
};

const forCurrency = (map, currency) => (map ? map[currency] || map['*'] || null : null);

/**
 * Le barème d'une grille pour un ordre : celui du titre s'il en a un
 * (`symbols`), puis celui des fonds (`funds`), puis celui de sa devise
 * (`markets`, `*` pour toutes). Un achat programmé suit `plan`.
 */
export const tariffSchedule = (tariff, currency, { plan = false, symbol, fund = false } = {}) => {
  if (!tariff) return null;
  if (plan && tariff.plan) return tariff.plan;
  const own = symbol ? forCurrency(tariff.symbols?.[String(symbol).toUpperCase()], currency) : null;
  return own || (fund ? forCurrency(tariff.funds, currency) : null) || forCurrency(tariff.markets, currency);
};

export const bourseDirectFee = (amount) => scheduleFee(tariffSchedule(tariffById('boursedirect'), 'EUR'), amount);

/** Taux de TTF à une date, en %. */
export const ttfRate = (date) => {
  const day = new Date(date).toISOString().slice(0, 10);
  if (day < '2017-01-01') return 0.2;
  if (day < '2025-04-01') return 0.3;
  return 0.4;
};

// Valeurs du CAC 40 de la table des secteurs (une petite valeur n'y est pas soumise).
const TTF_STOCKS = new Set(Object.keys(STOCK_SECTORS).filter((s) => s.endsWith('.PA') && s !== 'ALVMG.PA'));

export const isTtfStock = (symbol) => TTF_STOCKS.has(String(symbol || '').toUpperCase());

/**
 * @param {{rule: object|null, amount: number, side: 'buy'|'sell', symbol: string, assetType: string, date: Date, currency: string, account?: string, ttf?: boolean, plan?: boolean, fund?: boolean}} params
 *   fund : l'ordre porte sur un ETF ou un fonds (certaines grilles les facturent à part)
 * @returns {{total: number, brokerage: number, ttf: number}|null} null si aucune règle ne s'applique
 */
export const estimateFees = ({ rule: stored, amount, side, symbol, assetType, date = new Date(), currency, account, ttf = true, plan = false, fund = false }) => {
  const rule = normalizeRule(stored);
  if (!rule || rule.type === 'none' || !(amount > 0)) return null;
  let brokerage = 0;
  if (rule.type === 'tariff') {
    // Une grille ne couvre que ses marchés : rien d'estimé ailleurs.
    const schedule = tariffSchedule(tariffById(rule.id), currency, { plan, symbol, fund });
    if (!schedule) return null;
    brokerage = scheduleFee(schedule, amount);
  } else if (rule.type === 'percent') {
    brokerage = scheduleFee({ pct: rule.pct, min: rule.min || 0, max: rule.max }, amount);
  } else if (rule.type === 'fixed') {
    brokerage = Number(rule.amount) || 0;
  } else {
    return null;
  }
  if (account === 'PEA') brokerage = Math.min(brokerage, (amount * PEA_FEE_CAP) / 100);
  brokerage = round2(brokerage);
  const tax = round2(ttf && side === 'buy' && assetType === 'stock' && currency === 'EUR' && isTtfStock(symbol)
    ? (amount * ttfRate(date)) / 100
    : 0);
  // Chaque ligne de l'avis d'opéré est arrondie au centime avant le total.
  return { total: round2(brokerage + tax), brokerage, ttf: tax };
};

/**
 * Règle à poser quand on choisit l'établissement d'une enveloppe : sa grille
 * si le catalogue la connaît pour ce type d'enveloppe.
 */
export const ruleForInstitution = (institutionId, account) => {
  const tariff = BROKER_TARIFFS.find((x) => x.institution === institutionId && x.accounts.includes(account));
  return tariff ? { type: 'tariff', id: tariff.id } : null;
};
