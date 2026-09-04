/* Knowledge Base — "Known issues": problemi noti scritti a mano dallo
 * studio, che l'AI puo' usare come contesto per generare risposte piu'
 * mirate. Diversi dai problemi rilevati automaticamente in Issue Detection
 * (quelli restano calcolati al volo dalle recensioni, non sono righe
 * salvate qui — vedi routes/issues.js).
 *
 * GET    /api/conoscenza          elenco dei problemi noti del gioco attivo
 * POST   /api/conoscenza          crea un problema noto
 * PUT    /api/conoscenza/:id      modifica titolo/piattaforme/descrizione/stato
 * DELETE /api/conoscenza/:id      elimina
 *
 * Tutte passano da richiedeLogin + richiedeGiocoAttivo: ogni problema noto
 * appartiene a un gioco, "quale gioco" arriva solo dalla sessione (stesso
 * principio di org_id/game_id usato in reviews.js e integrations.js).
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import { richiedeLogin } from '../middleware/auth.js';
import { richiedeGiocoAttivo } from '../middleware/gioco.js';
import { richiedeRuolo } from '../middleware/ruolo.js';

const router = Router();
router.use(richiedeLogin, richiedeGiocoAttivo);

// La Knowledge Base non e' tra i permessi di un editor (vedi il pannello
// Team members: "Reviews, Replies, Analytics"), solo owner puo' scriverla.
const scrivibileDa = richiedeRuolo('owner');

const STATI_VALIDI = ['aperto', 'in_corso', 'risolto', 'non_pianificato'];

function idNonValido(res, id) {
  if (Number.isInteger(id)) return false;
  res.status(400).json({ errore: 'Id non valido.' });
  return true;
}

router.get('/', async (req, res) => {
  const problemi = await db.listKnownIssues(req.orgId, req.gameId);
  res.json(problemi);
});

router.post('/', scrivibileDa, async (req, res) => {
  const { title, affects, description } = req.body ?? {};

  if (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 200) {
    return res.status(400).json({ errore: 'Il titolo e\' obbligatorio (massimo 200 caratteri).' });
  }
  if (affects !== undefined && affects !== null && typeof affects !== 'string') {
    return res.status(400).json({ errore: 'Campo "affects" non valido.' });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ errore: 'Campo "description" non valido.' });
  }

  const problema = await db.createKnownIssue(req.orgId, req.gameId, {
    title: title.trim(),
    affects: affects?.trim() || null,
    description: description?.trim() || null,
  });
  res.status(201).json(problema);
});

router.put('/:id', scrivibileDa, async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  const { title, affects, description, status } = req.body ?? {};
  const campi = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 200) {
      return res.status(400).json({ errore: 'Titolo non valido.' });
    }
    campi.title = title.trim();
  }
  if (affects !== undefined) {
    if (affects !== null && typeof affects !== 'string') return res.status(400).json({ errore: 'Campo "affects" non valido.' });
    campi.affects = affects?.trim() || null;
  }
  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') return res.status(400).json({ errore: 'Campo "description" non valido.' });
    campi.description = description?.trim() || null;
  }
  if (status !== undefined) {
    if (!STATI_VALIDI.includes(status)) return res.status(400).json({ errore: 'Stato non valido.' });
    campi.status = status;
  }

  const problema = await db.updateKnownIssue(req.orgId, req.gameId, id, campi);
  if (!problema) return res.status(404).json({ errore: 'Problema non trovato.' });
  res.json(problema);
});

router.delete('/:id', scrivibileDa, async (req, res) => {
  const id = Number(req.params.id);
  if (idNonValido(res, id)) return;

  await db.deleteKnownIssue(req.orgId, req.gameId, id);
  res.json({ ok: true });
});

export default router;
