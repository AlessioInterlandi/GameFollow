/* Autenticazione.
 *
 * POST /api/auth/login    email + password -> apre la sessione
 * POST /api/auth/logout   distrugge la sessione
 * GET  /api/auth/me       dati dell'utente e dell'azienda collegata
 *
 * Al login salva in sessione sia userId che orgId.
 * In caso di credenziali sbagliate rispondi sempre con lo stesso messaggio
 * generico: non dire mai se e' l'email o la password a essere errata.
 */
