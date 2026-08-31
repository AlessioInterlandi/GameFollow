/* Unico punto in cui il frontend parla col backend.
 *
 * Esporta (su window, niente moduli: le pagine caricano gli script con
 * <script> semplici, senza type="module"):
 *   api(percorso, opzioni)   wrapper su fetch verso /api
 *   mostraMessaggio(testo, tipo)
 *   caricaIntestazione()     nome azienda + gestione del logout
 *
 * Qui dentro non deve MAI comparire una chiave API: le chiavi restano nel
 * backend. Tutto quello che sta in questa cartella e' leggibile da chiunque
 * apra gli strumenti per sviluppatori del browser.
 */

async function api(percorso, opzioni = {}) {
  const risposta = await fetch(`/api${percorso}`, {
    ...opzioni,
    headers: {
      'Content-Type': 'application/json',
      ...opzioni.headers,
    },
    body: opzioni.body ? JSON.stringify(opzioni.body) : undefined,
  });

  if (risposta.status === 401 && !percorso.startsWith('/auth/login')) {
    window.location.href = 'login.html';
    return null;
  }

  const tipo = risposta.headers.get('content-type') || '';
  const dati = tipo.includes('application/json') ? await risposta.json().catch(() => null) : null;

  if (!risposta.ok) {
    const errore = new Error(dati?.errore || `Errore ${risposta.status}`);
    errore.status = risposta.status;
    errore.dati = dati;
    throw errore;
  }

  return dati;
}

function mostraMessaggio(testo, tipo = 'info') {
  let contenitore = document.getElementById('messaggi-flash');
  if (!contenitore) {
    contenitore = document.createElement('div');
    contenitore.id = 'messaggi-flash';
    contenitore.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(contenitore);
  }

  const messaggio = document.createElement('div');
  messaggio.className = `flash flash-${tipo}`;
  messaggio.textContent = testo;
  messaggio.style.cssText = 'padding:10px 16px;border-radius:8px;color:#fff;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);';
  messaggio.style.background = tipo === 'errore' ? '#dc2626' : tipo === 'successo' ? '#16a34a' : '#241B10';

  contenitore.appendChild(messaggio);
  setTimeout(() => messaggio.remove(), 4000);
}

async function caricaIntestazione() {
  const nomeEl = document.getElementById('org-nome');
  const avatarEl = document.getElementById('avatar');
  const logoutEl = document.getElementById('logout-link');

  try {
    const dati = await api('/auth/me');
    if (!dati) return;

    if (nomeEl) nomeEl.textContent = dati.org?.name || '';
    if (avatarEl) avatarEl.textContent = (dati.org?.name || dati.email || '?').slice(0, 2).toUpperCase();
  } catch {
    // /auth/me risponde 401 -> api() reindirizza gia' al login.
  }

  if (logoutEl) {
    logoutEl.addEventListener('click', async (evento) => {
      evento.preventDefault();
      await api('/auth/logout', { method: 'POST' });
      window.location.href = 'login.html';
    });
  }
}
