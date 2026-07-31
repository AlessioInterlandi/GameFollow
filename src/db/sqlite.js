/* Implementazione SQLite delle funzioni dichiarate in db/index.js.
 *
 * Da fare:
 * - init(): crea la cartella data/, apre il file, esegue schema.sql
 * - le funzioni di lettura e scrittura, tutte con query preparate
 *
 * Regola non negoziabile: ogni query su dati di un cliente deve avere
 * org_id nella WHERE. Anche quando sembra superfluo.
 *   SELECT * FROM reviews WHERE org_id = ? AND id = ?
 * Se dimentichi org_id anche in un solo punto, un cliente puo' leggere
 * i dati di un altro.
 *
 * Usa sempre query preparate con i parametri (?), mai stringhe concatenate:
 * e' quello che ti protegge dalle SQL injection.
 */
