/* Preferenze di notifica — PERSONALI, non dell'organizzazione: ogni utente
 * (qualunque ruolo, non solo owner: non e' un'azione di gestione del
 * team/billing) legge e salva solo le proprie.
 *
 * GET /api/notifiche   preferenze attuali (default "di fabbrica" se non
 *                       le ha ancora mai salvate — vedi schema.sql)
 * PUT /api/notifiche    salva le modifiche
 *
 * Solo email/in-app + i 5 eventi con un vero significato nell'app: niente
 * Slack/Discord/Mentions (vedi il commento nell'HTML di Impostazioni) —
 * nessun canale li invia davvero, quindi niente preferenza finta da
 * salvare per loro.
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import { richiedeLogin } from '../middleware/auth.js';

const router = Router();
router.use(richiedeLogin);

const CAMPI_BOOLEANI = [
  'email_enabled', 'inapp_enabled',
  'event_new_reviews', 'event_critical_issues', 'event_replies_pending', 'event_weekly_digest', 'event_billing',
];

router.get('/', async (req, res) => {
  res.json(await db.getNotificationPreferences(req.userId));
});

router.put('/', async (req, res) => {
  const modifiche = {};
  for (const campo of CAMPI_BOOLEANI) {
    if (req.body?.[campo] !== undefined) {
      if (typeof req.body[campo] !== 'boolean') {
        return res.status(400).json({ errore: `Campo "${campo}" non valido.` });
      }
      modifiche[campo] = req.body[campo];
    }
  }

  const attuali = await db.getNotificationPreferences(req.userId);
  const aggiornate = await db.setNotificationPreferences(req.userId, { ...attuali, ...modifiche });
  res.json(aggiornate);
});

export default router;
