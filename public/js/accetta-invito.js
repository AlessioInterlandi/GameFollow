/* Pagina di atterraggio del link di invito al team.
 * Legge il token dalla query string, chiede a GET /api/team/invito/:token
 * a chi/quale organizzazione appartiene, mostra il riepilogo e un form per
 * scegliere la password vera. Il submit chiama POST /api/team/accetta, che
 * (se tutto va bene) apre gia' la sessione lato server: da qui basta
 * redirigere alla dashboard, non serve un login separato.
 *
 * Stessa regola di verifica-email.js: il testo mostrato viene SEMPRE da
 * js/i18n.js (gfI18n.t), mai dal messaggio del server (che risponde sempre
 * in italiano, vedi routes/team.js) — altrimenti la pagina risulterebbe
 * mezza tradotta per chi ha scelto un'altra lingua.
 */

(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const stati = {
    caricamento: document.getElementById('statoCaricamento'),
    form: document.getElementById('statoForm'),
    successo: document.getElementById('statoSuccesso'),
    errore: document.getElementById('statoErrore'),
  };

  function mostra(nome) {
    for (const [chiave, el] of Object.entries(stati)) {
      el.classList.toggle('hidden', chiave !== nome);
    }
  }

  function t(chiave, fallback) {
    return window.gfI18n ? window.gfI18n.t(chiave, fallback) : fallback;
  }

  const RUOLO_FALLBACK = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

  async function caricaInvito() {
    if (!token) {
      mostra('errore');
      return;
    }

    let risposta;
    try {
      risposta = await fetch(`/api/team/invito/${encodeURIComponent(token)}`);
    } catch {
      mostra('errore');
      return;
    }

    if (!risposta.ok) {
      mostra('errore');
      return;
    }

    const dati = await risposta.json();
    document.getElementById('invitoEmail').textContent = dati.email || '';
    document.getElementById('invitoOrg').textContent = dati.organizzazione || '';
    document.getElementById('invitoRuolo').textContent = t(`role.${dati.ruolo}`, RUOLO_FALLBACK[dati.ruolo] || dati.ruolo);

    mostra('form');
  }

  const form = document.getElementById('formAccetta');
  const formErr = document.getElementById('formErr');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const pw = document.getElementById('pw').value;
    const pwConferma = document.getElementById('pwConferma').value;

    formErr.classList.remove('show');

    if (pw.length < 8) {
      formErr.textContent = t('state.form.err_too_short', 'La password deve avere almeno 8 caratteri.');
      formErr.classList.add('show');
      return;
    }
    if (pw !== pwConferma) {
      formErr.textContent = t('state.form.err_mismatch', 'Le due password non coincidono.');
      formErr.classList.add('show');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t('state.form.submit_loading', 'Attivazione in corso...');

    try {
      const risposta = await fetch('/api/team/accetta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });

      if (risposta.ok) {
        mostra('successo');
        window.setTimeout(() => { window.location.href = 'app.html'; }, 1200);
      } else {
        formErr.textContent = t('state.form.err_generic', "Non e' stato possibile attivare l'account. Il link potrebbe essere scaduto.");
        formErr.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = t('state.form.submit', 'Attiva account');
      }
    } catch {
      formErr.textContent = t('state.form.err_network', 'Errore di rete. Riprova.');
      formErr.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = t('state.form.submit', 'Attiva account');
    }
  });

  caricaInvito();
})();
