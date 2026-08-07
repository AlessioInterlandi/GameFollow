/* Logica della pagina fatturazione.
 *
 * "Disdici l'abbonamento" chiama la route reale gia' prevista
 * (POST /api/abbonamento/disdici) e aggiorna subito badge e bottone.
 *
 * "Modifica dati" rende editabili i campi di fatturazione: per ora resta
 * solo sullo schermo, non c'e' ancora una route PUT dedicata.
 *
 * "Cambia carta" e lo scarico delle fatture restano collegati a Stripe e
 * al Sistema di Interscambio: non c'e' niente da simulare qui finche'
 * quelle integrazioni non esistono.
 */

function escapeHtml(testo) {
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

document.getElementById('btn-disdici').addEventListener('click', async () => {
  const confermato = window.confirm(
    "Disdire l'abbonamento? Il servizio resta attivo fino alla fine del mese già pagato."
  );
  if (!confermato) return;

  const bottone = document.getElementById('btn-disdici');
  bottone.disabled = true;
  bottone.textContent = 'Disdetta registrata';

  const badge = document.getElementById('badge-piano');
  badge.textContent = 'In scadenza';
  badge.className = 'badge attesa';

  await fetch('/api/abbonamento/disdici', { method: 'POST' });
});

// Trasforma i valori in campi modificabili al primo clic, li salva al secondo.
document.getElementById('btn-modifica-dati').addEventListener('click', () => {
  const bottone = document.getElementById('btn-modifica-dati');
  const inModifica = bottone.dataset.modifica === 'true';

  if (!inModifica) {
    document.querySelectorAll('#dati-fatturazione .v').forEach((valore) => {
      const testo = valore.innerHTML.replace(/<br\s*\/?>/gi, '\n').trim();
      const multilinea = testo.includes('\n');
      const campo = document.createElement(multilinea ? 'textarea' : 'input');
      if (!multilinea) campo.type = 'text';
      campo.className = 'campo-modifica';
      campo.value = testo;
      valore.replaceWith(campo);
    });
    bottone.textContent = 'Salva';
    bottone.dataset.modifica = 'true';
  } else {
    document.querySelectorAll('#dati-fatturazione .campo-modifica').forEach((campo) => {
      const valore = document.createElement('span');
      valore.className = 'v';
      valore.innerHTML = escapeHtml(campo.value).replace(/\n/g, '<br>');
      campo.replaceWith(valore);
    });
    bottone.textContent = 'Modifica dati';
    bottone.dataset.modifica = 'false';
  }
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
