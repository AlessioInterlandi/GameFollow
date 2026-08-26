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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- auth_id collega la riga a Supabase Auth (auth.users). E' la colonna su cui
-- si appoggiano le policy RLS qui sotto: senza, non c'e' modo di sapere a
-- quale org_id appartiene chi sta facendo la richiesta.
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    auth_id UUID UNIQUE REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- La query piu' frequente: elenco delle recensioni di un'azienda filtrate per stato.
CREATE INDEX IF NOT EXISTS idx_reviews_org_status ON reviews (org_id, status);

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
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solo la propria organizzazione" ON organizations;
CREATE POLICY "solo la propria organizzazione" ON organizations
  FOR ALL USING (id = current_org_id());

-- Ogni utente vede solo la propria riga (serve a caricare il proprio profilo,
-- non l'elenco dei colleghi: quello, se mai servira', passa dal backend).
DROP POLICY IF EXISTS "solo se stesso" ON users;
CREATE POLICY "solo se stesso" ON users
  FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "solo le recensioni della propria organizzazione" ON reviews;
CREATE POLICY "solo le recensioni della propria organizzazione" ON reviews
  FOR ALL USING (org_id = current_org_id());

DROP POLICY IF EXISTS "solo le integrazioni della propria organizzazione" ON integrations;
CREATE POLICY "solo le integrazioni della propria organizzazione" ON integrations
  FOR ALL USING (org_id = current_org_id());

DROP POLICY IF EXISTS "solo i pagamenti della propria organizzazione" ON payments;
CREATE POLICY "solo i pagamenti della propria organizzazione" ON payments
  FOR SELECT USING (org_id = current_org_id());

-- Nota: la service_role key (quella usata dal backend, in src/db/supabase.js)
-- IGNORA tutte queste policy. Le RLS sono la seconda rete di sicurezza:
-- la prima resta il filtro org_id scritto a mano in ogni query del driver.
