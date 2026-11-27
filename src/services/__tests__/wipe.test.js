// Effacement : données, accords bancaires, clés et rappels disparaissent ; les réglages restent.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __store: store,
    getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => { store.set(k, v); }),
    multiSet: jest.fn(async (pairs) => pairs.forEach(([k, v]) => store.set(k, v))),
    multiRemove: jest.fn(async (keys) => keys.forEach((k) => store.delete(k))),
    clear: jest.fn(async () => store.clear()),
  };
});
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn(async () => false) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x', getRandomBytes: (k) => new Uint8Array(k) }));
jest.mock('../gocardless', () => ({
  gocardless: {
    hasCredentials: jest.fn(async () => true),
    deleteRequisition: jest.fn(async () => true),
    clearCredentials: jest.fn(async () => {}),
  },
}));
jest.mock('../notifications', () => ({ syncMonthlyReminders: jest.fn(async () => {}) }));
jest.mock('../../widget', () => ({ updateWidget: jest.fn(async () => true) }));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { STORAGE_KEYS } = require('../../constants');
const { gocardless } = require('../gocardless');
const { syncMonthlyReminders } = require('../notifications');
const { wipeData, wipeEverything } = require('../wipe');

const fill = () => {
  const s = AsyncStorage.__store;
  s.set(STORAGE_KEYS.TRANSACTIONS, '[{"id":"t"}]');
  s.set(STORAGE_KEYS.PLANNING, '{"goals":[1]}');
  s.set(STORAGE_KEYS.BANK_LINKS, JSON.stringify([{ id: 'req1' }, { id: 'req2' }]));
  s.set(STORAGE_KEYS.WIDGET_DATA, '{"totalValue":1000}');
  s.set(STORAGE_KEYS.PRICE_ALERTS, '[1]');
  s.set(STORAGE_KEYS.SETTINGS, '{"language":"fr"}');
};

describe('effacement', () => {
  beforeEach(() => {
    AsyncStorage.__store.clear();
    jest.clearAllMocks();
  });

  test('Tout effacer : données, banque et widget, mais pas les réglages', async () => {
    fill();
    await wipeData();
    const s = AsyncStorage.__store;
    expect(s.has(STORAGE_KEYS.TRANSACTIONS)).toBe(false);
    expect(s.has(STORAGE_KEYS.PLANNING)).toBe(false);
    expect(s.has(STORAGE_KEYS.BANK_LINKS)).toBe(false);
    expect(s.has(STORAGE_KEYS.WIDGET_DATA)).toBe(false);
    expect(s.has(STORAGE_KEYS.PRICE_ALERTS)).toBe(false);
    expect(s.get(STORAGE_KEYS.SETTINGS)).toBe('{"language":"fr"}');
    expect(gocardless.deleteRequisition).toHaveBeenCalledWith('req1');
    expect(gocardless.deleteRequisition).toHaveBeenCalledWith('req2');
    expect(gocardless.clearCredentials).toHaveBeenCalled();
    expect(syncMonthlyReminders).toHaveBeenCalledWith([]);
  });

  test('PIN oublié : tout, réglages compris', async () => {
    fill();
    await wipeEverything();
    expect(AsyncStorage.__store.size).toBe(0);
    expect(require('expo-secure-store').deleteItemAsync).toHaveBeenCalledWith('patrimo.backup.password');
    expect(gocardless.deleteRequisition).toHaveBeenCalledTimes(2);
    expect(gocardless.clearCredentials).toHaveBeenCalled();
  });
});
