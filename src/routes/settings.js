/* Impostazioni dell'azienda cliente.
 *
 * GET  /api/impostazioni                 tono, invio automatico, stato Google
 * PUT  /api/impostazioni                 salva le modifiche
 * POST /api/impostazioni/collega-google  avvia il collegamento
 * POST /api/impostazioni/scollega-google
 *
 * Il PUT accetta solo i campi attesi, uno per uno: mai passare req.body
 * direttamente al database, l'utente potrebbe infilarci campi che non deve
 * poter modificare (per esempio il piano).
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import * as google from '../services/google.js';
import { richiedeLogin } from '../middleware/auth.js';
import { richiedeRuolo } from '../middleware/ruolo.js';
import { pianoEffettivo } from '../piani.js';

const router = Router();
router.use(richiedeLogin);

const LINGUE_VALIDE = ['it', 'en', 'es', 'fr'];

function mappaImpostazioni(org) {
  return {
    tono: org.tone,
    invio_automatico: org.auto_send,
    google_collegato: org.google_connected,
    lingua_sito: org.language || 'it',
  };
}

router.get('/', async (req, res) => {
  const org = await db.findOrgById(req.orgId);
  res.json(mappaImpostazioni(org));
});

router.put('/', richiedeRuolo('owner'), async (req, res) => {
  const { tono, invio_automatico, lingua_sito } = req.body ?? {};
  const modifiche = {};

  if (lingua_sito !== undefined) {
    if (typeof lingua_sito !== 'string' || !LINGUE_VALIDE.includes(lingua_sito)) {
      return res.status(400).json({ errore: `Lingua non valida. Valori validi: ${LINGUE_VALIDE.join(', ')}.` });
    }
    modifiche.language = lingua_sito;
  }

  if (tono !== undefined) {
    if (typeof tono !== 'string') return res.status(400).json({ errore: 'Tono non valido.' });
    modifiche.tone = tono;
  }
  if (invio_automatico !== undefined) {
    if (typeof invio_automatico !== 'boolean') return res.status(400).json({ errore: 'Invio automatico non valido.' });

    // Si puo' sempre SPEGNERE l'invio automatico (nessun piano lo richiede
    // per farlo), ma accenderlo richiede che il piano attuale lo includa —
    // altrimenti un account gratuito/Indie potrebbe attivarlo cambiando
    // solo la chiamata fetch, bypassando del tutto il piano a pagamento.
    if (invio_automatico) {
      const org = await db.findOrgById(req.orgId);
      if (!pianoEffettivo(org).features.ai_automation) {
        return res.status(403).json({
          errore: "L'invio automatico delle risposte richiede il piano Studio o superiore.",
          piano_richiesto: 'studio',
        });
      }
    }

    modifiche.auto_send = invio_automatico;
  }

  const org = await db.updateOrg(req.orgId, modifiche);
  res.json(mappaImpostazioni(org));
});

router.post('/collega-google', richiedeRuolo('owner'), (req, res) => {
  res.json({ url: google.urlAutorizzazione(req.orgId) });
});

router.post('/scollega-google', richiedeRuolo('owner'), async (req, res) => {
  const org = await db.updateOrg(req.orgId, { google_connected: false });
  res.json(mappaImpostazioni(org));
});

export default router;
