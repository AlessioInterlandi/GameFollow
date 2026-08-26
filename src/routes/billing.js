/* Abbonamento.
 *
 * POST /api/abbonamento/checkout   attiva il piano
 * POST /api/abbonamento/disdici
 * POST /api/abbonamento/webhook    NON protetta da login: la chiama Stripe
 *
 * Ora e' finto. Con Stripe: checkout crea una Checkout Session e restituisce
 * l'url a cui mandare il cliente; il piano si aggiorna SOLO dal webhook,
 * mai su richiesta diretta del frontend — altrimenti chiunque potrebbe
 * attivarsi l'abbonamento da solo cambiando una chiamata fetch.
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import * as email from '../services/email.js';
import { richiedeLogin } from '../middleware/auth.js';
import { jobQueue } from '../services/queue.js';

const router = Router();

router.post('/checkout', richiedeLogin, async (req, res) => {
  const org = await db.updateOrg(req.orgId, { plan: 'pro' });
  res.json({ ok: true, piano: org.plan });
});

router.post('/disdici', richiedeLogin, async (req, res) => {
  const org = await db.updateOrg(req.orgId, { plan: 'gratis' });

  const destinatario = req.session.email;
  if (destinatario) {
    jobQueue.accoda(`email-disdetta:${req.orgId}`, () =>
      email.inviaEmail(
        destinatario,
        'Disdetta registrata',
        "Abbiamo registrato la disdetta del tuo abbonamento. Il servizio resta attivo fino alla fine del periodo gia' pagato."
      )
    );
  }

  res.json({ ok: true, piano: org.plan });
});

// Non protetta da richiedeLogin: chi la chiama e' Stripe, non un browser
// con una sessione utente. La firma dell'evento si verifica qui quando
// l'integrazione sara' reale.
router.post('/webhook', (_req, res) => {
  res.status(200).json({ ricevuto: true });
});

export default router;
