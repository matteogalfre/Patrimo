/**
 * Repères de frais : les ETF les plus connus de chaque grand indice, et le
 * coût moyen d'un fonds actif. Sert à situer le TER de ses propres ETF.
 *
 * TER et éligibilité au PEA : fiches justETF, relevées le 4 novembre 2026
 * (TER des fonds iShares recoupés avec ishares.com). `alt` : autres
 * cotations du même fonds.
 */

export const BENCHMARKS_AS_OF = '2026-11-04';

/**
 * Frais moyens des fonds actions français gérés activement en 2025, frais
 * de performance compris (AMF, Lettre de l'Observatoire de l'épargne n° 65,
 * avril 2026). Les ETF actions français : 0,33 % en moyenne.
 */
export const ACTIVE_FUND_TER = Object.freeze({ value: 1.37, label: 'AMF 2025' });

/** ETF de référence par indice (clés de INDEX_PROFILES). */
export const REFERENCE_ETFS = Object.freeze({
  world: [
    { name: 'iShares Core MSCI World', ticker: 'IWDA.AS', alt: ['SWDA.L', 'EUNL.DE'], ter: 0.2, pea: false },
    { name: 'Xtrackers MSCI World', ticker: 'XDWD.DE', ter: 0.12, pea: false },
    { name: 'Amundi MSCI World Swap (CW8)', ticker: 'CW8.PA', ter: 0.38, pea: true },
    { name: 'iShares MSCI World Swap PEA', ticker: 'WPEA.PA', ter: 0.2, pea: true },
    { name: 'Amundi PEA Monde', ticker: 'DCAM.PA', ter: 0.2, pea: true },
  ],
  acwi: [
    { name: 'iShares MSCI ACWI', ticker: 'SSAC.AS', alt: ['SSAC.L', 'IUSQ.DE'], ter: 0.2, pea: false },
    { name: 'Vanguard FTSE All-World (Acc)', ticker: 'VWCE.DE', alt: ['VWCE.AS'], ter: 0.14, pea: false },
    { name: 'Vanguard FTSE All-World (Dist)', ticker: 'VWRL.AS', alt: ['VWRL.L'], ter: 0.14, pea: false },
    { name: 'SPDR MSCI All Country World', ticker: 'ACWE.PA', ter: 0.12, pea: false },
    { name: 'Amundi PEA Global (MSCI ACWI)', ticker: 'GPEA.PA', ter: 0.3, pea: true },
  ],
  sp500: [
    { name: 'iShares Core S&P 500', ticker: 'CSPX.L', alt: ['SXR8.DE', 'CSPX.AS'], ter: 0.07, pea: false },
    { name: 'Vanguard S&P 500', ticker: 'VUSA.AS', alt: ['VUSA.DE'], ter: 0.07, pea: false },
    { name: 'BNP Paribas Easy S&P 500', ticker: 'ESE.PA', ter: 0.14, pea: true },
    { name: 'Amundi PEA S&P 500', ticker: 'PSP5.PA', ter: 0.12, pea: true },
    { name: 'Amundi S&P 500 Swap', ticker: '500.PA', ter: 0.15, pea: false },
  ],
  ndx: [
    { name: 'iShares Nasdaq 100', ticker: 'CNDX.L', alt: ['SXRV.DE', 'CNDX.AS'], ter: 0.3, pea: false },
    { name: 'Invesco EQQQ Nasdaq-100', ticker: 'EQQQ.PA', alt: ['EQQQ.DE'], ter: 0.3, pea: false },
    { name: 'Amundi Core Nasdaq-100 Swap', ticker: 'UST.PA', alt: ['LYMS.DE'], ter: 0.22, pea: false },
    { name: 'Xtrackers Nasdaq 100', ticker: 'XNAS.DE', ter: 0.2, pea: false },
    { name: 'Amundi PEA Nasdaq-100', ticker: 'PUST.PA', ter: 0.3, pea: true },
  ],
  em: [
    { name: 'iShares Core MSCI EM IMI', ticker: 'EMIM.AS', alt: ['EIMI.L', 'IS3N.DE'], ter: 0.18, pea: false },
    { name: 'iShares MSCI EM', ticker: 'IEMA.AS', alt: ['SEMA.L', 'EUNM.DE'], ter: 0.18, pea: false },
    { name: 'Xtrackers MSCI Emerging Markets', ticker: 'XMME.DE', ter: 0.18, pea: false },
    { name: 'Amundi MSCI Emerging Markets Swap', ticker: 'AEEM.PA', ter: 0.2, pea: false },
    // Sur un indice ESG dérivé du MSCI EM : le seul émergents éligible au PEA.
    { name: 'Amundi PEA Émergent ESG Transition', ticker: 'PAEEM.PA', ter: 0.3, pea: true },
  ],
  europe: [
    { name: 'iShares Core MSCI Europe', ticker: 'IMAE.AS', alt: ['SMEA.L', 'EUNK.DE'], ter: 0.12, pea: false },
    { name: 'Amundi Core Stoxx Europe 600', ticker: 'MEUD.PA', ter: 0.07, pea: false },
    { name: 'Xtrackers MSCI Europe', ticker: 'XMEU.DE', ter: 0.12, pea: false },
    { name: 'BNP Paribas Easy Stoxx Europe 600', ticker: 'ETZ.PA', ter: 0.19, pea: true },
    { name: 'Amundi PEA MSCI Europe', ticker: 'PCEU.PA', ter: 0.15, pea: true },
  ],
  france: [
    { name: 'Amundi CAC 40 (Dist)', ticker: 'CAC.PA', ter: 0.25, pea: true },
    { name: 'Amundi CAC 40 (Acc)', ticker: 'CACC.PA', ter: 0.25, pea: true },
    { name: 'iShares MSCI France', ticker: 'IS3U.DE', alt: ['ISFR.L'], ter: 0.25, pea: true },
    { name: 'Xtrackers CAC 40', ticker: 'DX2G.DE', ter: 0.2, pea: true },
  ],
  es50: [
    { name: 'iShares Euro Stoxx 50 (DE)', ticker: 'EXW1.DE', ter: 0.09, pea: true },
    { name: 'iShares Core Euro Stoxx 50', ticker: 'CSX5.AS', alt: ['SXRT.DE', 'CSX5.L'], ter: 0.1, pea: true },
    { name: 'Xtrackers Euro Stoxx 50', ticker: 'XESC.DE', ter: 0.09, pea: true },
    { name: 'Amundi Euro Stoxx 50 II', ticker: 'MSE.PA', ter: 0.2, pea: true },
  ],
});
