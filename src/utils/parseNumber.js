/**
 * Lecture d'un nombre saisi au clavier, quelle que soit la langue.
 *
 * « 1 234,56 », « 1,234.56 », « 1.234,56 » et « 1234.56 » donnent tous
 * 1234.56. Une seule virgule ou un seul point reste ambigu (« 1,500 ») : on
 * suit alors la langue de l'app, où le séparateur de milliers est connu.
 */

import { getDisplayLocale } from './formatters';

const SPACES = /[\s  ']/g;

/** Séparateur de milliers de la langue : ',' en anglais, '.' en allemand, etc. */
const groupSeparator = (locale) => {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(12345.6).find((p) => p.type === 'group');
    return part ? part.value : null;
  } catch {
    return null;
  }
};

/**
 * Remet une saisie au format compris par Number() : point décimal, sans espaces
 * ni séparateur de milliers. Ne valide rien.
 * @param {string|number|null|undefined} input
 * @param {string} [locale] - BCP-47 ; par défaut la langue de l'app
 * @returns {string}
 */
export const normalizeNumber = (input, locale = getDisplayLocale()) => {
  let s = String(input ?? '').replace(SPACES, '').trim();
  if (!s) return '';
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Les deux : le dernier est la décimale, l'autre groupe les milliers.
    const decimal = lastComma > lastDot ? ',' : '.';
    const group = decimal === ',' ? '.' : ',';
    return s.split(group).join('').replace(decimal, '.');
  }

  const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null;
  if (!sep) return s;
  const parts = s.split(sep);
  // Plusieurs fois le même signe : des milliers (« 1.000.000 », « 1,000,000 »).
  if (parts.length > 2) return parts.every((p, i) => i === 0 || p.length === 3) ? parts.join('') : s;
  // Une seule fois : des milliers seulement si la langue l'écrit ainsi et que
  // trois chiffres suivent (« 1,500 » en anglais), jamais après un zéro (« 0,500 »).
  const [int, frac] = parts;
  const isGroup = groupSeparator(locale) === sep && frac.length === 3 && /^-?\d+$/.test(int) && !/^-?0$/.test(int);
  if (isGroup) return int + frac;
  return sep === ',' ? s.replace(',', '.') : s;
};

/**
 * @returns {number|null} null pour une saisie vide, NaN pour une saisie invalide
 */
export const parseNumber = (input, locale) => {
  const s = normalizeNumber(input, locale);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
