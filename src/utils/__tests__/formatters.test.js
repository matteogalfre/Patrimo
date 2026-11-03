import { formatPercent, formatCryptoAmount, formatDate } from '../formatters';

describe('formatPercent', () => {
  it('formats positive percentages with sign', () => {
    expect(formatPercent(25.5)).toBe('+25.5%');
  });

  it('formats negative percentages', () => {
    expect(formatPercent(-10.3)).toBe('-10.3%');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('handles non-finite values', () => {
    expect(formatPercent(NaN)).toBe('0%');
    expect(formatPercent(Infinity)).toBe('0%');
  });

  it('respects decimals option', () => {
    expect(formatPercent(25.556, { decimals: 2 })).toBe('+25.56%');
  });

  it('hides sign when showSign is false', () => {
    expect(formatPercent(25.5, { showSign: false })).toBe('25.5%');
  });
});

describe('formatCryptoAmount', () => {
  it('formats amounts as numbers', () => {
    const result = formatCryptoAmount(0.5, 'BTC');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('handles zero amounts', () => {
    const result = formatCryptoAmount(0, 'ETH');
    expect(result).toBeDefined();
  });

  it('handles non-finite values', () => {
    expect(formatCryptoAmount(NaN, 'BTC')).toBe('0');
    expect(formatCryptoAmount(Infinity, 'BTC')).toBe('0');
  });
});

describe('formatDate', () => {
  it('écrit « 1er » pour le premier du mois en français, pas ailleurs', () => {
    expect(formatDate(new Date(2026, 7, 1, 12), { locale: 'fr-FR' })).toBe('1er août 2026');
    expect(formatDate(new Date(2026, 7, 11, 12), { locale: 'fr-FR' })).toBe('11 août 2026');
    expect(formatDate(new Date(2026, 7, 1, 12), { locale: 'en-GB' })).toBe('1 Aug 2026');
  });
});
