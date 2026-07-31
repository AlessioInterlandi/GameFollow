/* Abbonamento.
 *
 * POST /api/abbonamento/checkout   attiva il piano
 * POST /api/abbonamento/disdici
 *
 * Ora e' finto. Con Stripe diventera':
 * - checkout crea una Checkout Session e restituisce l'url a cui mandare il cliente
 * - serve inoltre una route webhook (NON protetta da login, perche' la chiama
 *   Stripe e non il browser) che riceve gli eventi di pagamento e aggiorna il piano
 *
 * Il piano deve essere aggiornato solo dal webhook, mai su richiesta del
 * frontend: altrimenti chiunque potrebbe attivarsi l'abbonamento da solo.
 */
