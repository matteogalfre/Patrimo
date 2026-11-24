// Mode démo : l'exemple vit sous ses propres clés, le quitter n'efface que lui.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __store: store,
    getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => { store.set(k, v); }),
    removeItem: jest.fn(async (k) => { store.delete(k); }),
    multiSet: jest.fn(async (pairs) => pairs.forEach(([k, v]) => store.set(k, v))),
    multiRemove: jest.fn(async (keys) => keys.forEach((k) => store.delete(k))),
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn(async () => false) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${Math.random().toString(36).slice(2)}`, getRandomBytes: (n) => new Uint8Array(n) }));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { STORAGE_KEYS } = require('../../constants');
const { demoMode, DEMO_PLANNING_KEY } = require('../storage');

describe('mode démo et planification', () => {
  test('la planification d’exemple a sa propre clé', () => {
    expect(DEMO_PLANNING_KEY).not.toBe(STORAGE_KEYS.PLANNING);
    expect(DEMO_PLANNING_KEY.startsWith(STORAGE_KEYS.PLANNING)).toBe(true);
  });

  test('quitter la démo efface l’exemple, jamais la vraie planification', async () => {
    const real = JSON.stringify({ budget: { incomes: [{ id: 'a', label: 'Salaire', amount: 3000 }] } });
    AsyncStorage.__store.set(STORAGE_KEYS.PLANNING, real);
    await demoMode.enable({ transactions: [], dividends: [], cashAccounts: [] });
    expect(await demoMode.isOn()).toBe(true);
    AsyncStorage.__store.set(DEMO_PLANNING_KEY, JSON.stringify({ onboarded: true }));

    await demoMode.disable();
    expect(await demoMode.isOn()).toBe(false);
    expect(AsyncStorage.__store.has(DEMO_PLANNING_KEY)).toBe(false);
    expect(AsyncStorage.__store.get(STORAGE_KEYS.PLANNING)).toBe(real);
  });
});
