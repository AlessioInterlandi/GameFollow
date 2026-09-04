/* Gestione del form di accesso.
 * Intercetta il submit, chiama /api/auth/login, e in caso di errore
 * mostra il messaggio senza ricaricare la pagina. Il caso "email non
 * confermata" (403, motivo: email_non_verificata) mostra un messaggio
 * diverso con un link per rimandare l'email di conferma.
 *
 * I testi mostrati vengono da js/i18n.js (gfI18n.t), MAI dal testo che
 * arriva dal server: il backend risponde sempre in italiano (vedi
 * routes/auth.js), quindi usarlo direttamente romperebbe la coerenza della
 * pagina se l'utente ha scelto inglese/spagnolo/francese. Il corpo della
 * risposta serve solo per la LOGICA (status, motivo), mai per il testo
 * mostrato.
 */

const erroreBox = document.querySelector('.err');
const erroreMsg = document.getElementById('errMsg');
const resendWrap = document.getElementById('resendWrap');
const resendLink = document.getElementById('resendLink');

function t(chiave, fallback) {
  return window.gfI18n ? window.gfI18n.t(chiave, fallback) : fallback;
}

document.querySelector('form').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  erroreBox.classList.remove('show');
  resendWrap.style.display = 'none';
  resendLink.textContent = t('err.resend_link', 'Rinvia email di conferma');

  const risposta = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('email').value,
      password: document.getElementById('pw').value,
    }),
  });

  if (risposta.ok) {
    window.location.href = 'app.html';
    return;
  }

  const corpo = await risposta.json().catch(() => ({}));

  if (risposta.status === 403 && corpo.motivo === 'email_non_verificata') {
    erroreMsg.textContent = t('err.not_verified', 'Email non confermata. Controlla la tua casella di posta.');
    resendWrap.style.display = '';
  } else {
    erroreMsg.textContent = t('err.default', 'Email o password non corretti.');
  }
  erroreBox.classList.add('show');
});

resendLink.addEventListener('click', async (evento) => {
  evento.preventDefault();
  const email = document.getElementById('email').value;

  resendLink.textContent = t('err.resend_sending', 'Invio...');
  await fetch('/api/auth/rinvia-verifica', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  erroreMsg.textContent = t(
    'err.resend_sent',
    "Se l'indirizzo risulta registrato e non ancora confermato, ti abbiamo mandato una nuova email."
  );
  resendWrap.style.display = 'none';
});
