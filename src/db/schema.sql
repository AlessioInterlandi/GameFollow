-- Definizione delle tabelle.
--
-- organizations : l'azienda cliente. E' questa l'unita' che paga.
--   id, name, plan, google_connected, tone, auto_send, created_at
--
-- users : chi accede. Ogni utente appartiene a una organization.
--   id, org_id, email (unica), password_hash, created_at
--
-- reviews : le recensioni scaricate da Google.
--   id, org_id, author, rating, text, review_date,
--   status, draft_reply, published_reply, created_at
--
-- Stati previsti per status:
--   da_generare -> da_approvare -> pubblicata     (oppure: ignorata)
--
-- Nota: org_id compare in ogni tabella che contiene dati di un cliente.
-- E' la colonna che tiene separati i clienti tra loro.
-- Aggiungi un indice su (org_id, status): e' la query piu' frequente.

CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'gratis',
    google_connected INTEGER NOT NULL DEFAULT 0,
    tone TEXT,
    auto_send INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    author TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT,
    review_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'da_generare'
        CHECK (status IN ('da_generare', 'da_approvare', 'pubblicata', 'ignorata')),
    draft_reply TEXT,
    published_reply TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- La query piu' frequente: elenco delle recensioni di un'azienda filtrate per stato.
CREATE INDEX IF NOT EXISTS idx_reviews_org_status ON reviews (org_id, status);

-- integrations : stato del collegamento (Steam, GitHub, Slack...) per ogni
-- azienda. Una riga per provider, creata/aggiornata al primo click su
-- "Connect"/"Manage" — non serve pre-popolarla.
--
-- api_key: cifrata (vedi services/secrets.js), solo per le piattaforme che
-- si collegano con una chiave API (Steam, Google Play, App Store, Xbox).
-- api_key_hint: ultime 4 cifre in chiaro, solo per mostrarle nell'interfaccia
-- senza dover decifrare la chiave a ogni GET.
-- Gli strumenti (GitHub, Trello...) si collegano con una finestra di
-- autorizzazione, non hanno una chiave da salvare qui.
CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    provider TEXT NOT NULL,
    connected INTEGER NOT NULL DEFAULT 0,
    connected_at TEXT,
    api_key TEXT,
    api_key_hint TEXT,
    UNIQUE (org_id, provider)
);
