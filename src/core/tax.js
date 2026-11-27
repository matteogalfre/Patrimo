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
  const found = fx.at(tx.currency, tx.date);
  const rate = found > 0 ? found : 0;
  return {
    qty,
    known: price > 0,
    // Sans taux de change, le montant vaut 0 : le résultat est signalé comme estimé.
    rateOk: rate > 0,
    buy: (qty * price + fees) * rate,
    sell: (qty * price - fees) * rate,
    sellGross: qty * price * rate,
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
    const lot = lots.get(tx.assetId) || { qty: 0, cost: 0, approx: false };
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
          estimated: !a.known || !a.rateOk || lot.approx,
        });
      }
      // Ligne soldée : un rachat repart sur des prix connus.
      if (lot.qty <= 1e-12) {
        lot.qty = 0;
        lot.cost = 0;
        lot.approx = false;
      }
    } else {
      lot.qty += a.qty;
      lot.cost += a.buy;
      if (!a.known || !a.rateOk) lot.approx = true;
    }
    lots.set(tx.assetId, lot);
  });

  const gains = sales.reduce((s, x) => s + Math.max(0, x.gain), 0);
  const losses = sales.reduce((s, x) => s + Math.min(0, x.gain), 0);
  const ctoDividends = dividends.filter((d) => d.account === ACCOUNTS.CTO && yearOf(d.date) === year);
  return {
    sales,
    proceeds: sales.reduce((s, x) => s + x.proceeds, 0),
    cost: sales.reduce((s, x) => s + x.cost, 0),
    gains,
    losses,
    net: gains + losses,
    dividends: ctoDividends.reduce((s, d) => s + d.amount * (fx.at(d.currency, d.date) || 0), 0),
    dividendsEstimated: ctoDividends.some((d) => !(fx.at(d.currency, d.date) > 0)),
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
    const share = qty / a.qty;
    let approximate = !a.known || !a.rateOk;

    // Cours unitaire de l'actif vendu, frais non déduits : celui de la vente,
    // sinon la clôture du jour.
    let unit = a.known && a.rateOk ? a.sellGross / a.qty : 0;
    if (!(unit > 0)) {
      const p = priceAt(tx.assetId, tx.date);
      const r = p ? fx.at(p.currency, tx.date) : 0;
      unit = p?.price > 0 && r > 0 ? p.price * r : 0;
    }
    // Formulaire 2086 : la plus-value prend le prix net de frais (ligne 217),
    // la fraction d'acquisition le prix brut (ligne 216).
    const gross = a.known && a.rateOk ? a.sellGross * share : unit * qty;
    const fees = a.known && a.rateOk ? (a.sellGross - a.sell) * share : 0;
    const proceeds = Math.max(0, gross - fees);

    // Valeur de tout le portefeuille juste avant la cession, au cours du marché.
    let value = 0;
    holdings.forEach((q, assetId) => {
      if (q <= 1e-12) return;
      if (assetId === tx.assetId) {
        if (unit > 0) value += q * unit;
        else approximate = true;
        return;
      }
      const p = priceAt(assetId, tx.date);
      const r = p ? fx.at(p.currency, tx.date) : 0;
      if (p?.price > 0 && r > 0) value += q * p.price * r;
      else approximate = true;
    });
    value = Math.max(value, gross);

    const fraction = value > 0 ? (pta * gross) / value : 0;
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
