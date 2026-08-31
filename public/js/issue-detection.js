/* Issue Detection: chiama GET /api/problemi (vedi routes/issues.js) e
 * disegna la pagina — prima era tutta statica con dati finti.
 *
 * I filtri (gravita'/piattaforma/ricerca) sono lato client: i problemi
 * completi si scaricano una volta sola, i filtri rifanno solo il render.
 */

const PIATTAFORMA_LABELS = { steam: 'Steam', xbox: 'Xbox', google_play: 'Google Play', app_store: 'App Store' };
const GRAVITA_LABELS = { alta: 'High', media: 'Medium', bassa: 'Low' };
const GRAVITA_TAG_CLASSE = { alta: 'red', media: 'orange', bassa: 'green' };

const elCaricamento = document.getElementById('problemi-caricamento');
const elBloccato = document.getElementById('problemi-bloccato');
const elNonDisponibile = document.getElementById('problemi-non-disponibile');
const elErroreTesto = document.getElementById('problemi-errore-testo');
const elVuoto = document.getElementById('problemi-vuoto');
const elLista = document.getElementById('problemi-lista');
const elScaricaGrafico = document.getElementById('problemi-scarica-grafico');
const elGraficoContenitore = document.getElementById('problemi-grafico-contenitore');
const elGraficoCanvas = document.getElementById('problemi-grafico');
const elFiltroGravita = document.getElementById('problemi-filtro-gravita');
const elFiltroPiattaforma = document.getElementById('problemi-filtro-piattaforma');
const elFiltroRicerca = document.getElementById('problemi-filtro-ricerca');

const COLORE_GRAVITA = { alta: '#F87171', media: '#FF9D00', bassa: '#22C55E' };

let problemiCompleti = [];
let chartProblemi = null;

function formattaData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formattaAndamento(andamento) {
  if (andamento === null || andamento === undefined) return 'New this week';
  if (andamento === 0) return 'No change vs last week';
  const segno = andamento > 0 ? '+' : '';
  return `${segno}${andamento}% vs last week`;
}

function formattaPiattaforme(piattaforme) {
  return Object.entries(piattaforme)
    .sort((a, b) => b[1] - a[1])
    .map(([provider, n]) => `● ${PIATTAFORMA_LABELS[provider] || provider}　${n}`)
    .join('　　');
}

function creaCardPrincipale(problema) {
  const article = document.createElement('article');
  article.className = 'panel';
  article.style.marginBottom = '10px';
  if (problema.gravita === 'alta') article.style.borderColor = '#ff7067';

  const esempi = problema.esempi.length
    ? problema.esempi.map((testo) => `<p>“${testo}”</p>`).join('')
    : '<p style="color:var(--muted)">No review text available for this group.</p>';

  article.innerHTML = `
    ${problema.gravita === 'alta' ? '<span class="tag red">▲ POSSIBLE CRITICAL ISSUE</span>' : ''}
    <h2 style="font-size:15px;margin-top:10px">${problema.nome}</h2>
    <p>${problema.totale_recensioni} review${problema.totale_recensioni === 1 ? '' : 's'}　•　<span class="${problema.andamento_settimanale > 0 ? 'bad' : ''}">${formattaAndamento(problema.andamento_settimanale)}</span></p>
    <div class="grid-2" style="margin-top:15px">
      <div>
        <p>${formattaPiattaforme(problema.piattaforme)}</p>
        <h3>What reviewers are saying</h3>
        ${esempi}
      </div>
      <div>
        <p>Severity　<span class="${problema.gravita === 'alta' ? 'bad' : ''}">● ${GRAVITA_LABELS[problema.gravita]}</span></p>
        <p>First reported　${formattaData(problema.primo_segnalato)}</p>
        <p>Last reported　${formattaData(problema.ultimo_segnalato)}</p>
        <button disabled title="Ticket tracker integration coming soon" style="float:right;background:#FF9D00;color:#fff;opacity:.6;cursor:not-allowed">Create issue</button>
      </div>
    </div>
  `;
  return article;
}

function creaCardCompatta(problema) {
  const article = document.createElement('article');
  article.className = 'panel';
  article.style.marginBottom = '8px';
  article.style.cursor = 'pointer';

  const riga = document.createElement('div');
  riga.innerHTML = `<b>⚠ ${problema.nome}</b><span style="float:right">${problema.totale_recensioni} review${problema.totale_recensioni === 1 ? '' : 's'}　 <span class="tag ${GRAVITA_TAG_CLASSE[problema.gravita]}">${GRAVITA_LABELS[problema.gravita]}</span>　›</span>`;
  article.appendChild(riga);

  let dettaglio = null;
  article.addEventListener('click', () => {
    if (dettaglio) {
      dettaglio.remove();
      dettaglio = null;
      return;
    }
    dettaglio = document.createElement('div');
    dettaglio.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)';
    const esempi = problema.esempi.length ? problema.esempi.map((t) => `“${t}”`).join('<br>') : 'No review text available.';
    dettaglio.innerHTML = `
      <p>${formattaPiattaforme(problema.piattaforme)}</p>
      <p>${formattaAndamento(problema.andamento_settimanale)}　·　First reported ${formattaData(problema.primo_segnalato)}　·　Last reported ${formattaData(problema.ultimo_segnalato)}</p>
      <p style="margin-top:6px">${esempi}</p>
    `;
    article.appendChild(dettaglio);
  });

  return article;
}

function applicaFiltri() {
  const gravita = elFiltroGravita.value;
  const piattaforma = elFiltroPiattaforma.value;
  const ricerca = elFiltroRicerca.value.trim().toLowerCase();

  return problemiCompleti.filter((p) => {
    if (gravita && p.gravita !== gravita) return false;
    if (piattaforma && !p.piattaforme[piattaforma]) return false;
    if (ricerca && !p.nome.toLowerCase().includes(ricerca)) return false;
    return true;
  });
}

function disegnaGrafico(filtrati) {
  if (typeof Chart === 'undefined' || !elGraficoCanvas) return; // Chart.js non caricato, es. rete assente

  if (!filtrati.length) {
    elGraficoContenitore.hidden = true;
    return;
  }

  elGraficoContenitore.hidden = false;

  // Chart.js disegna dall'alto verso il basso: invertiamo per avere il
  // problema piu' grave in cima, come nella lista sopra.
  const ordinati = [...filtrati].reverse();
  const etichette = ordinati.map((p) => p.nome);
  const valori = ordinati.map((p) => p.totale_recensioni);
  const colori = ordinati.map((p) => COLORE_GRAVITA[p.gravita] || COLORE_GRAVITA.bassa);

  if (chartProblemi) {
    chartProblemi.data.labels = etichette;
    chartProblemi.data.datasets[0].data = valori;
    chartProblemi.data.datasets[0].backgroundColor = colori;
    chartProblemi.update();
    return;
  }

  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#AFA189';
    Chart.defaults.borderColor = '#2E2416';
  }

  chartProblemi = new Chart(elGraficoCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: etichette,
      datasets: [{ label: 'Reviews', data: valori, backgroundColor: colori }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0, color: '#AFA189' }, grid: { color: '#2E2416' } },
        y: { grid: { display: false }, ticks: { color: '#AFA189' } },
      },
    },
  });
}

function disegnaLista() {
  const filtrati = applicaFiltri();
  elLista.innerHTML = '';
  elVuoto.hidden = filtrati.length > 0;

  filtrati.forEach((problema, indice) => {
    elLista.appendChild(indice === 0 ? creaCardPrincipale(problema) : creaCardCompatta(problema));
  });

  disegnaGrafico(filtrati);
}

async function carica() {
  try {
    const dati = await api('/problemi');
    if (!dati) return; // 401 -> api() ha gia' rimandato al login

    elCaricamento.hidden = true;
    problemiCompleti = dati.problemi;

    if (problemiCompleti.length === 0) {
      elVuoto.hidden = false;
      return;
    }

    elScaricaGrafico.hidden = false;
    disegnaLista();
  } catch (errore) {
    elCaricamento.hidden = true;

    if (errore.status === 403) {
      elBloccato.hidden = false;
      return;
    }

    elNonDisponibile.hidden = false;
    elErroreTesto.textContent = errore.message || 'Riprova più tardi.';
  }
}

elFiltroGravita.addEventListener('change', disegnaLista);
elFiltroPiattaforma.addEventListener('change', disegnaLista);
elFiltroRicerca.addEventListener('input', disegnaLista);

elScaricaGrafico.addEventListener('click', () => {
  if (!chartProblemi) return;
  const link = document.createElement('a');
  link.href = chartProblemi.toBase64Image();
  link.download = 'issue-detection.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
});

carica();
