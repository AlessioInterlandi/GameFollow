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

const router = Router();
router.use(richiedeLogin);

function mappaImpostazioni(org) {
  return {
    tono: org.tone,
    invio_automatico: org.auto_send,
    google_collegato: org.google_connected,
  };
}

router.get('/', async (req, res) => {
  const org = await db.findOrgById(req.orgId);
  res.json(mappaImpostazioni(org));
});

router.put('/', async (req, res) => {
  const { tono, invio_automatico } = req.body ?? {};
  const modifiche = {};

  if (tono !== undefined) {
    if (typeof tono !== 'string') return res.status(400).json({ errore: 'Tono non valido.' });
    modifiche.tone = tono;
  }
  if (invio_automatico !== undefined) {
    if (typeof invio_automatico !== 'boolean') return res.status(400).json({ errore: 'Invio automatico non valido.' });
    modifiche.auto_send = invio_automatico;
  }

  const org = await db.updateOrg(req.orgId, modifiche);
  res.json(mappaImpostazioni(org));
});

router.post('/collega-google', (req, res) => {
  res.json({ url: google.urlAutorizzazione(req.orgId) });
});

router.post('/scollega-google', async (req, res) => {
  const org = await db.updateOrg(req.orgId, { google_connected: false });
  res.json(mappaImpostazioni(org));
});

export default router;
