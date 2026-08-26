/* I piani a pagamento, in un posto solo.
 *
 * L'id di ogni piano ('indie', 'studio', 'publisher') e' anche il valore
 * salvato in organizations.plan. 'gratis' non ha uno stripe_price_id: non
 * passa mai da Stripe Checkout, e' lo stato di partenza e quello a cui si
 * torna quando un abbonamento scade o viene disdetto.
 *
 * 'enterprise' non e' qui: e' "su misura" (vedi README), si vende a mano
 * per email/chiamata, non con un pulsante di self-checkout.
 *
 * stripe_price_id arriva dal .env: i Price vanno creati una volta sola
 * nella dashboard Stripe (Products), qui c'e' solo l'id di riferimento.
 * Se manca la variabile d'ambiente, quel piano non e' acquistabile finche'
 * non viene configurato — meglio un piano "non disponibile" che un prezzo
 * sbagliato.
 */
import { config } from './config.js';

export const PIANI = {
  gratis: {
    nome: 'Free',
    prezzo_mensile: 0,
    stripe_price_id: null,
    limiti: { giochi: 1, piattaforme: 1, recensioni_mese: 200 },
    features: { ai_automation: false, issue_detection: false, competitor_analysis: false },
  },
  indie: {
    nome: 'Indie',
    prezzo_mensile: 49,
    stripe_price_id: config.stripe.prezzoIndie,
    limiti: { giochi: 1, piattaforme: 3, recensioni_mese: 2000 },
    features: { ai_automation: false, issue_detection: false, competitor_analysis: false },
  },
  studio: {
    nome: 'Studio',
    prezzo_mensile: 149,
    stripe_price_id: config.stripe.prezzoStudio,
    limiti: { giochi: 5, piattaforme: 10, recensioni_mese: 20000 },
    features: { ai_automation: true, issue_detection: true, competitor_analysis: false },
  },
  publisher: {
    nome: 'Publisher',
    prezzo_mensile: 399,
    stripe_price_id: config.stripe.prezzoPublisher,
    limiti: { giochi: null, piattaforme: null, recensioni_mese: 100000 },
    features: { ai_automation: true, issue_detection: true, competitor_analysis: true },
  },
};

// Piani acquistabili da soli tramite Stripe Checkout (esclude 'gratis',
// che non ha un prezzo, e 'enterprise', che non esiste come oggetto qui).
export function pianoAcquistabile(id) {
  const piano = PIANI[id];
  return !!piano && !!piano.stripe_price_id;
}

// Il piano che conta DAVVERO per limiti e feature — non e' detto che sia
// organizations.plan!
//
// plan_status puo' essere:
//   'nessuno'      mai stato un abbonamento a pagamento -> gratis
//   'attivo'       pagamento a posto -> il piano vale
//   'in_scadenza'  disdetta richiesta (/disdici) O pagamento fallito
//                  (invoice.payment_failed): in ENTRAMBI i casi l'accesso
//                  resta quello del piano pagato finche' current_period_end
//                  non e' passato, perche' quel periodo e' gia' stato
//                  pagato — vedi il commento in routes/billing.js su
//                  /disdici. Dopo quella data, o se current_period_end
//                  manca del tutto, si scende a gratis.
//   'scaduto'      abbonamento terminato per davvero -> gratis (il webhook
//                  customer.subscription.deleted riporta gia' anche
//                  organizations.plan a 'gratis', questa funzione lo fa
//                  rispettare anche se per qualche motivo non fosse cosi')
//
// Questa e' la funzione da usare in ogni route/middleware che decide se
// una risorsa a pagamento e' accessibile. organizations.plan da solo NON
// basta: e' "l'ultimo piano pagato", utile per il pulsante di re-abbonamento,
// ma non deve mai concedere accesso da solo.
export function pianoEffettivoId(org) {
  if (!org) return 'gratis';
  if (org.plan_status === 'attivo' && PIANI[org.plan]) return org.plan;

  if (org.plan_status === 'in_scadenza' && PIANI[org.plan] && org.current_period_end) {
    const scadenza = new Date(org.current_period_end);
    if (!Number.isNaN(scadenza.getTime()) && scadenza.getTime() > Date.now()) return org.plan;
  }

  return 'gratis';
}

export function pianoEffettivo(org) {
  return PIANI[pianoEffettivoId(org)];
}
