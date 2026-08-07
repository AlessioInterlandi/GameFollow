/* Gestione del form di accesso.
 * Intercetta il submit, chiama /api/auth/login, e in caso di errore
 * mostra il messaggio senza ricaricare la pagina.
 */

document.querySelector('form').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const errore = document.querySelector('.err');
  errore.classList.remove('show');

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
  } else {
    errore.classList.add('show');
  }
});
