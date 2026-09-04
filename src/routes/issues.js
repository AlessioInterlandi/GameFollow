/* Issue Detection: raggruppa le recensioni in "problemi" per numero di
 * occorrenze, piattaforma, andamento nel tempo — vedi services/pythonAnalytics.js
 * per il perche' e' Python a fare i calcoli, non questo file.
 *
 * GET /api/problemi           elenco dei problemi rilevati
 * GET /api/problemi/grafico   lo stesso elenco come immagine PNG
 *
 * Feature riservata a Studio/Publisher (vedi piani.js): richiedeFeature
 * la blocca per chi e' su Free/Indie o ha un pagamento non a posto, PRIMA
 * di sprecare tempo a leggere le recensioni e lanciare Python.
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import * as analytics from '../services/pythonAnalytics.js';
import { richiedeLogin } from '../middleware/auth.js';
import { richiedeGiocoAttivo } from '../middleware/gioco.js';
import { richiedeFeature } from '../middleware/piano.js';

const router = Router();
// Anche questa e' scoperta per gioco: e' il pannello "Top reported issues"
// che compare nella stessa Dashboard che mostra il gioco attivo, quindi
// deve analizzare le recensioni di QUEL gioco, non di tutti insieme.
router.use(richiedeLogin, richiedeGiocoAttivo, richiedeFeature('issue_detection'));

function gestisciErrorePython(err, res) {
  if (err.message === analytics.ERRORE_PYTHON_MANCANTE) {
    console.error('Issue Detection: Python non trovato nel PATH (provati python3 e python).');
    return res.status(503).json({
      errore: "Analisi non disponibile: Python non e' installato o non e' nel PATH di questo server.",
    });
  }
  console.error('Issue Detection: errore da analisi_problemi.py:', err);
  return res.status(500).json({ errore: 'Errore interno durante il calcolo.' });
}

router.get('/', async (req, res) => {
  const recensioni = await db.listReviews(req.orgId, req.gameId);

  try {
    const problemi = await analytics.rileva(recensioni);
    res.json({ problemi, totale_recensioni_analizzate: recensioni.length });
  } catch (err) {
    gestisciErrorePython(err, res);
  }
});

router.get('/grafico', async (req, res) => {
  const recensioni = await db.listReviews(req.orgId, req.gameId);

  try {
    const png = await analytics.generaGrafico(recensioni);
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    gestisciErrorePython(err, res);
  }
});

export default router;
