/**
 * Investissements programmés (fonctions pures) : un montant fixe sur un actif,
 * chaque mois à un jour donné. L'app ne passe aucun ordre : elle rappelle et
 * pré-remplit l'opération, l'utilisateur la valide.
 */

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Plans dont l'échéance du mois est passée et pas encore traitée. */
export const duePlans = (plans = [], today = new Date()) => {
  const key = monthKey(today);
  return plans.filter((p) => p.active && today.getDate() >= p.day && !(p.handled || []).includes(key));
};

/**
 * Quantité à saisir pour un montant donné. Les titres s'achètent souvent par
 * unité entière : on arrondit à l'unité inférieure dès qu'on dépasse 1.
 */
export const quantityForAmount = ({ amount, price, assetType }) => {
  if (!(amount > 0) || !(price > 0)) return null;
  const raw = amount / price;
  if (assetType === 'crypto') return Math.floor(raw * 1e8) / 1e8;
  return raw >= 1 ? Math.floor(raw) : Math.floor(raw * 1e4) / 1e4;
};

/** Marque le mois comme traité (fait ou ignoré), en gardant un an d'historique. */
export const markHandled = (plan, today = new Date()) => {
  const key = monthKey(today);
  const handled = [...new Set([...(plan.handled || []), key])].sort().slice(-12);
  return { ...plan, handled };
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const FUND = /\b(etf|ucits|msci|s ?p 500|nasdaq|stoxx|index|indice)\b/;

/**
 * Les lignes d'investissement du budget pas encore programmées, avec l'actif
 * qu'elles désignent probablement : un titre détenu dont le symbole ou le nom
 * apparaît dans la ligne (« BTC », « Bitcoin »), ou, pour une ligne « ETF »,
 * l'ETF le plus acheté des 12 derniers mois.
 * @returns {Array<{id: string, label: string, amount: number, asset: object|null}>}
 */
export const budgetPlanSuggestions = ({ budget, plans = [], assets = [], transactions = [], today = new Date() }) => {
  const lines = (budget?.groups || [])
    .filter((g) => g.kind === 'invest')
    .flatMap((g) => g.items)
    .filter((it) => Number(it.amount) > 0);
  if (!lines.length) return [];
  const held = assets.filter((a) => a.isHeld);
  const since = today.getTime() - 365 * 24 * 60 * 60 * 1000;
  const bought = new Map();
  transactions
    .filter((tx) => tx.side !== 'sell' && new Date(tx.date).getTime() >= since)
    .forEach((tx) => bought.set(tx.assetId, (bought.get(tx.assetId) || 0) + (Number(tx.quantity) || 0) * (Number(tx.unitPrice) || 0)));
  const isFund = (a) => a.assetType === 'etf' || FUND.test(norm(a.name));
  const topFund = held.filter(isFund).sort((a, b) => (bought.get(b.assetId) || 0) - (bought.get(a.assetId) || 0))[0] || null;

  const guess = (label) => {
    const text = ` ${norm(label)} `;
    const direct = held.find((a) => {
      const symbol = norm(String(a.symbol || '').split('.')[0]);
      const name = norm(a.name);
      return (symbol.length >= 2 && text.includes(` ${symbol} `)) || (name.length >= 3 && (text.includes(` ${name} `) || ` ${name} `.includes(text)));
    });
    if (direct) return direct;
    return FUND.test(norm(label)) ? topFund : null;
  };

  const programmed = new Set(plans.filter((p) => p.active !== false).map((p) => p.assetId));
  return lines
    .map((it) => ({ id: it.id, label: it.label, amount: Number(it.amount), asset: guess(it.label) }))
    .filter((s) => !s.asset || !programmed.has(s.asset.assetId));
};
