/**
 * Moteur de calcul du patrimoine (fonctions pures, sans réseau ni stockage).
 *
 * Règles retenues, et pourquoi :
 *  - Une position = un actif dans une enveloppe (PEA, CTO, crypto). Le même
 *    ETF en PEA et en CTO a deux prix de revient distincts.
 *  - Prix de revient au coût moyen pondéré, frais d'achat inclus : c'est la
 *    méthode du fisc français pour les titres (prix moyen pondéré
 *    d'acquisition) et celle qu'affichent les courtiers.
 *  - Les frais de vente diminuent le produit de cession.
 *  - Chaque opération est convertie dans la devise de référence au taux de
 *    SON jour ; la valeur actuelle au taux du jour. L'écart est l'effet de
 *    change, isolé dans `fxEffect`.
 *  - Les positions soldées restent dans les totaux : leur gain réalisé fait
 *    partie de la performance (l'ancien calcul l'effaçait).
 *  - Trois bases de capital coexistent :
 *      grossInvested : cumul de tous les achats ;
 *      costBasis     : prix de revient de ce qui est encore détenu ;
 *      netInvested   : argent réellement sorti de la poche (achats − ventes),
 *                      dénominateur du rendement.
 */

import { ACCOUNT_ORDER, ASSET_TYPES, PEA_DEPOSIT_CEILING, PEA_MATURITY_YEARS, positionKey } from './assets';
import { formatDateKey } from '../utils/formatters';

/** En dessous, une quantité est considérée comme nulle (1 satoshi). */
export const DUST = 1e-8;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const byDateThenId = (a, b) => {
  const d = new Date(a.date) - new Date(b.date);
  if (d !== 0) return d;
  return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
};

const emptyLot = (tx) => ({
  key: positionKey(tx.assetId, tx.account),
  assetId: tx.assetId,
  assetType: tx.assetType,
  symbol: tx.symbol,
  name: tx.name || tx.symbol,
  account: tx.account,
  quantity: 0,
  costBasis: 0, // base, prix de revient de ce qui est détenu
  costAtFxNow: 0, // même coût, converti au taux du jour (pour isoler le change)
  grossInvested: 0,
  proceeds: 0,
  realized: 0,
  feesPaid: 0,
  txCount: 0,
  firstDate: tx.date,
  lastDate: tx.date,
  pricePending: false,
  oversold: false,
});

/**
 * @typedef {object} Transaction
 * @property {string} id
 * @property {string} assetId
 * @property {string} assetType
 * @property {string} symbol
 * @property {string} [name]
 * @property {string} account
 * @property {'buy'|'sell'} side
 * @property {number} quantity - toujours positive
 * @property {number|null} unitPrice - dans `currency` ; null = à compléter
 * @property {number} [fees] - dans `currency`
 * @property {string} currency - devise du prix saisi
 * @property {string} date - ISO
 */

/**
 * Calcule positions, actifs et totaux.
 *
 * @param {object} params
 * @param {Transaction[]} params.transactions
 * @param {Array<{id: string, assetId?: string, symbol?: string, account: string, amount: number, currency: string, date: string}>} [params.dividends]
 * @param {Object<string, {price: number, currency: string, changePct?: number}>} [params.quotes]
 * @param {{now: Function, at: Function}} params.fx - convertisseur vers la devise de référence
 */
export const computePortfolio = ({ transactions = [], dividends = [], quotes = {}, fx }) => {
  const lots = new Map();
  const warnings = { missingQuotes: [], pendingPrices: [], missingFx: [], oversold: [] };

  [...transactions].sort(byDateThenId).forEach((tx) => {
    const key = positionKey(tx.assetId, tx.account);
    if (!lots.has(key)) lots.set(key, emptyLot(tx));
    const lot = lots.get(key);
    lot.txCount += 1;
    if (tx.date < lot.firstDate) lot.firstDate = tx.date;
    if (tx.date > lot.lastDate) lot.lastDate = tx.date;

    const qty = Math.abs(num(tx.quantity));
    if (qty <= 0) return;
    const fees = Math.abs(num(tx.fees));

    let unitPrice = num(tx.unitPrice);
    let currency = tx.currency;
    if (!(unitPrice > 0)) {
      // Prix inconnu (import ancien, réseau absent à la saisie) : on valorise
      // provisoirement au cours actuel, donc sans gain ni perte, et on le
      // signale. Le contexte complète le prix depuis l'historique dès que
      // possible ; rien n'est écrit en base ici.
      const q = quotes[tx.assetId];
      unitPrice = q?.price > 0 ? q.price : 0;
      currency = q?.currency || currency;
      lot.pricePending = true;
      warnings.pendingPrices.push(tx.id);
    }

    let rate = fx.at(currency, tx.date);
    if (!(rate > 0)) {
      warnings.missingFx.push(currency);
      rate = 0;
    }
    const rateNow = fx.now(currency) > 0 ? fx.now(currency) : rate;

    if (tx.side === 'sell') {
      const sellQty = Math.min(qty, lot.quantity);
      if (qty > lot.quantity + DUST) {
        lot.oversold = true;
        warnings.oversold.push(tx.id);
      }
      if (sellQty <= 0) return;
      const share = sellQty / qty;
      const proceeds = (sellQty * unitPrice - fees * share) * rate;
      const avgCost = lot.costBasis / lot.quantity;
      const avgCostNow = lot.costAtFxNow / lot.quantity;
      lot.realized += proceeds - avgCost * sellQty;
      lot.proceeds += proceeds;
      lot.feesPaid += fees * share * rate;
      lot.costBasis -= avgCost * sellQty;
      lot.costAtFxNow -= avgCostNow * sellQty;
      lot.quantity -= sellQty;
      if (lot.quantity < DUST) {
        lot.quantity = 0;
        lot.costBasis = 0;
        lot.costAtFxNow = 0;
      }
    } else {
      const gross = qty * unitPrice + fees;
      lot.quantity += qty;
      lot.costBasis += gross * rate;
      lot.costAtFxNow += gross * rateNow;
      lot.grossInvested += gross * rate;
      lot.feesPaid += fees * rate;
    }
  });

  // Dividendes, rattachés à leur position quand elle existe.
  const dividendsByKey = new Map();
  let orphanDividends = 0;
  const orphanByAccount = {};
  dividends.forEach((d) => {
    const amount = num(d.amount) * (fx.at(d.currency, d.date) || 0);
    const key = d.assetId ? positionKey(d.assetId, d.account) : null;
    if (key && lots.has(key)) {
      dividendsByKey.set(key, (dividendsByKey.get(key) || 0) + amount);
    } else {
      orphanDividends += amount;
      orphanByAccount[d.account] = (orphanByAccount[d.account] || 0) + amount;
    }
  });

  const positions = [...lots.values()].map((lot) => {
    const quote = quotes[lot.assetId];
    const isHeld = lot.quantity > DUST;
    const rateNow = quote ? fx.now(quote.currency) : null;
    const hasQuote = !!(quote && quote.price > 0 && rateNow > 0);
    if (isHeld && !hasQuote) warnings.missingQuotes.push(lot.assetId);

    // Sans cours, on retient le prix de revient : la position compte dans le
    // patrimoine sans inventer de gain ni de perte.
    const value = !isHeld ? 0 : hasQuote ? lot.quantity * quote.price * rateNow : lot.costBasis;
    const unrealized = isHeld ? value - lot.costBasis : 0;
    const fxEffect = isHeld && hasQuote ? lot.costAtFxNow - lot.costBasis : 0;
    const priceEffect = unrealized - fxEffect;
    const dividendsTotal = dividendsByKey.get(lot.key) || 0;
    const totalPnL = unrealized + lot.realized + dividendsTotal;
    const netInvested = lot.grossInvested - lot.proceeds;
    const roiBase = netInvested > DUST ? netInvested : lot.grossInvested;
    const changePct = hasQuote && Number.isFinite(quote.changePct) ? quote.changePct : null;
    const dailyChange = changePct != null && isHeld ? value - value / (1 + changePct / 100) : 0;

    return {
      ...lot,
      isHeld,
      hasQuote,
      price: hasQuote ? quote.price : null,
      quoteCurrency: quote?.currency || null,
      value,
      avgCost: isHeld ? lot.costBasis / lot.quantity : 0,
      unrealized,
      priceEffect,
      fxEffect,
      dividends: dividendsTotal,
      totalPnL,
      netInvested,
      roi: roiBase > 0 ? (totalPnL / roiBase) * 100 : 0,
      unrealizedPct: isHeld && lot.costBasis > 0 ? (unrealized / lot.costBasis) * 100 : 0,
      changePct,
      dailyChange,
    };
  });

  const totals = aggregate(positions);
  totals.dividends += orphanDividends;
  totals.totalPnL += orphanDividends;
  totals.roi = roiOf(totals);

  const byAccount = {};
  ACCOUNT_ORDER.forEach((acc) => {
    const list = positions.filter((p) => p.account === acc);
    if (list.length || orphanByAccount[acc]) {
      const agg = aggregate(list);
      agg.dividends += orphanByAccount[acc] || 0;
      agg.totalPnL += orphanByAccount[acc] || 0;
      agg.roi = roiOf(agg);
      byAccount[acc] = agg;
    }
  });

  const byClass = {};
  Object.values(ASSET_TYPES).forEach((type) => {
    const list = positions.filter((p) => p.assetType === type);
    if (list.length) byClass[type] = aggregate(list);
  });

  const assets = groupByAsset(positions, totals.value);

  return {
    positions,
    assets,
    totals: { ...totals, byAccount, byClass },
    warnings: {
      missingQuotes: [...new Set(warnings.missingQuotes)],
      pendingPrices: warnings.pendingPrices,
      missingFx: [...new Set(warnings.missingFx)],
      oversold: warnings.oversold,
    },
  };
};

const roiOf = (t) => {
  const base = t.netInvested > DUST ? t.netInvested : t.grossInvested;
  return base > 0 ? (t.totalPnL / base) * 100 : 0;
};

const SUM_FIELDS = [
  'value', 'costBasis', 'costAtFxNow', 'unrealized', 'priceEffect', 'fxEffect',
  'realized', 'dividends', 'totalPnL', 'grossInvested', 'proceeds', 'netInvested',
  'feesPaid', 'dailyChange',
];

/** Somme des positions ; `roi` et `dailyChangePct` sont recalculés, pas sommés. */
export const aggregate = (positions) => {
  const t = Object.fromEntries(SUM_FIELDS.map((f) => [f, 0]));
  positions.forEach((p) => SUM_FIELDS.forEach((f) => { t[f] += p[f] || 0; }));
  t.roi = roiOf(t);
  const previous = t.value - t.dailyChange;
  t.dailyChangePct = previous > 0 ? (t.dailyChange / previous) * 100 : 0;
  t.unrealizedPct = t.costBasis > 0 ? (t.unrealized / t.costBasis) * 100 : 0;
  t.heldCount = positions.filter((p) => p.isHeld).length;
  return t;
};

/**
 * Regroupe les positions d'un même actif toutes enveloppes confondues, pour la
 * liste « Mes actifs ». Le détail par enveloppe reste dans `positions`.
 */
const groupByAsset = (positions, totalValue) => {
  const map = new Map();
  positions.forEach((p) => {
    if (!map.has(p.assetId)) {
      map.set(p.assetId, {
        assetId: p.assetId,
        assetType: p.assetType,
        symbol: p.symbol,
        name: p.name,
        price: p.price,
        quoteCurrency: p.quoteCurrency,
        changePct: p.changePct,
        hasQuote: p.hasQuote,
        quantity: 0,
        accounts: [],
        positions: [],
        pricePending: false,
        ...Object.fromEntries(SUM_FIELDS.map((f) => [f, 0])),
      });
    }
    const a = map.get(p.assetId);
    a.positions.push(p);
    if (p.isHeld) a.accounts.push(p.account);
    a.quantity += p.quantity;
    a.pricePending = a.pricePending || p.pricePending;
    if (!a.lastDate || p.lastDate > a.lastDate) a.lastDate = p.lastDate;
    SUM_FIELDS.forEach((f) => { a[f] += p[f] || 0; });
  });

  return [...map.values()]
    .map((a) => ({
      ...a,
      isHeld: a.quantity > DUST,
      avgCost: a.quantity > DUST ? a.costBasis / a.quantity : 0,
      roi: roiOf(a),
      unrealizedPct: a.costBasis > 0 ? (a.unrealized / a.costBasis) * 100 : 0,
      allocation: totalValue > 0 ? (a.value / totalValue) * 100 : 0,
    }))
    .sort((x, y) => y.value - x.value);
};

/**
 * Suivi du PEA.
 *
 * Le plafond de 150 000 € porte sur les VERSEMENTS, pas sur la valeur. Sans
 * relevé de versements, on les estime par le pic du capital net engagé
 * (achats − ventes) : c'est le minimum qu'il a fallu verser pour financer ces
 * achats. L'utilisateur peut saisir le vrai montant dans les réglages.
 *
 * @param {object} params
 * @param {Transaction[]} params.transactions
 * @param {{at: Function}} params.fx
 * @param {{openDate?: string, depositsOverride?: number}} [params.settings]
 * @param {Date} [params.today]
 */
export const computePeaStats = ({ transactions = [], fx, settings = {}, today = new Date() }) => {
  const pea = transactions.filter((t) => t.account === 'PEA').sort(byDateThenId);
  if (!pea.length && !settings.openDate && !(settings.depositsOverride > 0)) return null;

  let running = 0;
  let peak = 0;
  pea.forEach((tx) => {
    const qty = Math.abs(num(tx.quantity));
    const price = num(tx.unitPrice);
    if (!(price > 0)) return;
    const rate = fx.at(tx.currency, tx.date) || 0;
    const fees = Math.abs(num(tx.fees));
    if (tx.side === 'sell') running -= (qty * price - fees) * rate;
    else running += (qty * price + fees) * rate;
    peak = Math.max(peak, running);
  });

  const override = num(settings.depositsOverride);
  const deposits = override > 0 ? override : peak;
  const openDate = settings.openDate || pea[0]?.date || null;
  let maturityDate = null;
  let isMature = false;
  if (openDate) {
    const d = new Date(openDate);
    maturityDate = new Date(d.getFullYear() + PEA_MATURITY_YEARS, d.getMonth(), d.getDate());
    isMature = today >= maturityDate;
  }

  return {
    deposits,
    depositsEstimated: !(override > 0),
    ceiling: PEA_DEPOSIT_CEILING,
    remaining: Math.max(0, PEA_DEPOSIT_CEILING - deposits),
    usedPct: Math.min(100, (deposits / PEA_DEPOSIT_CEILING) * 100),
    openDate,
    maturityDate: maturityDate ? maturityDate.toISOString() : null,
    isMature,
  };
};

/**
 * Valeur du patrimoine à une série de dates, pour le graphique.
 *
 * Sans cours connu à une date (historique absent, titre radié), l'actif est
 * valorisé au prix de sa dernière opération plutôt qu'à zéro : sinon la
 * courbe plonge et la performance annuelle affiche une perte fictive.
 *
 * @param {object} params
 * @param {Transaction[]} params.transactions
 * @param {Date[]} params.dates
 * @param {(assetId: string, dateKey: string) => number|null} params.priceAt - cours (devise de cotation) à une date
 * @param {(assetId: string) => string} params.currencyOf - devise de cotation d'un actif
 * @param {{at: Function}} params.fx
 * @returns {number[]}
 */
export const computeValueSeries = ({ transactions = [], dates = [], priceAt, currencyOf, fx }) => {
  const sorted = [...transactions].sort(byDateThenId);
  return dates.map((date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const qty = {};
    const lastTrade = {};
    sorted.forEach((tx) => {
      if (new Date(tx.date) > end) return;
      const q = Math.abs(num(tx.quantity));
      qty[tx.assetId] = (qty[tx.assetId] || 0) + (tx.side === 'sell' ? -q : q);
      if (num(tx.unitPrice) > 0) lastTrade[tx.assetId] = { price: num(tx.unitPrice), currency: tx.currency };
    });
    const key = formatDateKey(end);
    let total = 0;
    Object.entries(qty).forEach(([assetId, q]) => {
      if (q <= DUST) return;
      const quoted = priceAt(assetId, key);
      const fallback = quoted > 0 ? null : lastTrade[assetId];
      const price = quoted > 0 ? quoted : fallback?.price;
      const rate = price > 0 ? fx.at(fallback ? fallback.currency : currencyOf(assetId), key) : 0;
      if (price > 0 && rate > 0) total += q * price * rate;
    });
    return total;
  });
};

/**
 * Argent net placé à chaque date : achats (frais compris) moins ventes (frais
 * déduits), au taux de change du jour de chaque opération. C'est la ligne
 * « investi » du graphique : l'écart avec la valeur est la plus-value.
 *
 * @param {object} params
 * @param {Transaction[]} params.transactions
 * @param {Date[]} params.dates
 * @param {{at: Function}} params.fx
 * @returns {number[]}
 */
export const computeInvestedSeries = ({ transactions = [], dates = [], fx }) => {
  const flows = [...transactions]
    .sort(byDateThenId)
    .map((tx) => {
      const qty = Math.abs(num(tx.quantity));
      const price = num(tx.unitPrice);
      const fees = Math.abs(num(tx.fees));
      const rate = fx.at(tx.currency, tx.date) || 0;
      const amount = tx.side === 'sell' ? -(qty * price - fees) : qty * price + fees;
      return { time: new Date(tx.date).getTime(), amount: price > 0 ? amount * rate : 0 };
    });
  return dates.map((date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const limit = end.getTime();
    return flows.reduce((sum, f) => (f.time <= limit ? sum + f.amount : sum), 0);
  });
};
