/* Cifratura dei segreti salvati sul database (es. le chiavi API di Steam,
 * Google Play... collegate da un'organizzazione).
 *
 * AES-256-GCM con chiave derivata da SESSION_SECRET tramite HKDF: non serve
 * una variabile d'ambiente in piu' da non perdere, ma la chiave usata qui
 * e' comunque distinta da quella delle sessioni (HKDF con un "info" diverso
 * per ogni scopo, non lo stesso segreto riusato due volte).
 *
 * Esporta: cifra(testo) -> stringa da salvare, decifra(valore) -> testo
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const chiave = Buffer.from(
  hkdfSync('sha256', config.sessionSecret, '', 'gamefollow-integration-keys', 32)
);

export function cifra(testoChiaro) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chiave, iv);
  const cifrato = Buffer.concat([cipher.update(testoChiaro, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, cifrato]).toString('base64');
}

export function decifra(valore) {
  const dati = Buffer.from(valore, 'base64');
  const iv = dati.subarray(0, 12);
  const tag = dati.subarray(12, 28);
  const cifrato = dati.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', chiave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrato), decipher.final()]).toString('utf8');
}
