/* Comune a tutte le pagine interne: apertura/chiusura del menu mobile.
 * La dashboard vera e propria (metriche + recensioni recenti) si carica
 * solo se gli elementi corrispondenti esistono in pagina (solo app.html).
 */
const navToggle = document.querySelector('.nav-toggle');
const sidebarEl = document.querySelector('.sidebar');
if (navToggle && sidebarEl) {
  navToggle.addEventListener('click', () => sidebarEl.classList.toggle('open'));
  sidebarEl.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => sidebarEl.classList.remove('open')));
}

function stelle(voto) {
  const piene = Math.round(voto);
  return '★★★★★☆☆☆☆☆'.slice(5 - piene, 10 - piene);
}

function formattaData(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const ore = Math.floor(diffMs / 3_600_000);
  if (ore < 1) return 'meno di un ora fa';
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.floor(ore / 24);
  return `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} fa`;
}

const ETICHETTA_STATO = {
  da_generare: 'To generate',
  da_approvare: 'Pending',
  pubblicata: 'AI reply',
  ignorata: 'Ignored',
};

function renderRecensioniRecenti(recensioni) {
  const contenitore = document.getElementById('recent-reviews');
  if (!contenitore) return;

  if (recensioni.length === 0) {
    contenitore.innerHTML = '<p style="color:var(--muted);font-size:13px">No reviews yet. Try "Sync" from the Reviews page.</p>';
    return;
  }

  contenitore.innerHTML = recensioni
    .slice(0, 5)
    .map((r, i) => {
      const sentimento = r.rating >= 4 ? 'Positive' : r.rating === 3 ? 'Neutral' : 'Negative';
      return `<div class="review-line">
        <span class="review-avatar a${i % 5}">${r.author.slice(0, 1)}</span>
        <div class="review-copy">
          <b>${escapeHtmlLocale(r.author)}</b>
          <span class="review-stars">${stelle(r.rating)}</span>
          <small>${formattaData(r.review_date)}</small>
          <p>${escapeHtmlLocale(r.text || '(no text)')}</p>
          <em>${ETICHETTA_STATO[r.status] || r.status}</em>
        </div>
        <div><span class="feeling ${sentimento.toLowerCase()}">${sentimento}</span></div>
      </div>`;
    })
    .join('');
}

function escapeHtmlLocale(testo) {
  const div = document.createElement('div');
  div.textContent = testo;
  return div.innerHTML;
}

async function caricaDashboard() {
  if (!document.getElementById('recent-reviews') && !document.getElementById('m-total')) return;

  try {
    const [statistiche, recensioni] = await Promise.all([api('/recensioni/stats'), api('/recensioni')]);
    if (!statistiche || !recensioni) return;

    const rating = document.getElementById('m-rating');
    if (rating) {
      rating.innerHTML = `${statistiche.media_voto || '—'} <span class="stars">${stelle(statistiche.media_voto)}</span>`;
    }

    const totale = document.getElementById('m-total');
    if (totale) totale.textContent = statistiche.totale.toLocaleString('en-US');

    const nonRisposte = statistiche.da_generare + statistiche.da_approvare;
    const unanswered = document.getElementById('m-unanswered');
    if (unanswered) unanswered.textContent = nonRisposte.toLocaleString('en-US');
    const unansweredPct = document.getElementById('m-unanswered-pct');
    if (unansweredPct && statistiche.totale > 0) {
      unansweredPct.textContent = `${((nonRisposte / statistiche.totale) * 100).toFixed(1)}% of total`;
    }

    const pubblicate = document.getElementById('m-published');
    if (pubblicate) pubblicate.textContent = statistiche.pubblicata.toLocaleString('en-US');
    const pubblicatePct = document.getElementById('m-published-pct');
    if (pubblicatePct && statistiche.totale > 0) {
      pubblicatePct.textContent = `${((statistiche.pubblicata / statistiche.totale) * 100).toFixed(1)}% of total`;
    }

    renderRecensioniRecenti(recensioni);
  } catch {
    // api() reindirizza gia' al login su 401; altri errori restano silenziosi
    // in dashboard, non e' un flusso critico.
  }
}

caricaDashboard();
