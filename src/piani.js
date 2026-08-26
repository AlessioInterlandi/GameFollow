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
  },
  indie: {
    nome: 'Indie',
    prezzo_mensile: 49,
    stripe_price_id: config.stripe.prezzoIndie,
    limiti: { giochi: 1, piattaforme: 3, recensioni_mese: 2000 },
  },
  studio: {
    nome: 'Studio',
    prezzo_mensile: 149,
    stripe_price_id: config.stripe.prezzoStudio,
    limiti: { giochi: 5, piattaforme: 10, recensioni_mese: 20000 },
  },
  publisher: {
    nome: 'Publisher',
    prezzo_mensile: 399,
    stripe_price_id: config.stripe.prezzoPublisher,
    limiti: { giochi: null, piattaforme: null, recensioni_mese: 100000 },
  },
};

// Piani acquistabili da soli tramite Stripe Checkout (esclude 'gratis',
// che non ha un prezzo, e 'enterprise', che non esiste come oggetto qui).
export function pianoAcquistabile(id) {
  const piano = PIANI[id];
  return !!piano && !!piano.stripe_price_id;
}
