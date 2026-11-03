/**
 * Sauvegardes protégées par mot de passe.
 *
 * AES-256-GCM (chiffrement authentifié : un fichier modifié ou un mauvais mot
 * de passe sont détectés), clé dérivée du mot de passe par PBKDF2-SHA256.
 * Bibliothèques @noble, en JavaScript pur et auditées : rien de natif, le
 * même code tourne partout.
 *
 * Sans le mot de passe, une sauvegarde chiffrée est perdue : l'écran le dit.
 */

import { gcm } from '@noble/ciphers/aes';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

const ITERATIONS = 120000;

const utf8Encode = (str) => {
  const out = [];
  for (let i = 0; i < str.length; i += 1) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(i += 1) - 0xdc00);
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
};

const utf8Decode = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let c;
    if (b < 0x80) { c = b; i += 1; }
    else if (b < 0xe0) { c = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2; }
    else if (b < 0xf0) { c = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); i += 3; }
    else {
      c = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      i += 4;
    }
    if (c > 0xffff) {
      c -= 0x10000;
      s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
    } else s += String.fromCharCode(c);
  }
  return s;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const toBase64 = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
};

const fromBase64 = (str) => {
  const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12)
      | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out.push((n >> 16) & 255);
    if (clean[i + 2] !== undefined) out.push((n >> 8) & 255);
    if (clean[i + 3] !== undefined) out.push(n & 255);
  }
  return Uint8Array.from(out);
};

// Version asynchrone : la dérivation rend la main régulièrement, l'écran ne
// se fige pas pendant les quelques secondes de calcul sur téléphone.
const deriveKey = (password, salt, iterations) => pbkdf2Async(sha256, utf8Encode(password), salt, { c: iterations, dkLen: 32 });

export const isEncryptedBackup = (json) => !!json && json.appName === 'Patrimo' && json.encrypted === true;

/**
 * @param {object} backup - sauvegarde Patrimo en clair
 * @param {string} password
 * @param {(n: number) => Uint8Array} randomBytes - aléa cryptographique
 */
export const encryptBackup = async (backup, password, randomBytes) => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = gcm(key, iv).encrypt(utf8Encode(JSON.stringify(backup)));
  return {
    appName: 'Patrimo',
    encrypted: true,
    version: 1,
    exportDate: backup.exportDate,
    kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-256-GCM', iv: toBase64(iv) },
    data: toBase64(data),
  };
};

/** @throws {Error} 'WRONG_PASSWORD' si le mot de passe est faux ou le fichier abîmé */
export const decryptBackup = async (envelope, password) => {
  try {
    const key = await deriveKey(password, fromBase64(envelope.kdf.salt), envelope.kdf.iterations);
    const plain = gcm(key, fromBase64(envelope.cipher.iv)).decrypt(fromBase64(envelope.data));
    return JSON.parse(utf8Decode(plain));
  } catch {
    throw new Error('WRONG_PASSWORD');
  }
};
