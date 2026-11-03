import { randomBytes } from 'crypto';
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../backupCrypto';

const rnd = (n) => Uint8Array.from(randomBytes(n));
const backup = { appName: 'Patrimo', exportDate: '2026-11-03', data: { transactions: [{ id: 'a', name: 'Société Générale 📈', quantity: 1.5 }] } };

describe('sauvegardes chiffrées', () => {
  test('aller-retour avec le bon mot de passe, accents et emoji compris', async () => {
    const env = await encryptBackup(backup, 'mot de passe €', rnd);
    expect(isEncryptedBackup(env)).toBe(true);
    expect(JSON.stringify(env)).not.toContain('Société');
    await expect(decryptBackup(env, 'mot de passe €')).resolves.toEqual(backup);
  });

  test('mauvais mot de passe ou fichier modifié : refusé', async () => {
    const env = await encryptBackup(backup, 'secret', rnd);
    await expect(decryptBackup(env, 'Secret')).rejects.toThrow('WRONG_PASSWORD');
    const tampered = { ...env, data: env.data.slice(0, -6) + 'AAAAAA' };
    await expect(decryptBackup(tampered, 'secret')).rejects.toThrow('WRONG_PASSWORD');
  });

  test('deux chiffrements du même fichier ne se ressemblent pas', async () => {
    const [a, b] = await Promise.all([encryptBackup(backup, 'x', rnd), encryptBackup(backup, 'x', rnd)]);
    expect(a.data).not.toBe(b.data);
  });
});
