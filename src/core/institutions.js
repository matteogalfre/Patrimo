/**
 * Reconnaître une banque ou un courtier à partir de ce que l'utilisateur a
 * tapé (« SG », « Société Générale », « bourso »…), et en proposer en cours
 * de saisie (fonctions pures).
 */

import { INSTITUTIONS } from '../constants/institutions';

/** Minuscules, sans accents ni ponctuation. */
export const normalizeName = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const keysOf = (inst) => [inst.name, ...inst.aliases].map(normalizeName);

/** L'établissement correspondant exactement à un nom saisi, ou null. */
export const findInstitution = (text) => {
  const q = normalizeName(text);
  if (!q) return null;
  return INSTITUTIONS.find((i) => keysOf(i).includes(q)) || null;
};

/**
 * Suggestions pour une saisie : début de nom d'abord, puis contenu. Sans
 * saisie, les plus courants du type demandé.
 * @param {string} query
 * @param {{types?: string[], limit?: number}} [opts]
 */
export const searchInstitutions = (query, { types = null, limit = 8 } = {}) => {
  const list = types ? INSTITUTIONS.filter((i) => types.includes(i.type)) : INSTITUTIONS;
  const q = normalizeName(query);
  if (!q) return list.slice(0, limit);
  const starts = list.filter((i) => keysOf(i).some((k) => k.startsWith(q)));
  const contains = list.filter((i) => !starts.includes(i) && keysOf(i).some((k) => k.includes(q)));
  return [...starts, ...contains].slice(0, limit);
};

export const institutionLogoUrl = (inst) => (inst?.domain ? `https://www.google.com/s2/favicons?domain=${inst.domain}&sz=128` : null);

export const institutionById = (id) => INSTITUTIONS.find((i) => i.id === id) || null;
