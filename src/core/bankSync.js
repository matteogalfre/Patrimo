/**
 * Connexion bancaire : ce qu'on tire des réponses GoCardless (solde, type et
 * nom du compte) et quand on a le droit de relire (fonctions pures).
 *
 * Une banque reliée (« lien ») garde ses comptes et, pour chacun, le compte
 * de liquidités Patrimo qu'il alimente. On ne garde jamais l'IBAN : seulement
 * une empreinte, pour retrouver le même compte quand on renouvelle l'accord.
 */

import { INSTITUTIONS } from '../constants/institutions';
import { normalizeName } from './institutions';

/** GoCardless autorise environ 4 lectures par jour et par compte : une toutes les 6 h. */
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Relecture automatique à l'ouverture de l'app, au plus toutes les 12 h. */
export const AUTO_SYNC_MS = 12 * 60 * 60 * 1000;

/** On prévient deux semaines avant la fin de l'accord. */
export const EXPIRY_WARNING_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

// Du plus parlant au moins parlant. `interimAvailable` peut inclure le
// découvert autorisé : on le prend seulement s'il n'y a rien d'autre.
const BALANCE_ORDER = ['interimBooked', 'expected', 'closingBooked', 'interimAvailable', 'openingBooked', 'forwardAvailable', 'nonInvoiced'];

/**
 * Le solde à retenir parmi ceux que renvoie la banque.
 * @param {Array} balances - `balances` de /accounts/{id}/balances/
 * @returns {{amount: number, currency: string, type: string, date: string|null}|null}
 */
export const pickBalance = (balances) => {
  const list = (Array.isArray(balances) ? balances : [])
    .map((b) => ({
      amount: Number(b?.balanceAmount?.amount),
      currency: String(b?.balanceAmount?.currency || '').toUpperCase(),
      type: String(b?.balanceType || ''),
      date: b?.referenceDate || b?.lastChangeDateTime || null,
      withCredit: b?.creditLimitIncluded === true,
    }))
    .filter((b) => Number.isFinite(b.amount) && b.currency);
  if (!list.length) return null;
  const rank = (b) => {
    const i = BALANCE_ORDER.indexOf(b.type);
    return (b.withCredit ? 100 : 0) + (i < 0 ? 50 : i);
  };
  const best = [...list].sort((a, b) => rank(a) - rank(b))[0];
  return { amount: Math.round(best.amount * 100) / 100, currency: best.currency, type: best.type, date: best.date };
};

// Mots qui trahissent un produit réglementé, dans le nom du compte.
const KIND_PATTERNS = [
  ['livretJeune', /\blivret jeune\b/],
  ['livretA', /\blivret a\b|\blivret bleu\b/],
  ['ldds', /\bldds?\b|developpement durable/],
  ['lep', /\blep\b|epargne populaire/],
  ['pel', /\bpel\b|plan (d )?epargne logement/],
  ['cel', /\bcel\b|compte (d )?epargne logement/],
  ['lifeInsurance', /assurance vie/],
  ['term', /compte a terme|\bcat\b|depot a terme/],
  ['pee', /\bpee\b|plan (d )?epargne (d )?entreprise/],
  ['percol', /\bperco(l)?\b/],
  ['current', /compte courant|compte cheques?|\bcheques?\b|current account|girokonto|\bcompte (de )?depot\b/],
];

/**
 * Le type de compte Patrimo d'après le détail renvoyé par la banque : nom
 * du produit d'abord, code ISO 20022 (`cashAccountType`) ensuite.
 * @param {object} account - `account` de /accounts/{id}/details/
 */
export const kindFromAccount = (account = {}) => {
  const text = normalizeName([account.product, account.name, account.details].filter(Boolean).join(' '));
  const hit = KIND_PATTERNS.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  const type = String(account.cashAccountType || '').toUpperCase();
  if (type === 'CACC' || type === 'TRAN' || type === 'CASH') return 'current';
  return 'other';
};

/**
 * Carte à débit différé : la banque la montre comme un compte, mais son
 * « solde » est l'en-cours du mois, déjà dépensé et bientôt prélevé sur le
 * compte courant. Ignorée par défaut pour ne pas fausser les liquidités.
 */
export const isCardAccount = (account = {}) => String(account.cashAccountType || '').toUpperCase() === 'CARD'
  || /\b(cb|carte|card|visa|mastercard|amex)\b/.test(normalizeName([account.product, account.name, account.details].filter(Boolean).join(' ')));

/** Un nom lisible : celui du produit, sinon le type et la banque. */
export const accountName = (account = {}, { institutionName = '', kindLabel = '' } = {}) => {
  const raw = [account.name, account.product, account.details, account.displayName]
    .map((s) => String(s || '').trim())
    .find((s) => s && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,}$/.test(s)); // jamais un IBAN en guise de nom
  if (raw) return raw.length > 40 ? `${raw.slice(0, 39)}…` : raw;
  return [kindLabel, institutionName].filter(Boolean).join(' · ');
};

/** « Compte courant », puis « Compte courant 2 »… si le nom est déjà pris. */
export const uniqueName = (name, taken = []) => {
  const used = new Set(taken.map((s) => normalizeName(s)));
  if (!used.has(normalizeName(name))) return name;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${name} ${i}`;
    if (!used.has(normalizeName(candidate))) return candidate;
  }
  return name;
};

const containsWords = (text, key) => key && ` ${text} `.includes(` ${key} `);

/**
 * L'établissement Patrimo qui correspond au nom GoCardless (« Crédit
 * Agricole Alpes Provence » → Crédit Agricole). Le nom le plus long gagne.
 */
export const matchInstitution = (name) => {
  const text = normalizeName(name);
  if (!text) return null;
  let best = null;
  let bestLength = 0;
  INSTITUTIONS.forEach((inst) => {
    [inst.name, ...(inst.aliases || [])].map(normalizeName).forEach((key) => {
      // Les sigles de deux lettres (« ca », « ce »…) sont trop ambigus dans un nom long.
      if (key.length < 3 && text !== key) return;
      if (containsWords(text, key) && key.length > bestLength) {
        best = inst.id;
        bestLength = key.length;
      }
    });
  });
  return best;
};

/** État de l'accord : valide, bientôt fini, expiré (ou pas encore finalisé). */
export const linkStatus = (link, now = Date.now()) => {
  if (!link) return 'expired';
  if (link.status === 'pending') return 'pending';
  if (link.status === 'expired') return 'expired';
  const until = link.validUntil ? new Date(link.validUntil).getTime() : null;
  if (until && until <= now) return 'expired';
  if (until && until - now <= EXPIRY_WARNING_DAYS * DAY) return 'expiring';
  return 'ok';
};

/** Fin de l'accord, à partir du jour où la banque l'a donné. */
export const validUntil = (from, days) => new Date(new Date(from).getTime() + days * DAY).toISOString();

/** Quand ce compte pourra être relu (0 : tout de suite). */
export const nextSyncAt = (account) => {
  const last = account?.lastSync ? new Date(account.lastSync).getTime() : 0;
  const blocked = account?.blockedUntil ? new Date(account.blockedUntil).getTime() : 0;
  return Math.max(last ? last + SYNC_INTERVAL_MS : 0, blocked);
};

/** Les comptes à relire maintenant. Même forcé, on ne dépasse pas le quota. */
export const dueAccounts = (link, now = Date.now()) => {
  if (!['ok', 'expiring'].includes(linkStatus(link, now))) return [];
  return (link.accounts || []).filter((a) => a.cashId && nextSyncAt(a) <= now);
};

/** Faut-il relire en tâche de fond (dernière lecture il y a plus de 12 h) ? */
export const needsAutoSync = (links = [], now = Date.now()) => links.some((link) => dueAccounts(link, now)
  .some((a) => !a.lastSync || now - new Date(a.lastSync).getTime() >= AUTO_SYNC_MS));

/**
 * Compte Patrimo à proposer pour un compte bancaire : même banque, même type,
 * même devise, pas déjà relié. Null : on en crée un nouveau.
 */
export const suggestTarget = (bankAccount, cashAccounts = [], usedIds = []) => {
  const used = new Set(usedIds);
  const candidates = cashAccounts.filter((c) => !used.has(c.id)
    && c.currency === bankAccount.currency
    && c.kind === bankAccount.kind
    && (!bankAccount.institution || c.institution === bankAccount.institution));
  return candidates.length === 1 ? candidates[0].id : null;
};

/** Ids des comptes Patrimo déjà alimentés par une banque. */
export const linkedCashIds = (links = []) => links.flatMap((l) => (l.accounts || []).map((a) => a.cashId).filter(Boolean));
