/* Impostazioni dell'azienda cliente.
 *
 * GET  /api/impostazioni                 tono, invio automatico, stato Google
 * PUT  /api/impostazioni                 salva le modifiche
 * POST /api/impostazioni/collega-google  avvia il collegamento
 * POST /api/impostazioni/scollega-google
 *
 * Nel PUT accetta solo i campi che ti aspetti, uno per uno.
 * Non passare mai req.body direttamente al database: l'utente potrebbe
 * infilarci campi che non deve poter modificare (per esempio il piano).
 */
