/* Guardia di accesso, da mettere davanti a tutte le route protette.
 *
 * Deve:
 * - bloccare con 401 chi non ha una sessione valida
 * - leggere org_id DALLA SESSIONE e appoggiarlo su req.orgId
 *
 * La riga che conta:
 *   req.orgId = req.session.orgId;
 *
 * org_id non deve MAI arrivare da req.body, req.query o req.params.
 * Se lo prendessi dal client, chiunque potrebbe cambiare un numero
 * nella richiesta e leggere i dati di un altro cliente.
 * E' l'errore piu' grave possibile in un SaaS multi-cliente.
 */
