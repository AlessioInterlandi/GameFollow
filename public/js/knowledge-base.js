/* Pagina Knowledge Base ("Known issues"): problemi noti scritti a mano
 * dallo studio, salvati su /api/conoscenza e legati al gioco attivo (vedi
 * routes/knowledgeBase.js). Prima era tutta statica con 3 esempi finti.
 */

const STATO_LABELS = { aperto: 'Open', in_corso: 'In progress', risolto: 'Fixed', non_pianificato: 'Not planned' };
const STATO_CLASSE = { aperto: '', in_corso: 'ok', risolto: 'ok', non_pianificato: '' };
const STATO_ICONA = { aperto: '○', in_corso: '●', risolto: '●', non_pianificato: '○' };

const elCaricamento = document.getElementById('problemi-noti-caricamento');
const elVuoto = document.getElementById('problemi-noti-vuoto');
const elLista = document.getElementById('problemi-noti-lista');
const modale = document.getElementById('modale-problema-noto');
const campoTitolo = document.getElementById('problema-noto-titolo');
const campoAffects = document.getElementById('problema-noto-affects');
const campoDescrizione = document.getElementById('problema-noto-descrizione');
const elErrore = document.getElementById('problema-noto-errore');

function escapeHtmlKb(testo) {
  const div = document.createElement('div');
  div.textContent = testo ?? '';
  return div.innerHTML;
}

function opzioniStato(statoAttuale) {
  return Object.entries(STATO_LABELS)
    .map(([valore, etichetta]) => `<option value="${valore}"${valore === statoAttuale ? ' selected' : ''}>${etichetta}</option>`)
    .join('');
}

function creaSchedaProblema(problema) {
  const article = document.createElement('article');
  article.className = 'panel';
  article.style.marginBottom = '10px';
  article.dataset.id = problema.id;

  article.innerHTML = `
    <h3>${escapeHtmlKb(problema.title)} <span class="${STATO_CLASSE[problema.status] || ''}" style="float:right">${STATO_ICONA[problema.status] || '○'}</span></h3>
    <p>Affects: ${problema.affects ? escapeHtmlKb(problema.affects) : '<span style="color:var(--muted)">—</span>'}</p>
    <p>${problema.description ? escapeHtmlKb(problema.description) : '<span style="color:var(--muted)">No description.</span>'}</p>
    <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
      <select class="problema-noto-stato" data-id="${problema.id}">${opzioniStato(problema.status)}</select>
      <button type="button" class="action" data-azione="elimina" data-id="${problema.id}" style="margin-left:auto">Delete</button>
    </div>
  `;
  return article;
}

async function carica() {
  elCaricamento.hidden = false;
  elVuoto.hidden = true;
  elLista.innerHTML = '';

  try {
    const problemi = await api('/conoscenza');
    if (!problemi) return; // 401 -> api() ha gia' rimandato al login

    elCaricamento.hidden = true;

    if (problemi.length === 0) {
      elVuoto.hidden = false;
      return;
    }

    problemi.forEach((problema) => elLista.appendChild(creaSchedaProblema(problema)));
  } catch {
    elCaricamento.textContent = 'Could not load known issues right now.';
  }
}

function apriModale() {
  campoTitolo.value = '';
  campoAffects.value = '';
  campoDescrizione.value = '';
  elErrore.style.display = 'none';
  modale.showModal();
  campoTitolo.focus();
}

document.getElementById('problema-noto-aggiungi-btn').addEventListener('click', apriModale);
document.getElementById('problema-noto-annulla').addEventListener('click', () => modale.close());

document.getElementById('problema-noto-salva').addEventListener('click', async () => {
  const titolo = campoTitolo.value.trim();
  if (!titolo) {
    elErrore.textContent = 'Please enter a title.';
    elErrore.style.display = 'block';
    return;
  }

  const bottone = document.getElementById('problema-noto-salva');
  bottone.disabled = true;
  try {
    await api('/conoscenza', {
      method: 'POST',
      body: { title: titolo, affects: campoAffects.value.trim(), description: campoDescrizione.value.trim() },
    });
    modale.close();
    mostraMessaggio('Known issue added.', 'successo');
    carica();
  } catch (errore) {
    elErrore.textContent = errore.dati?.errore || 'Could not add the issue.';
    elErrore.style.display = 'block';
  } finally {
    bottone.disabled = false;
  }
});

elLista.addEventListener('change', async (evento) => {
  const select = evento.target.closest('.problema-noto-stato');
  if (!select) return;

  const { id } = select.dataset;
  select.disabled = true;
  try {
    await api(`/conoscenza/${id}`, { method: 'PUT', body: { status: select.value } });
    mostraMessaggio('Status updated.', 'successo');
    carica();
  } catch (errore) {
    mostraMessaggio(errore.message, 'errore');
    select.disabled = false;
  }
});

elLista.addEventListener('click', async (evento) => {
  const bottone = evento.target.closest('button[data-azione="elimina"]');
  if (!bottone) return;

  const { id } = bottone.dataset;
  bottone.disabled = true;
  try {
    await api(`/conoscenza/${id}`, { method: 'DELETE' });
    mostraMessaggio('Known issue deleted.', 'successo');
    carica();
  } catch (errore) {
    mostraMessaggio(errore.message, 'errore');
    bottone.disabled = false;
  }
});

carica();
