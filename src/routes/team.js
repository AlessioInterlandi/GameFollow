/* Team members: chi ha accesso all'organizzazione, con quale ruolo.
 *
 * GET  /api/team                  elenco dei membri (attivi e invitati),
 *                                  aperto a tutti i ruoli — vedere chi c'e'
 *                                  nel team non e' un'azione sensibile
 * POST /api/team/invite           invita un nuovo membro (solo owner)
 * POST /api/team/:id/resend       rimanda l'email di invito (solo owner)
 * PUT  /api/team/:id/role         cambia il ruolo di un membro (solo owner)
 * DELETE /api/team/:id            rimuove un membro / revoca un invito (solo owner)
 *
 * GET  /api/team/invito/:token    (SENZA login) dati per la pagina di
 *                                  accettazione — a chi appartiene l'invito
 * POST /api/team/accetta          (SENZA login) consuma il token, imposta
 *                                  la password vera, apre la sessione
 *
 * Stesso principio di sicurezza di tutto il resto del sito: org_id arriva
 * SOLO dalla sessione (mai da :id nell'url), quindi ogni azione su un
 * membro e' comunque ricontrollata contro l'organizzazione di chi la fa —
 * vedi findUserById/updateUserRole/deleteUser in db/index.js, che filtrano
 * sempre per org_id.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import * as db from '../db/index.js';
import * as password from '../services/password.js';
import { richiedeLogin } from '../middleware/auth.js';
import { richiedeRuolo } from '../middleware/ruolo.js';
import { verificaLimite } from '../middleware/piano.js';
import { config } from '../config.js';
import { jobQueue } from '../services/queue.js';
import { inviaEmail } from '../services/email.js';

const router = Router();

const RUOLI_VALIDI = ['owner', 'editor', 'viewer'];
const DURATA_TOKEN_INVITO_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni: piu' largo dei
// classici 24h della verifica email di /register — accettare un invito di
// un collega e' meno urgente/sensibile che confermare la propria email in
// fase di registrazione, e non tutti controllano la posta lo stesso giorno.

function generaToken() {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

function scadenzaTokenInvito() {
  return new Date(Date.now() + DURATA_TOKEN_INVITO_MS).toISOString();
}

function linkInvito(token) {
  return `${config.appUrl}/accetta-invito.html?token=${token}`;
}

// Stato mostrato in Team members: "invited" finche' l'invito non e' stato
// accettato (email_verified_at ancora NULL, stesso segnale della
// registrazione self-service), "active" da quel momento in poi.
function mappaMembro(riga, userIdCorrente) {
  return {
    id: riga.id,
    email: riga.email,
    ruolo: riga.role,
    stato: riga.email_verified_at ? 'active' : 'invited',
    tu: riga.id === userIdCorrente,
    creato_il: riga.created_at,
  };
}

router.get('/', richiedeLogin, async (req, res) => {
  const membri = await db.listOrgUsers(req.orgId);
  res.json(membri.map((m) => mappaMembro(m, req.userId)));
});

router.post('/invite', richiedeLogin, richiedeRuolo('owner'), async (req, res) => {
  const { email, ruolo } = req.body ?? {};

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ errore: 'Email non valida.' });
  }
  if (typeof ruolo !== 'string' || !RUOLI_VALIDI.includes(ruolo)) {
    return res.status(400).json({ errore: `Ruolo non valido. Valori validi: ${RUOLI_VALIDI.join(', ')}.` });
  }

  const emailNormalizzata = email.trim().toLowerCase();

  const utenteEsistente = await db.findUserByEmail(emailNormalizzata);
  if (utenteEsistente) {
    // Qui, a differenza di /register, non serve nascondere che l'email e'
    // gia' in uso: chi invita ha scritto di proposito l'indirizzo di un
    // collega preciso (non e' un modulo pubblico che un estraneo potrebbe
    // usare per scoprire quali email esistono), e sapere il motivo del
    // rifiuto e' proprio quello che gli serve per capire cosa fare.
    return res.status(409).json({
      errore: utenteEsistente.org_id === req.orgId
        ? 'Questa persona fa gia\' parte del tuo team.'
        : 'Questa email ha gia\' un account GameFollow (in un\'altra organizzazione).',
    });
  }

  const org = await db.findOrgById(req.orgId);
  const membriAttuali = await db.listOrgUsers(req.orgId);
  const limite = verificaLimite(org, 'membri', membriAttuali.length);
  if (!limite.ok) {
    return res.status(403).json({
      errore: `Il tuo piano permette al massimo ${limite.limite} persone nel team. Fai l'upgrade del piano per invitarne altre.`,
    });
  }

  // Segnaposto inutilizzabile per il vincolo NOT NULL su password_hash
  // finche' la persona invitata non sceglie la propria password (vedi il
  // commento su creaInvito in db/sqlite.js) — byte casuali, mai
  // comunicati a nessuno, passati dalla stessa scrypt di una password
  // vera cosi' da non introdurre un formato "riconoscibile" nella colonna.
  const passwordHashSegnaposto = await password.hash(randomBytes(32).toString('hex'));
  const { token, tokenHash } = generaToken();

  const invitato = await db.creaInvito({
    orgId: req.orgId,
    email: emailNormalizzata,
    role: ruolo,
    invitedByUserId: req.userId,
    passwordHashSegnaposto,
    tokenHash,
    tokenExpires: scadenzaTokenInvito(),
  });

  jobQueue.accoda(`email-invito-team:${invitato.id}`, () =>
    inviaEmail(
      invitato.email,
      `${org.name} ti ha invitato/a su GameFollow`,
      `${req.session.email} ti ha invitato/a a collaborare su GameFollow con ${org.name}, come ${ruolo}.\n\nAccetta l'invito e scegli la tua password:\n${linkInvito(token)}\n\nIl link scade tra 7 giorni.`
    )
  );

  res.status(201).json(mappaMembro({ ...invitato, email_verified_at: null }, req.userId));
});

router.post('/:id/resend', richiedeLogin, richiedeRuolo('owner'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ errore: 'Id non valido.' });

  const membro = await db.findUserById(req.orgId, id);
  if (!membro) return res.status(404).json({ errore: 'Membro non trovato.' });
  if (membro.email_verified_at) return res.status(400).json({ errore: 'Questa persona ha gia\' accettato l\'invito.' });

  const { token, tokenHash } = generaToken();
  await db.impostaNuovoTokenInvito(membro.id, tokenHash, scadenzaTokenInvito());

  const org = await db.findOrgById(req.orgId);
  jobQueue.accoda(`email-invito-team-rinvio:${membro.id}`, () =>
    inviaEmail(
      membro.email,
      `${org.name} ti ha invitato/a su GameFollow`,
      `Ecco un nuovo link per accettare l'invito a collaborare su GameFollow con ${org.name}:\n${linkInvito(token)}\n\nIl link scade tra 7 giorni.`
    )
  );

  res.json({ ok: true });
});

router.put('/:id/role', richiedeLogin, richiedeRuolo('owner'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ errore: 'Id non valido.' });

  const { ruolo } = req.body ?? {};
  if (typeof ruolo !== 'string' || !RUOLI_VALIDI.includes(ruolo)) {
    return res.status(400).json({ errore: `Ruolo non valido. Valori validi: ${RUOLI_VALIDI.join(', ')}.` });
  }

  const membro = await db.findUserById(req.orgId, id);
  if (!membro) return res.status(404).json({ errore: 'Membro non trovato.' });

  // Il team deve avere sempre almeno un owner: senza questo controllo,
  // l'ultimo owner potrebbe degradarsi (o essere degradato) per errore e
  // lasciare l'organizzazione senza nessuno che possa piu' gestire
  // billing/team/integrazioni.
  if (membro.role === 'owner' && ruolo !== 'owner') {
    const membri = await db.listOrgUsers(req.orgId);
    const numeroOwner = membri.filter((m) => m.role === 'owner').length;
    if (numeroOwner <= 1) {
      return res.status(400).json({ errore: 'Il team deve avere sempre almeno un owner: promuovi qualcun altro prima di cambiare questo ruolo.' });
    }
  }

  const aggiornato = await db.updateUserRole(req.orgId, id, ruolo);

  // Chi cambia il PROPRIO ruolo (un owner che si degrada da solo, unico
  // caso possibile dato il controllo sopra se ci sono altri owner) deve
  // vedere subito il permesso nuovo nella propria sessione — altrimenti
  // resterebbe con i permessi vecchi finche' non rifa' login.
  if (id === req.userId) req.session.role = ruolo;

  res.json(mappaMembro(aggiornato, req.userId));
});

router.delete('/:id', richiedeLogin, richiedeRuolo('owner'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ errore: 'Id non valido.' });

  const membro = await db.findUserById(req.orgId, id);
  if (!membro) return res.status(404).json({ errore: 'Membro non trovato.' });

  if (id === req.userId) {
    return res.status(400).json({ errore: 'Non puoi rimuovere te stesso/a dal team.' });
  }
  if (membro.role === 'owner') {
    const membri = await db.listOrgUsers(req.orgId);
    const numeroOwner = membri.filter((m) => m.role === 'owner').length;
    if (numeroOwner <= 1) {
      return res.status(400).json({ errore: 'Il team deve avere sempre almeno un owner: promuovi qualcun altro prima di rimuovere questo membro.' });
    }
  }

  await db.deleteUser(req.orgId, id);
  res.json({ ok: true });
});

// Da qui in giu': SENZA login, la persona invitata non ha ancora un
// account attivo (ne' quindi una sessione). Stesso livello di fiducia
// della registrazione self-service in auth.js.

router.get('/invito/:token', async (req, res) => {
  const tokenHash = createHash('sha256').update(req.params.token).digest('hex');
  const utente = await db.trovaUtentePerTokenInvito(tokenHash);
  if (!utente) return res.status(400).json({ errore: 'Invito non valido o scaduto.' });

  const org = await db.findOrgById(utente.org_id);
  res.json({ email: utente.email, ruolo: utente.role, organizzazione: org?.name });
});

router.post('/accetta', async (req, res) => {
  const { token, password: passwordInviata } = req.body ?? {};

  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ errore: 'Invito non valido o scaduto.' });
  }
  if (typeof passwordInviata !== 'string' || passwordInviata.length < 8) {
    return res.status(400).json({ errore: 'La password deve avere almeno 8 caratteri.' });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const utente = await db.trovaUtentePerTokenInvito(tokenHash);
  if (!utente) return res.status(400).json({ errore: 'Invito non valido o scaduto.' });

  const passwordHash = await password.hash(passwordInviata);
  const attivato = await db.accettaInvito(utente.id, passwordHash);

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ errore: 'Errore interno.' });

    req.session.userId = attivato.id;
    req.session.orgId = attivato.org_id;
    req.session.email = attivato.email;
    req.session.role = attivato.role;
    res.json({ ok: true });
  });
});

export default router;
