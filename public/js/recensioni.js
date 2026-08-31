/* Pagina Reviews: elenco reale (GET /api/recensioni) e azioni reali
 * (sync, genera, approva, ignora) sulle recensioni dell'account collegato.
 */
(function () {
// Guardia contro una doppia esecuzione di questo script (cache del
// browser, estensioni di live-reload, ecc.): senza, la pagina caricata
// due volte attaccherebbe ogni listener due volte — un click su "Add
// review" salverebbe la stessa recensione due volte in silenzio, invece
// di limitarsi a dare l'errore di sintassi che dava prima.
if (window.__recensioniJsInizializzato) return;
window.__recensioniJsInizializzato = true;

const corpoTabella = document.getElementById('corpo-tabella');
const filtroStato = document.getElementById('filtro-stato');
const btnSync = document.getElementById('btn-sync');

const btnAggiungi = document.getElementById('btn-aggiungi');
const modaleAggiungi = document.getElementById('modale-aggiungi');
const aggiungiRating = document.getElementById('aggiungi-rating');
const aggiungiPiattaforma = document.getElementById('aggiungi-piattaforma');
const aggiungiAutore = document.getElementById('aggiungi-autore');
const aggiungiTesto = document.getElementById('aggiungi-testo');
const aggiungiErrore = document.getElementById('aggiungi-errore');

const ETICHETTA_STATO = {
  da_generare: { testo: 'To generate', classe: 'orange' },
  da_approvare: { testo: 'Pending approval', classe: 'orange' },
  pubblicata: { testo: 'Published', classe: 'green' },
  ignorata: { testo: 'Ignored', classe: '' },
};

function sentimento(rating) {
  if (rating >= 4) return { testo: 'Positive', classe: 'green' };
  if (rating === 3) return { testo: 'Neutral', classe: 'orange' };
  return { testo: 'Negative', classe: 'red' };
}

function stelle(voto) {
  const piene = Math.round(voto);
  return '★★★★★☆☆☆☆☆'.slice(5 - piene, 10 - piene);
}

function escapeHtmlLocale(testo) {
  const div = document.createElement('div');
  div.textContent = testo ?? '';
  return div.innerHTML;
}

function pulsantiAzione(recensione) {
  switch (recensione.status) {
    case 'da_generare':
      return `<button class="action" data-azione="genera" data-id="${recensione.id}">Generate reply</button>`;
    case 'da_approvare':
      return `<button class="action" style="background:#FF9D00;color:#fff" data-azione="approva" data-id="${recensione.id}">Approve</button>
              <button class="action" data-azione="ignora" data-id="${recensione.id}">Ignore</button>`;
    case 'pubblicata':
      return '<span class="ok">✓ Published</span>';
    default:
      return '<span style="color:var(--muted)">—</span>';
  }
}

function render(recensioni) {
  if (recensioni.length === 0) {
    corpoTabella.innerHTML = '<tr><td colspan="6">No reviews for this filter.</td></tr>';
    return;
  }

  corpoTabella.innerHTML = recensioni
    .map((r) => {
      const stato = ETICHETTA_STATO[r.status] || { testo: r.status, classe: '' };
      const feel = sentimento(r.rating);
      return `<tr>
        <td><b>${escapeHtmlLocale(r.text || '(no text)')}</b><br><small>${escapeHtmlLocale(r.author)}</small></td>
        <td class="rating">${stelle(r.rating)}</td>
        <td><span class="tag ${feel.classe}">${feel.testo}</span></td>
        <td>${new Date(r.review_date).toLocaleDateString('en-US')}</td>
        <td><span class="tag ${stato.classe}">${stato.testo}</span></td>
        <td>${pulsantiAzione(r)}</td>
      </tr>`;
    })
    .join('');
}

async function carica() {
  corpoTabella.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  const query = filtroStato.value ? `?stato=${encodeURIComponent(filtroStato.value)}` : '';
  const recensioni = await api(`/recensioni${query}`);
  if (recensioni) render(recensioni);
}

filtroStato.addEventListener('change', carica);

btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  btnSync.textContent = 'Syncing…';
  try {
    await api('/recensioni/sync', { method: 'POST' });
    mostraMessaggio('Sync started, new reviews will appear shortly.', 'successo');
    setTimeout(carica, 1500);
  } catch (err) {
    mostraMessaggio(err.message, 'errore');
  } finally {
    btnSync.disabled = false;
    btnSync.textContent = '⟳  Sync now';
  }
});

btnAggiungi.addEventListener('click', () => {
  aggiungiRating.value = '5';
  aggiungiPiattaforma.value = 'steam';
  aggiungiAutore.value = '';
  aggiungiTesto.value = '';
  aggiungiErrore.style.display = 'none';
  modaleAggiungi.showModal();
  aggiungiTesto.focus();
});

document.getElementById('aggiungi-annulla').addEventListener('click', () => modaleAggiungi.close());

document.getElementById('aggiungi-salva').addEventListener('click', async () => {
  const testo = aggiungiTesto.value.trim();
  if (!testo) {
    aggiungiErrore.textContent = 'Write (or paste) the review text first.';
    aggiungiErrore.style.display = 'block';
    return;
  }

  const bottoneSalva = document.getElementById('aggiungi-salva');
  bottoneSalva.disabled = true;
  try {
    await api('/recensioni/manuale', {
      method: 'POST',
      body: {
        rating: Number(aggiungiRating.value),
        piattaforma: aggiungiPiattaforma.value,
        autore: aggiungiAutore.value.trim(),
        testo,
      },
    });
    modaleAggiungi.close();
    mostraMessaggio('Review added.', 'successo');
    carica();
  } catch (err) {
    aggiungiErrore.textContent = err.message;
    aggiungiErrore.style.display = 'block';
  } finally {
    bottoneSalva.disabled = false;
  }
});

corpoTabella.addEventListener('click', async (evento) => {
  const bottone = evento.target.closest('button[data-azione]');
  if (!bottone) return;

  const { azione, id } = bottone.dataset;
  bottone.disabled = true;

  try {
    await api(`/recensioni/${id}/${azione}`, { method: 'POST' });
    mostraMessaggio(
      azione === 'genera' ? 'Reply generation started.' : azione === 'approva' ? 'Reply published.' : 'Review ignored.',
      'successo'
    );
    setTimeout(carica, azione === 'genera' ? 1200 : 200);
  } catch (err) {
    mostraMessaggio(err.message, 'errore');
    bottone.disabled = false;
  }
});

carica();
})();
