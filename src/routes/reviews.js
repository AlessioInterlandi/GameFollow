/* Le recensioni: il cuore del prodotto.
 *
 * GET  /api/recensioni            elenco, filtrabile per stato
 * GET  /api/recensioni/stats      contatori per la dashboard
 * POST /api/recensioni/sync       scarica nuove recensioni
 * POST /api/recensioni/:id/genera   chiede la bozza al modello AI
 * PUT  /api/recensioni/:id/bozza    salva le correzioni fatte a mano
 * POST /api/recensioni/:id/approva  pubblica la risposta
 * POST /api/recensioni/:id/ignora   la archivia senza rispondere
 *
 * Tutte passano da richiedeLogin: usano sempre req.orgId (dalla sessione).
 *
 * genera e sync fanno chiamate di rete lente (AI, sorgente esterna): non
 * bloccano la risposta HTTP, vengono accodate come job in background
 * (services/queue.js) e rispondono subito con 202.
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import * as ai from '../services/ai.js';
import * as google from '../services/google.js';
import * as n8n from '../services/n8n.js';
import * as email from '../services/email.js';
import { richiedeLogin } from '../middleware/auth.js';
import { jobQueue } from '../services/queue.js';

const router = Router();
router.use(richiedeLogin);

function idNonValido(res, id) {
  if (Number.isInteger(id)) return false;
  res.status(400).json({ errore: 'Id non valido.' });
  return true;
}

router.get('/', async (req, res) => {
  const { stato } = req.query;
  const recensioni = await db.listReviews(req.orgId, { status: typeof stato === 'string' ? stato : undefined });
  res.json(recensioni);
});

router.get('/stats', async (req, res) => {
  res.json(await db.stats(req.orgId));
});

router.post('/sync', (req, res) => {
  const { orgId } = req;

  jobQueue.accoda(`sync-recensioni:${orgId}`, async () => {
    const nuove = await google.scaricaNuoveRecensioni(10);
    for (const recensione of nuove) {
      await db.insertReview(orgId, recensione);
    }
    await n8n.lanciaWorkflow('nuove-recensioni', { orgId, quante: nuove.length });
  });

  res.status(202).json({ accodato: true });
});

router.post('/:id/genera', async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const recensione = await db.getReview(req.orgId, id);
  if (!recensione) return res.status(404).json({ errore: 'Recensione non trovata.' });

  // La recensione piu' economica da gestire e' quella che non chiede
  // niente al modello: 5 stelle senza testo merita un template, non
  // una chiamata a pagamento.
  if (recensione.rating === 5 && !recensione.text) {
    await db.updateReview(req.orgId, id, {
      draft_reply: 'Thank you so much for the 5 stars!',
      status: 'da_approvare',
    });
    return res.json({ accodato: false, motivo: 'template' });
  }

  const { orgId } = req;
  const emailProprietario = req.session.email;

  jobQueue.accoda(`genera-risposta:${orgId}:${id}`, async () => {
    const org = await db.findOrgById(orgId);
    const bozza = await ai.generaRisposta(recensione, org?.tone);
    const rischio = ai.classificaRischio(recensione);

    if (org?.auto_send && rischio === 'auto') {
      await google.pubblicaRisposta(id, bozza);
      await db.updateReview(orgId, id, { draft_reply: bozza, published_reply: bozza, status: 'pubblicata' });

      if (emailProprietario) {
        jobQueue.accoda(`email-auto-risposta:${orgId}:${id}`, () =>
          email.inviaEmail(
            emailProprietario,
            'Risposta pubblicata automaticamente',
            `La recensione di ${recensione.author} (${recensione.rating}/5) ha ricevuto una risposta automatica:\n\n${bozza}`
          )
        );
      }
    } else {
      await db.updateReview(orgId, id, { draft_reply: bozza, status: 'da_approvare' });
    }
  });

  res.status(202).json({ accodato: true });
});

router.put('/:id/bozza', async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const { testo } = req.body ?? {};
  if (typeof testo !== 'string' || testo.trim() === '') {
    return res.status(400).json({ errore: 'Testo mancante.' });
  }

  const aggiornata = await db.updateReview(req.orgId, id, { draft_reply: testo });
  if (!aggiornata) return res.status(404).json({ errore: 'Recensione non trovata.' });

  res.json(aggiornata);
});

router.post('/:id/approva', async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const recensione = await db.getReview(req.orgId, id);
  if (!recensione) return res.status(404).json({ errore: 'Recensione non trovata.' });
  if (!recensione.draft_reply) return res.status(400).json({ errore: 'Nessuna bozza da pubblicare.' });

  await google.pubblicaRisposta(id, recensione.draft_reply);
  const aggiornata = await db.updateReview(req.orgId, id, {
    published_reply: recensione.draft_reply,
    status: 'pubblicata',
  });

  res.json(aggiornata);
});

router.post('/:id/ignora', async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const aggiornata = await db.updateReview(req.orgId, id, { status: 'ignorata' });
  if (!aggiornata) return res.status(404).json({ errore: 'Recensione non trovata.' });

  res.json(aggiornata);
});

export default router;
