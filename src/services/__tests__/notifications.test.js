// Permission des notifications sur Android : une seule fenêtre pour des
// demandes simultanées, et un refus n'est pas retenu.
const mockRequest = jest.fn();
const mockCheck = jest.fn();
const mockPresent = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    check: (...a) => mockCheck(...a),
    request: (...a) => mockRequest(...a),
  },
}));
jest.mock('../../../modules/patrimo-notify', () => ({
  __esModule: true,
  default: { present: (...a) => mockPresent(...a), areEnabled: () => true, setMonthlyReminders: jest.fn() },
}));

const load = () => {
  let mod;
  jest.isolateModules(() => { mod = require('../notifications'); });
  return mod;
};

beforeEach(() => {
  mockRequest.mockReset();
  mockCheck.mockReset();
  mockPresent.mockReset();
});

test('deux demandes simultanées : une seule fenêtre, les deux réussissent', async () => {
  mockCheck.mockResolvedValue(false);
  let answer;
  mockRequest.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  const { ensureNotificationPermission, presentLocalNotification } = load();

  const first = ensureNotificationPermission();               // création de l'alerte
  const second = presentLocalNotification({ title: 'BTC', body: 'atteint' }); // alerte déjà atteinte
  await Promise.resolve();
  answer('granted');

  expect(await first).toBe(true);
  await second;
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mockPresent).toHaveBeenCalledWith('BTC', 'atteint', 'price-alerts');
});

test('un refus n\'est pas retenu : une autorisation donnée ensuite est prise en compte', async () => {
  mockCheck.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  mockRequest.mockResolvedValue('denied');
  const { ensureNotificationPermission } = load();
  expect(await ensureNotificationPermission()).toBe(false);
  expect(await ensureNotificationPermission()).toBe(true);
});
