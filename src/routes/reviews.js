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
import { richiedeGiocoAttivo } from '../middleware/gioco.js';
import { richiedeRuolo } from '../middleware/ruolo.js';
import { verificaLimite } from '../middleware/piano.js';
import { pianoEffettivo } from '../piani.js';
import { jobQueue } from '../services/queue.js';

const router = Router();
// richiedeGiocoAttivo DOPO richiedeLogin: ogni recensione appartiene a un
// gioco, e "quale gioco" per questa richiesta viene solo dalla sessione
// (req.gameId), mai da query/body/params — stesso principio di org_id.
router.use(richiedeLogin, richiedeGiocoAttivo);

// Scrittura riservata a owner/editor (un viewer legge tutto, non scrive
// nulla — vedi middleware/ruolo.js). Passata a mano a ogni route che
// scrive, non con un .use() a livello di router: le GET devono restare
// aperte a tutti i ruoli, ed elencarla esplicitamente route per route
// evita che l'ordine in cui sono dichiarate le route in questo file
// diventi silenziosamente rilevante per la sicurezza.
const scrivibileDa = richiedeRuolo('owner', 'editor');

function idNonValido(res, id) {
  if (Number.isInteger(id)) return false;
  res.status(400).json({ errore: 'Id non valido.' });
  return true;
}

router.get('/', async (req, res) => {
  const { stato } = req.query;
  const recensioni = await db.listReviews(req.orgId, req.gameId, { status: typeof stato === 'string' ? stato : undefined });
  res.json(recensioni);
});

router.get('/stats', async (req, res) => {
  res.json(await db.stats(req.orgId, req.gameId));
});

router.post('/sync', scrivibileDa, async (req, res) => {
  const { orgId, gameId } = req;

  // Il limite recensioni_mese esiste per contenere il costo delle chiamate
  // AI/di sync, non per punire chi lo raggiunge: bloccarlo qui, PRIMA di
  // accodare il job, evita di scaricare recensioni che poi non potremmo
  // comunque processare, e da' subito un errore chiaro invece di un 202
  // silenzioso che non porta a nulla.
  const org = await db.findOrgById(orgId);
  const usoAttuale = await db.contaRecensioniMese(orgId);
  const limite = verificaLimite(org, 'recensioni_mese', usoAttuale);
  if (!limite.ok) {
    return res.status(403).json({
      errore: `Limite di ${limite.limite} recensioni al mese raggiunto per il tuo piano attuale.`,
    });
  }

  jobQueue.accoda(`sync-recensioni:${orgId}:${gameId}`, async () => {
    const integrazioni = await db.listIntegrations(orgId, gameId);
    const piattaforme = integrazioni
      .filter((r) => r.connected && ['steam', 'google_play', 'app_store', 'xbox'].includes(r.provider))
      .map((r) => r.provider);

    const nuove = await google.scaricaNuoveRecensioni(10, piattaforme);
    for (const recensione of nuove) {
      await db.insertReview(orgId, gameId, recensione);
    }
    await n8n.lanciaWorkflow('nuove-recensioni', { orgId, gameId, quante: nuove.length });
  });

  res.status(202).json({ accodato: true });
});

// Scrivere una recensione a mano e lasciarla analizzare dal sito, senza
// passare da nessuna API esterna (vera o mock): utile per provare risposte
// AI e Issue Detection su un testo vero, o per piattaforme senza API di
// recensioni (es. l'App Store le dà col contagocce). Conta sullo stesso
// limite recensioni_mese del sync: entra comunque nello stesso conteggio
// di "quante recensioni processiamo questo mese".
router.post('/manuale', scrivibileDa, async (req, res) => {
  const { orgId } = req;
  const { autore, rating, testo, piattaforma } = req.body ?? {};

  const ratingNumero = Number(rating);
  if (!Number.isInteger(ratingNumero) || ratingNumero < 1 || ratingNumero > 5) {
    return res.status(400).json({ errore: 'Rating non valido (deve essere un intero da 1 a 5).' });
  }
  if (typeof testo !== 'string' || testo.trim() === '') {
    return res.status(400).json({ errore: 'Il testo della recensione è obbligatorio.' });
  }
  const piattaformeValide = ['steam', 'google_play', 'app_store', 'xbox'];
  if (piattaforma !== undefined && !piattaformeValide.includes(piattaforma)) {
    return res.status(400).json({ errore: 'Piattaforma non valida.' });
  }

  const org = await db.findOrgById(orgId);
  const usoAttuale = await db.contaRecensioniMese(orgId);
  const limite = verificaLimite(org, 'recensioni_mese', usoAttuale);
  if (!limite.ok) {
    return res.status(403).json({
      errore: `Limite di ${limite.limite} recensioni al mese raggiunto per il tuo piano attuale.`,
    });
  }

  const recensione = await db.insertReview(orgId, req.gameId, {
    author: (typeof autore === 'string' && autore.trim()) || 'Manual entry',
    rating: ratingNumero,
    text: testo.trim(),
    review_date: new Date().toISOString(),
    platform: piattaforma ?? 'steam',
  });

  res.status(201).json(recensione);
});

router.post('/:id/genera', scrivibileDa, async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const recensione = await db.getReview(req.orgId, req.gameId, id);
  if (!recensione) return res.status(404).json({ errore: 'Recensione non trovata.' });

  // La recensione piu' economica da gestire e' quella che non chiede
  // niente al modello: 5 stelle senza testo merita un template, non
  // una chiamata a pagamento.
  if (recensione.rating === 5 && !recensione.text) {
    await db.updateReview(req.orgId, req.gameId, id, {
      draft_reply: 'Thank you so much for the 5 stars!',
      status: 'da_approvare',
    });
    return res.json({ accodato: false, motivo: 'template' });
  }

  const { orgId, gameId } = req;
  const emailProprietario = req.session.email;

  jobQueue.accoda(`genera-risposta:${orgId}:${gameId}:${id}`, async () => {
    const org = await db.findOrgById(orgId);
    const bozza = await ai.generaRisposta(recensione, org?.tone);
    const rischio = ai.classificaRischio(recensione);

    // org.auto_send da solo non basta: potrebbe essere rimasto 'true' da
    // prima che il piano scendesse a Free/Indie (pagamento fallito,
    // disdetta, ecc. — vedi piani.js). Ricontrolliamo il piano EFFETTIVO
    // al momento dell'invio, non solo quando l'impostazione viene salvata
    // (settings.js blocca gia' l'accensione, ma questo e' il controllo che
    // conta davvero: e' quello che decide se pubblichiamo qualcosa a nome
    // dello studio senza che un umano l'abbia approvato).
    const autoAttivo = org?.auto_send && pianoEffettivo(org).features.ai_automation;

    if (autoAttivo && rischio === 'auto') {
      await google.pubblicaRisposta(id, bozza);
      await db.updateReview(orgId, gameId, id, { draft_reply: bozza, published_reply: bozza, status: 'pubblicata' });

      if (emailProprietario) {
        jobQueue.accoda(`email-auto-risposta:${orgId}:${gameId}:${id}`, () =>
          email.inviaEmail(
            emailProprietario,
            'Risposta pubblicata automaticamente',
            `La recensione di ${recensione.author} (${recensione.rating}/5) ha ricevuto una risposta automatica:\n\n${bozza}`
          )
        );
      }
    } else {
      await db.updateReview(orgId, gameId, id, { draft_reply: bozza, status: 'da_approvare' });
    }
  });

  res.status(202).json({ accodato: true });
});

router.put('/:id/bozza', scrivibileDa, async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const { testo } = req.body ?? {};
  if (typeof testo !== 'string' || testo.trim() === '') {
    return res.status(400).json({ errore: 'Testo mancante.' });
  }

  const aggiornata = await db.updateReview(req.orgId, req.gameId, id, { draft_reply: testo });
  if (!aggiornata) return res.status(404).json({ errore: 'Recensione non trovata.' });

  res.json(aggiornata);
});

router.post('/:id/approva', scrivibileDa, async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const recensione = await db.getReview(req.orgId, req.gameId, id);
  if (!recensione) return res.status(404).json({ errore: 'Recensione non trovata.' });
  if (!recensione.draft_reply) return res.status(400).json({ errore: 'Nessuna bozza da pubblicare.' });

  await google.pubblicaRisposta(id, recensione.draft_reply);
  const aggiornata = await db.updateReview(req.orgId, req.gameId, id, {
    published_reply: recensione.draft_reply,
    status: 'pubblicata',
  });

  res.json(aggiornata);
});

router.post('/:id/ignora', scrivibileDa, async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const aggiornata = await db.updateReview(req.orgId, req.gameId, id, { status: 'ignorata' });
  if (!aggiornata) return res.status(404).json({ errore: 'Recensione non trovata.' });

  res.json(aggiornata);
});

export default router;
