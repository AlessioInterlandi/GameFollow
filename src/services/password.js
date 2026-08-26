/* Hashing delle password.
 *
 * scrypt del modulo crypto di Node, nessuna dipendenza esterna.
 * Formato salvato: "salt:hash" (entrambi hex, salt casuale per ogni utente).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEY_LEN = 64;

export async function hash(password) {
  const salt = randomBytes(16).toString('hex');
  const derivata = await scrypt(password, salt, KEY_LEN);
  return `${salt}:${derivata.toString('hex')}`;
}

export async function verify(password, salvata) {
  const [salt, hashHex] = String(salvata ?? '').split(':');
  if (!salt || !hashHex) return false;

  const derivata = await scrypt(password, salt, KEY_LEN);
  const memorizzata = Buffer.from(hashHex, 'hex');
  if (derivata.length !== memorizzata.length) return false;

  return timingSafeEqual(derivata, memorizzata);
}
