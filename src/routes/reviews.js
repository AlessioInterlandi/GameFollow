/* Le recensioni: il cuore del prodotto.
 *
 * Tutte le route qui dentro passano prima dal middleware di autenticazione.
 *
 * GET  /api/recensioni            elenco, filtrabile per stato
 * GET  /api/recensioni/stats      contatori per la dashboard
 * POST /api/recensioni/sync       scarica nuove recensioni da Google
 * POST /api/recensioni/:id/genera   chiede la bozza al modello AI
 * PUT  /api/recensioni/:id/bozza    salva le correzioni fatte a mano
 * POST /api/recensioni/:id/approva  pubblica la risposta su Google
 * POST /api/recensioni/:id/ignora   la archivia senza rispondere
 *
 * Usa sempre req.orgId (dalla sessione) nelle chiamate al database.
 *
 * Prima di chiamare il modello, metti un filtro: le recensioni banali
 * (5 stelle senza testo) meritano un template, non una chiamata a pagamento.
 * La chiamata piu' economica e' quella che non fai.
 */
