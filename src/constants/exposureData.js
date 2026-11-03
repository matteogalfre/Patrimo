/**
 * Données d'exposition (pays et secteurs), intégrées à l'app.
 *
 * Indices : répartitions publiées par iShares (BlackRock) sur les fiches de
 * leurs ETF, au 30 octobre 2026, liquidités exclues. Un ETF qui suit le même
 * indice, quel que soit l'émetteur, a la même exposition à peu de chose près.
 * Le S&P 500 et le Nasdaq-100 sont comptés à 100 % États-Unis, le MSCI France
 * (proche du CAC 40) à 100 % France. À rafraîchir de temps en temps.
 *
 * Actions : secteur selon la classification GICS, pour les valeurs les plus
 * courantes ; le pays vient de la place de cotation. Tout se corrige sur la
 * fiche de l'actif.
 */

export const EXPOSURE_AS_OF = '2026-10-30';

export const INDEX_PROFILES = {
  world: {
    countries: { US: 72.44, JP: 5.7, GB: 3.49, CA: 3.42, CH: 2.31, FR: 2.22, DE: 2.1, AU: 1.58, NL: 1.32, OTHER: 4.96 },
    sectors: { tech: 29.67, financials: 16.1, industrials: 10.72, health: 10.13, discretionary: 8.68, communication: 7.15, staples: 5.35, energy: 4.57, materials: 3.13, utilities: 2.46, realEstate: 1.57 },
  },
  acwi: {
    countries: { US: 64.37, JP: 5.08, TW: 3.21, GB: 3.08, CA: 3.05, DE: 2.33, KR: 2.21, CH: 2.06, IE: 2.04, FR: 1.96, CN: 1.86, AU: 1.41, NL: 1.16, OTHER: 5.84 },
    sectors: { tech: 30.84, financials: 18.26, industrials: 10.01, health: 9.16, discretionary: 8.35, communication: 6.89, staples: 4.95, energy: 4.22, materials: 3.21, utilities: 2.27, realEstate: 1.48 },
  },
  sp500: {
    countries: { US: 100 },
    sectors: { tech: 37.4, financials: 12.17, health: 10.24, discretionary: 9.02, communication: 8.41, industrials: 8.14, staples: 4.99, energy: 3.9, utilities: 2.09, realEstate: 1.8, materials: 1.73 },
  },
  ndx: {
    countries: { US: 100 },
    sectors: { tech: 57.33, communication: 13.5, discretionary: 11.02, staples: 6.78, health: 4.81, industrials: 3.53, utilities: 1.18, materials: 1.06, energy: 0.51, financials: 0.22 },
  },
  em: {
    countries: { TW: 28.73, KR: 19.56, CN: 16.58, IN: 11.62, IE: 3.29, ZA: 3.04, SA: 2.37, BR: 2.02, DE: 1.89, MX: 1.77, AE: 1.27, PL: 1.23, OTHER: 6.08 },
    sectors: { tech: 40.75, financials: 24.03, discretionary: 7.44, communication: 5.92, industrials: 5.39, materials: 5.1, energy: 3.16, health: 2.6, staples: 2.46, utilities: 1.57, realEstate: 1.01 },
  },
  europe: {
    countries: { GB: 22.81, CH: 15.2, FR: 14.42, DE: 13.64, NL: 8.52, ES: 5.8, SE: 5.46, IT: 4.79, DK: 2.61, BE: 1.79, FI: 1.69, NO: 1.08, OTHER: 1.53 },
    sectors: { financials: 23.79, industrials: 17.73, health: 14.11, staples: 9.02, tech: 8.91, discretionary: 5.96, energy: 5.93, materials: 5.26, utilities: 4.94, communication: 3.15, realEstate: 0.53 },
  },
  france: {
    countries: { FR: 100 },
    sectors: { industrials: 29.72, financials: 12.48, discretionary: 10.68, health: 9.54, staples: 9.34, energy: 9.26, materials: 7.57, tech: 3.51, utilities: 3.43, communication: 2.78, realEstate: 1.28 },
  },
  es50: {
    countries: { FR: 31.89, DE: 29.68, NL: 13.86, ES: 10.69, IT: 8.47, BE: 2.85, FI: 2.17 },
    sectors: { financials: 26.23, industrials: 19.31, tech: 17.06, discretionary: 8.39, utilities: 5.83, staples: 5.7, energy: 5.69, health: 5.63, materials: 3.71, communication: 2.06 },
  },
};

/** Ordre d'affichage des indices dans le choix manuel. */
export const INDEX_KEYS = Object.keys(INDEX_PROFILES);

export const SECTORS = ['tech', 'financials', 'industrials', 'health', 'discretionary', 'communication', 'staples', 'energy', 'materials', 'utilities', 'realEstate'];

/** Pays proposés pour une action (les autres comptent dans « Autres »). */
export const COUNTRIES = ['FR', 'US', 'DE', 'NL', 'GB', 'CH', 'IT', 'ES', 'BE', 'SE', 'DK', 'FI', 'NO', 'IE', 'JP', 'CA', 'AU', 'CN', 'TW', 'KR', 'IN', 'BR', 'MX', 'ZA', 'SA', 'AE', 'PL', 'PT'];

/** Suffixe de cotation Yahoo → pays. Sans suffixe : marché américain. */
export const EXCHANGE_COUNTRY = {
  PA: 'FR', DE: 'DE', F: 'DE', AS: 'NL', BR: 'BE', MI: 'IT', MC: 'ES', L: 'GB', SW: 'CH', LS: 'PT',
  HE: 'FI', ST: 'SE', CO: 'DK', OL: 'NO', IR: 'IE', TO: 'CA', T: 'JP', HK: 'CN', AX: 'AU',
};

/** ETF courants → indice suivi (sinon, on devine d'après le nom). */
export const ETF_INDEX = {
  'CW8.PA': 'world', 'WPEA.PA': 'world', 'DCAM.PA': 'world', 'EWLD.PA': 'world', 'MWRD.PA': 'world', 'WLD.PA': 'world',
  'IWDA.AS': 'world', 'SWDA.L': 'world', 'EUNL.DE': 'world', 'XDWD.DE': 'world',
  'ESE.PA': 'sp500', 'PE500.PA': 'sp500', 'PSP5.PA': 'sp500', '500.PA': 'sp500', 'CSPX.L': 'sp500', 'CSPX.AS': 'sp500', 'SXR8.DE': 'sp500', 'VUSA.AS': 'sp500',
  'PUST.PA': 'ndx', 'PANX.PA': 'ndx', 'UST.PA': 'ndx', 'CNDX.L': 'ndx', 'CNDX.AS': 'ndx', 'SXRV.DE': 'ndx',
  'PAEEM.PA': 'em', 'AEEM.PA': 'em', 'EIMI.L': 'em', 'IEMA.L': 'em', 'IS3N.DE': 'em',
  'PCEU.PA': 'europe', 'MEUD.PA': 'europe', 'IMEU.AS': 'europe', 'SMEA.L': 'europe',
  'CAC.PA': 'france', 'C40.PA': 'france',
  'C50.PA': 'es50', 'MSE.PA': 'es50', 'SXRT.DE': 'es50', 'CSX5.AS': 'es50',
  'SSAC.L': 'acwi', 'IUSQ.DE': 'acwi',
};

/** Indice deviné d'après le nom de l'ETF, dans cet ordre. */
export const INDEX_PATTERNS = [
  ['ndx', /nasdaq/i],
  ['acwi', /acwi|all.country|all.world/i],
  ['em', /emerg|émerg|\bEM\b/i],
  ['sp500', /s&p.?500|msci usa\b/i],
  ['es50', /euro.?stoxx.?50|eurozone 50/i],
  ['france', /cac.?40|msci france/i],
  ['europe', /stoxx.?(europe.?)?600|msci europe|\beurope\b/i],
  ['world', /world|monde/i],
];

/** Secteur GICS des actions les plus courantes (CAC 40, grandes valeurs). */
export const STOCK_SECTORS = {
  'AC.PA': 'discretionary', 'AI.PA': 'materials', 'AIR.PA': 'industrials', 'CS.PA': 'financials', 'BNP.PA': 'financials',
  'EN.PA': 'industrials', 'BVI.PA': 'industrials', 'CAP.PA': 'tech', 'CA.PA': 'staples', 'ACA.PA': 'financials',
  'BN.PA': 'staples', 'DSY.PA': 'tech', 'EDEN.PA': 'financials', 'ENGI.PA': 'utilities', 'EL.PA': 'health',
  'ERF.PA': 'health', 'RMS.PA': 'discretionary', 'KER.PA': 'discretionary', 'OR.PA': 'staples', 'LR.PA': 'industrials',
  'MC.PA': 'discretionary', 'ML.PA': 'discretionary', 'ORA.PA': 'communication', 'RI.PA': 'staples', 'PUB.PA': 'communication',
  'RNO.PA': 'discretionary', 'SAF.PA': 'industrials', 'SGO.PA': 'industrials', 'SAN.PA': 'health', 'SU.PA': 'industrials',
  'GLE.PA': 'financials', 'STLAP.PA': 'discretionary', 'STMPA.PA': 'tech', 'TEP.PA': 'industrials', 'HO.PA': 'industrials',
  'TTE.PA': 'energy', 'URW.PA': 'realEstate', 'VIE.PA': 'utilities', 'DG.PA': 'industrials', 'VIV.PA': 'communication',
  'ALVMG.PA': 'health',
  AAPL: 'tech', MSFT: 'tech', NVDA: 'tech', AVGO: 'tech', AMD: 'tech', INTC: 'tech', ORCL: 'tech', ADBE: 'tech', CRM: 'tech',
  AMZN: 'discretionary', TSLA: 'discretionary', NKE: 'discretionary', MCD: 'discretionary',
  GOOGL: 'communication', GOOG: 'communication', META: 'communication', NFLX: 'communication', DIS: 'communication',
  'BRK-B': 'financials', JPM: 'financials', V: 'financials', MA: 'financials',
  JNJ: 'health', LLY: 'health', UNH: 'health', XOM: 'energy', PG: 'staples', KO: 'staples', PEP: 'staples', COST: 'staples', WMT: 'staples',
  'ASML.AS': 'tech', 'SAP.DE': 'tech', 'NOVO-B.CO': 'health', 'NESN.SW': 'staples',
};

/**
 * Historique long des indices, pour le rendement moyen sur 20 ou 30 ans
 * (cours hebdomadaires Yahoo). `total` : dividendes réinvestis ; sinon,
 * évolution du cours seul. Les émergents passent par l'ETF EEM (depuis 2003),
 * faute d'indice disponible sur longue période.
 */
export const INDEX_HISTORY = {
  sp500: { symbol: '^SP500TR', total: true, currency: 'USD' },
  ndx: { symbol: '^NDX', total: false, currency: 'USD' },
  world: { symbol: '^990100-USD-STRD', total: false, currency: 'USD' },
  em: { symbol: 'EEM', total: false, currency: 'USD' },
  europe: { symbol: '^STOXX', total: false, currency: 'EUR' },
  france: { symbol: '^FCHI', total: false, currency: 'EUR' },
  es50: { symbol: '^STOXX50E', total: false, currency: 'EUR' },
};
