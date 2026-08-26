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

const PORTA = 3999;
const BASE_URL = `http://localhost:${PORTA}`;

let processoServer;

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
  processoServer = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORTA), NODE_ENV: 'test' },
    stdio: 'pipe',
  });

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
