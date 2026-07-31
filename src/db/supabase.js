/* Implementazione Supabase (PostgreSQL) delle funzioni di db/index.js.
 *
 * Deve esportare ESATTAMENTE le stesse funzioni di sqlite.js:
 *   init, findUserByEmail, findOrgById, updateOrg,
 *   listReviews, getReview, updateReview, insertReview, stats
 * Se le firme coincidono, cambiare database e' una riga nel .env.
 *
 * Client:
 *   import { createClient } from '@supabase/supabase-js';
 *   createClient(config.supabaseUrl, config.supabaseServiceKey);
 *
 * LA CHIAVE service_role SCAVALCA LE RLS.
 * Sta solo qui, nel backend. Non deve MAI comparire in public/,
 * ne' essere spedita al browser in nessuna forma.
 * Nel frontend, se mai servira', si usa la chiave anon.
 *
 * Le query diventano asincrone: dove sqlite.js restituisce direttamente
 * un valore, qui serve await. Aggiorna di conseguenza le route.
 *   const { data, error } = await sb.from('reviews')
 *     .select('*').eq('org_id', orgId).order('review_date', { ascending: false });
 *   if (error) throw error;
 *
 * Anche con le RLS attive, continua a scrivere .eq('org_id', orgId)
 * in ogni query. Con la service_role key le policy non ti proteggono:
 * l'unica difesa e' il filtro che scrivi tu.
 *
 * init() qui non crea le tabelle: lo schema si applica una volta sola
 * dalla dashboard di Supabase (vedi schema.supabase.sql).
 */
