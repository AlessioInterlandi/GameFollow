/* Gestione del form di accesso.
 * Intercetta il submit, chiama /api/auth/login, e in caso di errore
 * mostra il messaggio senza ricaricare la pagina. Il caso "email non
 * confermata" (403, motivo: email_non_verificata) mostra un messaggio
 * diverso con un link per rimandare l'email di conferma.
 */

const erroreBox = document.querySelector('.err');
const erroreMsg = document.getElementById('errMsg');
const resendWrap = document.getElementById('resendWrap');
const resendLink = document.getElementById('resendLink');

document.querySelector('form').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  erroreBox.classList.remove('show');
  resendWrap.style.display = 'none';

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
    erroreMsg.textContent = corpo.errore || 'Email non confermata. Controlla la tua casella di posta.';
    resendWrap.style.display = '';
  } else {
    erroreMsg.textContent = 'Email o password non corretti.';
  }
  erroreBox.classList.add('show');
});

resendLink.addEventListener('click', async (evento) => {
  evento.preventDefault();
  const email = document.getElementById('email').value;

  resendLink.textContent = 'Invio...';
  await fetch('/api/auth/rinvia-verifica', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  erroreMsg.textContent = 'Se l\'indirizzo risulta registrato e non ancora confermato, ti abbiamo mandato una nuova email.';
  resendWrap.style.display = 'none';
});
