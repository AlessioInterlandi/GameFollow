-- Schema per PostgreSQL/Supabase.
-- Da incollare una volta sola nel SQL Editor della dashboard.
--
-- Differenze rispetto a SQLite:
--   INTEGER PRIMARY KEY AUTOINCREMENT  ->  BIGSERIAL PRIMARY KEY
--   TEXT con datetime('now')           ->  TIMESTAMPTZ DEFAULT now()
--   INTEGER usato come booleano        ->  BOOLEAN
--   niente virgolette doppie sui nomi: PostgreSQL abbassa tutto a minuscolo

CREATE TABLE IF NOT EXISTS organizations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'gratis',
    plan_status TEXT NOT NULL DEFAULT 'nessuno'
        CHECK (plan_status IN ('nessuno', 'attivo', 'in_scadenza', 'scaduto')),
    google_connected BOOLEAN NOT NULL DEFAULT false,
    tone TEXT,
    auto_send BOOLEAN NOT NULL DEFAULT false,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    current_period_end TIMESTAMPTZ,
    -- Lingua del sito scelta in Impostazioni -> App settings (vedi lo
    -- stesso commento in schema.sql).
    language TEXT NOT NULL DEFAULT 'it' CHECK (language IN ('it', 'en', 'es', 'fr')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrazione idempotente per chi ha gia' eseguito questo schema in passato
-- (stesso motivo del blocco analogo sulle colonne di verifica email qui
-- sotto): CREATE TABLE IF NOT EXISTS non tocca una tabella che esiste gia'.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'it';

-- auth_id collega la riga a Supabase Auth (auth.users). E' la colonna su cui
-- si appoggiano le policy RLS qui sotto: senza, non c'e' modo di sapere a
-- quale org_id appartiene chi sta facendo la richiesta.
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    auth_id UUID UNIQUE REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- Registrazione self-service: NULL finche' l'utente non conferma
    -- l'email (vedi lo stesso commento in schema.sql per i dettagli).
    email_verified_at TIMESTAMPTZ,
    verify_token_hash TEXT,
    verify_token_expires TIMESTAMPTZ,
    -- Team/inviti + ruoli — vedi lo stesso commento in schema.sql.
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor', 'viewer')),
    invited_by_user_id BIGINT REFERENCES users(id),
    invite_token_hash TEXT,
    invite_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrazione idempotente per chi ha GIA' eseguito questo schema in passato:
-- CREATE TABLE IF NOT EXISTS sopra non aggiunge colonne a una tabella che
-- esiste gia', quindi le tre colonne della verifica email vanno aggiunte
-- qui a parte. Sicura da rieseguire piu' volte (ADD COLUMN IF NOT EXISTS
-- non fallisce se la colonna c'e' gia'). Il backfill marca come "gia'
-- verificati" tutti gli utenti creati PRIMA di questa modifica (erano
-- account creati a mano dal gestore del sito, quindi gia' fidati): senza
-- questo passaggio, al prossimo deploy nessun cliente esistente riuscirebbe
-- piu' ad accedere. E' un no-op alla seconda esecuzione, perche' a quel
-- punto tutte le righe hanno gia' email_verified_at valorizzato.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires TIMESTAMPTZ;
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

-- Stessa idea per le colonne di team/ruoli, aggiunte in un secondo momento:
-- il backfill imposta 'owner' su ogni utente gia' esistente (aveva gia'
-- accesso completo prima che i ruoli esistessero, non deve perderlo ora).
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_user_id BIGINT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_expires TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'editor', 'viewer'));
  END IF;
END $$;

-- games : i videogiochi seguiti da un'organizzazione — vedi lo stesso
-- commento in schema.sql. Va creata PRIMA di reviews/integrations perche'
-- ci sono colonne che la referenziano.
CREATE TABLE IF NOT EXISTS games (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_org ON games (org_id);

-- Un gioco di default per ogni organizzazione che esisteva gia' prima di
-- questa tabella: senza, chi ha gia' un account si troverebbe senza nessun
-- gioco da mostrare nel menu a tendina al prossimo accesso. Le nuove
-- organizzazioni ne ricevono uno direttamente da creaOrganizzazioneEUtente,
-- quindi questo INSERT diventa un no-op non appena tutte le org ne hanno
-- almeno uno.
INSERT INTO games (org_id, name)
SELECT o.id, 'My first game' FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.org_id = o.id);

CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    author TEXT NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT,
    review_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'da_generare'
        CHECK (status IN ('da_generare', 'da_approvare', 'pubblicata', 'ignorata')),
    draft_reply TEXT,
    published_reply TEXT,
    platform TEXT DEFAULT 'steam',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrazione idempotente per chi ha gia' eseguito questo schema in passato
-- (stesso pattern usato sopra per organizations.language): aggiunge la
-- colonna a chi non ce l'ha ancora, poi assegna ogni recensione esistente
-- al (primo) gioco della propria organizzazione, cosi' nessuna recensione
-- sparisce dalla vista scoperta per gioco appena la colonna comincia a
-- essere usata. UPDATE e' un no-op alle esecuzioni successive perche' a
-- quel punto game_id e' gia' valorizzato ovunque.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS game_id BIGINT REFERENCES games(id);
UPDATE reviews SET game_id = (
    SELECT MIN(g.id) FROM games g WHERE g.org_id = reviews.org_id
) WHERE game_id IS NULL;

-- La query piu' frequente: elenco delle recensioni di un'azienda filtrate per stato.
CREATE INDEX IF NOT EXISTS idx_reviews_org_status ON reviews (org_id, status);
-- Seconda query piu' frequente da quando esiste il multi-gioco: le
-- recensioni di UN gioco specifico dell'azienda.
CREATE INDEX IF NOT EXISTS idx_reviews_org_game ON reviews (org_id, game_id);

-- integrations : stato del collegamento (Steam, GitHub, Slack...) per ogni
-- azienda. Una riga per provider, creata/aggiornata al primo click su
-- "Connect"/"Manage" — non serve pre-popolarla.
-- api_key: cifrata lato applicazione prima di arrivare qui (vedi
-- services/secrets.js) — anche con la service_role key, sul database resta
-- solo testo cifrato, mai la chiave in chiaro.
CREATE TABLE IF NOT EXISTS integrations (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    provider TEXT NOT NULL,
    connected BOOLEAN NOT NULL DEFAULT false,
    connected_at TIMESTAMPTZ,
    api_key TEXT,
    api_key_hint TEXT,
    UNIQUE (org_id, provider)
);

-- game_id: la stessa piattaforma si collega separatamente per ogni gioco,
-- con la propria chiave API. Migrazione idempotente: aggiunge la colonna,
-- assegna le righe esistenti al (primo) gioco dell'organizzazione, poi
-- sostituisce il vincolo UNIQUE — a differenza di SQLite, Postgres puo'
-- farlo con un ALTER TABLE diretto, senza ricreare la tabella.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS game_id BIGINT REFERENCES games(id);
UPDATE integrations SET game_id = (
    SELECT MIN(g.id) FROM games g WHERE g.org_id = integrations.org_id
) WHERE game_id IS NULL;

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_org_id_provider_key;
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_org_id_game_id_provider_key;
ALTER TABLE integrations ADD CONSTRAINT integrations_org_id_game_id_provider_key UNIQUE (org_id, game_id, provider);

-- known_issues : i problemi noti pubblicati a mano nella pagina Knowledge
-- Base ("Known issues") — vedi lo stesso commento in schema.sql. Tabella
-- nuova, org_id e game_id ci sono fin dall'inizio: nessuna migrazione.
CREATE TABLE IF NOT EXISTS known_issues (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    game_id BIGINT NOT NULL REFERENCES games(id),
    title TEXT NOT NULL,
    affects TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'aperto'
        CHECK (status IN ('aperto', 'in_corso', 'risolto', 'non_pianificato')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_known_issues_org_game ON known_issues (org_id, game_id);

-- payments : storico delle transazioni reali, una riga per evento Stripe,
-- scritta solo dal webhook (mai dal checkout diretto). stripe_event_id
-- garantisce l'idempotenza: Stripe puo' rimandare lo stesso evento.
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    stripe_event_id TEXT NOT NULL UNIQUE,
    stripe_invoice_id TEXT,
    plan TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur',
    status TEXT NOT NULL CHECK (status IN ('pagato', 'fallito', 'rimborsato')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payments (org_id, created_at DESC);

-- notification_preferences : preferenze di notifica di UN utente — vedi lo
-- stesso commento in schema.sql (solo email/in-app, niente Slack/Discord/
-- Mentions: nessun canale che li invii davvero esiste ancora).
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES users(id),
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    inapp_enabled BOOLEAN NOT NULL DEFAULT true,
    event_new_reviews BOOLEAN NOT NULL DEFAULT true,
    event_critical_issues BOOLEAN NOT NULL DEFAULT true,
    event_replies_pending BOOLEAN NOT NULL DEFAULT true,
    event_weekly_digest BOOLEAN NOT NULL DEFAULT false,
    event_billing BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--
-- ROW LEVEL SECURITY
--
-- Senza queste righe, chiunque abbia la chiave anon legge tutto.
-- E' l'errore piu' comune di chi inizia con Supabase.
--
-- La policy confronta org_id con l'organizzazione dell'utente letta DA UNA
-- TABELLA (users), non dai metadata del JWT: alcuni campi del token sono
-- modificabili dall'utente stesso, quindi non vanno mai usati per decidere
-- a quale organizzazione appartiene.
--
-- current_org_id() e' SECURITY DEFINER: gira con i permessi di chi l'ha
-- creata (non dell'utente che fa la query), quindi legge la tabella users
-- ignorando la RLS di users e non genera ricorsione tra le policy.
--
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid()
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solo la propria organizzazione" ON organizations;
CREATE POLICY "solo la propria organizzazione" ON organizations
  FOR ALL USING (id = current_org_id());

-- Ogni utente vede solo la propria riga (serve a caricare il proprio profilo,
-- non l'elenco dei colleghi: quello, se mai servira', passa dal backend).
DROP POLICY IF EXISTS "solo se stesso" ON users;
CREATE POLICY "solo se stesso" ON users
  FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "solo i giochi della propria organizzazione" ON games;
CREATE POLICY "solo i giochi della propria organizzazione" ON games
  FOR ALL USING (org_id = current_org_id());

DROP POLICY IF EXISTS "solo le recensioni della propria organizzazione" ON reviews;
CREATE POLICY "solo le recensioni della propria organizzazione" ON reviews
  FOR ALL USING (org_id = current_org_id());

DROP POLICY IF EXISTS "solo le integrazioni della propria organizzazione" ON integrations;
CREATE POLICY "solo le integrazioni della propria organizzazione" ON integrations
  FOR ALL USING (org_id = current_org_id());

DROP POLICY IF EXISTS "solo i problemi noti della propria organizzazione" ON known_issues;
CREATE POLICY "solo i problemi noti della propria organizzazione" ON known_issues
  FOR ALL USING (org_id = current_org_id());

DROP POLICY IF EXISTS "solo i pagamenti della propria organizzazione" ON payments;
CREATE POLICY "solo i pagamenti della propria organizzazione" ON payments
  FOR SELECT USING (org_id = current_org_id());

-- Preferenze di notifica: per-utente, non per-organizzazione (ognuno vede
-- e cambia solo le proprie, mai quelle di un collega).
DROP POLICY IF EXISTS "solo le proprie preferenze di notifica" ON notification_preferences;
CREATE POLICY "solo le proprie preferenze di notifica" ON notification_preferences
  FOR ALL USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Nota: la service_role key (quella usata dal backend, in src/db/supabase.js)
-- IGNORA tutte queste policy. Le RLS sono la seconda rete di sicurezza:
-- la prima resta il filtro org_id scritto a mano in ogni query del driver.
