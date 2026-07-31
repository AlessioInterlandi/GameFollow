/* Unico punto in cui il frontend parla col backend.
 *
 * Esporta:
 *   api(percorso, opzioni)   wrapper su fetch verso /api
 *   mostraMessaggio(testo, tipo)
 *   caricaIntestazione()     nome azienda + gestione del logout
 *
 * Il wrapper deve: mettere l'header JSON, e se riceve 401 rimandare al login.
 * Cosi' la gestione della sessione scaduta la scrivi una volta sola.
 *
 * Qui dentro non deve MAI comparire una chiave API: le chiavi restano
 * nel backend. Tutto quello che sta in questa cartella e' leggibile
 * da chiunque apra gli strumenti per sviluppatori del browser.
 */
