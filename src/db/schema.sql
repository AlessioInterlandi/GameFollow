-- Definizione delle tabelle.
--
-- organizations : l'azienda cliente. E' questa l'unita' che paga.
--   id, name, plan, plan_status, google_connected, tone, auto_send,
--   stripe_customer_id, stripe_subscription_id, current_period_end,
--   language, created_at
--
-- users : chi accede. Ogni utente appartiene a una organization.
--   id, org_id, email (unica), password_hash, created_at,
--   email_verified_at, verify_token_hash, verify_token_expires,
--   role, invited_by_user_id, invite_token_hash, invite_token_expires
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
-- Team/inviti (vedi routes/team.js): un utente invitato da un compagno di
-- squadra nasce con email_verified_at = NULL (stesso significato di sopra:
-- "onboarding non completato", qui "invito non ancora accettato" — la
-- pagina Team members mostra "Invited" finche' resta cosi', "Active" da
-- quel momento in poi) e un password_hash SEGNAPOSTO inutilizzabile (hash
-- di byte casuali, mai comunicato a nessuno: serve solo a rispettare il
-- vincolo NOT NULL prima che la persona invitata scelga la propria
-- password). invite_token_hash/invite_token_expires funzionano come
-- verify_token_hash/verify_token_expires ma per il link di invito
-- (routes/team.js POST /accetta), che al click imposta la password vera,
-- valorizza email_verified_at e svuota questi due campi — esattamente
-- come impostaEmailVerificata() fa gia' per verify_token_hash. role e'
-- 'owner' per chi crea l'organizzazione (o per gli utenti gia' esistenti
-- prima di questa colonna: vedi la migrazione), il ruolo scelto da chi
-- invita per chiunque altro.
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
    -- Lingua del sito scelta in Impostazioni -> App settings. Oggi
    -- controlla solo le pagine pubbliche (landing/login/registrazione,
    -- vedi js/i18n.js): il resto dell'app resta in inglese finche' non
    -- viene tradotto a sua volta.
    language TEXT NOT NULL DEFAULT 'it' CHECK (language IN ('it', 'en', 'es', 'fr')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- NULL = email non ancora confermata (self-registrazione) o invito non
    -- ancora accettato (team) — in entrambi i casi il login resta bloccato.
    email_verified_at TEXT,
    verify_token_hash TEXT,
    verify_token_expires TEXT,
    -- owner = accesso completo (incluso billing/team/integrazioni);
    -- editor = Reviews/Replies (lettura+scrittura) + lettura ovunque;
    -- viewer = sola lettura ovunque. Applicato per davvero lato server
    -- (vedi middleware/ruolo.js), non solo mostrato in interfaccia.
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor', 'viewer')),
    -- Chi ha invitato questo utente (NULL per chi si e' registrato da solo,
    -- creando la propria organizzazione). Solo informativo per ora.
    invited_by_user_id INTEGER REFERENCES users(id),
    invite_token_hash TEXT,
    invite_token_expires TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- games : i videogiochi seguiti da un'organizzazione. Ogni organizzazione
-- nasce con un gioco di default (vedi creaOrganizzazioneEUtente); quanti
-- gliene si possono aggiungere dipende dal piano (limiti.giochi in
-- piani.js). Il gioco "attivo" per un utente vive nella sessione (stesso
-- principio di org_id: mai da req.body/query/params, vedi
-- middleware/gioco.js), non in una colonna qui.
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_org ON games (org_id);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    -- A quale gioco appartiene questa recensione. Nullable per lo stesso
    -- motivo di platform sotto: le righe inserite prima di questa colonna
    -- non ce l'hanno finche' la migrazione in sqlite.js non le assegna al
    -- gioco di default dell'organizzazione.
    game_id INTEGER REFERENCES games(id),
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
-- L'indice per (org_id, game_id) NON sta qui apposta: su un database che
-- esisteva gia' prima del multi-gioco, reviews.game_id non c'e' ancora a
-- questo punto (CREATE TABLE IF NOT EXISTS sopra e' un no-op su una
-- tabella che esiste gia', quindi non aggiunge la colonna) — un CREATE
-- INDEX su una colonna mancante fallirebbe. Viene creato da
-- applicaMigrazioneGiochi() in sqlite.js, DOPO essersi assicurata che la
-- colonna esista.

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
-- game_id: nullable per lo stesso motivo di reviews.game_id sopra (righe
-- create prima del multi-gioco). Il vincolo UNIQUE ora include game_id:
-- la stessa piattaforma (es. Steam) si collega separatamente per ogni
-- gioco, con la propria chiave API.
CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    game_id INTEGER REFERENCES games(id),
    provider TEXT NOT NULL,
    connected INTEGER NOT NULL DEFAULT 0,
    connected_at TEXT,
    api_key TEXT,
    api_key_hint TEXT,
    UNIQUE (org_id, game_id, provider)
);

-- known_issues : i problemi noti che lo studio pubblica a mano nella
-- pagina Knowledge Base ("Known issues") per aiutare l'AI a rispondere in
-- modo mirato — diversi dai problemi rilevati automaticamente dall'AI in
-- Issue Detection (quelli restano calcolati al volo dalle recensioni,
-- vedi routes/issues.js, non sono righe salvate qui). Tabella nuova
-- (come games sopra): niente migrazione da fare, org_id e game_id ci sono
-- fin dall'inizio.
--   id, org_id, game_id, title, affects, description, status,
--   created_at, updated_at
--
-- Stati previsti per status: aperto, in_corso, risolto, non_pianificato
CREATE TABLE IF NOT EXISTS known_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    title TEXT NOT NULL,
    -- Piattaforme/versioni interessate, testo libero (es. "Steam, Xbox").
    affects TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'aperto'
        CHECK (status IN ('aperto', 'in_corso', 'risolto', 'non_pianificato')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_known_issues_org_game ON known_issues (org_id, game_id);

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

-- notification_preferences : preferenze di notifica di UN utente (non
-- dell'organizzazione: ogni persona del team sceglie le proprie). Una riga
-- sola per utente, creata al primo salvataggio da Impostazioni ->
-- Notifications (vedi routes/notifiche.js) — finche' non esiste, la route
-- restituisce i valori di default sotto, cosi' un utente che non ha mai
-- toccato questa pagina vede comunque lo stato "di fabbrica" giusto invece
-- di tutto spento.
--
-- Solo email/in-app: niente Slack/Discord/Mentions (vedi il commento in
-- public/impostazioni.html) — non esiste nessun canale che invii
-- davvero una notifica ne' su Slack/Discord ne' per una @menzione, quindi
-- niente preferenza finta da salvare per loro.
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    email_enabled INTEGER NOT NULL DEFAULT 1,
    inapp_enabled INTEGER NOT NULL DEFAULT 1,
    event_new_reviews INTEGER NOT NULL DEFAULT 1,
    event_critical_issues INTEGER NOT NULL DEFAULT 1,
    event_replies_pending INTEGER NOT NULL DEFAULT 1,
    event_weekly_digest INTEGER NOT NULL DEFAULT 0,
    event_billing INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
