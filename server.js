/* Punto di avvio dell'applicazione.
 *
 * Cosa va scritto qui:
 * - crea l'app Express
 * - abilita la lettura del JSON nelle richieste
 * - configura le sessioni (cookie httpOnly, sameSite lax)
 * - inizializza il database
 * - monta le route sotto /api/...
 * - serve la cartella public/ come file statici
 * - un gestore di errori finale
 * - app.listen sulla porta di config
 *
 * Regola: qui non va nessuna logica applicativa. Solo montaggio.
 */
