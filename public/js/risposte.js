/* Pagina Replies: bozze generate dall'AI, modificabili e pubblicabili.
 * Stesso backend di recensioni.js (le "risposte" sono un campo della
 * recensione), vista diversa: qui conta il testo della bozza.
 */
const corpoTabella = document.getElementById('corpo-tabella');
const filtroStato = document.getElementById('filtro-stato');

function escapeHtmlLocale(testo) {
  const div = document.createElement('div');
  div.textContent = testo ?? '';
  return div.innerHTML;
}

function rigaAzioni(recensione) {
  if (recensione.status === 'da_approvare') {
    return `
      <button class="action" data-azione="modifica" data-id="${recensione.id}">Edit</button>
      <button class="action" style="background:#FF9D00;color:#fff" data-azione="approva" data-id="${recensione.id}">Approve</button>
      <button class="action" data-azione="ignora" data-id="${recensione.id}">Ignore</button>`;
  }
  if (recensione.status === 'pubblicata') return '<span class="ok">✓ Published</span>';
  return '<span style="color:var(--muted)">—</span>';
}

function statoTag(status) {
  if (status === 'da_approvare') return '<span class="tag orange">Awaiting approval</span>';
  if (status === 'pubblicata') return '<span class="tag green">Published</span>';
  if (status === 'ignorata') return '<span class="tag">Ignored</span>';
  return `<span class="tag">${status}</span>`;
}

function render(recensioni) {
  const conRisposta = recensioni.filter((r) => r.draft_reply || r.published_reply);

  if (conRisposta.length === 0) {
    corpoTabella.innerHTML = '<tr><td colspan="4">No replies here yet.</td></tr>';
    return;
  }

  corpoTabella.innerHTML = conRisposta
    .map((r) => `<tr data-id="${r.id}">
        <td>${escapeHtmlLocale(r.text || '(no text)')}</td>
        <td class="cella-risposta">${escapeHtmlLocale(r.published_reply || r.draft_reply)}</td>
        <td>${statoTag(r.status)}</td>
        <td>${rigaAzioni(r)}</td>
      </tr>`)
    .join('');
}

async function carica() {
  corpoTabella.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
  const query = filtroStato.value ? `?stato=${encodeURIComponent(filtroStato.value)}` : '';
  const recensioni = await api(`/recensioni${query}`);
  if (recensioni) render(recensioni);
}

filtroStato.addEventListener('change', carica);

corpoTabella.addEventListener('click', async (evento) => {
  const bottone = evento.target.closest('button[data-azione]');
  if (!bottone) return;

  const { azione, id } = bottone.dataset;

  if (azione === 'modifica') {
    const riga = bottone.closest('tr');
    const cella = riga.querySelector('.cella-risposta');
    const testoAttuale = cella.textContent;

    cella.innerHTML = `<textarea style="width:100%;min-height:60px">${escapeHtmlLocale(testoAttuale)}</textarea>
      <button class="action" data-azione="salva-bozza" data-id="${id}" style="margin-top:6px">Save</button>`;
    return;
  }

  if (azione === 'salva-bozza') {
    const riga = bottone.closest('tr');
    const testo = riga.querySelector('textarea').value.trim();
    if (!testo) return;

    bottone.disabled = true;
    try {
      await api(`/recensioni/${id}/bozza`, { method: 'PUT', body: { testo } });
      mostraMessaggio('Draft saved.', 'successo');
      carica();
    } catch (err) {
      mostraMessaggio(err.message, 'errore');
      bottone.disabled = false;
    }
    return;
  }

  bottone.disabled = true;
  try {
    await api(`/recensioni/${id}/${azione}`, { method: 'POST' });
    mostraMessaggio(azione === 'approva' ? 'Reply published.' : 'Review ignored.', 'successo');
    carica();
  } catch (err) {
    mostraMessaggio(err.message, 'errore');
    bottone.disabled = false;
  }
});

carica();
