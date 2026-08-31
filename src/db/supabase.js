/* Implementazione Supabase (PostgreSQL) delle funzioni di db/index.js.
 * Stesse firme di sqlite.js: cambiare database e' una riga nel .env.
 *
 * LA CHIAVE service_role SCAVALCA LE RLS. Sta solo qui, lato backend.
 * Anche con le RLS attive, ogni query filtra comunque su org_id:
 * con la service_role key le policy non proteggono, l'unica difesa
 * e' il filtro scritto qui.
 *
 * init() non crea le tabelle: lo schema si applica una volta sola dalla
 * dashboard di Supabase (vedi schema.supabase.sql).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { cifra, decifra } from '../services/secrets.js';

let sb;

function getClient() {
  if (!sb) sb = createClient(config.supabaseUrl, config.supabaseServiceKey);
  return sb;
}

export async function init() {
  getClient();
}

export async function findUserByEmail(email) {
  const { data, error } = await getClient()
    .from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function findOrgById(orgId) {
  const { data, error } = await getClient()
    .from('organizations').select('*').eq('id', orgId).maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function updateOrg(orgId, campi) {
  const consentiti = ['name', 'plan', 'plan_status', 'tone', 'auto_send', 'google_connected', 'stripe_customer_id', 'stripe_subscription_id', 'current_period_end'];
  const patch = Object.fromEntries(Object.entries(campi).filter(([k]) => consentiti.includes(k)));

  if (Object.keys(patch).length === 0) return findOrgById(orgId);

  const { data, error } = await getClient()
    .from('organizations').update(patch).eq('id', orgId).select().maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

// Crea una nuova organizzazione e il suo primo utente in un'unica
// operazione (registrazione self-service, vedi lo stesso commento in
// sqlite.js). Il client supabase-js non espone transazioni multi-tabella
// come node:sqlite (niente BEGIN/COMMIT reali da qui): se l'inserimento
// dell'utente fallisce (es. email duplicata, vincolo UNIQUE lato Postgres),
// viene eseguita un'azione compensativa che cancella l'organizzazione
// appena creata, cosi' da non lasciare organizzazioni "orfane" senza
// utenti. Non e' atomico al 100% (una race fra le due insert e'
// teoricamente possibile, es. il processo muore fra le due query), ma e'
// il meglio ottenibile da qui senza una funzione Postgres/RPC dedicata.
// Dato che questo driver non e' quello attivo in produzione (vedi
// DB_DRIVER nel .env), la parita' con sqlite.js viene mantenuta per
// correttezza futura, non perche' sia il percorso critico oggi: se in
// futuro Supabase diventasse il driver attivo, conviene sostituire
// questa funzione con una vera funzione Postgres (plpgsql) chiamata via
// .rpc(), che garantisce atomicita' reale lato database.
export async function creaOrganizzazioneEUtente({ nomeOrg, email, passwordHash, verifyTokenHash, verifyTokenExpires }) {
  const client = getClient();

  const { data: org, error: erroreOrg } = await client
    .from('organizations').insert({ name: nomeOrg }).select().single();
  if (erroreOrg) throw erroreOrg;

  const { data: user, error: erroreUser } = await client
    .from('users')
    .insert({
      org_id: org.id,
      email,
      password_hash: passwordHash,
      verify_token_hash: verifyTokenHash,
      verify_token_expires: verifyTokenExpires,
    })
    .select()
    .single();

  if (erroreUser) {
    // Azione compensativa: l'org non deve restare orfana senza utenti.
    await client.from('organizations').delete().eq('id', org.id);
    throw erroreUser;
  }

  return { org, user };
}

// Vedi il commento gemello in sqlite.js sul perche' del confronto con la
// scadenza (li' serve normalizzare i formati con datetime(), qui no: le
// colonne sono TIMESTAMPTZ e Postgres confronta i timestamp nativamente
// senza l'insidia del confronto testuale). Il principio resta lo stesso:
// un token scaduto non deve fare match.
export async function trovaUtentePerTokenVerifica(tokenHash) {
  const { data, error } = await getClient()
    .from('users')
    .select('*')
    .eq('verify_token_hash', tokenHash)
    .gt('verify_token_expires', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function impostaEmailVerificata(userId) {
  const { error } = await getClient()
    .from('users')
    .update({ email_verified_at: new Date().toISOString(), verify_token_hash: null, verify_token_expires: null })
    .eq('id', userId);
  if (error) throw error;
}

export async function impostaNuovoTokenVerifica(userId, tokenHash, scadenza) {
  const { error } = await getClient()
    .from('users')
    .update({ verify_token_hash: tokenHash, verify_token_expires: scadenza })
    .eq('id', userId);
  if (error) throw error;
}

export async function listReviews(orgId, { status } = {}) {
  let query = getClient()
    .from('reviews').select('*').eq('org_id', orgId).order('review_date', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getReview(orgId, id) {
  const { data, error } = await getClient()
    .from('reviews').select('*').eq('org_id', orgId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function updateReview(orgId, id, campi) {
  const consentiti = ['status', 'draft_reply', 'published_reply'];
  const patch = Object.fromEntries(Object.entries(campi).filter(([k]) => consentiti.includes(k)));
  if (Object.keys(patch).length === 0) return getReview(orgId, id);

  const { data, error } = await getClient()
    .from('reviews').update(patch).eq('org_id', orgId).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function insertReview(orgId, recensione) {
  const { author, rating, text, review_date, platform } = recensione;
  const { data, error } = await getClient()
    .from('reviews')
    .insert({ org_id: orgId, author, rating, text: text ?? null, review_date, platform: platform ?? 'steam' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Vedi il commento gemello in sqlite.js: stesso conteggio, mese solare
// corrente in UTC (coerente con created_at, che e' salvato in UTC da Postgres).
export async function contaRecensioniMese(orgId) {
  const inizioMese = new Date();
  inizioMese.setUTCDate(1);
  inizioMese.setUTCHours(0, 0, 0, 0);

  const { count, error } = await getClient()
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', inizioMese.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function stats(orgId) {
  const { data, error } = await getClient()
    .from('reviews').select('status, rating').eq('org_id', orgId);
  if (error) throw error;

  const base = { da_generare: 0, da_approvare: 0, pubblicata: 0, ignorata: 0 };
  let somma = 0;
  for (const riga of data) {
    base[riga.status] = (base[riga.status] ?? 0) + 1;
    somma += riga.rating;
  }
  const totale = data.length;

  return { ...base, totale, media_voto: totale ? Number((somma / totale).toFixed(2)) : 0 };
}

export async function listIntegrations(orgId) {
  const { data, error } = await getClient()
    .from('integrations').select('provider, connected, connected_at, api_key_hint').eq('org_id', orgId);
  if (error) throw error;
  return data;
}

export async function setIntegration(orgId, provider, connected, apiKeyChiaro = null) {
  const connectedAt = connected ? new Date().toISOString() : null;
  const apiKeyCifrata = connected && apiKeyChiaro ? cifra(apiKeyChiaro) : null;
  const apiKeyHint = connected && apiKeyChiaro ? apiKeyChiaro.slice(-4) : null;

  const { data, error } = await getClient()
    .from('integrations')
    .upsert(
      { org_id: orgId, provider, connected, connected_at: connectedAt, api_key: apiKeyCifrata, api_key_hint: apiKeyHint },
      { onConflict: 'org_id,provider' }
    )
    .select('provider, connected, connected_at, api_key_hint')
    .single();
  if (error) throw error;
  return data;
}

// Per uso futuro, vedi il commento gemello in sqlite.js: nessuna route la
// usa ancora, nessun endpoint restituisce mai la chiave al frontend.
export async function getIntegrationSecret(orgId, provider) {
  const { data, error } = await getClient()
    .from('integrations')
    .select('api_key')
    .eq('org_id', orgId).eq('provider', provider).eq('connected', true)
    .maybeSingle();
  if (error) throw error;
  return data?.api_key ? decifra(data.api_key) : undefined;
}

export async function findOrgByStripeCustomerId(stripeCustomerId) {
  const { data, error } = await getClient()
    .from('organizations').select('*').eq('stripe_customer_id', stripeCustomerId).maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

// ignoreDuplicates sull'id evento Stripe: stesso motivo del driver sqlite,
// un webhook ripetuto non deve duplicare la transazione registrata.
export async function insertPayment(orgId, pagamento) {
  const { stripe_event_id, stripe_invoice_id, plan, amount_cents, currency, status } = pagamento;
  const { error } = await getClient()
    .from('payments')
    .upsert(
      {
        org_id: orgId,
        stripe_event_id,
        stripe_invoice_id: stripe_invoice_id ?? null,
        plan,
        amount_cents,
        currency: currency ?? 'eur',
        status,
      },
      { onConflict: 'stripe_event_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function listPayments(orgId) {
  const { data, error } = await getClient()
    .from('payments').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
