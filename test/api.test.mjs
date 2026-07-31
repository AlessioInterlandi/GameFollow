/* Test delle API. Avvia il server e lo interroga con fetch.
 *
 * I controlli che servono davvero:
 * - senza login le route protette rispondono 401
 * - password sbagliata rifiutata
 * - login corretto apre la sessione
 * - due account diversi appartengono a organizzazioni diverse
 *
 * - ISOLAMENTO: l'utente A vede solo le proprie recensioni
 * - ISOLAMENTO: l'utente A non puo' agire su una risorsa di B (404)
 *   Questi due sono i piu' importanti di tutti. Se un giorno si rompono,
 *   devi accorgertene qui e non da un cliente arrabbiato.
 *
 * - flusso completo: genera bozza -> correggi -> pubblica
 * - sync aggiunge recensioni
 * - le impostazioni si salvano
 */
