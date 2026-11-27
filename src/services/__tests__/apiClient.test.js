import { retryAfterMs } from '../apiClient';

describe('Retry-After', () => {
  test('secondes ou date HTTP, bornées à 10 s', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs('3600')).toBe(10000);
    const now = Date.parse('2026-11-27T10:00:00Z');
    expect(retryAfterMs('Fri, 27 Nov 2026 10:00:05 GMT', now)).toBe(5000);
    expect(retryAfterMs('Fri, 27 Nov 2026 09:00:00 GMT', now)).toBe(0);
  });

  test('absent ou illisible : délai par défaut', () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('n’importe quoi')).toBeNull();
  });
});
