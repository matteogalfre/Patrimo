import { normalizeNumber, parseNumber } from '../parseNumber';

describe('lecture des nombres saisis', () => {
  test('les deux séparateurs : le dernier est la décimale', () => {
    expect(parseNumber('1,234.56', 'fr-FR')).toBe(1234.56);
    expect(parseNumber('1.234,56', 'en-US')).toBe(1234.56);
    expect(parseNumber('1 234,56', 'fr-FR')).toBe(1234.56);
    expect(parseNumber('1 234,56', 'fr-FR')).toBe(1234.56);
  });

  test('une virgule seule : décimale en français, milliers en anglais', () => {
    expect(parseNumber('1,5', 'fr-FR')).toBe(1.5);
    expect(parseNumber('1,500', 'fr-FR')).toBe(1.5);
    expect(parseNumber('1,000', 'en-US')).toBe(1000);
    expect(parseNumber('1,5', 'en-US')).toBe(1.5);
    expect(parseNumber('0,500', 'en-US')).toBe(0.5);
  });

  test('un point seul : décimale, sauf milliers en allemand', () => {
    expect(parseNumber('12.5', 'fr-FR')).toBe(12.5);
    expect(parseNumber('1.500', 'de-DE')).toBe(1500);
    expect(parseNumber('0.123', 'de-DE')).toBe(0.123);
    expect(parseNumber('1.000.000', 'fr-FR')).toBe(1000000);
  });

  test('vide, invalide, négatif', () => {
    expect(parseNumber('', 'fr-FR')).toBeNull();
    expect(parseNumber('  ', 'fr-FR')).toBeNull();
    expect(parseNumber('abc', 'fr-FR')).toBeNaN();
    expect(parseNumber('-3,2', 'fr-FR')).toBe(-3.2);
    expect(normalizeNumber(42)).toBe('42');
  });
});
