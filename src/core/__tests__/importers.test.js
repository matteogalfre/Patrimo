import {
  buildBackup,
  detectBackupFormat,
  mergeById,
  normalizeTransaction,
  parseBackup,
} from '../importers';

describe('normalizeTransaction', () => {
  test('remet une opération au format interne', () => {
    const t = normalizeTransaction({
      id: 'a', assetType: 'stock', symbol: 'cw8.pa', account: 'PEA', side: 'buy',
      quantity: '2,5', unitPrice: '480.1', fees: 1.99, currency: 'eur', date: '2026-01-10',
    });
    expect(t).toMatchObject({
      assetId: 'stock:CW8.PA', symbol: 'CW8.PA', account: 'PEA', quantity: 2.5,
      unitPrice: 480.1, fees: 1.99, currency: 'EUR', side: 'buy',
    });
  });

  test('une crypto ne peut pas être dans un PEA', () => {
    const t = normalizeTransaction({ assetType: 'crypto', symbol: 'BTC', account: 'PEA', quantity: 1, date: '2026-01-01' });
    expect(t.account).toBe('CRYPTO');
  });

  test('opérations inutilisables rejetées', () => {
    expect(normalizeTransaction({ symbol: '', quantity: 1, date: '2026-01-01' })).toBeNull();
    expect(normalizeTransaction({ symbol: 'AAPL', quantity: 0, date: '2026-01-01' })).toBeNull();
    expect(normalizeTransaction({ symbol: 'AAPL', quantity: 1, date: 'pas une date' })).toBeNull();
  });

  test('prix absent conservé comme inconnu, jamais inventé', () => {
    expect(normalizeTransaction({ symbol: 'AAPL', quantity: 1, date: '2026-01-01' }).unitPrice).toBeNull();
  });
});

describe('format natif et détection', () => {
  test('aller-retour export / import sans perte', () => {
    const transactions = [normalizeTransaction({ id: 'x1', assetType: 'stock', symbol: 'CW8.PA', account: 'PEA', quantity: 1, unitPrice: 500, currency: 'EUR', date: '2026-01-01' })];
    const cashAccounts = [{ id: 'c1', name: 'Livret A', kind: 'livretA', currency: 'EUR', rate: 1.5, institution: null, history: [{ date: '2026-01-01T12:00:00.000Z', balance: 5000 }], createdAt: '2026-01-01T12:00:00.000Z', updatedAt: null }];
    const backup = buildBackup({ transactions, dividends: [], cashAccounts, appVersion: '1.0.0' });
    const r = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(r.format).toBe('patrimo');
    expect(r.transactions).toEqual(transactions);
    expect(r.cashAccounts).toEqual(cashAccounts);
  });

  test('seules les sauvegardes Patrimo sont acceptées', () => {
    expect(detectBackupFormat({ data: { transactions: [] } })).toBe('patrimo');
    expect(detectBackupFormat({ appName: 'CryptoTrackr', data: { investments: [{ crypto: 'BTC', amount: 1 }] } })).toBeNull();
    expect(detectBackupFormat({ foo: 1 })).toBeNull();
    expect(() => parseBackup({ foo: 1 })).toThrow('UNKNOWN_FORMAT');
  });

  test('réimporter le même fichier ne crée pas de doublon', () => {
    const { transactions } = parseBackup({ appName: 'Patrimo', data: { transactions: [{ id: 'tx_1', assetType: 'crypto', symbol: 'BTC', quantity: 1, unitPrice: 1, date: '2024-01-01' }] } });
    const first = mergeById([], transactions);
    const second = mergeById(first.merged, transactions);
    expect(first.added).toBe(1);
    expect(second.added).toBe(0);
    expect(second.merged).toHaveLength(1);
  });
});
