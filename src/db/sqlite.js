/* Implementazione SQLite delle funzioni dichiarate in db/index.js.
 *
 * Usa node:sqlite, il modulo integrato in Node (niente compilazione
 * nativa: su Windows serve altrimenti Visual Studio con il workload C++,
 * che qui non c'e'). E' ancora "experimental" in Node ma l'API e' stabile
 * a sufficienza per un singolo processo con volumi bassi/medi. Se in futuro
 * si preferisce better-sqlite3, questo e' l'unico file da riscrivere.
 *
 * Regola non negoziabile: ogni query su dati di un cliente ha org_id
 * nella WHERE. Query sempre preparate, mai stringhe concatenate.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { cifra, decifra } from '../services/secrets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

function getDb() {
  if (!db) throw new Error('Database non inizializzato: chiama init() prima di usarlo.');
  return db;
}

function mapOrg(row) {
  if (!row) return undefined;
  return { ...row, google_connected: !!row.google_connected, auto_send: !!row.auto_send };
}

// Non c'e' un vero sistema di migrazioni (il progetto e' ancora in
// sviluppo, il database si e' sempre potuto ricreare da zero con
// src/db/seed.js) — ma cancellare data/app.db richiede accesso esclusivo
// al file, che non sempre c'e' (es. il server e' gia' in esecuzione da
// qualche altra parte). Per le colonne aggiunte DOPO la prima versione
// dello schema, quindi, si controlla se mancano e si aggiungono con
// ALTER TABLE — CREATE TABLE IF NOT EXISTS da solo non le aggiungerebbe
// mai a un database che esiste gia'. Idempotente: si puo' chiamare a ogni
// avvio senza problemi.
function applicaMigrazioniColonne() {
  const colonneReviews = db.prepare("PRAGMA table_info(reviews)").all().map((c) => c.name);
  if (!colonneReviews.includes('platform')) {
    db.exec("ALTER TABLE reviews ADD COLUMN platform TEXT DEFAULT 'steam'");
  }
}

export async function init() {
  const filePath = path.resolve(config.sqliteFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  db.exec('PRAGMA journal_mode = WAL');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  applicaMigrazioniColonne();
}

export async function findUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export async function findOrgById(orgId) {
  return mapOrg(getDb().prepare('SELECT * FROM organizations WHERE id = ?').get(orgId));
}

export async function updateOrg(orgId, campi) {
  const consentiti = ['name', 'plan', 'plan_status', 'tone', 'auto_send', 'google_connected', 'stripe_customer_id', 'stripe_subscription_id', 'current_period_end'];
  const chiavi = Object.keys(campi).filter((k) => consentiti.includes(k));
  if (chiavi.length > 0) {
    const setClause = chiavi.map((k) => `${k} = ?`).join(', ');
    const valori = chiavi.map((k) => (typeof campi[k] === 'boolean' ? (campi[k] ? 1 : 0) : campi[k]));
    getDb().prepare(`UPDATE organizations SET ${setClause} WHERE id = ?`).run(...valori, orgId);
  }
  return findOrgById(orgId);
}

export async function listReviews(orgId, { status } = {}) {
  if (status) {
    return getDb()
      .prepare('SELECT * FROM reviews WHERE org_id = ? AND status = ? ORDER BY review_date DESC')
      .all(orgId, status);
  }
  return getDb()
    .prepare('SELECT * FROM reviews WHERE org_id = ? ORDER BY review_date DESC')
    .all(orgId);
}

export async function getReview(orgId, id) {
  return getDb().prepare('SELECT * FROM reviews WHERE org_id = ? AND id = ?').get(orgId, id);
}

export async function updateReview(orgId, id, campi) {
  const consentiti = ['status', 'draft_reply', 'published_reply'];
  const chiavi = Object.keys(campi).filter((k) => consentiti.includes(k));
  if (chiavi.length === 0) return getReview(orgId, id);

  const setClause = chiavi.map((k) => `${k} = ?`).join(', ');
  const valori = chiavi.map((k) => campi[k]);
  const risultato = getDb()
    .prepare(`UPDATE reviews SET ${setClause} WHERE org_id = ? AND id = ?`)
    .run(...valori, orgId, id);

  if (risultato.changes === 0) return undefined;
  return getReview(orgId, id);
}

export async function insertReview(orgId, recensione) {
  const { author, rating, text, review_date, platform } = recensione;
  const risultato = getDb()
    .prepare('INSERT INTO reviews (org_id, author, rating, text, review_date, platform) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orgId, author, rating, text ?? null, review_date, platform ?? 'steam');
  return getReview(orgId, risultato.lastInsertRowid);
}

// Recensioni scaricate nel mese solare in corso, per far rispettare il
// limite recensioni_mese del piano (vedi middleware/piano.js). created_at
// e' quando la recensione e' entrata nel nostro database (il sync), non
// review_date (quando e' stata scritta su Steam/etc.) — cosi' il limite
// misura davvero "quante ne abbiamo scaricate noi questo mese", coerente
// col motivo per cui il limite esiste (costo delle chiamate AI/di sync).
export async function contaRecensioniMese(orgId) {
  const riga = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM reviews
       WHERE org_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )
    .get(orgId);
  return riga.n;
}

export async function stats(orgId) {
  const conteggi = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM reviews WHERE org_id = ? GROUP BY status')
    .all(orgId);
  const media = getDb()
    .prepare('SELECT AVG(rating) AS m FROM reviews WHERE org_id = ?')
    .get(orgId);

  const base = { da_generare: 0, da_approvare: 0, pubblicata: 0, ignorata: 0 };
  conteggi.forEach((riga) => { base[riga.status] = riga.n; });
  const totale = Object.values(base).reduce((a, b) => a + b, 0);

  return { ...base, totale, media_voto: media.m ? Number(media.m.toFixed(2)) : 0 };
}

export async function listIntegrations(orgId) {
  return getDb()
    .prepare('SELECT provider, connected, connected_at, api_key_hint FROM integrations WHERE org_id = ?')
    .all(orgId)
    .map((riga) => ({ ...riga, connected: !!riga.connected }));
}

export async function setIntegration(orgId, provider, connected, apiKeyChiaro = null) {
  const connectedAt = connected ? new Date().toISOString() : null;
  const apiKeyCifrata = connected && apiKeyChiaro ? cifra(apiKeyChiaro) : null;
  const apiKeyHint = connected && apiKeyChiaro ? apiKeyChiaro.slice(-4) : null;

  getDb()
    .prepare(
      `INSERT INTO integrations (org_id, provider, connected, connected_at, api_key, api_key_hint)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (org_id, provider) DO UPDATE SET
         connected = excluded.connected,
         connected_at = excluded.connected_at,
         api_key = excluded.api_key,
         api_key_hint = excluded.api_key_hint`
    )
    .run(orgId, provider, connected ? 1 : 0, connectedAt, apiKeyCifrata, apiKeyHint);

  return { provider, connected, connected_at: connectedAt, api_key_hint: apiKeyHint };
}

// Per uso futuro: quando un'integrazione a chiave API fara' davvero
// chiamate esterne (es. sync recensioni Steam), il servizio chiamera'
// questa funzione per recuperare la chiave in chiaro. Nessuna route la usa
// ancora — nessun endpoint restituisce mai la chiave al frontend.
export async function getIntegrationSecret(orgId, provider) {
  const riga = getDb()
    .prepare('SELECT api_key FROM integrations WHERE org_id = ? AND provider = ? AND connected = 1')
    .get(orgId, provider);
  return riga?.api_key ? decifra(riga.api_key) : undefined;
}

export async function findOrgByStripeCustomerId(stripeCustomerId) {
  return mapOrg(
    getDb().prepare('SELECT * FROM organizations WHERE stripe_customer_id = ?').get(stripeCustomerId)
  );
}

// ON CONFLICT DO NOTHING sull'id evento Stripe: se lo stesso webhook arriva
// due volte (Stripe ritenta in caso di rete lenta), la seconda scrittura
// e' un no-op invece di duplicare la transazione.
export async function insertPayment(orgId, pagamento) {
  const { stripe_event_id, stripe_invoice_id, plan, amount_cents, currency, status } = pagamento;
  getDb()
    .prepare(
      `INSERT INTO payments (org_id, stripe_event_id, stripe_invoice_id, plan, amount_cents, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (stripe_event_id) DO NOTHING`
    )
    .run(orgId, stripe_event_id, stripe_invoice_id ?? null, plan, amount_cents, currency ?? 'eur', status);
}

export async function listPayments(orgId) {
  return getDb()
    .prepare('SELECT * FROM payments WHERE org_id = ? ORDER BY created_at DESC')
    .all(orgId);
}
