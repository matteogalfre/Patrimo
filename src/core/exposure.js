/**
 * Diversification (fonctions pures) : où est investi l'argent placé en
 * actions et ETF, par pays et par secteur.
 *
 * Un ETF est décomposé selon l'indice qu'il suit (« transparence ») ; une
 * action compte pour son pays et son secteur. Ce qu'on ne sait pas classer
 * reste à part, signalé, plutôt que deviné. Les cryptos ne sont pas incluses.
 */

import {
  ETF_INDEX,
  EXCHANGE_COUNTRY,
  INDEX_PATTERNS,
  INDEX_PROFILES,
  STOCK_SECTORS,
} from '../constants/exposureData';
import { ASSET_TYPES } from './assets';

const FUND_NAME = /\b(ETF|UCITS|OPCVM|FCP|SICAV|TRACKER)\b|^(AMUNDI|ISHARES|LYXOR|XTRACKERS|VANGUARD|SPDR|BNP PARIBAS EASY|INVESCO)\b/i;

/** Ramène une répartition à 100 % (les fiches excluent les liquidités). */
const normalize = (weights) => {
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);
  return sum > 0 ? Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / sum])) : {};
};

/**
 * Comment un actif est classé : indice suivi pour un ETF, pays et secteur
 * pour une action. `override` vient de la fiche de l'actif.
 * @returns {{kind: 'etf'|'stock', profile: string|null, country: string|null, sector: string|null, source: 'manual'|'auto'|null}}
 */
export const classify = ({ symbol = '', name = '' }, override = {}) => {
  const sym = String(symbol).toUpperCase();
  if (override.profile && INDEX_PROFILES[override.profile]) {
    return { kind: 'etf', profile: override.profile, country: null, sector: null, source: 'manual' };
  }
  const known = ETF_INDEX[sym];
  const guessed = known || INDEX_PATTERNS.find(([, re]) => re.test(name))?.[0] || null;
  const isFund = !!known || FUND_NAME.test(name);
  if (isFund) return { kind: 'etf', profile: guessed, country: null, sector: null, source: guessed ? 'auto' : null };

  const suffix = sym.includes('.') ? sym.split('.').pop() : '';
  const country = override.country || (suffix ? EXCHANGE_COUNTRY[suffix] : 'US') || null;
  const sector = override.sector || STOCK_SECTORS[sym] || null;
  const manual = !!(override.country || override.sector);
  return { kind: 'stock', profile: null, country, sector, source: manual ? 'manual' : country || sector ? 'auto' : null };
};

const toList = (map, total) => Object.entries(map)
  .map(([key, value]) => ({ key, value, pct: total > 0 ? (value / total) * 100 : 0 }))
  .sort((a, b) => (a.key === 'OTHER') - (b.key === 'OTHER') || b.value - a.value);

/**
 * Exposition par pays et par secteur des actions et ETF détenus.
 * @param {Array<{assetId: string, assetType: string, symbol: string, name: string, value: number}>} holdings
 * @param {Object<string, {profile?: string, country?: string, sector?: string}>} [overrides]
 */
export const computeExposure = (holdings = [], overrides = {}) => {
  const countries = {};
  const sectors = {};
  let unknownCountry = 0;
  let unknownSector = 0;
  let total = 0;
  const assets = [];
  const add = (map, key, v) => { map[key] = (map[key] || 0) + v; };

  holdings
    .filter((h) => h.assetType !== ASSET_TYPES.CRYPTO && h.value > 0)
    .forEach((h) => {
      const c = classify(h, overrides[h.assetId]);
      total += h.value;
      assets.push({ ...c, assetId: h.assetId, symbol: h.symbol, name: h.name, value: h.value });
      if (c.kind === 'etf') {
        const profile = INDEX_PROFILES[c.profile];
        if (!profile) {
          unknownCountry += h.value;
          unknownSector += h.value;
          return;
        }
        Object.entries(normalize(profile.countries)).forEach(([k, w]) => add(countries, k, h.value * w));
        Object.entries(normalize(profile.sectors)).forEach(([k, w]) => add(sectors, k, h.value * w));
        return;
      }
      if (c.country) add(countries, c.country, h.value);
      else unknownCountry += h.value;
      if (c.sector) add(sectors, c.sector, h.value);
      else unknownSector += h.value;
    });

  return {
    total,
    countries: toList(countries, total),
    sectors: toList(sectors, total),
    unknown: {
      countries: { value: unknownCountry, pct: total > 0 ? (unknownCountry / total) * 100 : 0 },
      sectors: { value: unknownSector, pct: total > 0 ? (unknownSector / total) * 100 : 0 },
    },
    assets: assets.sort((a, b) => b.value - a.value),
  };
};

const EMERGING = ['CN', 'TW', 'KR', 'IN', 'BR', 'MX', 'ZA', 'SA', 'AE', 'PL'];
const shareIn = (list, key) => list.find((x) => x.key === key)?.pct || 0;
const profileShare = (profile, dim, key) => {
  const weights = INDEX_PROFILES[profile][dim];
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);
  return sum > 0 ? ((weights[key] || 0) / sum) * 100 : 0;
};

/**
 * Ce qu'il faut retenir de la répartition, du plus important au plus
 * secondaire. Chaque constat a un niveau (`warning`, `info`, `good`) et ses
 * valeurs ; l'écran se charge du texte.
 * @param {ReturnType<typeof computeExposure>} exposure
 * @returns {{countries: object[], sectors: object[]}}
 */
export const diversificationInsights = (exposure) => {
  const countries = [];
  const sectors = [];
  if (!(exposure?.total > 0)) return { countries, sectors };

  // --- Pays -------------------------------------------------------------------
  const top = exposure.countries.find((x) => x.key !== 'OTHER');
  if (top) {
    const p = top.pct;
    if (p >= 90) countries.push({ key: 'countryExtreme', level: 'warning', country: top.key, pct: p });
    else if (p >= 70) countries.push({ key: 'countryHigh', level: 'warning', country: top.key, pct: p });
    else if (p >= 50) countries.push({ key: 'countryMedium', level: 'info', country: top.key, pct: p });
    else countries.push({ key: 'countryBalanced', level: 'good' });

    if (top.key === 'US' && p >= 50) {
      countries.push({ key: 'dollar', level: 'info' });
      const world = profileShare('world', 'countries', 'US');
      if (Math.abs(p - world) >= 10) countries.push({ key: 'worldBenchmark', level: 'info', pct: world });
    }
  }
  const france = shareIn(exposure.countries, 'FR');
  if (france >= 25) countries.push({ key: 'homeBias', level: 'info', pct: france, world: profileShare('world', 'countries', 'FR') });
  const emerging = EMERGING.reduce((s, k) => s + shareIn(exposure.countries, k), 0);
  if (emerging < 1) countries.push({ key: 'noEmerging', level: 'info' });
  if (exposure.unknown.countries.pct >= 10) countries.push({ key: 'unknown', level: 'warning', pct: exposure.unknown.countries.pct });

  // --- Secteurs ---------------------------------------------------------------
  const lead = exposure.sectors[0];
  if (lead) {
    const s = lead.pct;
    const broad = exposure.sectors.filter((x) => x.pct >= 5).length;
    if (s >= 50) sectors.push({ key: 'sectorExtreme', level: 'warning', sector: lead.key, pct: s });
    else if (s >= 35) sectors.push({ key: 'sectorHigh', level: 'warning', sector: lead.key, pct: s });
    else if (broad >= 6) sectors.push({ key: 'sectorBalanced', level: 'good', count: broad });
    else sectors.push({ key: 'sectorMedium', level: 'info', count: broad });

    if (lead.key === 'tech' && s >= 30) {
      sectors.push({ key: 'techContext', level: 'info', sp: profileShare('sp500', 'sectors', 'tech'), world: profileShare('world', 'sectors', 'tech') });
    }
  }
  const all = ['tech', 'financials', 'industrials', 'health', 'discretionary', 'communication', 'staples', 'energy', 'materials', 'utilities', 'realEstate'];
  const missing = all.filter((k) => shareIn(exposure.sectors, k) < 1);
  if (missing.length >= 3) sectors.push({ key: 'missingSectors', level: 'info', sectors: missing.slice(0, 4) });
  if (exposure.unknown.sectors.pct >= 10) sectors.push({ key: 'unknown', level: 'warning', pct: exposure.unknown.sectors.pct });

  return { countries, sectors };
};
