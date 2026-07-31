/* Tutte le variabili d'ambiente lette in un posto solo.
 *
 * Esporta un oggetto `config` con:
 * - port, sessionSecret
 * - dbDriver                       'sqlite' oppure 'supabase'
 * - sqliteFile                     se dbDriver = sqlite
 * - supabaseUrl, supabaseAnonKey, supabaseServiceKey
 * - aiProvider, aiApiKey, aiModel
 * - n8nWebhookUrl
 * - prezzoMensile
 *
 * Regola: process.env non deve comparire da nessun'altra parte nel progetto.
 * Se un giorno cambi il nome di una variabile, cambi solo questo file.
 *
 * Utile aggiungere un controllo all'avvio: se dbDriver e' 'supabase' ma
 * mancano URL o chiave, meglio fermarsi subito con un errore chiaro
 * che scoprirlo alla prima query.
 */
