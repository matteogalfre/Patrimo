import { classify, computeExposure } from '../exposure';
import { INDEX_PROFILES } from '../../constants/exposureData';

describe('classement des actifs', () => {
  test('ETF connu, ETF deviné par le nom, ETF inconnu', () => {
    expect(classify({ symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF' })).toMatchObject({ kind: 'etf', profile: 'sp500', source: 'auto' });
    expect(classify({ symbol: 'XYZ.PA', name: 'Amundi PEA Nasdaq-100 UCITS ETF' })).toMatchObject({ kind: 'etf', profile: 'ndx' });
    expect(classify({ symbol: 'ABC.PA', name: 'Lyxor PEA Monde (MSCI World) UCITS ETF' }).profile).toBe('world');
    expect(classify({ symbol: 'ABC.PA', name: 'Amundi PEA MSCI Emerging Markets ESG UCITS ETF' }).profile).toBe('em');
    expect(classify({ symbol: 'ZZZ.PA', name: 'Amundi Global Aggregate Bond UCITS ETF' })).toMatchObject({ kind: 'etf', profile: null, source: null });
  });

  test('action : secteur connu, pays par la place de cotation, correction manuelle', () => {
    expect(classify({ symbol: 'MC.PA', name: 'LVMH' })).toMatchObject({ kind: 'stock', country: 'FR', sector: 'discretionary' });
    expect(classify({ symbol: 'AAPL', name: 'Apple' })).toMatchObject({ country: 'US', sector: 'tech' });
    expect(classify({ symbol: 'FOO.PA', name: 'Petite société' })).toMatchObject({ country: 'FR', sector: null });
    expect(classify({ symbol: 'AIR.PA', name: 'Airbus' }, { country: 'NL' })).toMatchObject({ country: 'NL', sector: 'industrials', source: 'manual' });
    expect(classify({ symbol: 'ZZZ.PA', name: 'Bond UCITS ETF' }, { profile: 'europe' })).toMatchObject({ kind: 'etf', profile: 'europe', source: 'manual' });
  });
});

describe('exposition', () => {
  test('ETF décomposé selon son indice, action à part entière, inconnu signalé, crypto exclue', () => {
    const holdings = [
      { assetId: 'stock:ESE.PA', assetType: 'stock', symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', value: 6000 },
      { assetId: 'stock:MC.PA', assetType: 'stock', symbol: 'MC.PA', name: 'LVMH', value: 3000 },
      { assetId: 'stock:FOO.PA', assetType: 'stock', symbol: 'FOO.PA', name: 'Petite société', value: 1000 },
      { assetId: 'crypto:BTC', assetType: 'crypto', symbol: 'BTC', name: 'Bitcoin', value: 5000 },
    ];
    const e = computeExposure(holdings);
    expect(e.total).toBe(10000);
    expect(e.countries[0]).toMatchObject({ key: 'US' });
    expect(e.countries[0].pct).toBeCloseTo(60, 6);
    expect(e.countries.find((c) => c.key === 'FR').pct).toBeCloseTo(40, 6);
    const sp = INDEX_PROFILES.sp500.sectors;
    const spSum = Object.values(sp).reduce((s, v) => s + v, 0);
    expect(e.sectors.find((s) => s.key === 'tech').value).toBeCloseTo(6000 * (sp.tech / spSum), 6);
    expect(e.sectors.find((s) => s.key === 'discretionary').value).toBeCloseTo(3000 + 6000 * (sp.discretionary / spSum), 6);
    expect(e.unknown.sectors.value).toBe(1000);
    expect(e.unknown.countries.value).toBe(0);
    const totalSectors = e.sectors.reduce((s, x) => s + x.value, 0) + e.unknown.sectors.value;
    expect(totalSectors).toBeCloseTo(10000, 6);
  });

  test('« Autres » toujours en fin de liste', () => {
    const e = computeExposure([{ assetId: 'stock:CW8.PA', assetType: 'stock', symbol: 'CW8.PA', name: 'Amundi MSCI World', value: 1000 }]);
    expect(e.countries[e.countries.length - 1].key).toBe('OTHER');
    expect(e.countries[0].key).toBe('US');
  });
});

describe('ce qu’il faut retenir', () => {
  const { diversificationInsights } = require('../exposure');
  const keys = (list) => list.map((x) => x.key);

  test('presque tout aux États-Unis : concentration extrême, dollar, comparaison, pas d’émergents', () => {
    const e = computeExposure([
      { assetId: 'stock:ESE.PA', assetType: 'stock', symbol: 'ESE.PA', name: 'BNP Paribas Easy S&P 500 UCITS ETF', value: 9800 },
      { assetId: 'stock:MC.PA', assetType: 'stock', symbol: 'MC.PA', name: 'LVMH', value: 200 },
    ]);
    const { countries, sectors } = diversificationInsights(e);
    expect(keys(countries)).toEqual(['countryExtreme', 'dollar', 'worldBenchmark', 'noEmerging']);
    expect(countries[0]).toMatchObject({ country: 'US', level: 'warning' });
    expect(countries[0].pct).toBeCloseTo(98, 6);
    expect(countries[2].pct).toBeGreaterThan(70);
    expect(keys(sectors)).toEqual(['sectorHigh', 'techContext']);
  });

  test('ETF monde : majorité US sans alerte forte ; actions françaises : biais maison et secteurs absents', () => {
    const world = computeExposure([{ assetId: 'stock:CW8.PA', assetType: 'stock', symbol: 'CW8.PA', name: 'Amundi MSCI World', value: 1000 }]);
    const w = diversificationInsights(world);
    expect(keys(w.countries)).toEqual(['countryHigh', 'dollar', 'noEmerging']);
    expect(keys(w.sectors)).toEqual(['sectorBalanced']);

    const fr = computeExposure([
      { assetId: 'stock:MC.PA', assetType: 'stock', symbol: 'MC.PA', name: 'LVMH', value: 500 },
      { assetId: 'stock:TTE.PA', assetType: 'stock', symbol: 'TTE.PA', name: 'TotalEnergies', value: 500 },
      { assetId: 'stock:FOO.PA', assetType: 'stock', symbol: 'FOO.PA', name: 'Inconnue', value: 500 },
    ]);
    const f = diversificationInsights(fr);
    expect(keys(f.countries)).toEqual(['countryExtreme', 'homeBias', 'noEmerging']);
    expect(keys(f.sectors)).toEqual(['sectorMedium', 'missingSectors', 'unknown']);
  });
});
