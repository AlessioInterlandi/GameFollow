/* Logica della pagina impostazioni.
 * Carica i valori attuali (per ora finti, poi da GET /api/impostazioni),
 * li mostra nel form, salva le modifiche (PUT /api/impostazioni) e gestisce
 * collega/scollega Google (POST .../collega-google e .../scollega-google)
 * aggiornando subito lo stato a schermo.
 */

const statoGoogle = {
  collegato: true,
  nome: 'Trattoria da Mario',
  indirizzo: 'via Emilia 44, Modena',
};

function renderStatoGoogle() {
  const contenitore = document.getElementById('stato-google');

  if (statoGoogle.collegato) {
    contenitore.className = 'status';
    contenitore.removeAttribute('style');
    contenitore.innerHTML = `
      <div class="who">
        &#10003; Collegato<br>
        <span class="name">${statoGoogle.nome}</span> &middot; ${statoGoogle.indirizzo}
      </div>
      <button class="btn" id="scollega-google">Scollega</button>
    `;
  } else {
    contenitore.className = 'alert';
    contenitore.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap';
    contenitore.innerHTML = `
      <span>Nessun account Google collegato: serve per leggere le recensioni e pubblicare le risposte.</span>
      <button class="btn primary" id="collega-google">Collega account Google</button>
    `;
  }
}

// Delegato sul contenitore: dentro ci sono sempre e solo uno dei due bottoni.
document.getElementById('stato-google').addEventListener('click', async (evento) => {
  if (evento.target.id === 'collega-google') {
    statoGoogle.collegato = true;
    renderStatoGoogle();
    await fetch('/api/impostazioni/collega-google', { method: 'POST' });
  }

  if (evento.target.id === 'scollega-google') {
    statoGoogle.collegato = false;
    renderStatoGoogle();
    await fetch('/api/impostazioni/scollega-google', { method: 'POST' });
  }
});

// "Quando pubblicare": scelta singola, un clic sposta il pallino pieno.
document.querySelectorAll('.opt').forEach((opzione) => {
  opzione.addEventListener('click', () => {
    document.querySelectorAll('.opt').forEach((o) => o.classList.remove('on'));
    opzione.classList.add('on');
  });
});

document.getElementById('btn-salva').addEventListener('click', async () => {
  const bottone = document.getElementById('btn-salva');
  const opzioneScelta = document.querySelector('.opt.on');

  const impostazioni = {
    firma: document.getElementById('firma').value,
    tono: document.getElementById('tono').value,
    fatti: document.getElementById('fatti').value,
    pubblicazione: opzioneScelta ? opzioneScelta.dataset.valore : 'conferma',
  };

  await fetch('/api/impostazioni', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(impostazioni),
  });

  const testoOriginale = bottone.textContent;
  bottone.textContent = 'Salvato ✓';
  bottone.disabled = true;
  setTimeout(() => {
    bottone.textContent = testoOriginale;
    bottone.disabled = false;
  }, 2000);
});

// Menu account: apre/chiude il pallino con le iniziali in alto a destra.
const bottoneAvatar = document.getElementById('avatar');
const menuAccount = document.getElementById('account-dropdown');

bottoneAvatar.addEventListener('click', (evento) => {
  evento.stopPropagation();
  const apri = menuAccount.hidden;
  menuAccount.hidden = !apri;
  bottoneAvatar.setAttribute('aria-expanded', String(apri));
});

document.addEventListener('click', () => {
  menuAccount.hidden = true;
  bottoneAvatar.setAttribute('aria-expanded', 'false');
});

document.getElementById('logout-link').addEventListener('click', async (evento) => {
  evento.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = 'login.html';
});

renderStatoGoogle();
