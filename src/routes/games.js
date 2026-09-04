/* Videogiochi: quanti e quali un'organizzazione segue con GameFollow.
 *
 * GET  /api/giochi                elenco dei giochi dell'organizzazione
 *                                  (con quale e' quello attivo e il limite
 *                                  del piano)
 * POST /api/giochi                aggiunge un gioco nuovo (nome obbligatorio),
 *                                  bloccato dal limite del piano (vedi piani.js)
 * POST /api/giochi/:id/seleziona  cambia il gioco attivo (salvato in sessione)
 *
 * Il gioco "attivo" — quello che Dashboard e Recensioni mostrano — vive
 * SOLO in sessione (vedi middleware/gioco.js), mai in un parametro della
 * richiesta: selezionarne uno e' letteralmente l'unica cosa che
 * POST /:id/seleziona fa con l'id ricevuto, e solo dopo aver verificato
 * che appartenga all'organizzazione di chi ha fatto la richiesta.
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import { richiedeLogin } from '../middleware/auth.js';
import { richiedeGiocoAttivo } from '../middleware/gioco.js';
import { richiedeRuolo } from '../middleware/ruolo.js';
import { verificaLimite } from '../middleware/piano.js';

const router = Router();
// richiedeGiocoAttivo anche qui (non solo su recensioni/integrazioni):
// serve a sapere qual e' il gioco attivo per marcarlo nell'elenco, e sulla
// primissima richiesta dopo il login e' lei a sceglierlo e salvarlo in
// sessione — senza, su una sessione appena aperta req.session.gameId
// sarebbe ancora vuoto e nessun gioco risulterebbe "attivo" finche' non
// fosse gia' stata chiamata un'altra route (es. le recensioni).
router.use(richiedeLogin, richiedeGiocoAttivo);

router.get('/', async (req, res) => {
  const org = await db.findOrgById(req.orgId);
  const limite = verificaLimite(org, 'giochi', req.giochiOrg.length);

  res.json({
    giochi: req.giochiOrg.map((g) => ({ id: g.id, nome: g.name, attivo: g.id === req.gameId })),
    limite_raggiunto: !limite.ok,
    limite: limite.limite ?? null,
  });
});

// Aggiungere un gioco impegna il limite del piano (una risorsa
// dell'intera organizzazione, non una preferenza personale come "quale
// gioco sto guardando ora" qui sotto): solo owner.
router.post('/', richiedeRuolo('owner'), async (req, res) => {
  const { nome } = req.body ?? {};
  if (typeof nome !== 'string' || nome.trim().length === 0) {
    return res.status(400).json({ errore: 'Il nome del gioco è obbligatorio.' });
  }
  if (nome.trim().length > 80) {
    return res.status(400).json({ errore: 'Nome troppo lungo (massimo 80 caratteri).' });
  }

  const org = await db.findOrgById(req.orgId);
  const limite = verificaLimite(org, 'giochi', req.giochiOrg.length);
  if (!limite.ok) {
    return res.status(403).json({
      errore: `Il tuo piano permette di seguire al massimo ${limite.limite} giochi. Fai l'upgrade del piano per aggiungerne altri.`,
    });
  }

  const gioco = await db.createGame(req.orgId, nome.trim());

  // Il gioco appena creato diventa subito quello attivo: e' quello che chi
  // lo ha appena aggiunto si aspetta di vedere, senza un secondo clic sul
  // menu a tendina per selezionarlo.
  req.session.gameId = gioco.id;

  res.status(201).json({ id: gioco.id, nome: gioco.name, attivo: true });
});

router.post('/:id/seleziona', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ errore: 'Id non valido.' });
  }

  const gioco = await db.findGameById(req.orgId, id);
  if (!gioco) return res.status(404).json({ errore: 'Gioco non trovato.' });

  req.session.gameId = gioco.id;
  res.json({ id: gioco.id, nome: gioco.name, attivo: true });
});

export default router;
