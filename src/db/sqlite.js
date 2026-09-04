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

  // Lingua del sito (selettore in Impostazioni -> App settings): 'it' come
  // default per gli account che esistevano gia' prima di questa colonna,
  // coerente con l'unica lingua che il sito parlava finora.
  const colonneOrg = db.prepare("PRAGMA table_info(organizations)").all().map((c) => c.name);
  if (!colonneOrg.includes('language')) {
    db.exec("ALTER TABLE organizations ADD COLUMN language TEXT NOT NULL DEFAULT 'it'");
  }

  const colonneUsers = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!colonneUsers.includes('email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
    db.exec('ALTER TABLE users ADD COLUMN verify_token_hash TEXT');
    db.exec('ALTER TABLE users ADD COLUMN verify_token_expires TEXT');

    // Queste colonne sono appena nate: ogni utente che esiste GIA' a
    // questo punto e' un account creato a mano (o dal seed) prima che
    // esistesse la registrazione self-service — va trattato come gia'
    // verificato, altrimenti chi ha gia' un account smetterebbe di colpo
    // di poter fare login. Solo gli account creati DA QUI IN AVANTI con
    // POST /register nascono con email_verified_at = NULL per davvero.
    db.exec("UPDATE users SET email_verified_at = datetime('now') WHERE email_verified_at IS NULL");
  }

  // Team/ruoli: stesso principio di sopra. Il DEFAULT 'owner' della ADD
  // COLUMN si applica gia' da solo a ogni riga esistente (SQLite lo scrive
  // per davvero, non lo calcola al volo) — ogni utente che c'era gia' prima
  // di questa colonna aveva gia' accesso completo, resta cosi'.
  if (!colonneUsers.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor', 'viewer'))");
    db.exec('ALTER TABLE users ADD COLUMN invited_by_user_id INTEGER REFERENCES users(id)');
    db.exec('ALTER TABLE users ADD COLUMN invite_token_hash TEXT');
    db.exec('ALTER TABLE users ADD COLUMN invite_token_expires TEXT');
  }
}

// Multi-gioco: games e' una tabella nuova (creata direttamente da
// CREATE TABLE IF NOT EXISTS in schema.sql su ogni avvio), ma reviews e
// integrations esistevano gia' prima — servono le stesse ALTER TABLE
// idempotenti di applicaMigrazioniColonne() sopra, piu' un backfill che
// una semplice ADD COLUMN non puo' fare da sola: dare un gioco di default
// a ogni organizzazione che non ne ha ancora nessuno, poi assegnargli le
// righe orfane. Per integrations, il vincolo UNIQUE(org_id, provider) deve
// diventare UNIQUE(org_id, game_id, provider): SQLite non permette di
// modificare un vincolo UNIQUE con ALTER TABLE, quindi l'unico modo e'
// ricreare la tabella (rinomina, ricrea con lo schema nuovo, ricopia i
// dati, elimina la vecchia) — pattern standard SQLite per questo caso,
// eseguito solo la prima volta (idempotente: la seconda esecuzione trova
// gia' la colonna e salta tutto il blocco).
function applicaMigrazioneGiochi() {
  // Un gioco di default per ogni organizzazione che esisteva gia' prima di
  // questa tabella: le organizzazioni create da qui in avanti lo ricevono
  // direttamente da creaOrganizzazioneEUtente, quindi qui non trovano piu'
  // righe da questo punto in avanti.
  const orgSenzaGiochi = db
    .prepare(
      `SELECT o.id FROM organizations o
       WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.org_id = o.id)`
    )
    .all();
  for (const { id: orgId } of orgSenzaGiochi) {
    db.prepare('INSERT INTO games (org_id, name) VALUES (?, ?)').run(orgId, 'My first game');
  }

  const colonneReviews = db.prepare("PRAGMA table_info(reviews)").all().map((c) => c.name);
  if (!colonneReviews.includes('game_id')) {
    db.exec('ALTER TABLE reviews ADD COLUMN game_id INTEGER REFERENCES games(id)');
  }
  // Sempre (non solo alla prima esecuzione): copre sia il backfill iniziale
  // sia il caso limite di una recensione rimasta senza game_id per qualche
  // motivo — no-op non appena tutte le righe ce l'hanno gia'.
  db.exec(`
    UPDATE reviews SET game_id = (
      SELECT MIN(g.id) FROM games g WHERE g.org_id = reviews.org_id
    ) WHERE game_id IS NULL
  `);
  // Questo indice non sta in schema.sql apposta (vedi il commento li'): la
  // colonna e' garantita esistere solo da qui in poi, su database sia
  // nuovi che vecchi.
  db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_org_game ON reviews (org_id, game_id)');

  const colonneIntegrations = db.prepare("PRAGMA table_info(integrations)").all().map((c) => c.name);
  if (!colonneIntegrations.includes('game_id')) {
    db.exec('ALTER TABLE integrations ADD COLUMN game_id INTEGER REFERENCES games(id)');
    db.exec(`
      UPDATE integrations SET game_id = (
        SELECT MIN(g.id) FROM games g WHERE g.org_id = integrations.org_id
      ) WHERE game_id IS NULL
    `);

    db.exec('ALTER TABLE integrations RENAME TO integrations_old');
    db.exec(`
      CREATE TABLE integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          org_id INTEGER NOT NULL REFERENCES organizations(id),
          game_id INTEGER REFERENCES games(id),
          provider TEXT NOT NULL,
          connected INTEGER NOT NULL DEFAULT 0,
          connected_at TEXT,
          api_key TEXT,
          api_key_hint TEXT,
          UNIQUE (org_id, game_id, provider)
      )
    `);
    db.exec(`
      INSERT INTO integrations (id, org_id, game_id, provider, connected, connected_at, api_key, api_key_hint)
      SELECT id, org_id, game_id, provider, connected, connected_at, api_key, api_key_hint FROM integrations_old
    `);
    db.exec('DROP TABLE integrations_old');
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
  applicaMigrazioneGiochi();
}

export async function findUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export async function findOrgById(orgId) {
  return mapOrg(getDb().prepare('SELECT * FROM organizations WHERE id = ?').get(orgId));
}

// Registrazione self-service: crea l'organizzazione E il suo primo utente
// (owner) in una singola transazione — o nascono entrambi, o non nasce
// nessuno dei due, mai un'organizzazione orfana senza utenti se qualcosa
// va storto a meta'. Il piano parte 'gratis' (default di schema.sql).
export async function creaOrganizzazioneEUtente({ nomeOrg, email, passwordHash, verifyTokenHash, verifyTokenExpires }) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const org = database
      .prepare('INSERT INTO organizations (name) VALUES (?)')
      .run(nomeOrg);
    const utente = database
      .prepare(
        `INSERT INTO users (org_id, email, password_hash, verify_token_hash, verify_token_expires)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(org.lastInsertRowid, email, passwordHash, verifyTokenHash, verifyTokenExpires);
    // Ogni organizzazione nasce con un gioco di default: senza, il menu a
    // tendina in alto non avrebbe nulla da mostrare al primo accesso.
    // L'utente puo' rinominarlo o aggiungerne altri in seguito (secondo il
    // limite del proprio piano).
    const gioco = database
      .prepare('INSERT INTO games (org_id, name) VALUES (?, ?)')
      .run(org.lastInsertRowid, 'My first game');
    database.exec('COMMIT');

    return {
      org: await findOrgById(org.lastInsertRowid),
      user: database.prepare('SELECT * FROM users WHERE id = ?').get(utente.lastInsertRowid),
      gioco: database.prepare('SELECT * FROM games WHERE id = ?').get(gioco.lastInsertRowid),
    };
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

// listGames/createGame/findGameById: nessun controllo di limite qui dentro
// apposta (stesso principio di insertReview/setIntegration) — il conteggio
// e il confronto col piano li fa la route (routes/games.js), che gia' ha
// in mano org e verificaLimite().
export async function listGames(orgId) {
  return getDb()
    .prepare('SELECT * FROM games WHERE org_id = ? ORDER BY id ASC')
    .all(orgId);
}

export async function createGame(orgId, name) {
  const risultato = getDb()
    .prepare('INSERT INTO games (org_id, name) VALUES (?, ?)')
    .run(orgId, name);
  return getDb().prepare('SELECT * FROM games WHERE id = ?').get(risultato.lastInsertRowid);
}

export async function findGameById(orgId, id) {
  return getDb().prepare('SELECT * FROM games WHERE org_id = ? AND id = ?').get(orgId, id);
}

// token in chiaro -> SHA-256 -> confrontato con verify_token_hash: vedi
// routes/auth.js per come viene calcolato l'hash da confrontare. La
// scadenza si controlla direttamente nella WHERE: un token scaduto non
// fa match, stessa risposta "link non valido" di un token sbagliato.
//
// datetime(...) su ENTRAMBI i lati del confronto, non solo su 'now': il
// valore salvato arriva da new Date().toISOString() in JS ("2026-08-31T09:34:59.368Z"),
// mentre datetime('now') di SQLite produce "2026-08-31 09:35:00" (spazio,
// niente millisecondi/Z). Confrontati come stringhe pure, senza normalizzarli
// entrambi, ' ' (spazio) < 'T' nell'ordine ASCII: un token scaduto da anni
// risulterebbe SEMPRE "maggiore" del now e non scadrebbe mai. Verificato
// con un test dedicato prima di questa correzione.
export async function trovaUtentePerTokenVerifica(tokenHash) {
  return getDb()
    .prepare(
      `SELECT * FROM users
       WHERE verify_token_hash = ? AND datetime(verify_token_expires) > datetime('now')`
    )
    .get(tokenHash);
}

export async function impostaEmailVerificata(userId) {
  getDb()
    .prepare(
      `UPDATE users SET email_verified_at = datetime('now'), verify_token_hash = NULL, verify_token_expires = NULL
       WHERE id = ?`
    )
    .run(userId);
}

// Usata sia dalla registrazione (primo invio) sia da "rinvia email di
// verifica": genera sempre un token nuovo, quello vecchio smette subito
// di funzionare (un solo link valido alla volta).
export async function impostaNuovoTokenVerifica(userId, tokenHash, scadenza) {
  getDb()
    .prepare('UPDATE users SET verify_token_hash = ?, verify_token_expires = ? WHERE id = ?')
    .run(tokenHash, scadenza, userId);
}

// Team members: elenco di TUTTI gli utenti di un'organizzazione (attivi e
// invitati non ancora accettati), per la pagina Settings -> Team members.
// Mai la password_hash (nemmeno cifrata/segnaposto): questa funzione
// alimenta direttamente una risposta HTTP.
export async function listOrgUsers(orgId) {
  return getDb()
    .prepare(
      `SELECT id, email, role, email_verified_at, invite_token_expires, created_at
       FROM users WHERE org_id = ? ORDER BY created_at ASC`
    )
    .all(orgId);
}

// Scoped come findGameById/getReview: org_id nella WHERE, cosi' un id
// preso a caso non permette mai di leggere/modificare l'utente di
// un'altra organizzazione.
export async function findUserById(orgId, id) {
  return getDb().prepare('SELECT * FROM users WHERE org_id = ? AND id = ?').get(orgId, id);
}

// Crea la riga "invitata": password_hash e' un segnaposto INUTILIZZABILE
// (vedi routes/team.js su come viene generato — hash di byte casuali, mai
// comunicato a nessuno), sovrascritto per davvero solo quando la persona
// invitata accetta e sceglie la propria password (accettaInvito sotto).
// email_verified_at resta NULL: e' quello che fa apparire "Invited" nella
// pagina Team members e blocca il login finche' l'invito non e' accettato,
// stesso principio della registrazione self-service.
export async function creaInvito({ orgId, email, role, invitedByUserId, passwordHashSegnaposto, tokenHash, tokenExpires }) {
  const risultato = getDb()
    .prepare(
      `INSERT INTO users (org_id, email, password_hash, role, invited_by_user_id, invite_token_hash, invite_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(orgId, email, passwordHashSegnaposto, role, invitedByUserId, tokenHash, tokenExpires);
  return getDb().prepare('SELECT id, org_id, email, role, created_at FROM users WHERE id = ?').get(risultato.lastInsertRowid);
}

// Token in chiaro -> SHA-256 -> confrontato con invite_token_hash, stesso
// principio (e stessa insidia sul confronto testuale delle date, vedi il
// commento su trovaUtentePerTokenVerifica) di verifica email. In piu':
// email_verified_at deve essere ancora NULL, altrimenti un link di invito
// gia' usato una volta (per esempio ricevuto due volte per errore)
// resterebbe valido per sempre invece di scadere alla prima accettazione.
export async function trovaUtentePerTokenInvito(tokenHash) {
  return getDb()
    .prepare(
      `SELECT * FROM users
       WHERE invite_token_hash = ? AND email_verified_at IS NULL
         AND datetime(invite_token_expires) > datetime('now')`
    )
    .get(tokenHash);
}

// "Rinvia invito": stesso principio di impostaNuovoTokenVerifica, un
// token nuovo invalida subito quello vecchio.
export async function impostaNuovoTokenInvito(userId, tokenHash, scadenza) {
  getDb()
    .prepare('UPDATE users SET invite_token_hash = ?, invite_token_expires = ? WHERE id = ?')
    .run(tokenHash, scadenza, userId);
}

// Accettazione dell'invito: imposta la password VERA scelta dalla persona
// invitata, valorizza email_verified_at (da questo momento puo' fare
// login, e la pagina Team members la mostra come "Active") e svuota i
// campi del token — stesso schema di impostaEmailVerificata().
export async function accettaInvito(userId, passwordHash) {
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, email_verified_at = datetime('now'),
         invite_token_hash = NULL, invite_token_expires = NULL
       WHERE id = ?`
    )
    .run(passwordHash, userId);
  return getDb().prepare('SELECT id, org_id, email, role FROM users WHERE id = ?').get(userId);
}

export async function updateUserRole(orgId, userId, role) {
  const risultato = getDb()
    .prepare('UPDATE users SET role = ? WHERE org_id = ? AND id = ?')
    .run(role, orgId, userId);
  if (risultato.changes === 0) return undefined;
  return findUserById(orgId, userId);
}

export async function deleteUser(orgId, userId) {
  getDb().prepare('DELETE FROM users WHERE org_id = ? AND id = ?').run(orgId, userId);
}

// notification_preferences: una riga sola per utente, creata al primo
// salvataggio — vedi il commento in schema.sql sui valori di default
// restituiti finche' non esiste ancora.
const PREFERENZE_DEFAULT = {
  email_enabled: true, inapp_enabled: true,
  event_new_reviews: true, event_critical_issues: true, event_replies_pending: true,
  event_weekly_digest: false, event_billing: false,
};

export async function getNotificationPreferences(userId) {
  const riga = getDb().prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId);
  if (!riga) return { user_id: userId, ...PREFERENZE_DEFAULT };
  return {
    ...riga,
    email_enabled: !!riga.email_enabled,
    inapp_enabled: !!riga.inapp_enabled,
    event_new_reviews: !!riga.event_new_reviews,
    event_critical_issues: !!riga.event_critical_issues,
    event_replies_pending: !!riga.event_replies_pending,
    event_weekly_digest: !!riga.event_weekly_digest,
    event_billing: !!riga.event_billing,
  };
}

export async function setNotificationPreferences(userId, preferenze) {
  const p = { ...PREFERENZE_DEFAULT, ...preferenze };
  getDb()
    .prepare(
      `INSERT INTO notification_preferences
         (user_id, email_enabled, inapp_enabled, event_new_reviews, event_critical_issues, event_replies_pending, event_weekly_digest, event_billing, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (user_id) DO UPDATE SET
         email_enabled = excluded.email_enabled,
         inapp_enabled = excluded.inapp_enabled,
         event_new_reviews = excluded.event_new_reviews,
         event_critical_issues = excluded.event_critical_issues,
         event_replies_pending = excluded.event_replies_pending,
         event_weekly_digest = excluded.event_weekly_digest,
         event_billing = excluded.event_billing,
         updated_at = excluded.updated_at`
    )
    .run(
      userId,
      p.email_enabled ? 1 : 0, p.inapp_enabled ? 1 : 0,
      p.event_new_reviews ? 1 : 0, p.event_critical_issues ? 1 : 0, p.event_replies_pending ? 1 : 0,
      p.event_weekly_digest ? 1 : 0, p.event_billing ? 1 : 0
    );
  return getNotificationPreferences(userId);
}

export async function updateOrg(orgId, campi) {
  const consentiti = ['name', 'plan', 'plan_status', 'tone', 'auto_send', 'google_connected', 'stripe_customer_id', 'stripe_subscription_id', 'current_period_end', 'language'];
  const chiavi = Object.keys(campi).filter((k) => consentiti.includes(k));
  if (chiavi.length > 0) {
    const setClause = chiavi.map((k) => `${k} = ?`).join(', ');
    const valori = chiavi.map((k) => (typeof campi[k] === 'boolean' ? (campi[k] ? 1 : 0) : campi[k]));
    getDb().prepare(`UPDATE organizations SET ${setClause} WHERE id = ?`).run(...valori, orgId);
  }
  return findOrgById(orgId);
}

export async function listReviews(orgId, gameId, { status } = {}) {
  if (status) {
    return getDb()
      .prepare('SELECT * FROM reviews WHERE org_id = ? AND game_id = ? AND status = ? ORDER BY review_date DESC')
      .all(orgId, gameId, status);
  }
  return getDb()
    .prepare('SELECT * FROM reviews WHERE org_id = ? AND game_id = ? ORDER BY review_date DESC')
    .all(orgId, gameId);
}

export async function getReview(orgId, gameId, id) {
  return getDb().prepare('SELECT * FROM reviews WHERE org_id = ? AND game_id = ? AND id = ?').get(orgId, gameId, id);
}

export async function updateReview(orgId, gameId, id, campi) {
  const consentiti = ['status', 'draft_reply', 'published_reply'];
  const chiavi = Object.keys(campi).filter((k) => consentiti.includes(k));
  if (chiavi.length === 0) return getReview(orgId, gameId, id);

  const setClause = chiavi.map((k) => `${k} = ?`).join(', ');
  const valori = chiavi.map((k) => campi[k]);
  const risultato = getDb()
    .prepare(`UPDATE reviews SET ${setClause} WHERE org_id = ? AND game_id = ? AND id = ?`)
    .run(...valori, orgId, gameId, id);

  if (risultato.changes === 0) return undefined;
  return getReview(orgId, gameId, id);
}

export async function insertReview(orgId, gameId, recensione) {
  const { author, rating, text, review_date, platform } = recensione;
  const risultato = getDb()
    .prepare('INSERT INTO reviews (org_id, game_id, author, rating, text, review_date, platform) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(orgId, gameId, author, rating, text ?? null, review_date, platform ?? 'steam');
  return getReview(orgId, gameId, risultato.lastInsertRowid);
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

export async function stats(orgId, gameId) {
  const conteggi = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM reviews WHERE org_id = ? AND game_id = ? GROUP BY status')
    .all(orgId, gameId);
  const media = getDb()
    .prepare('SELECT AVG(rating) AS m FROM reviews WHERE org_id = ? AND game_id = ?')
    .get(orgId, gameId);

  const base = { da_generare: 0, da_approvare: 0, pubblicata: 0, ignorata: 0 };
  conteggi.forEach((riga) => { base[riga.status] = riga.n; });
  const totale = Object.values(base).reduce((a, b) => a + b, 0);

  return { ...base, totale, media_voto: media.m ? Number(media.m.toFixed(2)) : 0 };
}

export async function listIntegrations(orgId, gameId) {
  return getDb()
    .prepare('SELECT provider, connected, connected_at, api_key_hint FROM integrations WHERE org_id = ? AND game_id = ?')
    .all(orgId, gameId)
    .map((riga) => ({ ...riga, connected: !!riga.connected }));
}

// Come listIntegrations, ma su TUTTI i giochi dell'organizzazione: serve
// solo per far rispettare il limite piattaforme del piano (vedi
// routes/integrations.js), che resta un tetto per organizzazione — non per
// gioco — anche ora che ogni piattaforma si collega separatamente per
// ogni gioco.
export async function listIntegrationsOrg(orgId) {
  return getDb()
    .prepare('SELECT provider, connected, game_id FROM integrations WHERE org_id = ?')
    .all(orgId)
    .map((riga) => ({ ...riga, connected: !!riga.connected }));
}

export async function setIntegration(orgId, gameId, provider, connected, apiKeyChiaro = null) {
  const connectedAt = connected ? new Date().toISOString() : null;
  const apiKeyCifrata = connected && apiKeyChiaro ? cifra(apiKeyChiaro) : null;
  const apiKeyHint = connected && apiKeyChiaro ? apiKeyChiaro.slice(-4) : null;

  getDb()
    .prepare(
      `INSERT INTO integrations (org_id, game_id, provider, connected, connected_at, api_key, api_key_hint)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (org_id, game_id, provider) DO UPDATE SET
         connected = excluded.connected,
         connected_at = excluded.connected_at,
         api_key = excluded.api_key,
         api_key_hint = excluded.api_key_hint`
    )
    .run(orgId, gameId, provider, connected ? 1 : 0, connectedAt, apiKeyCifrata, apiKeyHint);

  return { provider, connected, connected_at: connectedAt, api_key_hint: apiKeyHint };
}

// Per uso futuro: quando un'integrazione a chiave API fara' davvero
// chiamate esterne (es. sync recensioni Steam), il servizio chiamera'
// questa funzione per recuperare la chiave in chiaro. Nessuna route la usa
// ancora — nessun endpoint restituisce mai la chiave al frontend.
export async function getIntegrationSecret(orgId, gameId, provider) {
  const riga = getDb()
    .prepare('SELECT api_key FROM integrations WHERE org_id = ? AND game_id = ? AND provider = ? AND connected = 1')
    .get(orgId, gameId, provider);
  return riga?.api_key ? decifra(riga.api_key) : undefined;
}

// known_issues: problemi noti scritti a mano nella Knowledge Base, scoperti
// per gioco (stesso principio di sicurezza di reviews/integrations: org_id
// e game_id arrivano SEMPRE dalla sessione lato route, mai da qui).
export async function listKnownIssues(orgId, gameId) {
  return getDb()
    .prepare('SELECT * FROM known_issues WHERE org_id = ? AND game_id = ? ORDER BY created_at DESC')
    .all(orgId, gameId);
}

export async function createKnownIssue(orgId, gameId, { title, affects, description }) {
  const risultato = getDb()
    .prepare('INSERT INTO known_issues (org_id, game_id, title, affects, description) VALUES (?, ?, ?, ?, ?)')
    .run(orgId, gameId, title, affects || null, description || null);
  return getDb().prepare('SELECT * FROM known_issues WHERE id = ?').get(risultato.lastInsertRowid);
}

export async function updateKnownIssue(orgId, gameId, id, campi) {
  const consentiti = ['title', 'affects', 'description', 'status'];
  const colonne = Object.keys(campi).filter((chiave) => consentiti.includes(chiave));
  if (colonne.length === 0) return getDb().prepare('SELECT * FROM known_issues WHERE org_id = ? AND game_id = ? AND id = ?').get(orgId, gameId, id);

  const set = colonne.map((colonna) => `${colonna} = ?`).join(', ');
  const valori = colonne.map((colonna) => campi[colonna]);
  getDb()
    .prepare(`UPDATE known_issues SET ${set}, updated_at = datetime('now') WHERE org_id = ? AND game_id = ? AND id = ?`)
    .run(...valori, orgId, gameId, id);

  return getDb().prepare('SELECT * FROM known_issues WHERE org_id = ? AND game_id = ? AND id = ?').get(orgId, gameId, id);
}

export async function deleteKnownIssue(orgId, gameId, id) {
  getDb().prepare('DELETE FROM known_issues WHERE org_id = ? AND game_id = ? AND id = ?').run(orgId, gameId, id);
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
