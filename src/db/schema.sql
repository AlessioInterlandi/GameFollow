-- Definizione delle tabelle.
--
-- organizations : l'azienda cliente. E' questa l'unita' che paga.
--   id, name, plan, plan_status, google_connected, tone, auto_send,
--   stripe_customer_id, stripe_subscription_id, current_period_end, created_at
--
-- users : chi accede. Ogni utente appartiene a una organization.
--   id, org_id, email (unica), password_hash, created_at,
--   email_verified_at, verify_token_hash, verify_token_expires
--
-- Registrazione self-service (vedi routes/auth.js POST /register): un
-- account nuovo nasce con email_verified_at = NULL e non puo' fare login
-- finche' non clicca il link ricevuto via email. verify_token_hash e'
-- l'HASH del token (mai il token in chiaro: chi legge il database non deve
-- poter verificare account a piacere), verify_token_expires la sua scadenza.
-- Gli account creati a mano (o dal seed) restano verificati da subito: la
-- migrazione qui sotto marca come verificati tutti gli utenti che esistono
-- gia' al momento in cui queste colonne vengono aggiunte.
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
    -- 'nessuno' finche' non c'e' mai stato un abbonamento; poi rispecchia
    -- lo stato dell'abbonamento Stripe (attivo, in_scadenza, scaduto).
    -- Aggiornato SOLO dal webhook (vedi routes/billing.js), mai da una
    -- richiesta diretta del frontend.
    plan_status TEXT NOT NULL DEFAULT 'nessuno'
        CHECK (plan_status IN ('nessuno', 'attivo', 'in_scadenza', 'scaduto')),
    google_connected INTEGER NOT NULL DEFAULT 0,
    tone TEXT,
    auto_send INTEGER NOT NULL DEFAULT 0,
    -- Id cliente/abbonamento lato Stripe. NULL finche' non ha mai pagato.
    -- Servono per ritrovare l'organizzazione quando arriva un evento
    -- webhook (Stripe manda l'id cliente, non il nostro org_id).
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    -- Fine del periodo gia' pagato: e' la data mostrata come "prossimo
    -- addebito" finche' l'abbonamento e' attivo, o "attivo fino al" se e'
    -- stata richiesta la disdetta.
    current_period_end TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- NULL = email non ancora confermata, il login resta bloccato.
    email_verified_at TEXT,
    verify_token_hash TEXT,
    verify_token_expires TEXT,
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
    -- Piattaforma di provenienza (steam, google_play, app_store, xbox) —
    -- serve a Issue Detection per il riepilogo per piattaforma. Nullable
    -- perche' recensioni inserite prima di questa colonna non ce l'hanno;
    -- 'steam' come default per il sync mock (vedi services/google.js) se
    -- per qualche motivo non gli arriva la lista di piattaforme collegate.
    platform TEXT DEFAULT 'steam',
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

-- payments : storico delle transazioni reali (le fatture pagate/fallite/
-- rimborsate). Una riga per evento Stripe, scritta SOLO dal webhook —
-- mai dal checkout diretto, per lo stesso motivo per cui il piano non si
-- attiva mai su richiesta diretta del frontend.
--
-- stripe_event_id: usato per l'idempotenza. Stripe puo' mandare lo stesso
-- evento piu' di una volta (retry di rete); senza questo controllo
-- rischieremmo di registrare due volte lo stesso pagamento.
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    stripe_event_id TEXT NOT NULL UNIQUE,
    stripe_invoice_id TEXT,
    plan TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur',
    status TEXT NOT NULL CHECK (status IN ('pagato', 'fallito', 'rimborsato')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payments (org_id, created_at DESC);
