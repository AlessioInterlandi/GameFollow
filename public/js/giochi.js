/* Menu a tendina "cambia gioco" nella topbar, presente in ogni pagina
 * autenticata (vedi #game-select-btn nell'HTML di ognuna). Popola il nome
 * del gioco attivo, l'elenco dei giochi dell'organizzazione, e la finestra
 * "Add game" — bloccata dal limite del piano (limiti.giochi in piani.js).
 *
 * Il gioco attivo vive SOLO in sessione lato server (vedi
 * middleware/gioco.js): selezionarne uno diverso, o aggiungerne uno nuovo,
 * ricarica la pagina — cosi' tutti i dati che dipendono dal gioco attivo
 * (recensioni, statistiche...) si aggiornano da soli, senza duplicare qui
 * la logica di ogni singola pagina.
 */
function iniziliGioco(nome) {
  return (nome || '?').trim().slice(0, 2).toUpperCase();
}

function escapeHtmlGioco(testo) {
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

function chiudiMenuGiochi() {
  const menu = document.getElementById('game-select-menu');
  const bottone = document.getElementById('game-select-btn');
  if (menu) menu.hidden = true;
  if (bottone) bottone.setAttribute('aria-expanded', 'false');
}

function aggiornaEtichettaGiocoAttivo(gioco) {
  if (!gioco) return;

  const thumb = document.getElementById('game-select-thumb');
  const nome = document.getElementById('game-select-nome');
  if (thumb) thumb.textContent = iniziliGioco(gioco.nome);
  if (nome) nome.textContent = gioco.nome;

  // Il blocco nella sidebar mostra lo stesso gioco attivo, in sola lettura
  // (le piattaforme elencate sotto restano contenuto statico per ora — la
  // loro scopertura per gioco e' prevista in un passaggio successivo).
  const thumbSidebar = document.getElementById('sidebar-game-thumb');
  const nomeSidebar = document.getElementById('sidebar-game-nome');
  if (thumbSidebar) thumbSidebar.textContent = iniziliGioco(gioco.nome);
  if (nomeSidebar) nomeSidebar.textContent = gioco.nome;
}

async function selezionaGioco(id) {
  try {
    await api(`/giochi/${id}/seleziona`, { method: 'POST' });
    window.location.reload();
  } catch (errore) {
    if (typeof mostraMessaggio === 'function') {
      mostraMessaggio(errore.dati?.errore || 'Could not switch game.', 'errore');
    }
  }
}

async function caricaMenuGiochi() {
  const bottone = document.getElementById('game-select-btn');
  const menu = document.getElementById('game-select-menu');
  if (!bottone || !menu) return;

  let dati;
  try {
    dati = await api('/giochi');
  } catch {
    return; // api() reindirizza gia' al login su 401; altri errori restano silenziosi qui
  }
  if (!dati) return;

  const attivo = dati.giochi.find((g) => g.attivo) || dati.giochi[0];
  aggiornaEtichettaGiocoAttivo(attivo);

  const lista = document.getElementById('game-select-lista');
  if (lista) {
    lista.innerHTML = '';
    dati.giochi.forEach((gioco) => {
      const voce = document.createElement('button');
      voce.type = 'button';
      voce.className = 'game-select-item' + (gioco.attivo ? ' attivo' : '');
      voce.innerHTML = `<span class="game-thumb">${escapeHtmlGioco(iniziliGioco(gioco.nome))}</span><span>${escapeHtmlGioco(gioco.nome)}</span>`;
      voce.addEventListener('click', () => {
        chiudiMenuGiochi();
        if (!gioco.attivo) selezionaGioco(gioco.id);
      });
      lista.appendChild(voce);
    });
  }

  const bottoneAggiungi = document.getElementById('game-select-aggiungi-btn');
  if (bottoneAggiungi) {
    bottoneAggiungi.disabled = dati.limite_raggiunto;
    bottoneAggiungi.title = dati.limite_raggiunto
      ? `Your plan allows up to ${dati.limite} game${dati.limite === 1 ? '' : 's'}. Upgrade to add more.`
      : '';
  }
}

function apriModaleAggiungiGioco() {
  const dialogo = document.getElementById('modale-aggiungi-gioco');
  if (!dialogo) return;

  const campo = document.getElementById('aggiungi-gioco-nome');
  const errore = document.getElementById('aggiungi-gioco-errore');
  if (campo) campo.value = '';
  if (errore) errore.style.display = 'none';

  dialogo.showModal();
  if (campo) campo.focus();
}

async function salvaNuovoGioco() {
  const dialogo = document.getElementById('modale-aggiungi-gioco');
  const campo = document.getElementById('aggiungi-gioco-nome');
  const erroreEl = document.getElementById('aggiungi-gioco-errore');
  const nome = campo?.value.trim() || '';

  if (!nome) {
    if (erroreEl) { erroreEl.textContent = 'Please enter a game name.'; erroreEl.style.display = 'block'; }
    return;
  }

  try {
    await api('/giochi', { method: 'POST', body: { nome } });
    dialogo?.close();
    window.location.reload();
  } catch (errore) {
    if (erroreEl) {
      erroreEl.textContent = errore.dati?.errore || 'Could not add the game.';
      erroreEl.style.display = 'block';
    }
  }
}

function initMenuGiochi() {
  const bottone = document.getElementById('game-select-btn');
  const menu = document.getElementById('game-select-menu');
  if (!bottone || !menu) return; // pagina senza il menu, per sicurezza

  bottone.addEventListener('click', (evento) => {
    evento.stopPropagation();
    const apri = menu.hidden;
    menu.hidden = !apri;
    bottone.setAttribute('aria-expanded', String(apri));
  });
  menu.addEventListener('click', (evento) => evento.stopPropagation());
  document.addEventListener('click', chiudiMenuGiochi);

  const bottoneAggiungi = document.getElementById('game-select-aggiungi-btn');
  if (bottoneAggiungi) {
    bottoneAggiungi.addEventListener('click', () => {
      if (bottoneAggiungi.disabled) return;
      chiudiMenuGiochi();
      apriModaleAggiungiGioco();
    });
  }

  const annulla = document.getElementById('aggiungi-gioco-annulla');
  const dialogo = document.getElementById('modale-aggiungi-gioco');
  if (annulla && dialogo) annulla.addEventListener('click', () => dialogo.close());

  const salva = document.getElementById('aggiungi-gioco-salva');
  if (salva) salva.addEventListener('click', salvaNuovoGioco);
}

/* Collassa/espandi la sidebar (icone-solo). Stato ricordato per browser
 * in localStorage: essendo un sito multi-pagina senza SPA, senza questo
 * la sidebar tornerebbe espansa a ogni cambio pagina.
 */
const CHIAVE_SIDEBAR_COLLASSATA = 'gf_sidebar_collapsed';

function initCollassaSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const link = sidebar?.querySelector('.collapse');
  if (!sidebar || !link) return;

  let collassata = false;
  try { collassata = localStorage.getItem(CHIAVE_SIDEBAR_COLLASSATA) === '1'; } catch { /* privacy mode: pazienza */ }
  sidebar.classList.toggle('collapsed', collassata);

  link.addEventListener('click', (evento) => {
    evento.preventDefault();
    const ora = sidebar.classList.toggle('collapsed');
    try { localStorage.setItem(CHIAVE_SIDEBAR_COLLASSATA, ora ? '1' : '0'); } catch { /* privacy mode: pazienza */ }
  });
}

/* Identita' reale nella topbar (avatar/nome studio/piano) al posto del
 * placeholder statico "SD / Studio Dreamforge / Pro Plan". Il markup e'
 * identico su ogni pagina autenticata (vedi .top-actions), quindi non
 * servono id dedicati: si aggancia alla struttura .avatar + div fratello.
 *
 * Il box "Upgrade to Pro" in sidebar si nasconde da solo per chi ha gia'
 * il piano piu' alto acquistabile online (publisher): non ha senso
 * proporre un upgrade che non esiste.
 */
const PIANO_LABEL_TOPBAR = { gratis: 'Free plan', indie: 'Indie plan', studio: 'Studio plan', publisher: 'Publisher plan', enterprise: 'Enterprise plan' };

async function caricaIdentitaTopbar() {
  const avatar = document.querySelector('.top-actions .avatar');
  if (!avatar) return;

  let identita, abbonamento;
  try {
    [identita, abbonamento] = await Promise.all([api('/auth/me'), api('/abbonamento').catch(() => null)]);
  } catch {
    return; // api() reindirizza gia' al login su 401; altri errori restano silenziosi qui
  }
  if (!identita?.org) return;

  const nomeOrg = identita.org.name || 'Your studio';
  avatar.textContent = iniziliGioco(nomeOrg);

  const infoDiv = avatar.nextElementSibling;
  if (infoDiv?.tagName === 'DIV') {
    const nomeEl = infoDiv.querySelector('b');
    const pianoEl = infoDiv.querySelector('small');
    if (nomeEl) nomeEl.textContent = nomeOrg;
    if (pianoEl) pianoEl.textContent = abbonamento?.piano_nome ? `${abbonamento.piano_nome} plan` : (PIANO_LABEL_TOPBAR[identita.org.plan] || 'Free plan');
  }

  if (abbonamento?.piano === 'publisher') {
    document.querySelectorAll('.upgrade').forEach((box) => { box.hidden = true; });
  }
}

/* Il pulsante "Upgrade plan" nel box sidebar manda alla sezione Piani e
 * limiti di Settings (stesso pattern del link gia' presente in
 * issue-detection.html quando una feature e' bloccata dal piano).
 */
function initPulsantiUpgrade() {
  document.querySelectorAll('.upgrade button').forEach((bottone) => {
    bottone.addEventListener('click', () => { window.location.href = 'impostazioni.html#plans'; });
  });
}

/* Stato reale dei connettori (Steam/Google Play/App Store) nel box "my
 * first game" della sidebar: prima era testo statico ("Connected"/
 * "Connect") uguale per tutti, indipendente da cosa fosse davvero
 * collegato. /api/integrazioni e' gia' scoperta per il gioco attivo (vedi
 * middleware/gioco.js), quindi riflette esattamente cio' che si vede
 * anche in Integrations per quel gioco.
 */
async function caricaStatoConnettoriSidebar() {
  const righe = document.querySelectorAll('.connected .source[data-provider]');
  if (!righe.length) return;

  let lista;
  try {
    lista = await api('/integrazioni');
  } catch {
    righe.forEach((riga) => {
      const etichetta = riga.querySelector('.sidebar-stato');
      if (etichetta) etichetta.textContent = 'Status unavailable';
    });
    return;
  }
  if (!lista) return; // 401 -> api() ha gia' rimandato al login

  const mappa = new Map(lista.map((i) => [i.provider, i]));
  righe.forEach((riga) => {
    const etichetta = riga.querySelector('.sidebar-stato');
    if (!etichetta) return;
    const connesso = mappa.get(riga.dataset.provider)?.connesso === true;
    etichetta.textContent = connesso ? 'Connected' : 'Not connected';
    etichetta.classList.toggle('bad', !connesso);
  });
}

initMenuGiochi();
caricaMenuGiochi();
initCollassaSidebar();
caricaIdentitaTopbar();
initPulsantiUpgrade();
caricaStatoConnettoriSidebar();
