import { isIsin, listingsFromFigi } from '../listings';

describe('ISIN', () => {
  test('clé de contrôle vérifiée', () => {
    ['LU1681043599', 'IE00B4L5Y983', 'FR0000121014', 'US0378331005'].forEach((x) => expect(isIsin(x)).toBe(true));
    expect(isIsin('FR0000121015')).toBe(false);
    expect(isIsin('CW8')).toBe(false);
    expect(isIsin(' lu1681043599 ')).toBe(true);
  });
});

describe('cotations OpenFIGI → Yahoo', () => {
  const rows = [
    { ticker: 'IWDA', exchCode: 'NA', marketSector: 'Equity', name: 'ISHARES CORE MSCI WORLD', securityType: 'ETP', securityType2: 'Mutual Fund' },
    { ticker: 'SWDA', exchCode: 'LN', marketSector: 'Equity', name: 'ISHARES CORE MSCI WORLD', securityType: 'ETP', securityType2: 'Mutual Fund' },
    { ticker: 'SWDA', exchCode: 'GR', marketSector: 'Equity', name: 'ISHARES CORE MSCI WORLD', securityType: 'ETP' },
    { ticker: 'IRRRF', exchCode: 'US', marketSector: 'Equity', name: 'ISHARES CORE MSCI WORLD', securityType: 'ETP' },
    { ticker: 'IWDA', exchCode: 'NA', marketSector: 'Equity', name: 'doublon' },
  ];

  test('suffixes Yahoo, places inconnues et doublons écartés, US hors titre américain', () => {
    expect(listingsFromFigi(rows, 'IE00B4L5Y983')).toEqual([
      { symbol: 'IWDA.AS', name: 'ISHARES CORE MSCI WORLD', exchange: 'Amsterdam', quoteType: 'ETF' },
      { symbol: 'SWDA.L', name: 'ISHARES CORE MSCI WORLD', exchange: 'LSE', quoteType: 'ETF' },
    ]);
  });

  test('action américaine : cotation US gardée, classe d’action au format Yahoo', () => {
    const us = [{ ticker: 'BRK/B', exchCode: 'US', marketSector: 'Equity', name: 'BERKSHIRE HATHAWAY', securityType: 'Common Stock' }];
    expect(listingsFromFigi(us, 'US0846707026')).toEqual([
      { symbol: 'BRK-B', name: 'BERKSHIRE HATHAWAY', exchange: 'US', quoteType: 'EQUITY' },
    ]);
  });
});
