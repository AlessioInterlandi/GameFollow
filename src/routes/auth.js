/* Autenticazione.
 *
 * POST /api/auth/register        crea organizzazione + utente, manda l'email di conferma
 * POST /api/auth/verifica-email  consuma il token di conferma, sblocca il login
 * POST /api/auth/rinvia-verifica rimanda l'email di conferma (se serve ancora)
 * POST /api/auth/login           email + password -> apre la sessione
 * POST /api/auth/logout          distrugge la sessione
 * GET  /api/auth/me              dati dell'utente e dell'azienda collegata
 *
 * Credenziali sbagliate: sempre lo stesso messaggio generico, mai "email
 * inesistente" vs "password sbagliata" — direbbe a un attaccante quali
 * email sono registrate. Lo stesso principio vale ora anche per /register
 * e /rinvia-verifica: vedi i commenti sulle singole route.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import * as db from '../db/index.js';
import * as password from '../services/password.js';
import { richiedeLogin } from '../middleware/auth.js';
import { config } from '../config.js';
import { jobQueue } from '../services/queue.js';
import { inviaEmail } from '../services/email.js';

const router = Router();

// Hash "finto" con cui confrontare quando l'utente non esiste: senza,
// il ramo "utente non trovato" salterebbe subito lo scrypt e risponderebbe
// piu' veloce di quello "password sbagliata", rivelando quali email esistono.
const HASH_FITTIZIO = await password.hash('password-usata-solo-per-il-tempo-costante');

const DURATA_TOKEN_VERIFICA_MS = 24 * 60 * 60 * 1000; // 24 ore
const MESSAGGIO_REGISTRAZIONE =
  'Se i dati inseriti sono validi, controlla la tua casella email per confermare la registrazione.';

function generaToken() {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

function scadenzaToken() {
  return new Date(Date.now() + DURATA_TOKEN_VERIFICA_MS).toISOString();
}

// Distingue "email gia' registrata" da un errore generico del database.
// sqlite.js rilancia l'errore grezzo di node:sqlite, il driver supabase
// quello di postgrest (codice 23505 = unique_violation) — controlliamo
// entrambe le forme cosi' la route funziona con qualunque DB_DRIVER.
function isEmailDuplicata(err) {
  const msg = String(err?.message ?? '');
  return err?.code === '23505' || msg.includes('UNIQUE constraint failed: users.email') || msg.includes('duplicate key value');
}

function linkVerifica(token) {
  return `${config.appUrl}/verifica-email.html?token=${token}`;
}

router.post('/register', async (req, res) => {
  const { nomeOrg, email, password: passwordInviata } = req.body ?? {};

  if (
    typeof nomeOrg !== 'string' || nomeOrg.trim().length < 2 ||
    typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof passwordInviata !== 'string' || passwordInviata.length < 8
  ) {
    return res.status(400).json({
      errore: 'Dati non validi: nome, email valida e password di almeno 8 caratteri sono obbligatori.',
    });
  }

  const emailNormalizzata = email.trim().toLowerCase();

  // La scrypt viene calcolata SEMPRE, anche se poi si scopre che l'email
  // e' gia' in uso: cosi' il tempo di risposta resta simile fra "email
  // nuova" e "email gia' registrata" e non diventa un modo per un
  // attaccante di scoprire quali account esistono gia' (stesso principio
  // di HASH_FITTIZIO usato in /login).
  const passwordHash = await password.hash(passwordInviata);
  const { token, tokenHash } = generaToken();
  const scadenza = scadenzaToken();

  try {
    const { user } = await db.creaOrganizzazioneEUtente({
      nomeOrg: nomeOrg.trim(),
      email: emailNormalizzata,
      passwordHash,
      verifyTokenHash: tokenHash,
      verifyTokenExpires: scadenza,
    });

    jobQueue.accoda('email-verifica-registrazione', () =>
      inviaEmail(
        user.email,
        'Conferma la tua email su GameFollow',
        `Benvenuto su GameFollow.\n\nConferma il tuo indirizzo email per attivare l'account:\n${linkVerifica(token)}\n\nIl link scade tra 24 ore. Se non hai richiesto tu questa registrazione, ignora questa email.`
      )
    );
  } catch (err) {
    if (!isEmailDuplicata(err)) {
      console.error(err);
      return res.status(500).json({ errore: 'Errore interno.' });
    }

    // L'email esiste gia'. NON lo diciamo a chi ha inviato la richiesta
    // (altrimenti la route diventerebbe un modo per verificare quali
    // email sono registrate su GameFollow): rispondiamo con lo stesso
    // messaggio generico del percorso "successo". Avvisiamo invece il
    // vero proprietario dell'account, cosi' se non e' stato lui a
    // provarci puo' accorgersene.
    const utenteEsistente = await db.findUserByEmail(emailNormalizzata);
    if (utenteEsistente) {
      jobQueue.accoda('email-avviso-registrazione-duplicata', () =>
        inviaEmail(
          utenteEsistente.email,
          'Qualcuno ha provato a registrarsi con la tua email su GameFollow',
          `Abbiamo ricevuto un tentativo di registrazione su GameFollow usando questo indirizzo email, che risulta gia' associato a un account.\n\nSe sei stato tu e hai dimenticato di avere gia' un account, prova ad accedere dalla pagina di login. Se non sei stato tu, non e' richiesta nessuna azione: la tua password non e' stata modificata.`
        )
      );
    }
  }

  res.status(201).json({ ok: true, messaggio: MESSAGGIO_REGISTRAZIONE });
});

router.post('/verifica-email', async (req, res) => {
  const { token } = req.body ?? {};

  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ errore: 'Link di verifica non valido o scaduto.' });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const utente = await db.trovaUtentePerTokenVerifica(tokenHash);

  if (!utente) {
    return res.status(400).json({ errore: 'Link di verifica non valido o scaduto.' });
  }

  await db.impostaEmailVerificata(utente.id);
  res.json({ ok: true });
});

router.post('/rinvia-verifica', async (req, res) => {
  const { email } = req.body ?? {};

  if (typeof email !== 'string') {
    return res.status(400).json({ errore: 'Email non valida.' });
  }

  const emailNormalizzata = email.trim().toLowerCase();
  const utente = await db.findUserByEmail(emailNormalizzata);

  // Stesso principio anti-enumerazione di /register: la risposta e'
  // identica che l'account esista o no, che sia gia' verificato o no.
  // L'email di verifica parte solo nel caso in cui serva davvero.
  if (utente && !utente.email_verified_at) {
    const { token, tokenHash } = generaToken();
    await db.impostaNuovoTokenVerifica(utente.id, tokenHash, scadenzaToken());

    jobQueue.accoda('email-verifica-rinvio', () =>
      inviaEmail(
        utente.email,
        'Conferma la tua email su GameFollow',
        `Ecco un nuovo link per confermare il tuo indirizzo email:\n${linkVerifica(token)}\n\nIl link scade tra 24 ore.`
      )
    );
  }

  res.json({ ok: true, messaggio: MESSAGGIO_REGISTRAZIONE });
});

router.post('/login', async (req, res) => {
  const { email, password: passwordInviata } = req.body ?? {};

  if (typeof email !== 'string' || typeof passwordInviata !== 'string') {
    return res.status(400).json({ errore: 'Credenziali non valide.' });
  }

  const utente = await db.findUserByEmail(email.trim().toLowerCase());
  const passwordOk = await password.verify(passwordInviata, utente?.password_hash ?? HASH_FITTIZIO);

  if (!utente || !passwordOk) {
    return res.status(401).json({ errore: 'Credenziali non valide.' });
  }

  // Questo controllo arriva SOLO dopo che la password e' gia' stata
  // verificata come corretta: chi riceve questo errore conosce gia' le
  // credenziali vere, quindi non e' un canale di enumerazione (a
  // differenza di un "email non trovata" prima del controllo password,
  // che invece la codebase evita apposta ovunque).
  if (!utente.email_verified_at) {
    return res.status(403).json({ errore: 'Email non confermata. Controlla la tua casella di posta.', motivo: 'email_non_verificata' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ errore: 'Errore interno.' });

    req.session.userId = utente.id;
    req.session.orgId = utente.org_id;
    req.session.email = utente.email;
    res.json({ ok: true });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('gamefollow.sid');
    res.json({ ok: true });
  });
});

router.get('/me', richiedeLogin, async (req, res) => {
  const org = await db.findOrgById(req.orgId);
  res.json({ userId: req.userId, email: req.session.email, org });
});

export default router;
