/**
 * Aide à la déclaration fiscale française (fonctions pures).
 *
 *  - Compte-titres (formulaire 2074) : plus-value de cession = prix de cession
 *    net de frais − prix moyen pondéré d'acquisition (frais d'achat compris).
 *    Chaque montant en devise est converti au taux du jour de l'opération.
 *  - Crypto (formulaire 2086, art. 150 VH bis du CGI) : pour chaque cession
 *    contre de la monnaie,
 *      plus-value = C − PTA × C / V
 *    où C est le prix de cession, V la valeur globale du portefeuille crypto
 *    juste avant la cession et PTA le prix total d'acquisition, diminué à
 *    chaque cession de la fraction PTA × C / V déjà imputée. Les cessions
 *    d'un foyer qui ne dépassent pas 305 € sur l'année sont exonérées.
 *
 * Limites, affichées à l'écran : les ventes crypto enregistrées sont
 * supposées être des ventes contre euros (un échange crypto contre crypto
 * n'est pas imposable), et la valeur du portefeuille est estimée avec les
 * cours de clôture du jour.
 */

import { ACCOUNTS } from './assets';

export const CRYPTO_EXEMPTION_THRESHOLD = 305;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sorted = (transactions) => [...transactions].sort((a, b) => {
  const d = new Date(a.date) - new Date(b.date);
  return d !== 0 ? d : String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
});

const yearOf = (date) => new Date(date).getFullYear();

/** Montant d'une opération dans la devise de référence, frais compris (achat) ou déduits (vente). */
const amounts = (tx, fx) => {
  const qty = Math.abs(num(tx.quantity));
  const price = num(tx.unitPrice);
  const fees = Math.abs(num(tx.fees));
  const rate = fx.at(tx.currency, tx.date) || 0;
  return {
    qty,
    known: price > 0,
    buy: (qty * price + fees) * rate,
    sell: (qty * price - fees) * rate,
  };
};

/**
 * Cessions du compte-titres d'une année.
 * @returns {{sales: object[], proceeds: number, cost: number, gains: number, losses: number, net: number, dividends: number}}
 */
export const computeCtoTax = ({ transactions = [], dividends = [], fx, year }) => {
  const lots = new Map();
  const sales = [];
  // Les années suivantes ne changent rien à celle-ci.
  sorted(transactions.filter((t) => t.account === ACCOUNTS.CTO && yearOf(t.date) <= year)).forEach((tx) => {
    const lot = lots.get(tx.assetId) || { qty: 0, cost: 0 };
    const a = amounts(tx, fx);
    if (tx.side === 'sell') {
      const qty = Math.min(a.qty, lot.qty);
      if (qty <= 0) return;
      const share = qty / a.qty;
      const cost = (lot.cost / lot.qty) * qty;
      const proceeds = a.sell * share;
      lot.qty -= qty;
      lot.cost -= cost;
      if (yearOf(tx.date) === year) {
        sales.push({
          id: tx.id,
          date: tx.date,
          assetId: tx.assetId,
          symbol: tx.symbol,
          name: tx.name,
          quantity: qty,
          proceeds,
          cost,
          gain: proceeds - cost,
          estimated: !a.known,
        });
      }
    } else {
      lot.qty += a.qty;
      lot.cost += a.buy;
    }
    lots.set(tx.assetId, lot);
  });

  const gains = sales.reduce((s, x) => s + Math.max(0, x.gain), 0);
  const losses = sales.reduce((s, x) => s + Math.min(0, x.gain), 0);
  return {
    sales,
    proceeds: sales.reduce((s, x) => s + x.proceeds, 0),
    cost: sales.reduce((s, x) => s + x.cost, 0),
    gains,
    losses,
    net: gains + losses,
    dividends: dividends
      .filter((d) => d.account === ACCOUNTS.CTO && yearOf(d.date) === year)
      .reduce((s, d) => s + d.amount * (fx.at(d.currency, d.date) || 0), 0),
  };
};

/**
 * Cessions de cryptos d'une année, formule du 2086.
 * @param {object} params
 * @param {(assetId: string, date: string) => {price: number, currency: string}|null} params.priceAt
 *   cours d'une crypto à une date (pour la valeur globale du portefeuille)
 */
export const computeCryptoTax = ({ transactions = [], fx, priceAt, year }) => {
  const holdings = new Map();
  let pta = 0;
  const sales = [];

  sorted(transactions.filter((t) => t.account === ACCOUNTS.CRYPTO && yearOf(t.date) <= year)).forEach((tx) => {
    const a = amounts(tx, fx);
    if (tx.side !== 'sell') {
      pta += a.buy;
      holdings.set(tx.assetId, (holdings.get(tx.assetId) || 0) + a.qty);
      return;
    }

    const held = holdings.get(tx.assetId) || 0;
    const qty = Math.min(a.qty, held);
    if (qty <= 0) return;
    const proceeds = a.sell * (qty / a.qty);

    // Valeur de tout le portefeuille juste avant la cession. L'actif vendu est
    // valorisé au prix de la vente ; les autres au cours de clôture du jour.
    let approximate = !a.known;
    let value = 0;
    holdings.forEach((q, assetId) => {
      if (q <= 1e-12) return;
      if (assetId === tx.assetId) {
        value += (q * a.sell) / a.qty;
        return;
      }
      const p = priceAt(assetId, tx.date);
      if (p?.price > 0) value += q * p.price * (fx.at(p.currency, tx.date) || 0);
      else approximate = true;
    });
    value = Math.max(value, proceeds);

    const fraction = value > 0 ? (pta * proceeds) / value : 0;
    pta = Math.max(0, pta - fraction);
    holdings.set(tx.assetId, held - qty);

    if (yearOf(tx.date) === year) {
      sales.push({
        id: tx.id,
        date: tx.date,
        assetId: tx.assetId,
        symbol: tx.symbol,
        name: tx.name,
        quantity: qty,
        proceeds,
        portfolioValue: value,
        acquisitionShare: fraction,
        gain: proceeds - fraction,
        approximate,
      });
    }
  });

  const proceedsTotal = sales.reduce((s, x) => s + x.proceeds, 0);
  return {
    sales,
    proceeds: proceedsTotal,
    net: sales.reduce((s, x) => s + x.gain, 0),
    exempt: sales.length > 0 && proceedsTotal <= CRYPTO_EXEMPTION_THRESHOLD,
    remainingAcquisition: pta,
  };
};

/** Années où il s'est passé quelque chose de déclarable, plus récente en premier. */
export const taxYears = ({ transactions = [], dividends = [] }) => {
  const years = new Set();
  transactions.forEach((t) => {
    if (t.side === 'sell' && (t.account === ACCOUNTS.CTO || t.account === ACCOUNTS.CRYPTO)) years.add(yearOf(t.date));
  });
  dividends.forEach((d) => {
    if (d.account === ACCOUNTS.CTO) years.add(yearOf(d.date));
  });
  return [...years].sort((a, b) => b - a);
};
