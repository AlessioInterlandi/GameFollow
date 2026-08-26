# GameFollow — struttura del progetto

Micro-SaaS di **Game Review Intelligence & Management**: piattaforma che centralizza le recensioni dei videogiochi (Steam, Google Play, App Store, console) provenienti da diverse piattaforme, le analizza con l'AI e genera risposte, insight e ticket per gli sviluppatori. Non un semplice "bot che risponde alle recensioni", ma uno strumento che dice allo studio **cosa sistemare nel gioco**.

*Nota: questo progetto nasce dall'impalcatura di un micro-SaaS più generale (recensioni Google per attività locali); la stessa architettura — multi-tenancy, database dietro un'unica porta, provider AI intercambiabile — regge perfettamente anche per il dominio "recensioni di videogiochi". Il piano di prodotto completo è in `CLAUDE OUTPUTS/Costi/gamefollow-descrizione-prodotto.pdf`.*

Ogni file contiene solo un commento che spiega cosa ci va dentro. Il codice lo scrivi tu, un file alla volta.

---

## Chi è il cliente

- **Indie developer** — una persona con un gioco pubblicato su Steam, magari anche su altre piattaforme.
- **Piccolo studio** — 2-20 persone, uno o più giochi.
- **Medio studio / publisher** — decine di giochi, migliaia o milioni di recensioni.

Target iniziale: **indie developer e piccoli studi** — più facili da raggiungere, e con un problema concreto (nessuno dedicato alla gestione delle recensioni).

---

## Struttura

```
gamefollow/
├── server.js                  avvio, sessioni, montaggio delle route
├── package.json                dipendenze e comandi
├── .env.example                 variabili da copiare in .env
├── src/
│   ├── config.js                tutte le variabili in un posto solo
│   ├── db/
│   │   ├── index.js             ← punto di scambio del database
│   │   ├── sqlite.js             implementazione SQLite
│   │   ├── supabase.js           implementazione Supabase/PostgreSQL
│   │   ├── schema.sql             tabelle (SQLite)
│   │   ├── schema.supabase.sql    tabelle + policy RLS (PostgreSQL)
│   │   └── seed.js               dati finti per sviluppare
│   ├── middleware/auth.js        chi sei, e a quale studio/team appartieni
│   ├── routes/
│   │   ├── auth.js               login, logout, chi sono
│   │   ├── reviews.js            il cuore del prodotto: recensioni + analisi AI
│   │   ├── settings.js           collegamento piattaforme, knowledge base del gioco
│   │   └── billing.js            abbonamento
│   └── services/
│       ├── ai.js                 ← punto di scambio del modello AI (sentiment, topic, risposta)
│       ├── google.js              ← da riscrivere: OAuth/API Google Play (V2)
│       ├── steam.js               ← da aggiungere: import recensioni Steam (V1, punto di partenza)
│       ├── n8n.js                 chiamata ai workflow via webhook (recupero recensioni, notifiche)
│       └── password.js            hashing
├── public/                      frontend: HTML + CSS + JS, senza framework
│   ├── index.html                pagina di vendita
│   ├── login.html
│   ├── app.html                  dashboard (rating, sentiment, top issue)
│   ├── impostazioni.html         collegamento gioco/piattaforme, knowledge base
│   ├── css/style.css
│   └── js/                       api.js · login.js · app.js · impostazioni.js
└── test/api.test.mjs
```

---

## In che ordine costruirlo

Ogni passo produce qualcosa di verificabile. Non passare al successivo finché il precedente non funziona.

1. `config.js` e `.env` — la base di tutto
2. `db/schema.sql` e `db/sqlite.js` — le tabelle (giochi, recensioni, knowledge base) e le query
3. `db/seed.js` — uno studio finto con un gioco e recensioni finte, così hai dati con cui lavorare
4. `services/password.js` — serve al seed
5. `routes/auth.js` e `middleware/auth.js` — login funzionante
6. `server.js` — a questo punto il server parte e puoi provare il login
7. `services/steam.js` (o mock) per l'import recensioni + `routes/reviews.js` con `services/ai.js` in versione mock
8. `public/login.html` e `app.html` — il frontend, solo ora
9. `settings.js`, `billing.js`, i test

Il frontend per ultimo: se lo fai prima, ti ritrovi a disegnare pagine per dati che non esistono ancora.

---

## Le decisioni già prese nella struttura

### 1. Multi-tenancy: una app, tanti studi

Ogni riga del database ha una colonna `org_id` (lo studio/team), e ogni query filtra su quella. La parte che conta: **`org_id` non arriva mai dal client**, lo prende il middleware dalla sessione.

```js
req.orgId = req.session.orgId;   // dalla sessione, MAI da req.body o req.query
```

Se lo leggessi dalla richiesta, chiunque potrebbe cambiare un numero e vedere i dati (o le recensioni) di un altro studio. È l'unico errore in tutto il progetto che, se lo fai, ti fa perdere tutti i clienti insieme.

### 2. Il database sta dietro una porta sola

Le route importano solo da `src/db/index.js`, mai da `sqlite.js` o `supabase.js`. Cambiare database è una riga nel `.env`:

```bash
DB_DRIVER=sqlite      # un file sul disco, zero configurazione
DB_DRIVER=supabase    # PostgreSQL ospitato
```

Un accorgimento: le funzioni Supabase sono asincrone, quelle SQLite no. Dichiara `async` l'interfaccia fin dall'inizio e usa `await` nelle route anche con SQLite — così il passaggio non richiede modifiche.

### 3. Il fornitore AI è una variabile

`services/ai.js` espone le funzioni che producono dati strutturati per ogni recensione (sentiment, topic, issue, severity, tipo, risposta generata), non solo testo libero. Sotto ci stanno `mock`, `openai`, `anthropic`, scelti dal `.env`.

Sviluppa sempre con `mock`: è istantaneo e non costa niente. Regola pratica costi: usare un modello economico (es. Claude Haiku) per classificazione e generazione risposta — nell'ordine di ~€0,003 a recensione — e riservare un modello più costoso solo ai riassunti di issue complesse.

---

## Se usi Supabase

Supabase non è solo un database: è PostgreSQL + autenticazione + storage. Sono tre decisioni separate.

**Due architetture possibili:**

| | Il tuo backend parla a Supabase | Il frontend parla a Supabase |
|---|---|---|
| Dove sta la sicurezza | middleware, una riga leggibile | policy RLS scritte in SQL |
| Codice backend | resta tutto | quasi tutto cancellato |
| Se sbagli | errore visibile nei test | dati di un cliente visibili a un altro |

**La via consigliata è ibrida:** usa Supabase Auth (login, verifica email), tieni il tuo backend per i dati, e attiva le RLS lo stesso come seconda rete.

### Le due regole da non violare

**La `service_role` key non deve mai finire nel frontend.** Scavalca tutte le RLS: chi ce l'ha legge l'intero database. Sta solo in `.env`, lato server. Nel browser si usa la chiave `anon`.

**Non autorizzare in base ai metadata del JWT.** Alcuni campi del token sono modificabili dall'utente. L'appartenenza a uno studio va verificata contro una tabella:

```sql
CREATE POLICY "solo il proprio studio" ON reviews
  FOR ALL USING (
    org_id = (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );
```

E ricorda: siccome il tuo backend usa la `service_role` key, **le policy non lo fermano**. Il filtro `org_id` nelle query resta la prima difesa, le RLS sono la seconda.

### Cose pratiche da sapere

- Piano gratuito: 500 MB di database, 2 progetti attivi, 50.000 utenti al mese
- **I progetti gratuiti vanno in pausa dopo 7 giorni di inattività** — si riattivano dalla dashboard
- Nessun backup sul piano gratuito
- Lo schema si applica una volta sola dal SQL Editor della dashboard, non da `init()`

---

## Il sistema di sicurezza (obbligatorio, non rimandabile)

L'AI non può rispondere automaticamente a qualsiasi cosa. Tre livelli di rischio:

| Livello | Esempio di recensione | Comportamento |
|---|---|---|
| Auto reply | "Amazing game!" | Risposta AI pubblicata automaticamente |
| Human approval | "The game is good but there are some annoying bugs" | AI genera risposta, attende approvazione umana |
| Human only | "You stole my money" / minacce legali / rimborsi | Mai pubblicazione automatica |

---

## Python/SQL vs AI: cosa calcolare con cosa

Regola generale: **Python/SQL per tutto ciò che è calcolo deterministico**, **AI solo per ciò che richiede comprensione del linguaggio**.

**Con Python/SQL** (query sul database): rating medio, aggregazioni per piattaforma/periodo, conteggi, confronto sentiment prima/dopo una patch, qualsiasi percentuale/delta/ranking.

**Con l'AI** (solo dove serve comprensione del testo): sentiment e topic extraction dal testo grezzo, clustering di recensioni simili, generazione della risposta, riassunto testuale di un issue.

L'AI entra **una volta per recensione** (classificazione + eventuale generazione risposta); dashboard, trend, aggregazioni, parte numerica dell'issue detection sono puro backend.

---

## Roadmap: V1 / V2 / V3

**V1 — Solo Steam.** Errore da evitare: partire integrando tutte le piattaforme insieme. Meglio concentrarsi su Steam e validare il prodotto: registrazione, creazione gioco, collegamento Steam, import recensioni, dashboard, AI sentiment/topic/response, knowledge base, approve/reject, pubblicazione risposta, issue detection, notifiche email/Discord. Se questo funziona con Steam, si ha già un prodotto dimostrabile.

**V2 — Multi-platform Review Inbox.** Aggiunta di Google Play e App Store, inbox unificata multi-piattaforma → il valore percepito aumenta molto.

**V3 — Piattaforma di gestione del feedback.** Integrazione GitHub/Jira/Discord/Slack, competitor analysis, patch analysis, analytics avanzate, API pubblica, gestione team.

---

## I tre livelli di valore

1. **MONITOR** — "Fammi vedere tutte le recensioni."
2. **AUTOMATE** — "Rispondi alle recensioni al posto mio."
3. **UNDERSTAND** — "Dimmi cosa devo fare per migliorare il mio gioco." ← quello su cui puntare di più: un software che collega una patch a 63 nuove segnalazioni simili, indica piattaforme coinvolte, causa probabile e prepara già il ticket GitHub è molto più difficile da sostituire di uno che dice solo "Thanks for your feedback!".

Architettura ideale in una riga: **STORE → API → n8n → DATABASE → AI → ANALYSIS → DASHBOARD → DEVELOPER → STORE/GITHUB**

---

## Modello di pricing (bozza)

| Piano | Prezzo | Cosa include |
|---|---|---|
| Indie | ~€49-59/mese | 1 gioco · 3 piattaforme · 2.000 recensioni/mese |
| Studio | ~€149-169/mese | 5 giochi · 10 piattaforme · 20.000 recensioni/mese · AI automation · issue detection |
| Publisher | ~€399-449/mese | Giochi multipli · 100.000+ recensioni · team · competitor analysis · API |
| Enterprise | da ~€1.000+/mese | su misura |

Dettagli e confronto con i competitor (Appbot, AppFollow) nel documento PDF collegato.

---

## Cosa cambia quando diventi maggiorenne

Tre file, nessuna riscrittura dell'app:

| File | Adesso | Poi |
|---|---|---|
| `services/steam.js` / `services/google.js` | recensioni inventate | import reale via API Steam / Google Play |
| `routes/billing.js` | segna il piano come attivo | Stripe Checkout + webhook |
| `services/n8n.js` | scrive nel log | webhook n8n reali |

Tieni le firme delle funzioni così come sono descritte nei commenti: è quello che rende la sostituzione indolore.

---

## Comandi previsti

```bash
npm install
cp .env.example .env
npm run seed     # popola il database
npm start        # http://localhost:3000
npm test
```

Le dipendenze in `package.json` sono già quelle giuste: `express`, `express-session`, `dotenv`, `helmet`, `compression`, `express-rate-limit`. Il database SQLite usa `node:sqlite`, integrato in Node (>= 22.5) — nessuna compilazione nativa richiesta.

Se usi Supabase aggiungi anche:

```bash
npm install @supabase/supabase-js
```
