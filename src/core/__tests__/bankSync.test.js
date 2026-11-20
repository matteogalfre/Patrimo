import {
  accountName,
  dueAccounts,
  isCardAccount,
  kindFromAccount,
  linkStatus,
  matchInstitution,
  needsAutoSync,
  nextSyncAt,
  pickBalance,
  SYNC_INTERVAL_MS,
  suggestTarget,
  uniqueName,
  validUntil,
} from '../bankSync';

const NOW = new Date('2026-11-05T10:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;

describe('pickBalance', () => {
  it('préfère le solde comptable du jour au disponible avec découvert', () => {
    const b = pickBalance([
      { balanceAmount: { amount: '2500.00', currency: 'EUR' }, balanceType: 'interimAvailable', creditLimitIncluded: true },
      { balanceAmount: { amount: '1234.567', currency: 'eur' }, balanceType: 'closingBooked', referenceDate: '2026-11-04' },
    ]);
    expect(b).toEqual({ amount: 1234.57, currency: 'EUR', type: 'closingBooked', date: '2026-11-04' });
  });

  it('prend le disponible quand il est seul, et ignore les montants illisibles', () => {
    expect(pickBalance([
      { balanceAmount: { amount: 'abc', currency: 'EUR' }, balanceType: 'expected' },
      { balanceAmount: { amount: '-42.1', currency: 'EUR' }, balanceType: 'interimAvailable' },
    ]).amount).toBe(-42.1);
    expect(pickBalance([])).toBeNull();
    expect(pickBalance(undefined)).toBeNull();
  });
});

describe('kindFromAccount', () => {
  it.each([
    [{ product: 'LIVRET A' }, 'livretA'],
    [{ name: 'Livret Jeune' }, 'livretJeune'],
    [{ product: 'Livret de Développement Durable et Solidaire' }, 'ldds'],
    [{ product: "Livret d'Épargne Populaire" }, 'lep'],
    [{ product: "Plan d'Épargne Logement" }, 'pel'],
    [{ product: 'CEL' }, 'cel'],
    [{ product: 'Compte Chèques', cashAccountType: 'CACC' }, 'current'],
    [{ name: 'Main', cashAccountType: 'CACC' }, 'current'],
    [{ name: 'Coffre vacances', cashAccountType: 'SVGS' }, 'other'],
  ])('%o → %s', (account, kind) => {
    expect(kindFromAccount(account)).toBe(kind);
  });
});

describe('isCardAccount', () => {
  it('reconnaît une carte à débit différé', () => {
    expect(isCardAccount({ cashAccountType: 'CARD' })).toBe(true);
    expect(isCardAccount({ name: 'CB VISA PREMIER' })).toBe(true);
    expect(isCardAccount({ product: 'Compte Chèques', cashAccountType: 'CACC' })).toBe(false);
    expect(isCardAccount({ product: 'Compte joint' })).toBe(false);
  });
});

describe('accountName', () => {
  it('garde le nom du produit, jamais un IBAN', () => {
    expect(accountName({ product: 'Compte Sobrio' })).toBe('Compte Sobrio');
    expect(accountName({ name: 'FR76 3000 6000 0112 3456 7890 189' }, { institutionName: 'SG', kindLabel: 'Compte courant' }))
      .toBe('Compte courant · SG');
  });

  it('numérote un nom déjà pris', () => {
    expect(uniqueName('Livret A', ['Livret A', 'livret a 2'])).toBe('Livret A 3');
    expect(uniqueName('Livret A', ['LDDS'])).toBe('Livret A');
  });
});

describe('matchInstitution', () => {
  it.each([
    ['Société Générale', 'sg'],
    ['Crédit Agricole Alpes Provence', 'ca'],
    ["Caisse d'Epargne Ile de France", 'ce'],
    ['BRED Banque Populaire', 'bred'],
    ['Crédit Mutuel de Bretagne', 'arkea'],
    ['Revolut', 'revolut'],
    ['Boursorama', 'bourso'],
    ['Banque Inconnue', null],
  ])('%s → %s', (name, id) => {
    expect(matchInstitution(name)).toBe(id);
  });
});

describe('accord et quota', () => {
  const link = (over = {}) => ({
    status: 'linked',
    validUntil: new Date(NOW + 60 * 24 * HOUR).toISOString(),
    accounts: [
      { id: 'a', cashId: 'cash_1', lastSync: new Date(NOW - 7 * HOUR).toISOString() },
      { id: 'b', cashId: 'cash_2', lastSync: new Date(NOW - 2 * HOUR).toISOString() },
      { id: 'c', cashId: null },
    ],
    ...over,
  });

  it('statut selon la date de fin', () => {
    expect(linkStatus(link(), NOW)).toBe('ok');
    expect(linkStatus(link({ validUntil: new Date(NOW + 5 * 24 * HOUR).toISOString() }), NOW)).toBe('expiring');
    expect(linkStatus(link({ validUntil: new Date(NOW - HOUR).toISOString() }), NOW)).toBe('expired');
    expect(linkStatus(link({ status: 'pending' }), NOW)).toBe('pending');
    expect(validUntil('2026-11-05T00:00:00.000Z', 90)).toBe('2027-02-03T00:00:00.000Z');
  });

  it('une lecture toutes les 6 h par compte au plus', () => {
    expect(dueAccounts(link(), NOW).map((a) => a.id)).toEqual(['a']);
    expect(nextSyncAt({ lastSync: new Date(NOW).toISOString() })).toBe(NOW + SYNC_INTERVAL_MS);
    expect(nextSyncAt({ blockedUntil: new Date(NOW + 20 * HOUR).toISOString() })).toBe(NOW + 20 * HOUR);
    expect(dueAccounts(link({ status: 'expired' }), NOW)).toEqual([]);
  });

  it('relecture automatique seulement après 12 h', () => {
    expect(needsAutoSync([link()], NOW)).toBe(false);
    const old = link();
    old.accounts[0].lastSync = new Date(NOW - 13 * HOUR).toISOString();
    expect(needsAutoSync([old], NOW)).toBe(true);
  });
});

describe('suggestTarget', () => {
  const cash = [
    { id: 'c1', kind: 'current', currency: 'EUR', institution: 'sg' },
    { id: 'c2', kind: 'livretA', currency: 'EUR', institution: 'sg' },
    { id: 'c3', kind: 'current', currency: 'EUR', institution: 'revolut' },
  ];

  it("propose le compte existant de la même banque et du même type", () => {
    expect(suggestTarget({ kind: 'current', currency: 'EUR', institution: 'sg' }, cash)).toBe('c1');
    expect(suggestTarget({ kind: 'current', currency: 'EUR', institution: 'sg' }, cash, ['c1'])).toBeNull();
    expect(suggestTarget({ kind: 'ldds', currency: 'EUR', institution: 'sg' }, cash)).toBeNull();
  });
});
