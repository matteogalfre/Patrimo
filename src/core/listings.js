/**
 * Recherche par ISIN (fonctions pures) : un ISIN désigne un titre, coté sur
 * plusieurs places. OpenFIGI les liste avec un code de place Bloomberg, qu'on
 * traduit en suffixe Yahoo pour proposer, par exemple, la cotation en euros à
 * Amsterdam d'un ETF que Yahoo ne renvoie qu'à Londres.
 */

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Vrai pour un ISIN bien formé, clé de contrôle comprise. */
export const isIsin = (value) => {
  const s = String(value || '').trim().toUpperCase();
  if (!ISIN_RE.test(s)) return false;
  // Lettres → nombres (A = 10), puis clé de Luhn sur la chaîne de chiffres.
  const digits = s.slice(0, -1).split('').map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(s[s.length - 1]);
};

/** Places retenues : code Bloomberg → suffixe et nom affiché comme chez Yahoo. */
export const EXCHANGES = Object.freeze({
  FP: { suffix: '.PA', label: 'Paris' },
  NA: { suffix: '.AS', label: 'Amsterdam' },
  BB: { suffix: '.BR', label: 'Brussels' },
  GY: { suffix: '.DE', label: 'XETRA' },
  IM: { suffix: '.MI', label: 'Milan' },
  SM: { suffix: '.MC', label: 'Madrid' },
  SW: { suffix: '.SW', label: 'Swiss' },
  SE: { suffix: '.SW', label: 'Swiss' },
  LN: { suffix: '.L', label: 'LSE' },
  US: { suffix: '', label: 'US' },
});

const quoteTypeOf = (row) => {
  const types = `${row.securityType || ''} ${row.securityType2 || ''}`.toUpperCase();
  if (types.includes('ETP') || types.includes('ETF')) return 'ETF';
  if (types.includes('FUND')) return 'MUTUALFUND';
  return 'EQUITY';
};

/**
 * Cotations Yahoo possibles à partir d'une réponse OpenFIGI. Pour un titre
 * non américain, la cotation US est un marché de gré à gré peu liquide : on
 * l'écarte.
 * @param {Array<object>} rows - `data` d'une tâche de /v3/mapping
 * @param {string} [isin]
 * @returns {Array<{symbol: string, name: string, exchange: string, quoteType: string}>}
 */
export const listingsFromFigi = (rows = [], isin = '') => {
  const american = /^(US|CA)/.test(String(isin).toUpperCase());
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    const place = EXCHANGES[row.exchCode];
    const ticker = String(row.ticker || '').trim().toUpperCase().replace(/\//g, '-');
    if (!place || !ticker || /\s/.test(ticker) || row.marketSector !== 'Equity') return;
    if (row.exchCode === 'US' && isin && !american) return;
    const symbol = `${ticker}${place.suffix}`;
    if (seen.has(symbol)) return;
    seen.add(symbol);
    out.push({ symbol, name: row.name || ticker, exchange: place.label, quoteType: quoteTypeOf(row) });
  });
  return out;
};
