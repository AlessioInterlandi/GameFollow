/* Gestione del form di registrazione.
 * Intercetta il submit, chiama /api/auth/register e mostra il messaggio
 * generico che arriva dal server (uguale sia per email nuova che per
 * email gia' registrata, apposta: vedi src/routes/auth.js).
 */

const form = document.getElementById('form-registrazione');
const err = document.getElementById('err');
const ok = document.getElementById('ok');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  err.classList.remove('show');
  ok.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creazione account...';

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

    const corpo = await risposta.json().catch(() => ({}));

    if (risposta.ok) {
      ok.textContent = corpo.messaggio || 'Controlla la tua email per confermare l\'account.';
      ok.classList.add('show');
      form.reset();
      submitBtn.textContent = 'Fatto';
    } else {
      err.textContent = corpo.errore || 'Non e\' stato possibile completare la registrazione. Riprova.';
      err.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crea account';
    }
  } catch {
    err.textContent = 'Errore di rete. Riprova.';
    err.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crea account';
  }
});
