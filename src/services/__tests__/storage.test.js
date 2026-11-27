// Stockage : des écritures lancées ensemble ne se perdent pas.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  // Une lecture et une écriture qui prennent du temps, comme sur un téléphone.
  const later = (fn) => new Promise((resolve) => setTimeout(() => resolve(fn()), Math.random() * 5));
  return {
    __store: store,
    getItem: jest.fn((k) => later(() => (store.has(k) ? store.get(k) : null))),
    setItem: jest.fn((k, v) => later(() => { store.set(k, v); })),
    multiSet: jest.fn(async (pairs) => pairs.forEach(([k, v]) => store.set(k, v))),
    multiRemove: jest.fn(async (keys) => keys.forEach((k) => store.delete(k))),
    multiGet: jest.fn(async (keys) => keys.map((k) => [k, store.has(k) ? store.get(k) : null])),
    getAllKeys: jest.fn(async () => [...store.keys()]),
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn(async () => false) }));
let n = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${(n += 1)}`, getRandomBytes: (k) => new Uint8Array(k) }));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { STORAGE_KEYS } = require('../../constants');
const { cashRepo, historyCache } = require('../storage');

const account = (name) => ({ name, kind: 'livretA', rate: 3, history: [{ date: '2026-01-01', balance: 100 }] });

describe('écritures concurrentes', () => {
  beforeEach(() => AsyncStorage.__store.clear());

  test('des ajouts lancés ensemble sont tous gardés', async () => {
    await Promise.all(['A', 'B', 'C', 'D', 'E'].map((x) => cashRepo.add(account(x))));
    const { data } = await cashRepo.getAll();
    expect(data.map((a) => a.name).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  test('updateMany modifie tout en une écriture', async () => {
    const added = [];
    for (const x of ['A', 'B', 'C']) added.push((await cashRepo.add(account(x))).data);
    AsyncStorage.setItem.mockClear();
    const { data } = await cashRepo.updateMany(added.map((a) => ({ id: a.id, rate: 2 })));
    expect(data).toHaveLength(3);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const { data: all } = await cashRepo.getAll();
    expect(all.every((a) => a.rate === 2)).toBe(true);
  });

  test('un ajout pendant des modifications n’est pas écrasé', async () => {
    const first = (await cashRepo.add(account('A'))).data;
    await Promise.all([
      cashRepo.update(first.id, { rate: 1 }),
      cashRepo.add(account('B')),
      cashRepo.update(first.id, { name: 'A2' }),
    ]);
    const { data } = await cashRepo.getAll();
    expect(data).toHaveLength(2);
    const a = data.find((x) => x.id === first.id);
    expect(a.name).toBe('A2');
    expect(a.rate).toBe(1);
  });

  test('update d’un id inconnu', async () => {
    const { data, error } = await cashRepo.update('nope', { rate: 1 });
    expect(data).toBeNull();
    expect(error.message).toBe('NOT_FOUND');
    expect(AsyncStorage.__store.has(STORAGE_KEYS.CASH_ACCOUNTS)).toBe(false);
  });
});

describe('cache des historiques, un actif par entrée', () => {
  beforeEach(() => AsyncStorage.__store.clear());

  test('écrit et relit seulement les actifs demandés', async () => {
    await historyCache.write({
      series: { 'stock:CW8.PA': { '2026-01-02': 500 }, 'crypto:BTC': { '2026-01-02': 90000 } },
      currencies: { 'stock:CW8.PA': 'EUR', 'crypto:BTC': 'USD' },
      froms: { 'stock:CW8.PA': '2025-01-01', 'crypto:BTC': '2025-06-01' },
    });
    const c = await historyCache.read(['stock:CW8.PA']);
    expect(Object.keys(c.series)).toEqual(['stock:CW8.PA']);
    expect(c.currencies['stock:CW8.PA']).toBe('EUR');
    expect(historyCache.isUsable(c, ['stock:CW8.PA'], '2025-03-01')).toBe(true);
    // L'historique ne remonte pas assez loin.
    expect(historyCache.isUsable(c, ['stock:CW8.PA'], '2024-01-01')).toBe(false);
    expect(historyCache.isUsable(c, ['stock:CW8.PA', 'crypto:BTC'], '2025-03-01')).toBe(false);
  });

  test('un actif trop gros n’empêche pas d’écrire les autres', async () => {
    const huge = {};
    for (let i = 0; i < 120000; i += 1) huge[`k${i}`] = i;
    await historyCache.write({ series: { big: huge, small: { '2026-01-02': 1 } }, from: '2025-01-01' });
    const c = await historyCache.read(['big', 'small']);
    expect(Object.keys(c.series)).toEqual(['small']);
  });

  test('clear efface toutes les entrées', async () => {
    await historyCache.write({ series: { a: { '2026-01-02': 1 } }, from: '2025-01-01' });
    await historyCache.clear();
    expect(await historyCache.read(['a'])).toBeNull();
  });
});
