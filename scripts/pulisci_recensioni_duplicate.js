/* Rimuove le recensioni finte duplicate generate dal bug (ormai corretto)
 * in src/services/google.js: stesso autore + stesso testo ripetuti con
 * voti diversi/contraddittori nella stessa organizzazione.
 *
 * Va lanciato UNA TANTUM, in locale, con node (non tramite il bridge
 * remoto: l'accesso al file .db via cartella condivisa da' "disk I/O
 * error", soprattutto col server acceso).
 *
 * Sicurezza:
 * - tocca SOLO recensioni ancora in stato 'da_generare' (mai aperte/
 *   risposte), quindi nessun lavoro fatto a mano viene toccato
 * - di default e' un dry-run: stampa cosa cancellerebbe senza cancellare
 *   nulla. Rilancia con --apply per applicare davvero.
 *
 * Uso:
 *   node scripts/pulisci_recensioni_duplicate.js            (dry-run)
 *   node scripts/pulisci_recensioni_duplicate.js --apply     (applica)
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'data', 'app.db');
const applica = process.argv.includes('--apply');

const db = new DatabaseSync(dbPath);

const duplicati = db.prepare(`
  SELECT id, org_id, author, text, rating, status
  FROM reviews
  WHERE status = 'da_generare'
    AND id NOT IN (
      SELECT MIN(id) FROM reviews
      WHERE status = 'da_generare'
      GROUP BY org_id, author, text
    )
  ORDER BY org_id, author, text, id
`).all();

if (duplicati.length === 0) {
  console.log('Nessuna recensione duplicata trovata (solo tra quelle mai aperte/risposte).');
  process.exit(0);
}

console.log(`Trovate ${duplicati.length} recensioni duplicate da rimuovere (autore+testo ripetuti, stato ancora "da_generare"):\n`);
for (const r of duplicati) {
  console.log(`  #${r.id}  org ${r.org_id}  ${r.author}  ${r.rating}★  "${(r.text ?? '(nessun testo)').slice(0, 60)}"`);
}

if (!applica) {
  console.log('\nQuesto era un dry-run: nessuna riga cancellata. Rilancia con --apply per applicare davvero.');
  process.exit(0);
}

const cancella = db.prepare('DELETE FROM reviews WHERE id = ?');
db.exec('BEGIN');
for (const r of duplicati) cancella.run(r.id);
db.exec('COMMIT');

console.log(`\nFatto: ${duplicati.length} recensioni duplicate cancellate.`);
