/* Pagina Integrations: stato reale letto/salvato su /api/integrazioni,
 * legato all'account collegato (req.orgId lato server, mai scelto qui).
 *
 * Due flussi diversi a seconda di integrazione.tipo:
 *   'chiave_api'  apre il modale, chiede la chiave, POST /collega con { chiave_api }
 *   'oauth'       apre un popup su GET /:provider/autorizza, aspetta il
 *                 postMessage di conferma da oauth-mock.html
 */
const carte = document.querySelectorAll('.integration[data-provider]');
const modale = document.getElementById('modale-chiave');
const modaleInput = document.getElementById('modale-input');
const modaleLabel = document.getElementById('modale-label');
const modaleTitolo = document.getElementById('modale-titolo');
const modaleErrore = document.getElementById('modale-errore');

let integrazioneInModale = null;

function applica(carta, integrazione) {
  const stato = carta.querySelector('.stato');
  const bottone = carta.querySelector('button');

  bottone.disabled = false;
  carta.dataset.tipo = integrazione.tipo;

  if (integrazione.connesso) {
    stato.textContent = integrazione.chiave_finale ? `Connected — key ending in ${integrazione.chiave_finale}` : 'Connected';
    stato.classList.add('ok');
    bottone.textContent = 'Disconnect';
    bottone.dataset.azione = 'scollega';
  } else {
    stato.textContent = 'Not connected';
    stato.classList.remove('ok');
    bottone.textContent = 'Connect';
    bottone.dataset.azione = 'collega';
  }
}

async function carica() {
  const lista = await api('/integrazioni');
  if (!lista) return;

  const mappa = new Map(lista.map((i) => [i.provider, i]));
  carte.forEach((carta) => {
    const integrazione = mappa.get(carta.dataset.provider);
    if (integrazione) applica(carta, integrazione);
  });
}

function apriModaleChiave(carta) {
  const nome = carta.querySelector('h3').textContent;
  integrazioneInModale = carta;

  modaleTitolo.textContent = `Connect ${nome}`;
  modaleLabel.textContent = `${nome} API key`;
  modaleInput.value = '';
  modaleErrore.style.display = 'none';
  modale.showModal();
  modaleInput.focus();
}

document.getElementById('modale-annulla').addEventListener('click', () => modale.close());

document.getElementById('modale-salva').addEventListener('click', async () => {
  const carta = integrazioneInModale;
  if (!carta) return;

  const chiave = modaleInput.value.trim();
  if (chiave.length < 8) {
    modaleErrore.textContent = 'Key looks too short (minimum 8 characters).';
    modaleErrore.style.display = 'block';
    return;
  }

  const bottoneSalva = document.getElementById('modale-salva');
  bottoneSalva.disabled = true;
  try {
    const risultato = await api(`/integrazioni/${carta.dataset.provider}/collega`, {
      method: 'POST',
      body: { chiave_api: chiave },
    });
    if (!risultato) return;

    applica(carta, { connesso: true, tipo: 'chiave_api', chiave_finale: risultato.chiave_finale });
    modale.close();
    mostraMessaggio(`${carta.querySelector('h3').textContent} connected to your account.`, 'successo');
  } catch (err) {
    modaleErrore.textContent = err.message;
    modaleErrore.style.display = 'block';
  } finally {
    bottoneSalva.disabled = false;
  }
});

async function apriFinestraOAuth(carta) {
  const nome = carta.querySelector('h3').textContent;
  const provider = carta.dataset.provider;

  const risposta = await api(`/integrazioni/${provider}/autorizza`);
  if (!risposta) return;

  const popup = window.open(risposta.url, 'gamefollow-oauth', 'width=420,height=520');
  if (!popup) {
    mostraMessaggio('Please allow pop-ups to connect this integration.', 'errore');
    return;
  }

  const alChiudere = ({ data, origin }) => {
    if (origin !== window.location.origin || data?.tipo !== 'gamefollow-oauth' || data.provider !== provider) return;
    window.removeEventListener('message', alChiudere);

    if (data.ok) {
      applica(carta, { connesso: true, tipo: 'oauth' });
      mostraMessaggio(`${nome} connected to your account.`, 'successo');
    }
  };
  window.addEventListener('message', alChiudere);
}

async function scollega(carta) {
  const nome = carta.querySelector('h3').textContent;
  const bottone = carta.querySelector('button');

  bottone.disabled = true;
  try {
    const risultato = await api(`/integrazioni/${carta.dataset.provider}/scollega`, { method: 'POST' });
    if (!risultato) return;

    applica(carta, { connesso: false, tipo: carta.dataset.tipo });
    mostraMessaggio(`${nome} disconnected.`, 'successo');
  } catch (err) {
    mostraMessaggio(err.message, 'errore');
    bottone.disabled = false;
  }
}

carte.forEach((carta) => {
  const bottone = carta.querySelector('button');

  bottone.addEventListener('click', () => {
    const azione = bottone.dataset.azione || 'collega';

    if (azione === 'scollega') {
      scollega(carta);
      return;
    }

    if (carta.dataset.tipo === 'chiave_api') {
      apriModaleChiave(carta);
    } else {
      apriFinestraOAuth(carta);
    }
  });
});

carica();
