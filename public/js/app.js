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
  // Testo in inglese: come ogni altra stringa visibile nella dashboard
  // (a differenza delle 4 pagine pubbliche, quelle autenticate non fanno
  // parte del sistema i18n — vedi public/js/i18n.js).
  const diffMs = Date.now() - new Date(iso).getTime();
  const ore = Math.floor(diffMs / 3_600_000);
  if (ore < 1) return 'less than an hour ago';
  if (ore < 24) return `${ore} ${ore === 1 ? 'hour' : 'hours'} ago`;
  const giorni = Math.floor(ore / 24);
  return `${giorni} ${giorni === 1 ? 'day' : 'days'} ago`;
}

const ETICHETTA_STATO = {
  da_generare: 'To generate',
  da_approvare: 'Pending',
  pubblicata: 'AI reply',
  ignorata: 'Ignored',
};

const PIATTAFORMA_LABELS = { steam: 'Steam', xbox: 'Xbox', google_play: 'Google Play', app_store: 'App Store' };
const GRAVITA_TAG_CLASSE = { alta: 'red', media: 'orange', bassa: 'green' };

// Circonferenza del cerchio SVG con r=26 (2*PI*26 ≈ 163.4, arrotondato) —
// condivisa da tutti i donut ad arco animato della dashboard (Reply status
// piu' sotto, Sentiment distribution qui) cosi' usano tutti lo stesso
// stroke-dasharray della pagina di login.
const RING_DONUT_CIRC = 163;

function applicaTemaGrafici() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#AFA189';
  Chart.defaults.borderColor = '#2E2416';
  Chart.defaults.font.family = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
}

// Card "Sentiment distribution": donut multi-segmento animato (Positive/
// Neutral/Negative) con i dati reali, disegnato a mano in SVG (stessa
// tecnica stroke-dashoffset del ring-donut di "Reply status" qui sotto, ma
// con un arco per segmento sullo stesso cerchio) al posto del vecchio
// grafico Chart.js generico — che non aveva ne' etichetta al centro ne'
// uno stile coerente con il resto della dashboard.
const SENTIMENT_SEGMENTI = [
  { chiave: 'positive', elId: 'dash-sentiment-positive' },
  { chiave: 'neutral', elId: 'dash-sentiment-neutral' },
  { chiave: 'negative', elId: 'dash-sentiment-negative' },
];

function disegnaSentiment(recensioni) {
  const donut = document.getElementById('dash-sentiment-donut');
  if (!donut) return;

  let positive = 0, neutral = 0, negative = 0;
  for (const r of recensioni) {
    if (r.rating >= 4) positive++;
    else if (r.rating === 3) neutral++;
    else negative++;
  }
  const totale = recensioni.length;
  const divisore = totale || 1;
  const conteggi = { positive, neutral, negative };
  const pct = (n) => `${Math.round((n / divisore) * 100)}%`;

  const elP = document.getElementById('dash-sentiment-positive');
  const elN = document.getElementById('dash-sentiment-neutral');
  const elNeg = document.getElementById('dash-sentiment-negative');
  if (elP) elP.textContent = `${pct(positive)} (${positive.toLocaleString('en-US')})`;
  if (elN) elN.textContent = `${pct(neutral)} (${neutral.toLocaleString('en-US')})`;
  if (elNeg) elNeg.textContent = `${pct(negative)} (${negative.toLocaleString('en-US')})`;

  const centro = document.getElementById('dash-sentiment-center-val');
  if (centro) centro.textContent = totale.toLocaleString('en-US');

  // Segmenti in ordine Positive -> Neutral -> Negative, dalle ore 12 in
  // senso orario (stesso ordine della legenda accanto). Ogni arco usa
  // stroke-dasharray "lunghezza resto-cerchio" (non un unico valore fisso
  // come nel ring-donut a un segmento) cosi' piu' archi possono condividere
  // lo stesso cerchio senza sovrapporsi: --seg-len e' sia la lunghezza del
  // trattino sia il punto di partenza dell'animazione (nascosto -> 0).
  let angoloCumulato = 0;
  SENTIMENT_SEGMENTI.forEach(({ chiave }) => {
    const arco = donut.querySelector(`.donut-arc[data-key="${chiave}"]`);
    if (!arco) return;
    const n = conteggi[chiave];
    const frazione = n / divisore;
    const segLen = RING_DONUT_CIRC * frazione;

    arco.classList.remove('draw');
    arco.style.strokeDasharray = `${segLen} ${RING_DONUT_CIRC}`;
    arco.style.setProperty('--seg-len', segLen);
    arco.style.setProperty('--seg-rotate', `${-90 + angoloCumulato}deg`);
    angoloCumulato += frazione * 360;

    if (n > 0) {
      void arco.offsetWidth; // forza il reflow: l'animazione riparte anche quando i dati si ricaricano
      arco.classList.add('draw');
    }
  });
}

// Card "Rating by platform": barre animate al posto del bar chart Chart.js
// generico — stessa tecnica width->var(--w) gia' usata nella pagina di
// login, con il numero di piattaforme e i loro valori sempre reali.
function disegnaPiattaforma(recensioni) {
  const contenitore = document.getElementById('dash-piattaforma-bars');
  if (!contenitore) return;

  const perPiattaforma = {};
  for (const r of recensioni) {
    const p = r.platform || 'steam';
    if (!perPiattaforma[p]) perPiattaforma[p] = { somma: 0, conteggio: 0 };
    perPiattaforma[p].somma += r.rating;
    perPiattaforma[p].conteggio += 1;
  }

  const piattaforme = Object.keys(perPiattaforma);
  contenitore.innerHTML = '';

  if (piattaforme.length === 0) {
    const vuoto = document.createElement('p');
    vuoto.className = 'p-bars-empty';
    vuoto.textContent = 'No reviews yet';
    contenitore.appendChild(vuoto);
    return;
  }

  piattaforme.forEach((p) => {
    const { somma, conteggio } = perPiattaforma[p];
    const media = Math.round((somma / conteggio) * 100) / 100;
    const larghezza = Math.min(100, Math.round((media / 5) * 100));

    const riga = document.createElement('div');
    riga.className = 'p-bar-row';

    const lbl = document.createElement('span');
    lbl.className = 'p-bar-lbl';
    lbl.textContent = `${PIATTAFORMA_LABELS[p] || p} (${conteggio})`;

    const track = document.createElement('span');
    track.className = 'p-bar-track';
    const fill = document.createElement('span');
    fill.className = 'p-bar-fill';
    fill.style.setProperty('--w', `${larghezza}%`);
    track.appendChild(fill);

    const val = document.createElement('span');
    val.className = 'p-bar-val';
    val.textContent = media.toFixed(2);

    riga.append(lbl, track, val);
    contenitore.appendChild(riga);
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

function formattaDataCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Card "Critical issue detected" della dashboard: stessa fonte dati di
// Issue Detection (/api/problemi), mostra solo il problema in cima alla
// lista (gia' ordinata per gravita'/rilevanza, vedi issue-detection.js) e
// SOLO se e' davvero di gravita' alta — altrimenti sarebbe fuorviante
// chiamarlo "critical".
function disegnaProblemaCritico(problemi) {
  const caricamento = document.getElementById('dash-critical-caricamento');
  const corpo = document.getElementById('dash-critical-corpo');
  const vuoto = document.getElementById('dash-critical-vuoto');
  if (!caricamento || !corpo || !vuoto) return;

  caricamento.hidden = true;
  const primo = problemi[0];

  if (!primo || primo.gravita !== 'alta') {
    vuoto.hidden = false;
    corpo.hidden = true;
    return;
  }

  document.getElementById('dash-critical-nome').textContent = primo.nome;
  document.getElementById('dash-critical-conteggio').innerHTML =
    `${primo.totale_recensioni} review${primo.totale_recensioni === 1 ? '' : 's'} ${primo.andamento_settimanale > 0 ? `<b class="negative">+${primo.andamento_settimanale}%</b> vs last week` : ''}`;

  const chips = document.getElementById('dash-critical-piattaforme');
  chips.innerHTML = Object.entries(primo.piattaforme)
    .sort((a, b) => b[1] - a[1])
    .map(([provider, n]) => `<span>●　${PIATTAFORMA_LABELS[provider] || provider}　${n}</span>`)
    .join('');

  document.getElementById('dash-critical-primo').textContent = formattaDataCorta(primo.primo_segnalato);
  document.getElementById('dash-critical-ultimo').textContent = formattaDataCorta(primo.ultimo_segnalato);
  document.getElementById('dash-critical-esempio').textContent = primo.esempi[0] ? `“${primo.esempi[0]}”` : 'No review text available for this group.';

  corpo.hidden = false;
  vuoto.hidden = true;
}

async function caricaProblemiDashboard() {
  const nota = document.getElementById('dash-problemi-nota');
  const tabella = document.getElementById('dash-problemi-tabella');
  const corpo = document.getElementById('dash-problemi-corpo');
  const criticalCaricamento = document.getElementById('dash-critical-caricamento');
  if (!nota || !tabella || !corpo) return;

  try {
    const dati = await api('/problemi');
    if (!dati) return; // 401 -> api() ha gia' rimandato al login

    disegnaProblemaCritico(dati.problemi);

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
      nota.innerHTML = 'Issue Detection is part of the Studio plan and up. <a class="link" href="impostazioni.html#plans">Upgrade →</a>';
      if (criticalCaricamento) { criticalCaricamento.hidden = true; document.getElementById('dash-critical-vuoto').hidden = false; }
    } else {
      nota.textContent = 'Issue analysis not available right now.';
      if (criticalCaricamento) criticalCaricamento.textContent = 'Not available right now.';
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

// Metrica "Positive sentiment" + mini-grafico dell'andamento: percentuale
// di recensioni positive (voto >= 4) su tutte le recensioni caricate, con
// accanto un vero grafico Chart.js dell'andamento nel tempo — non un
// numero statico ne' i 7 giorni fissi di prima.
//
// La granularita' dei bucket (giorno/settimana/mese) e il loro numero si
// calcolano dall'arco di tempo REALMENTE coperto dalle recensioni: poche
// recensioni recenti danno pochi bucket giornalieri ravvicinati, uno
// storico lungo passa automaticamente a settimane o mesi. L'asse Y non ha
// un massimo fisso: si adatta al vero intervallo di valori (Chart.js lo fa
// da solo quando non gli si impone min/max), cosi' anche una variazione
// piccola resta leggibile invece di schiacciarsi su una scala 0-100
// sempre identica. Bucket e scala si ricalcolano ad ogni cambio di gioco,
// perche' si parte sempre dalle recensioni appena scaricate.
let chartAndamento = null;

function calcolaBucketAndamento(recensioni) {
  const conDatai = recensioni
    .map((r) => ({ ...r, _data: new Date(r.review_date) }))
    .filter((r) => !Number.isNaN(r._data.getTime()))
    .sort((a, b) => a._data - b._data);
  if (conDatai.length === 0) return { etichette: [], percentuali: [], conteggi: [] };

  const prima = conDatai[0]._data;
  const ultima = conDatai[conDatai.length - 1]._data;
  const giorniSpan = Math.max(1, Math.round((ultima - prima) / 86_400_000));

  let granularita;
  if (giorniSpan <= 14) granularita = 'giorno';
  else if (giorniSpan <= 120) granularita = 'settimana';
  else granularita = 'mese';

  const chiaveBucket = (data) => {
    if (granularita === 'giorno') return data.toISOString().slice(0, 10);
    if (granularita === 'settimana') {
      const inizioSettimana = new Date(data);
      inizioSettimana.setDate(data.getDate() - data.getDay());
      return inizioSettimana.toISOString().slice(0, 10);
    }
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  };

  const perBucket = new Map();
  for (const r of conDatai) {
    const chiave = chiaveBucket(r._data);
    if (!perBucket.has(chiave)) perBucket.set(chiave, { totale: 0, positive: 0, data: r._data });
    const voce = perBucket.get(chiave);
    voce.totale += 1;
    if (r.rating >= 4) voce.positive += 1;
  }

  const chiaviOrdinate = [...perBucket.keys()].sort();
  const formattaEtichetta = (chiave, data) => {
    if (granularita === 'giorno') return data.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (granularita === 'settimana') return data.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return data.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const etichette = [];
  const percentuali = [];
  const conteggi = [];
  chiaviOrdinate.forEach((chiave) => {
    const voce = perBucket.get(chiave);
    etichette.push(formattaEtichetta(chiave, voce.data));
    percentuali.push(Math.round((voce.positive / voce.totale) * 100));
    conteggi.push(voce.totale);
  });

  return { etichette, percentuali, conteggi };
}

function disegnaSentimentMetrica(recensioni) {
  const el = document.getElementById('m-sentiment');
  const canvas = document.getElementById('m-sentiment-chart');
  if (!el) return;

  if (recensioni.length === 0) {
    el.textContent = '—';
    return;
  }

  const positive = recensioni.filter((r) => r.rating >= 4).length;
  const pct = Math.round((positive / recensioni.length) * 100);
  el.textContent = `${pct}%`;
  el.className = pct >= 50 ? 'positive' : 'negative';

  if (!canvas || typeof Chart === 'undefined') return;

  const { etichette, percentuali, conteggi } = calcolaBucketAndamento(recensioni);
  if (etichette.length < 2) return; // troppo pochi punti per un andamento leggibile

  if (chartAndamento) {
    chartAndamento.data.labels = etichette;
    chartAndamento.data.datasets[0].data = percentuali;
    chartAndamento.data.datasets[0]._conteggi = conteggi;
    chartAndamento.update();
    return;
  }

  chartAndamento = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: etichette,
      datasets: [{
        data: percentuali,
        _conteggi: conteggi,
        borderColor: '#22C55E',
        backgroundColor: 'rgba(34,197,94,.14)',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { intersect: false, mode: 'index' },
      scales: { x: { display: false }, y: { display: false } }, // sparkline: niente assi, solo l'andamento
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = ctx.dataset._conteggi?.[ctx.dataIndex];
              return `${ctx.parsed.y}% positive${n ? ` (${n} review${n === 1 ? '' : 's'})` : ''}`;
            },
          },
        },
      },
    },
  });
}

// Metrica "Platforms connected": conteggio reale da /api/integrazioni,
// non un dato di vetrina.
async function caricaPlatformeMetrica() {
  const el = document.getElementById('m-platforms');
  const nota = document.getElementById('m-platforms-note');
  if (!el) return;

  try {
    const integrazioni = await api('/integrazioni');
    if (!integrazioni) return;
    const connesse = integrazioni.filter((i) => i.connesso).length;
    el.textContent = `${connesse} / ${integrazioni.length}`;
    if (nota) nota.textContent = connesse === 0 ? 'None connected yet' : '';
  } catch {
    el.textContent = '—';
  }
}

// Card "Reply status": percentuali reali (pubblicate/in attesa/da generare)
// calcolate dalle stesse statistiche gia' scaricate per le altre metriche
// — sostituisce il vecchio pannello "Reply automation" con numeri finti,
// che distinguevano "auto reply" da "solo umano" senza che questa
// distinzione sia mai salvata da nessuna parte nel database.
// (RING_DONUT_CIRC e' definita piu' in alto, vicino a disegnaSentiment: la
// condividono entrambi i donut ad arco animato della dashboard.)

function disegnaRisposteStato(statistiche) {
  const donut = document.getElementById('dash-risposte-donut');
  const arco = document.getElementById('dash-risposte-seg');
  if (!donut || !arco) return;

  const { totale, pubblicata, da_approvare, da_generare } = statistiche;
  const pctPubblicata = totale > 0 ? Math.round((pubblicata / totale) * 100) : 0;
  const pctApprovare = totale > 0 ? Math.round((da_approvare / totale) * 100) : 0;

  document.getElementById('dash-risposte-pct').textContent = `${pctPubblicata}%`;
  document.getElementById('dash-risposte-frazione').textContent = `${pubblicata.toLocaleString('en-US')} / ${totale.toLocaleString('en-US')} reviews`;
  document.getElementById('dash-risposte-pubblicata').textContent = `${pubblicata.toLocaleString('en-US')} (${pctPubblicata}%)`;
  document.getElementById('dash-risposte-approvare').textContent = `${da_approvare.toLocaleString('en-US')} (${pctApprovare}%)`;
  document.getElementById('dash-risposte-generare').textContent = da_generare.toLocaleString('en-US');

  // Stesso arco SVG animato della pagina di login (stroke-dashoffset), qui
  // pero' con il dato reale (percentuale di recensioni con risposta
  // pubblicata) al posto dei numeri decorativi fissi del login.
  const offset = RING_DONUT_CIRC - (RING_DONUT_CIRC * pctPubblicata / 100);
  arco.style.strokeDashoffset = String(offset);
  // Ritocca la classe per far ripartire l'animazione di disegno ogni volta
  // che i dati si (ri)caricano (primo giro, cambio gioco, refresh) — senza
  // questo la seconda chiamata non riavvierebbe la CSS animation gia' finita.
  arco.classList.remove('draw');
  void arco.getBoundingClientRect();
  arco.classList.add('draw');
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
    disegnaSentimentMetrica(recensioni);
    disegnaRisposteStato(statistiche);
  } catch {
    // api() reindirizza gia' al login su 401; altri errori restano silenziosi
    // in dashboard, non e' un flusso critico.
  }

  caricaPlatformeMetrica();
  caricaProblemiDashboard();
}

caricaDashboard();
