/* Guardie legate al piano/abbonamento, da usare DOPO richiedeLogin (serve
 * req.orgId dalla sessione).
 *
 * richiedeFeature('ai_automation') protegge azioni booleane (una feature
 * o ce l'hai o non ce l'hai, es. invio automatico delle risposte).
 *
 * verificaLimite(...) e' invece per i limiti numerici (piattaforme
 * collegate, recensioni scaricate questo mese): non e' un middleware da
 * solo perche' ogni route deve prima contare l'uso attuale a modo suo
 * (query diverse), quindi le route la chiamano a mano dopo aver contato.
 *
 * In entrambi i casi il piano che conta e' quello EFFETTIVO (vedi
 * piani.js/pianoEffettivo): un pagamento fallito o un abbonamento scaduto
 * negano l'accesso alle risorse a pagamento anche se organizations.plan
 * dice ancora 'studio' o 'publisher'.
 */
import * as db from '../db/index.js';
import { PIANI, pianoEffettivo, pianoEffettivoId } from '../piani.js';

// Piano minimo (tra indie/studio/publisher, in quest'ordine) che sblocca
// una data feature — usato solo per il messaggio d'errore, cosi' l'utente
// sa subito a cosa fare l'upgrade invece di scoprirlo per tentativi.
function pianoMinimoPer(feature) {
  return Object.entries(PIANI).find(([, p]) => p.features?.[feature])?.[0] ?? null;
}

export function richiedeFeature(feature) {
  return async (req, res, next) => {
    const org = await db.findOrgById(req.orgId);
    const piano = pianoEffettivo(org);

    if (piano?.features?.[feature]) {
      req.pianoEffettivoId = pianoEffettivoId(org);
      return next();
    }

    res.status(403).json({
      errore: 'Questa funzione non e\' inclusa nel tuo piano attuale.',
      feature,
      piano_richiesto: pianoMinimoPer(feature),
    });
  };
}

// Non un middleware: le route la chiamano dopo aver contato l'uso attuale
// a modo loro (query diverse per "piattaforme collegate" vs "recensioni
// di questo mese"). limite null = illimitato per quel piano.
export function verificaLimite(org, chiaveLimite, usoAttuale) {
  const limite = pianoEffettivo(org)?.limiti?.[chiaveLimite];
  if (limite == null) return { ok: true };
  return { ok: usoAttuale < limite, limite };
}
