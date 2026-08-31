/* Pagina di atterraggio del link di conferma email.
 * Legge il token dalla query string, lo consuma chiamando
 * /api/auth/verifica-email e mostra l'esito.
 */

(async () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const stati = {
    caricamento: document.getElementById('statoCaricamento'),
    successo: document.getElementById('statoSuccesso'),
    errore: document.getElementById('statoErrore'),
  };

  function mostra(nome) {
    for (const [chiave, el] of Object.entries(stati)) {
      el.classList.toggle('hidden', chiave !== nome);
    }
  }

  if (!token) {
    mostra('errore');
    return;
  }

  try {
    const risposta = await fetch('/api/auth/verifica-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (risposta.ok) {
      mostra('successo');
    } else {
      const corpo = await risposta.json().catch(() => ({}));
      if (corpo.errore) document.getElementById('messaggioErrore').textContent = corpo.errore;
      mostra('errore');
    }
  } catch {
    mostra('errore');
  }
})();
