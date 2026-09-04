/* Test delle API. Avvia il server come processo separato e lo interroga
 * con fetch, come farebbe un client vero.
 *
 * Presuppone che `npm run seed` sia gia' stato eseguito (lo fa `npm test`,
 * vedi package.json) cosi' esistono due account gia' pronti:
 *   dev@pixelforge.test / pixelforge123          (Pixel Forge Studio)
 *   team@novainteractive.test / novainteractive123 (Nova Interactive)
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import * as db from '../src/db/index.js';

const PORTA = 3999;
const BASE_URL = `http://localhost:${PORTA}`;

let processoServer;

// Il flusso di invito team manda il link via email, che in sviluppo (senza
// SMTP configurato, vedi services/email.js) finisce solo nel log del
// processo server. Bufferizziamo lo stdout del processo spawnato cosi' i
// test possono recuperare il token vero senza doverlo esporre via API
// (esporlo sarebbe un buco di sicurezza: chiunque potrebbe leggere
// /api/team, vedere l'id dell'invito e "indovinare" il token).
let stdoutBuffer = '';

function creaClient() {
  let cookie = '';

  async function chiama(percorso, opzioni = {}) {
    const risposta = await fetch(`${BASE_URL}${percorso}`, {
      ...opzioni,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...opzioni.headers,
      },
    });

    const setCookie = risposta.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];

    return risposta;
  }

  return {
    get: (percorso) => chiama(percorso),
    post: (percorso, corpo) => chiama(percorso, { method: 'POST', body: corpo ? JSON.stringify(corpo) : undefined }),
    put: (percorso, corpo) => chiama(percorso, { method: 'PUT', body: JSON.stringify(corpo) }),
    delete: (percorso) => chiama(percorso, { method: 'DELETE' }),
  };
}

async function login(email, password) {
  const client = creaClient();
  const risposta = await client.post('/api/auth/login', { email, password });
  assert.equal(risposta.status, 200, `login fallito per ${email}`);
  return client;
}

async function attendiCondizione(fn, { tentativi = 40, attesaMs = 50 } = {}) {
  for (let i = 0; i < tentativi; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, attesaMs));
  }
  return false;
}

before(async () => {
  await db.init();

  processoServer = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORTA), NODE_ENV: 'test' },
    stdio: 'pipe',
  });
  processoServer.stdout.on('data', (chunk) => { stdoutBuffer += chunk.toString(); });

  await attendiCondizione(async () => {
    try {
      await fetch(`${BASE_URL}/index.html`);
      return true;
    } catch {
      return false;
    }
  });
});

after(() => {
  processoServer.kill();
});

test('senza login le route protette rispondono 401', async () => {
  const risposta = await fetch(`${BASE_URL}/api/recensioni`);
  assert.equal(risposta.status, 401);
});

test('password sbagliata rifiutata', async () => {
  const client = creaClient();
  const risposta = await client.post('/api/auth/login', { email: 'dev@pixelforge.test', password: 'sbagliata' });
  assert.equal(risposta.status, 401);
});

test('login corretto apre la sessione', async () => {
  const client = await login('dev@pixelforge.test', 'pixelforge123');
  const risposta = await client.get('/api/auth/me');
  assert.equal(risposta.status, 200);
  const dati = await risposta.json();
  assert.equal(dati.email, 'dev@pixelforge.test');
});

test('due account diversi appartengono a organizzazioni diverse', async () => {
  const clienteA = await login('dev@pixelforge.test', 'pixelforge123');
  const clienteB = await login('team@novainteractive.test', 'novainteractive123');

  const orgA = await (await clienteA.get('/api/auth/me')).json();
  const orgB = await (await clienteB.get('/api/auth/me')).json();

  assert.notEqual(orgA.org.id, orgB.org.id);
});

test('ISOLAMENTO: ogni utente vede solo le proprie recensioni', async () => {
  const clienteA = await login('dev@pixelforge.test', 'pixelforge123');
  const clienteB = await login('team@novainteractive.test', 'novainteractive123');

  const recensioniA = await (await clienteA.get('/api/recensioni')).json();
  const recensioniB = await (await clienteB.get('/api/recensioni')).json();

  const idA = new Set(recensioniA.map((r) => r.id));
  const idB = new Set(recensioniB.map((r) => r.id));

  assert.ok(recensioniA.length > 0 && recensioniB.length > 0);
  assert.equal([...idA].some((id) => idB.has(id)), false);
});

test('ISOLAMENTO: un utente non puo agire su una recensione di un altro (404)', async () => {
  const clienteA = await login('dev@pixelforge.test', 'pixelforge123');
  const clienteB = await login('team@novainteractive.test', 'novainteractive123');

  const recensioniB = await (await clienteB.get('/api/recensioni')).json();
  const idDiB = recensioniB[0].id;

  const risposta = await clienteA.post(`/api/recensioni/${idDiB}/ignora`);
  assert.equal(risposta.status, 404);
});

test('flusso completo: genera bozza -> correggi -> pubblica', async () => {
  const client = await login('dev@pixelforge.test', 'pixelforge123');

  const recensioni = await (await client.get('/api/recensioni')).json();
  const daGenerare = recensioni.find((r) => r.status === 'da_generare');
  assert.ok(daGenerare, 'serve almeno una recensione "da_generare" nel seed');

  const rispostaGenera = await client.post(`/api/recensioni/${daGenerare.id}/genera`);
  assert.ok([200, 202].includes(rispostaGenera.status));

  const generata = await attendiCondizione(async () => {
    const r = await client.get('/api/recensioni');
    const aggiornata = (await r.json()).find((x) => x.id === daGenerare.id);
    return aggiornata?.draft_reply != null;
  });
  assert.ok(generata, 'la bozza non e stata generata in tempo');

  const correzione = 'Grazie mille per il feedback, lo terremo in considerazione!';
  const rispostaBozza = await client.put(`/api/recensioni/${daGenerare.id}/bozza`, { testo: correzione });
  assert.equal(rispostaBozza.status, 200);
  assert.equal((await rispostaBozza.json()).draft_reply, correzione);

  const rispostaApprova = await client.post(`/api/recensioni/${daGenerare.id}/approva`);
  assert.equal(rispostaApprova.status, 200);
  const pubblicata = await rispostaApprova.json();
  assert.equal(pubblicata.status, 'pubblicata');
  assert.equal(pubblicata.published_reply, correzione);
});

test('sync aggiunge recensioni', async () => {
  const client = await login('dev@pixelforge.test', 'pixelforge123');

  const prima = await (await client.get('/api/recensioni/stats')).json();
  const rispostaSync = await client.post('/api/recensioni/sync');
  assert.equal(rispostaSync.status, 202);

  const aumentato = await attendiCondizione(async () => {
    const dopo = await (await client.get('/api/recensioni/stats')).json();
    return dopo.totale > prima.totale;
  });
  assert.ok(aumentato, 'il sync non ha aggiunto recensioni in tempo');
});

test('le impostazioni si salvano', async () => {
  const client = await login('dev@pixelforge.test', 'pixelforge123');

  const rispostaPut = await client.put('/api/impostazioni', { tono: 'scherzoso', invio_automatico: true });
  assert.equal(rispostaPut.status, 200);
  const salvate = await rispostaPut.json();
  assert.equal(salvate.tono, 'scherzoso');
  assert.equal(salvate.invio_automatico, true);

  const rilette = await (await client.get('/api/impostazioni')).json();
  assert.equal(rilette.tono, 'scherzoso');
});

test('Knowledge Base: crea, modifica stato, elimina un problema noto', async () => {
  const client = await login('dev@pixelforge.test', 'pixelforge123');

  const rispostaCrea = await client.post('/api/conoscenza', {
    title: 'Crash on level 4 boss fight',
    affects: 'Steam, Xbox',
    description: 'The game crashes reliably during the level 4 boss fight.',
  });
  assert.equal(rispostaCrea.status, 201);
  const creato = await rispostaCrea.json();
  assert.equal(creato.title, 'Crash on level 4 boss fight');
  assert.equal(creato.status, 'aperto');

  const listaGET = await (await client.get('/api/conoscenza')).json();
  assert.ok(listaGET.some((p) => p.id === creato.id));

  const rispostaPut = await client.put(`/api/conoscenza/${creato.id}`, { status: 'in_corso' });
  assert.equal(rispostaPut.status, 200);
  assert.equal((await rispostaPut.json()).status, 'in_corso');

  const rispostaPutInvalido = await client.put(`/api/conoscenza/${creato.id}`, { status: 'non_esiste' });
  assert.equal(rispostaPutInvalido.status, 400);

  const rispostaDelete = await client.delete(`/api/conoscenza/${creato.id}`);
  assert.equal(rispostaDelete.status, 200);

  const listaDopo = await (await client.get('/api/conoscenza')).json();
  assert.equal(listaDopo.some((p) => p.id === creato.id), false);
});

test('Knowledge Base: ISOLAMENTO tra organizzazioni', async () => {
  const clienteA = await login('dev@pixelforge.test', 'pixelforge123');
  const clienteB = await login('team@novainteractive.test', 'novainteractive123');

  const creatoDaA = await (await clienteA.post('/api/conoscenza', { title: 'Solo per Pixel Forge' })).json();

  const listaB = await (await clienteB.get('/api/conoscenza')).json();
  assert.equal(listaB.some((p) => p.id === creatoDaA.id), false);

  // B non deve poter modificare o eliminare un problema noto di A: la
  // route filtra sempre per org_id/game_id della SESSIONE di chi chiama,
  // mai per quelli passati nell'URL — stesso principio di reviews.js.
  const rispostaPutDaB = await clienteB.put(`/api/conoscenza/${creatoDaA.id}`, { status: 'risolto' });
  assert.equal(rispostaPutDaB.status, 404);

  const rispostaDeleteDaB = await clienteB.delete(`/api/conoscenza/${creatoDaA.id}`);
  assert.equal(rispostaDeleteDaB.status, 200); // DELETE e' idempotente: 0 righe cancellate, nessun errore

  const ancoraDiA = await (await clienteA.get('/api/conoscenza')).json();
  assert.ok(ancoraDiA.some((p) => p.id === creatoDaA.id), 'la DELETE di B non deve aver cancellato la riga di A');
});

/* ---------------------------------------------------------------------
 * Team / inviti / ruoli / notifiche
 * --------------------------------------------------------------------- */

function emailUnica(prefisso) {
  return `${prefisso}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invite.test`;
}

// Il token vero non e' mai restituito da nessuna API (solo il suo hash e'
// salvato nel database, vedi routes/team.js): lo recuperiamo dal log
// dell'email finta, cercando solo nella porzione di stdout apparsa DOPO
// la chiamata che ha generato l'invito, cosi' due inviti ravvicinati non
// si confondono a vicenda.
async function attendiTokenInvito(dalIndice) {
  let token = null;
  await attendiCondizione(() => {
    const nuovo = stdoutBuffer.slice(dalIndice);
    const match = nuovo.match(/token=([0-9a-f]{64})/);
    if (match) { token = match[1]; return true; }
    return false;
  });
  assert.ok(token, 'token di invito non trovato nel log email (mock)');
  return token;
}

async function invitaEAccetta(client, { email, ruolo, password: pw = 'invitopass123' }) {
  const puntoPrima = stdoutBuffer.length;
  const rispostaInvite = await client.post('/api/team/invite', { email, ruolo });
  assert.equal(rispostaInvite.status, 201, `invito fallito per ${email}`);

  const token = await attendiTokenInvito(puntoPrima);

  const rispostaDettagli = await fetch(`${BASE_URL}/api/team/invito/${token}`);
  assert.equal(rispostaDettagli.status, 200);
  const dettagli = await rispostaDettagli.json();
  assert.equal(dettagli.email, email);
  assert.equal(dettagli.ruolo, ruolo);

  const nuovoClient = creaClient();
  const rispostaAccetta = await nuovoClient.post('/api/team/accetta', { token, password: pw });
  assert.equal(rispostaAccetta.status, 200, `accettazione fallita per ${email}`);

  return nuovoClient;
}

test('Team: invito -> accettazione -> il nuovo membro ha il ruolo assegnato', async () => {
  const owner = await login('dev@pixelforge.test', 'pixelforge123');
  const email = emailUnica('editor');

  const editorClient = await invitaEAccetta(owner, { email, ruolo: 'editor' });

  const identita = await (await editorClient.get('/api/auth/me')).json();
  assert.equal(identita.email, email);
  assert.equal(identita.role, 'editor');

  const ownerIdentita = await (await owner.get('/api/auth/me')).json();
  assert.equal(identita.org.id, ownerIdentita.org.id, 'il nuovo membro deve appartenere alla stessa organizzazione di chi lo ha invitato');
});

test('Team: invito con email o ruolo non validi viene rifiutato', async () => {
  const owner = await login('dev@pixelforge.test', 'pixelforge123');

  const rispostaEmail = await owner.post('/api/team/invite', { email: 'non-una-email', ruolo: 'editor' });
  assert.equal(rispostaEmail.status, 400);

  const rispostaRuolo = await owner.post('/api/team/invite', { email: emailUnica('badrole'), ruolo: 'superadmin' });
  assert.equal(rispostaRuolo.status, 400);
});

test('Team: non si puo invitare due volte la stessa email', async () => {
  const owner = await login('dev@pixelforge.test', 'pixelforge123');
  const email = emailUnica('dup');

  const prima = await owner.post('/api/team/invite', { email, ruolo: 'viewer' });
  assert.equal(prima.status, 201);

  const seconda = await owner.post('/api/team/invite', { email, ruolo: 'viewer' });
  assert.equal(seconda.status, 409);
});

test("Ruoli: il viewer e' di sola lettura, l'editor scrive sulle recensioni ma non su impostazioni/knowledge base/team", async () => {
  const owner = await login('dev@pixelforge.test', 'pixelforge123');

  const viewerClient = await invitaEAccetta(owner, { email: emailUnica('viewer'), ruolo: 'viewer' });
  const editorClient = await invitaEAccetta(owner, { email: emailUnica('editor2'), ruolo: 'editor' });

  // viewer: lettura ok, scrittura vietata ovunque
  assert.equal((await viewerClient.get('/api/recensioni')).status, 200);
  assert.equal((await viewerClient.post('/api/recensioni/sync')).status, 403);
  assert.equal((await viewerClient.put('/api/impostazioni', { tono: 'x' })).status, 403);
  assert.equal((await viewerClient.post('/api/conoscenza', { title: 'x' })).status, 403);

  // editor: scrittura sulle recensioni ok, ma non su impostazioni/knowledge base/team
  assert.equal((await editorClient.post('/api/recensioni/sync')).status, 202);
  assert.equal((await editorClient.put('/api/impostazioni', { tono: 'x' })).status, 403);
  assert.equal((await editorClient.post('/api/conoscenza', { title: 'x' })).status, 403);
  assert.equal((await editorClient.post('/api/team/invite', { email: emailUnica('z'), ruolo: 'viewer' })).status, 403);
});

test('Team: il team deve avere sempre almeno un owner', async () => {
  const owner = await login('dev@pixelforge.test', 'pixelforge123');
  const identita = await (await owner.get('/api/auth/me')).json();

  const rispostaDegrado = await owner.put(`/api/team/${identita.userId}/role`, { ruolo: 'editor' });
  assert.equal(rispostaDegrado.status, 400);

  const rispostaRimozione = await owner.delete(`/api/team/${identita.userId}`);
  assert.equal(rispostaRimozione.status, 400);
});

test('Team: ISOLAMENTO tra organizzazioni', async () => {
  const ownerA = await login('dev@pixelforge.test', 'pixelforge123');
  const ownerB = await login('team@novainteractive.test', 'novainteractive123');

  const membro = await (await ownerA.post('/api/team/invite', { email: emailUnica('isoteam'), ruolo: 'viewer' })).json();

  const listaB = await (await ownerB.get('/api/team')).json();
  assert.equal(listaB.some((m) => m.id === membro.id), false, 'B non deve vedere il membro di A nella propria lista team');

  // org_id arriva sempre dalla SESSIONE di chi chiama, mai da :id nell'url
  // (stesso principio di reviews.js/conoscenza.js): B non tocca un membro di A.
  assert.equal((await ownerB.put(`/api/team/${membro.id}/role`, { ruolo: 'owner' })).status, 404);
  assert.equal((await ownerB.delete(`/api/team/${membro.id}`)).status, 404);
  assert.equal((await ownerB.post(`/api/team/${membro.id}/resend`)).status, 404);
});

test('Team: il limite di posti del piano blocca nuovi inviti', async () => {
  const owner = await login('dev@pixelforge.test', 'pixelforge123');
  const identita = await (await owner.get('/api/auth/me')).json();
  const orgId = identita.org.id;

  // Gli account di sviluppo sono seedati sul piano Publisher (illimitato,
  // vedi src/db/seed.js): per provare il limite lo abbassiamo a Indie
  // (1 solo posto, vedi src/piani.js) parlando direttamente al database,
  // come fa il seed — non esiste un'API per cambiare piano se non passando
  // da un vero checkout Stripe.
  await db.updateOrg(orgId, { plan: 'indie' });
  try {
    const risposta = await owner.post('/api/team/invite', { email: emailUnica('overlimit'), ruolo: 'viewer' });
    assert.equal(risposta.status, 403);
  } finally {
    await db.updateOrg(orgId, { plan: 'publisher' }); // ripristina il piano di sviluppo del seed
  }
});

test('Notifiche: le preferenze si leggono e si salvano, sono per singolo utente (non per organizzazione)', async () => {
  const clienteA = await login('dev@pixelforge.test', 'pixelforge123');
  const clienteB = await login('team@novainteractive.test', 'novainteractive123');

  const inizialiA = await (await clienteA.get('/api/notifiche')).json();
  assert.equal(inizialiA.email_enabled, true);

  const rispostaPut = await clienteA.put('/api/notifiche', { event_weekly_digest: true, inapp_enabled: false });
  assert.equal(rispostaPut.status, 200);
  const salvate = await rispostaPut.json();
  assert.equal(salvate.event_weekly_digest, true);
  assert.equal(salvate.inapp_enabled, false);

  const riletteA = await (await clienteA.get('/api/notifiche')).json();
  assert.equal(riletteA.event_weekly_digest, true);

  // per-UTENTE, non per-organizzazione: B non deve vedere le modifiche di A
  const perB = await (await clienteB.get('/api/notifiche')).json();
  assert.equal(perB.event_weekly_digest, false);
});

test('Notifiche: un campo non valido (o non booleano) viene rifiutato', async () => {
  const client = await login('dev@pixelforge.test', 'pixelforge123');
  const risposta = await client.put('/api/notifiche', { email_enabled: 'si' });
  assert.equal(risposta.status, 400);
});
