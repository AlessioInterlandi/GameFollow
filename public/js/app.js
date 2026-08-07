/* Logica della dashboard: le recensioni in attesa di approvazione.
 * L'intestazione (menu account) e' gestita da comune.js.
 *
 * Per ora le recensioni sono dati finti qui sotto: quando ci sara' il
 * backend basta sostituirle con la risposta di /api/recensioni, il resto
 * (rendering, escape) resta uguale.
 *
 * Ogni testo che arriva da fuori (nome, recensione, bozza) passa da
 * escapeHtml prima di finire nell'HTML: il nome di chi scrive la recensione
 * lo decide un estraneo, inserirlo grezzo e' un buco XSS.
 */

const recensioni = [
  {
    id: 1,
    autore: 'Giulia B.',
    data: '2 giorni fa',
    fonte: 'Google',
    stelle: 2,
    testo: 'Cibo buono ma abbiamo aspettato 50 minuti per un primo. Sala scoperta, nessuno che passava a chiedere.',
    bozza: 'Buongiorno Giulia, ha ragione e ci dispiace: 50 minuti sono troppi. Quel sabato eravamo in tre in sala per il pienone e non siamo riusciti a seguire tutti. Se torna, mi chieda al banco — vorrei rimediare di persona. Mario',
  },
  {
    id: 2,
    autore: 'Andrea T.',
    data: '3 giorni fa',
    fonte: 'Google',
    stelle: 5,
    testo: 'Tagliatelle al ragù come quelle di mia nonna. Ci torniamo di sicuro.',
    bozza: 'Grazie Andrea, il paragone con la nonna è il complimento più bello che ci facciano. Il ragù lo fa mia madre ogni mattina. Vi aspettiamo!',
  },
];

function stelleHtml(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function schedaRecensione(r) {
  return `
    <div class="review" id="recensione-${r.id}">
      <div class="review-head">
        <span class="author">${escapeHtml(r.autore)}</span>
        <span class="date">${escapeHtml(r.data)} <span class="badge">${escapeHtml(r.fonte)}</span></span>
      </div>
      <p class="stars">${stelleHtml(r.stelle)}</p>
      <p class="text">${escapeHtml(r.testo)}</p>

      <div class="draft">
        <p class="draft-label">Risposta proposta</p>
        <p>${escapeHtml(r.bozza)}</p>
      </div>

      <div class="actions">
        <button class="btn primary">&#10003; Approva e invia</button>
        <button class="btn">&#9998; Modifica</button>
        <button class="btn ghost">Ignora</button>
      </div>
    </div>
  `;
}

function caricaLista() {
  document.getElementById('lista-recensioni').innerHTML = recensioni.map(schedaRecensione).join('');
}

caricaLista();
