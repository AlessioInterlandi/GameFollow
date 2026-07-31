/* Unico punto di contatto tra l'applicazione e il database.
 *
 * Sceglie il driver in base a config.dbDriver ed esporta le funzioni
 * con nomi neutri, che non dicono quale database c'e' sotto:
 *   init, findUserByEmail, findOrgById, updateOrg,
 *   listReviews, getReview, updateReview, insertReview, stats
 *
 * Mappa dei driver disponibili:
 *   sqlite    -> ./sqlite.js     un file sul disco, zero configurazione
 *   supabase  -> ./supabase.js   PostgreSQL ospitato
 *
 * Perche' esiste questo file: le route importano SOLO da qui.
 * Cambiare database significa scrivere un nuovo driver con le stesse
 * funzioni e cambiare una riga nel .env. Nessuna route va toccata.
 *
 * Attenzione: le funzioni Supabase sono asincrone mentre quelle SQLite no.
 * Conviene dichiarare async l'interfaccia fin dall'inizio e usare await
 * nelle route anche con SQLite, cosi' il passaggio non richiede modifiche.
 */
