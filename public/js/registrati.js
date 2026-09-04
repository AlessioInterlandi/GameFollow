/* Gestione del form di registrazione.
 * Intercetta il submit, chiama /api/auth/register. Il testo mostrato viene
 * da js/i18n.js (gfI18n.t), MAI dal messaggio che arriva dal server: il
 * backend risponde sempre in italiano (vedi routes/auth.js), quindi il
 * corpo della risposta serve solo per la LOGICA (ok/errore/status), mai
 * per il testo mostrato — altrimenti la pagina risulterebbe mezza tradotta
 * per chi ha scelto inglese/spagnolo/francese.
 */

const form = document.getElementById('form-registrazione');
const err = document.getElementById('err');
const ok = document.getElementById('ok');
const submitBtn = document.getElementById('submitBtn');

function t(chiave, fallback) {
  return window.gfI18n ? window.gfI18n.t(chiave, fallback) : fallback;
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  err.classList.remove('show');
  ok.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.textContent = t('form.submit_loading', 'Creazione account...');

  try {
    const risposta = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomeOrg: document.getElementById('nomeOrg').value,
        email: document.getElementById('email').value,
        password: document.getElementById('pw').value,
      }),
    });

    if (risposta.ok) {
      ok.textContent = t('ok.default', "Controlla la tua email per confermare l'account.");
      ok.classList.add('show');
      form.reset();
      submitBtn.textContent = t('form.submit_done', 'Fatto');
    } else {
      const chiaveErrore = risposta.status === 400 ? 'err.invalid' : 'err.generic';
      err.textContent = t(chiaveErrore, "Non e' stato possibile completare la registrazione. Riprova.");
      err.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = t('form.submit', 'Crea account');
    }
  } catch {
    err.textContent = t('err.network', 'Errore di rete. Riprova.');
    err.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = t('form.submit', 'Crea account');
  }
});
