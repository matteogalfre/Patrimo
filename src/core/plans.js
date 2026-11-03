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
