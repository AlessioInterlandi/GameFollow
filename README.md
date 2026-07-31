# Rispondi Recensioni — struttura del progetto

Impalcatura di un micro-SaaS: più aziende clienti accedono alla **stessa** app, ognuna vede solo i propri dati, paga un canone mensile e riceve risposte alle recensioni Google generate con l'AI.

Ogni file contiene solo un commento che spiega cosa ci va dentro. Il codice lo scrivi tu, un file alla volta.

---

## Struttura

```
rispondi-recensioni/
├── server.js                  avvio, sessioni, montaggio delle route
├── package.json               dipendenze e comandi
├── .env.example               variabili da copiare in .env
├── src/
│   ├── config.js              tutte le variabili in un posto solo
│   ├── db/
│   │   ├── index.js           ← punto di scambio del database
│   │   ├── sqlite.js          implementazione SQLite
│   │   ├── supabase.js        implementazione Supabase/PostgreSQL
│   │   ├── schema.sql         tabelle (SQLite)
│   │   ├── schema.supabase.sql tabelle + policy RLS (PostgreSQL)
│   │   └── seed.js            dati finti per sviluppare
│   ├── middleware/auth.js     chi sei, e a quale azienda appartieni
│   ├── routes/
│   │   ├── auth.js            login, logout, chi sono
│   │   ├── reviews.js         il cuore del prodotto
│   │   ├── settings.js        tono, collegamento Google
│   │   └── billing.js         abbonamento
│   └── services/
│       ├── ai.js              ← punto di scambio del modello AI
│       ├── google.js          ← da riscrivere quando avrai OAuth
│       ├── n8n.js             chiamata ai workflow via webhook
│       └── password.js        hashing
├── public/                    frontend: HTML + CSS + JS, senza framework
│   ├── index.html             pagina di vendita
│   ├── login.html
│   ├── app.html               dashboard
│   ├── impostazioni.html
│   ├── css/style.css
│   └── js/                    api.js · login.js · app.js · impostazioni.js
└── test/api.test.mjs
```

---

## In che ordine costruirlo

Ogni passo produce qualcosa di verificabile. Non passare al successivo finché il precedente non funziona.

1. `config.js` e `.env` — la base di tutto
2. `db/schema.sql` e `db/sqlite.js` — le tabelle e le query
3. `db/seed.js` — due aziende finte, così hai dati con cui lavorare
4. `services/password.js` — serve al seed
5. `routes/auth.js` e `middleware/auth.js` — login funzionante
6. `server.js` — a questo punto il server parte e puoi provare il login
7. `routes/reviews.js` con `services/ai.js` in versione mock
8. `public/login.html` e `app.html` — il frontend, solo ora
9. `settings.js`, `billing.js`, i test

Il frontend per ultimo: se lo fai prima, ti ritrovi a disegnare pagine per dati che non esistono ancora.

---

## Le tre decisioni già prese nella struttura

### 1. Multi-tenancy: una app, tanti clienti

Ogni riga del database ha una colonna `org_id`, e ogni query filtra su quella. La parte che conta: **`org_id` non arriva mai dal client**, lo prende il middleware dalla sessione.

```js
req.orgId = req.session.orgId;   // dalla sessione, MAI da req.body o req.query
```

Se lo leggessi dalla richiesta, chiunque potrebbe cambiare un numero e vedere i dati di un altro cliente. È l'unico errore in tutto il progetto che, se lo fai, ti fa perdere tutti i clienti insieme.

### 2. Il database sta dietro una porta sola

Le route importano solo da `src/db/index.js`, mai da `sqlite.js` o `supabase.js`. Cambiare database è una riga nel `.env`:

```bash
DB_DRIVER=sqlite      # un file sul disco, zero configurazione
DB_DRIVER=supabase    # PostgreSQL ospitato
```

Un accorgimento: le funzioni Supabase sono asincrone, quelle SQLite no. Dichiara `async` l'interfaccia fin dall'inizio e usa `await` nelle route anche con SQLite — così il passaggio non richiede modifiche.

---

## Se usi Supabase

Supabase non è solo un database: è PostgreSQL + autenticazione + storage. Sono tre decisioni separate.

**Due architetture possibili:**

| | Il tuo backend parla a Supabase | Il frontend parla a Supabase |
|---|---|---|
| Dove sta la sicurezza | middleware, una riga leggibile | policy RLS scritte in SQL |
| Codice backend | resta tutto | quasi tutto cancellato |
| Se sbagli | errore visibile nei test | dati di un cliente visibili a un altro |

**La via consigliata è ibrida:** usa Supabase Auth (ti risparmia password dimenticate, verifica email, login con Google), tieni il tuo backend per i dati, e attiva le RLS lo stesso come seconda rete.

### Le due regole da non violare

**La `service_role` key non deve mai finire nel frontend.** Scavalca tutte le RLS: chi ce l'ha legge l'intero database. Sta solo in `.env`, lato server. Nel browser si usa la chiave `anon`.

**Non autorizzare in base ai metadata del JWT.** Alcuni campi del token sono modificabili dall'utente. L'appartenenza a un'organizzazione va verificata contro una tabella:

```sql
CREATE POLICY "solo la propria organizzazione" ON reviews
  FOR ALL USING (
    org_id = (SELECT org_id FROM users WHERE auth_id = auth.uid())
  );
```

E ricorda: siccome il tuo backend usa la `service_role` key, **le policy non lo fermano**. Il filtro `org_id` nelle query resta la prima difesa, le RLS sono la seconda.

### Cose pratiche da sapere

- Piano gratuito: 500 MB di database, 2 progetti attivi, 50.000 utenti al mese
- **I progetti gratuiti vanno in pausa dopo 7 giorni di inattività** — si riattivano dalla dashboard, ma se salti una settimana lo trovi spento
- Nessun backup sul piano gratuito
- Lo schema si applica una volta sola dal SQL Editor della dashboard, non da `init()`

### 3. Il fornitore AI è una variabile

`services/ai.js` espone una funzione sola, `generaRisposta()`. Sotto ci stanno `mock`, `openai`, `anthropic`, scelti dal `.env`.

Sviluppa sempre con `mock`: è istantaneo e non costa niente. I prezzi e i modelli cambiano ogni pochi mesi — se il nome del modello è sparso in trenta punti del codice, ogni volta rifai il giro.

---

## Cosa cambia quando diventi maggiorenne

Tre file, nessuna riscrittura dell'app:

| File | Adesso | Poi |
|---|---|---|
| `services/google.js` | recensioni inventate | OAuth Google Business Profile |
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

Le dipendenze in `package.json` sono già quelle giuste: `express`, `express-session`, `better-sqlite3`, `dotenv`.

Se usi Supabase aggiungi anche:

```bash
npm install @supabase/supabase-js
```
