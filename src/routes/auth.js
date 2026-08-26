/* Autenticazione.
 *
 * POST /api/auth/login    email + password -> apre la sessione
 * POST /api/auth/logout   distrugge la sessione
 * GET  /api/auth/me       dati dell'utente e dell'azienda collegata
 *
 * Credenziali sbagliate: sempre lo stesso messaggio generico, mai "email
 * inesistente" vs "password sbagliata" — direbbe a un attaccante quali
 * email sono registrate.
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import * as password from '../services/password.js';
import { richiedeLogin } from '../middleware/auth.js';

const router = Router();

// Hash "finto" con cui confrontare quando l'utente non esiste: senza,
// il ramo "utente non trovato" salterebbe subito lo scrypt e risponderebbe
// piu' veloce di quello "password sbagliata", rivelando quali email esistono.
const HASH_FITTIZIO = await password.hash('password-usata-solo-per-il-tempo-costante');

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
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', richiedeLogin, async (req, res) => {
  const org = await db.findOrgById(req.orgId);
  res.json({ userId: req.userId, email: req.session.email, org });
});

export default router;
