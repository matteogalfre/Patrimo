import { computeCryptoTax, computeCtoTax, taxYears } from '../tax';
import { createFxConverter } from '../fx';

const fx = createFxConverter({ base: 'EUR', latest: { USD: 0.9 }, history: { USD: { '2025-01-01': 0.9 } } });
const tx = (id, account, assetId, side, quantity, unitPrice, date, fees = 0, currency = 'EUR') => ({
  id, account, assetId, symbol: assetId.split(':')[1], side, quantity, unitPrice, fees, currency, date: `${date}T12:00:00Z`,
});

describe('compte-titres (2074)', () => {
  const transactions = [
    tx('1', 'CTO', 'stock:AAPL', 'buy', 10, 100, '2024-01-10', 2),
    tx('2', 'CTO', 'stock:AAPL', 'buy', 10, 200, '2024-06-10', 2),
    tx('3', 'CTO', 'stock:AAPL', 'sell', 5, 250, '2025-03-10', 1),
    tx('4', 'PEA', 'stock:CW8.PA', 'sell', 1, 500, '2025-03-10'),
  ];
  const r = computeCtoTax({ transactions, dividends: [{ account: 'CTO', amount: 12, currency: 'EUR', date: '2025-05-01' }], fx, year: 2025 });

  test('prix moyen pondéré frais compris, cession nette de frais', () => {
    expect(r.sales).toHaveLength(1);
    // PMP = (1 002 + 2 002) / 20 = 150,20 ; 5 titres = 751 ; cession 1 249.
    expect(r.sales[0].cost).toBeCloseTo(751);
    expect(r.sales[0].proceeds).toBeCloseTo(1249);
    expect(r.net).toBeCloseTo(498);
  });

  test('le PEA n\'est pas dans le 2074, les dividendes CTO de l\'année oui', () => {
    expect(r.sales.every((s) => s.assetId !== 'stock:CW8.PA')).toBe(true);
    expect(r.dividends).toBe(12);
  });
});

describe('crypto (2086)', () => {
  const prices = { 'crypto:ETH': { price: 2000, currency: 'EUR' } };
  const priceAt = (assetId) => prices[assetId] || null;

  test('formule C − PTA × C / V, PTA diminué à chaque cession', () => {
    const transactions = [
      tx('1', 'CRYPTO', 'crypto:BTC', 'buy', 1, 20000, '2024-01-01'),
      tx('2', 'CRYPTO', 'crypto:ETH', 'buy', 5, 2000, '2024-01-01'),
      tx('3', 'CRYPTO', 'crypto:BTC', 'sell', 0.5, 40000, '2025-02-01'),
      tx('4', 'CRYPTO', 'crypto:BTC', 'sell', 0.5, 40000, '2025-06-01'),
    ];
    const r = computeCryptoTax({ transactions, fx, priceAt, year: 2025 });
    // Première cession : V = 1 BTC à 40 000 + 5 ETH à 2 000 = 50 000 ; C = 20 000 ;
    // fraction = 30 000 × 20 000 / 50 000 = 12 000 ; plus-value 8 000.
    expect(r.sales[0].portfolioValue).toBeCloseTo(50000);
    expect(r.sales[0].gain).toBeCloseTo(8000);
    // Seconde : PTA 18 000, V = 20 000 + 10 000 = 30 000 ; fraction 12 000 ; plus-value 8 000.
    expect(r.sales[1].acquisitionShare).toBeCloseTo(12000);
    expect(r.net).toBeCloseTo(16000);
    expect(r.exempt).toBe(false);
    // PTA restant à la fin de l'année : 30 000 − 12 000 − 12 000.
    expect(r.remainingAcquisition).toBeCloseTo(6000);
    const later = computeCryptoTax({ transactions: [...transactions, tx('5', 'CRYPTO', 'crypto:ETH', 'sell', 1, 3000, '2026-01-01')], fx, priceAt, year: 2025 });
    expect(later.remainingAcquisition).toBeCloseTo(6000);
  });

  test('cessions totales sous 305 € : exonérées', () => {
    const transactions = [
      tx('1', 'CRYPTO', 'crypto:BTC', 'buy', 1, 100, '2024-01-01'),
      tx('2', 'CRYPTO', 'crypto:BTC', 'sell', 0.5, 300, '2025-02-01'),
    ];
    expect(computeCryptoTax({ transactions, fx, priceAt, year: 2025 }).exempt).toBe(true);
  });

  test('années déclarables', () => {
    const transactions = [
      tx('1', 'CRYPTO', 'crypto:BTC', 'sell', 1, 1, '2024-01-01'),
      tx('2', 'PEA', 'stock:X', 'sell', 1, 1, '2023-01-01'),
    ];
    expect(taxYears({ transactions, dividends: [{ account: 'CTO', date: '2022-05-01' }] })).toEqual([2024, 2022]);
  });
});
