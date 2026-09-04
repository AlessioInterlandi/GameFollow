/* Pagina di atterraggio del link di conferma email.
 * Legge il token dalla query string, lo consuma chiamando
 * /api/auth/verifica-email e mostra l'esito. Il testo dei tre stati e' gia'
 * tradotto via data-i18n direttamente nell'HTML (js/i18n.js): questo script
 * si limita a scegliere QUALE stato mostrare, non riscrive mai il testo con
 * il messaggio del server (che risponde sempre in italiano, vedi
 * routes/auth.js) per non rompere la coerenza della lingua scelta.
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

    mostra(risposta.ok ? 'successo' : 'errore');
  } catch {
    mostra('errore');
  }
})();
