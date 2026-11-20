import { findInstitution, institutionLogoUrl, normalizeName, searchInstitutions } from '../institutions';

describe('banques et courtiers', () => {
  test('reconnus quelle que soit la façon de les écrire', () => {
    expect(normalizeName("Caisse d'Épargne")).toBe('caisse d epargne');
    expect(findInstitution('SG').id).toBe('sg');
    expect(findInstitution('Société Générale').id).toBe('sg');
    expect(findInstitution('revolut').id).toBe('revolut');
    expect(findInstitution('Boursorama').id).toBe('bourso');
    expect(findInstitution('Ma petite banque')).toBeNull();
  });

  test('suggestions en cours de saisie, par type', () => {
    // Le début du nom d'abord, puis ce qui le contient (EasyBourse).
    expect(searchInstitutions('bour').map((i) => i.id)).toEqual(['bourso', 'boursedirect', 'easybourse']);
    expect(searchInstitutions('', { types: ['crypto'], limit: 3 }).map((i) => i.id)).toEqual(['binance', 'kraken', 'coinbase']);
  });

  test('logo par domaine, rien sans domaine fiable', () => {
    expect(institutionLogoUrl(findInstitution('Revolut'))).toContain('domain=revolut.com');
    expect(institutionLogoUrl(findInstitution('Bourse Direct'))).toContain('domain=www.boursedirect.fr');
    // Spirica n'a pas de logo exploitable : ses initiales s'affichent.
    expect(institutionLogoUrl(findInstitution('Spirica'))).toBeNull();
  });
});
