/* Astrazione sul modello AI.
 *
 * Esporta UNA funzione: generaRisposta(recensione, tono)
 * Sotto ci stanno piu' implementazioni, scelte da config.aiProvider:
 *   mock       -> risposta finta, nessuna rete, nessun costo
 *   openai     -> POST https://api.openai.com/v1/chat/completions
 *   anthropic  -> POST https://api.anthropic.com/v1/messages
 *
 * Il resto dell'app non deve sapere quale fornitore c'e' sotto.
 * I prezzi e i modelli cambiano ogni pochi mesi: se scrivi il nome del
 * modello sparso in trenta punti del codice, ogni volta rifai il giro.
 *
 * Sviluppa sempre con mock. Accendi il modello vero solo quando devi
 * valutare la qualita' delle risposte.
 *
 * Il prompt vive qui, in un posto solo. Chiedi risposte brevi, in italiano,
 * e vieta esplicitamente di inventare fatti non presenti nella recensione.
 */
