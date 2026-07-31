/* Hashing delle password.
 *
 * Esporta:
 *   hash(password)            -> stringa da salvare nel database
 *   verify(password, salvata) -> true/false
 *
 * Usa scrypt del modulo crypto di Node (nessuna dipendenza esterna),
 * con un salt casuale diverso per ogni utente, salvato insieme all'hash.
 *
 * Per il confronto usa timingSafeEqual, non ===.
 * Le password in chiaro non vanno mai salvate, ne' scritte nei log.
 */
