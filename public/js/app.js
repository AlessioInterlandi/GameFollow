/* Logica della dashboard.
 *
 * Funzioni da scrivere:
 *   caricaStats()      riempie i contatori
 *   caricaLista()      scarica le recensioni e le disegna
 *   schedaRecensione() costruisce l'HTML di una singola recensione
 *   genera(id) / pubblica(id) / ignora(id)
 *   gestione dei filtri per stato e del pulsante di sincronizzazione
 *
 * Ogni testo che arriva dal database va passato in una funzione di escape
 * prima di finire nell'HTML. Il nome di chi scrive la recensione lo decide
 * un estraneo: se lo inserisci grezzo nella pagina, quello e' un buco XSS.
 */
