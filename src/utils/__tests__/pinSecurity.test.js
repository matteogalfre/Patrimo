/**
 * Tests for the PIN security helpers. These rely on the mocks defined in
 * `jest.setup.js` for `expo-crypto` and `expo-secure-store`:
 *  - `digestStringAsync(_alg, data)` returns `hash(<data>)` so we can assert
 *    on stable hashes without re-implementing SHA-256 here.
 *  - `getRandomBytesAsync(n)` returns a deterministic byte array of 0x07s.
 *  - `SecureStore` is an in-memory `Map`.
 */

const SecureStore = require('expo-secure-store');

const {
  createPinHash,
  verifyPin,
  isV2Hash,
  savePinHashSecure,
  loadPinHashSecure,
  deletePinHashSecure,
  recordFailedAttempt,
  clearFailedAttempts,
  getAttemptState,
  migrateLegacyHashIfNeeded,
} = require('../pinSecurity');

const PEPPER_TAIL = 'Patrimo/v1/pepper.Qm7vK2xR-keep-stable';
const FIXED_SALT_HEX = '07'.repeat(16); // matches the deterministic mock.

beforeEach(() => {
  SecureStore.__reset();
});

describe('createPinHash / verifyPin', () => {
  it('produces a v2-formatted hash', async () => {
    const h = await createPinHash('1234');
    expect(isV2Hash(h)).toBe(true);
    const [marker, salt, hash] = h.split(':');
    expect(marker).toBe('v2');
    expect(salt).toBe(FIXED_SALT_HEX);
    expect(hash).toBe(`hash(${FIXED_SALT_HEX}|1234|${PEPPER_TAIL})`);
  });

  it('verifies a freshly-created hash', async () => {
    const h = await createPinHash('4321');
    await expect(verifyPin('4321', h)).resolves.toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const h = await createPinHash('4321');
    await expect(verifyPin('0000', h)).resolves.toBe(false);
  });

  it('returns false when no hash is stored', async () => {
    await expect(verifyPin('1234', null)).resolves.toBe(false);
    await expect(verifyPin('1234', '')).resolves.toBe(false);
  });

  it('rejects malformed v2 strings', async () => {
    await expect(verifyPin('1234', 'v2:onlyone')).resolves.toBe(false);
  });

  it('verifies a legacy (non-v2) hash via simpleHash fallback', async () => {
    // Mirror the original simpleHash implementation so we can assert on it.
    const legacyHash = (pin) => {
      let h = 0;
      const s = `${pin}CryptoTrackr_salt`;
      for (let i = 0; i < s.length; i += 1) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
      }
      return h.toString(36);
    };

    const stored = legacyHash('5678');
    expect(isV2Hash(stored)).toBe(false);
    await expect(verifyPin('5678', stored)).resolves.toBe(true);
    await expect(verifyPin('0000', stored)).resolves.toBe(false);
  });
});

describe('SecureStore helpers', () => {
  it('save / load / delete round trip', async () => {
    await expect(loadPinHashSecure()).resolves.toBeNull();
    await savePinHashSecure('v2:abc:def');
    await expect(loadPinHashSecure()).resolves.toBe('v2:abc:def');
    await deletePinHashSecure();
    await expect(loadPinHashSecure()).resolves.toBeNull();
  });
});

describe('lockout helpers', () => {
  it('escalates the lockout after 5 then 10 failures', async () => {
    let state;
    for (let i = 0; i < 4; i += 1) {
      state = await recordFailedAttempt();
      expect(state.lockoutUntil).toBe(0);
    }
    state = await recordFailedAttempt(); // 5th
    expect(state.count).toBe(5);
    expect(state.lockoutUntil).toBeGreaterThan(Date.now());

    // Fill up to the 10-attempt tier.
    for (let i = 6; i <= 10; i += 1) {
      state = await recordFailedAttempt();
    }
    expect(state.count).toBe(10);
    // 10-tier should be ≥ 5 minutes ⇒ much later than 30s.
    expect(state.lockoutUntil - Date.now()).toBeGreaterThan(60 * 1000);
  });

  it('clearFailedAttempts resets count and lockout', async () => {
    await recordFailedAttempt();
    await recordFailedAttempt();
    let s = await getAttemptState();
    expect(s.count).toBe(2);
    await clearFailedAttempts();
    s = await getAttemptState();
    expect(s.count).toBe(0);
    expect(s.lockoutUntil).toBe(0);
  });
});

describe('migrateLegacyHashIfNeeded', () => {
  it('copies a non-empty legacy hash into SecureStore', async () => {
    await expect(loadPinHashSecure()).resolves.toBeNull();
    const migrated = await migrateLegacyHashIfNeeded('abc123');
    expect(migrated).toBe('abc123');
    await expect(loadPinHashSecure()).resolves.toBe('abc123');
  });

  it('keeps the existing SecureStore value when one is already present', async () => {
    await savePinHashSecure('v2:xx:yy');
    const migrated = await migrateLegacyHashIfNeeded('legacy-hash');
    expect(migrated).toBe('v2:xx:yy');
  });

  it('returns null when nothing to migrate', async () => {
    const migrated = await migrateLegacyHashIfNeeded(null);
    expect(migrated).toBeNull();
  });
});
