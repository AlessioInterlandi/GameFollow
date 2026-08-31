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

const PIATTAFORMA_LABELS = { steam: 'Steam', xbox: 'Xbox', google_play: 'Google Play', app_store: 'App Store' };
const GRAVITA_TAG_CLASSE = { alta: 'red', media: 'orange', bassa: 'green' };

let chartSentiment = null;
let chartPiattaforma = null;

// Le due card sotto sono grafici reali (Chart.js), calcolati lato client
// dalle recensioni gia' scaricate per la dashboard — nessuna chiamata in piu'.

function applicaTemaGrafici() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#AFA189';
  Chart.defaults.borderColor = '#2E2416';
  Chart.defaults.font.family = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
}

function disegnaSentiment(recensioni) {
  const canvas = document.getElementById('dash-sentiment-grafico');
  if (!canvas || typeof Chart === 'undefined') return;
  applicaTemaGrafici();

  let positive = 0, neutre = 0, negative = 0;
  for (const r of recensioni) {
    if (r.rating >= 4) positive++;
    else if (r.rating === 3) neutre++;
    else negative++;
  }
  const totale = recensioni.length || 1;
  const pct = (n) => `${Math.round((n / totale) * 100)}%`;

  const elP = document.getElementById('dash-sentiment-positive');
  const elN = document.getElementById('dash-sentiment-neutral');
  const elNeg = document.getElementById('dash-sentiment-negative');
  if (elP) elP.textContent = `${pct(positive)} (${positive.toLocaleString('en-US')})`;
  if (elN) elN.textContent = `${pct(neutre)} (${neutre.toLocaleString('en-US')})`;
  if (elNeg) elNeg.textContent = `${pct(negative)} (${negative.toLocaleString('en-US')})`;

  const dati = [positive, neutre, negative];
  const colori = ['#22C55E', '#FF9D00', '#F87171'];

  if (chartSentiment) {
    chartSentiment.data.datasets[0].data = dati;
    chartSentiment.update();
    return;
  }

  chartSentiment = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels: ['Positive', 'Neutral', 'Negative'], datasets: [{ data: dati, backgroundColor: colori }] },
    options: {
      responsive: true,
      maintainAspectRatio: false, // riempie il .chart-box (158px), stessa altezza del grafico a fianco
      plugins: { legend: { display: false } },
      cutout: '65%',
    },
  });
}

function disegnaPiattaforma(recensioni) {
  const canvas = document.getElementById('dash-piattaforma-grafico');
  if (!canvas || typeof Chart === 'undefined') return;
  applicaTemaGrafici();

  const perPiattaforma = {};
  for (const r of recensioni) {
    const p = r.platform || 'steam';
    if (!perPiattaforma[p]) perPiattaforma[p] = { somma: 0, conteggio: 0 };
    perPiattaforma[p].somma += r.rating;
    perPiattaforma[p].conteggio += 1;
  }

  const piattaforme = Object.keys(perPiattaforma);
  const etichette = piattaforme.map((p) => `${PIATTAFORMA_LABELS[p] || p} (${perPiattaforma[p].conteggio})`);
  const medie = piattaforme.map((p) => Math.round((perPiattaforma[p].somma / perPiattaforma[p].conteggio) * 100) / 100);

  if (chartPiattaforma) {
    chartPiattaforma.data.labels = etichette;
    chartPiattaforma.data.datasets[0].data = medie;
    chartPiattaforma.update();
    return;
  }

  chartPiattaforma = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: etichette, datasets: [{ label: 'Average rating', data: medie, backgroundColor: '#FFC569' }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false, // riempie il .chart-box (158px), stessa altezza del donut a fianco
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, max: 5, grid: { color: '#2E2416' }, ticks: { color: '#AFA189' } },
        y: { grid: { display: false }, ticks: { color: '#AFA189' } },
      },
    },
  });
}

function creaRigaProblema(problema) {
  const tr = document.createElement('tr');
  const andamento = problema.andamento_settimanale;
  const testoAndamento = andamento === null || andamento === undefined ? 'New' : `${andamento > 0 ? '+' : ''}${andamento}%`;
  const classeAndamento = andamento > 0 ? 'negative' : andamento < 0 ? 'positive' : '';
  tr.innerHTML = `<td>${escapeHtmlLocale(problema.nome)}</td><td>${problema.totale_recensioni.toLocaleString('en-US')}</td><td class="${classeAndamento}">${testoAndamento}</td>`;
  return tr;
}

async function caricaProblemiDashboard() {
  const nota = document.getElementById('dash-problemi-nota');
  const tabella = document.getElementById('dash-problemi-tabella');
  const corpo = document.getElementById('dash-problemi-corpo');
  if (!nota || !tabella || !corpo) return;

  try {
    const dati = await api('/problemi');
    if (!dati) return; // 401 -> api() ha gia' rimandato al login

    if (!dati.problemi.length) {
      nota.textContent = 'No issues detected in your reviews yet.';
      tabella.hidden = true;
      return;
    }

    corpo.innerHTML = '';
    dati.problemi.slice(0, 5).forEach((problema) => corpo.appendChild(creaRigaProblema(problema)));
    nota.hidden = true;
    tabella.hidden = false;
  } catch (errore) {
    if (errore.status === 403) {
      nota.innerHTML = 'Issue Detection is part of the Studio plan and up. <a class="link" href="impostazioni.html">Upgrade →</a>';
    } else {
      nota.textContent = 'Issue analysis not available right now.';
    }
    tabella.hidden = true;
  }
}

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
    disegnaSentiment(recensioni);
    disegnaPiattaforma(recensioni);
  } catch {
    // api() reindirizza gia' al login su 401; altri errori restano silenziosi
    // in dashboard, non e' un flusso critico.
  }

  caricaProblemiDashboard();
}

caricaDashboard();
