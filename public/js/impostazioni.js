document.querySelectorAll('.settings-nav button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.settings-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
  });
});

const billingButtons = document.querySelectorAll('.billing-toggle button');
const planAmounts = document.querySelectorAll('.plan-price .amount, .compare-table .amount');
const planNotes = document.querySelectorAll('.plan-note');

function applyBillingCycle(cycle) {
  planAmounts.forEach((el) => {
    const price = el.dataset[cycle];
    if (price) el.textContent = price;
  });
  planNotes.forEach((note) => {
    note.hidden = cycle !== 'annual';
  });
}

billingButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    billingButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyBillingCycle(btn.dataset.billing);
  });
});

const compareToggle = document.getElementById('compare-toggle');
const compareTable = document.getElementById('compare-table');
if (compareToggle && compareTable) {
  compareToggle.addEventListener('click', (event) => {
    event.preventDefault();
    const willShow = compareTable.hidden;
    compareTable.hidden = !willShow;
    compareToggle.textContent = willShow ? 'Hide detailed comparison　⌃' : 'Compare all plans in detail　⌄';
  });
}

/* Abbonamento reale (tab Billing + tab Plans & limits).
 * Sostituisce i dati statici del mockup con GET /api/abbonamento e collega
 * i pulsanti "Choose <piano>" a Stripe Checkout, "Manage plan" / "Update" /
 * "View invoices" al portale clienti Stripe, "Cancel subscription" alla
 * disdetta reale (vedi routes/billing.js per il perche' di ogni scelta).
 */

const PIANO_LABELS = { gratis: 'Free', indie: 'Indie', studio: 'Studio', publisher: 'Publisher', enterprise: 'Enterprise' };
const STATO_LABELS = { nessuno: 'No active plan', attivo: 'Current plan', in_scadenza: 'Cancels at period end', scaduto: 'Expired' };
const PAGAMENTO_STATO_LABELS = { pagato: 'Paid', fallito: 'Failed', rimborsato: 'Refunded' };

function renderPianoAttuale(dati) {
  const elLabel = document.getElementById('billing-status-label');
  const elNome = document.getElementById('billing-plan-name');
  if (!elLabel || !elNome) return;

  elLabel.textContent = STATO_LABELS[dati.stato] || 'Current plan';
  elNome.textContent = `${dati.piano_nome} `;
  const prezzo = document.createElement('span');
  prezzo.textContent = dati.prezzo_mensile ? `€${dati.prezzo_mensile} / mo` : 'Free';
  elNome.appendChild(prezzo);

  const ul = document.getElementById('billing-plan-limits');
  ul.innerHTML = '';
  const limiti = dati.limiti || {};
  const righe = [
    limiti.giochi != null ? `${limiti.giochi} game${limiti.giochi === 1 ? '' : 's'}` : 'Unlimited games',
    limiti.piattaforme != null ? `${limiti.piattaforme} platforms` : 'Unlimited platforms',
    limiti.recensioni_mese != null ? `${limiti.recensioni_mese.toLocaleString('en-US')} reviews / month` : 'Unlimited reviews',
  ];
  righe.forEach((testo) => {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = `✓ ${testo}`;
    ul.appendChild(li);
  });

  const btnCancel = document.getElementById('btn-cancel-plan');
  if (btnCancel) btnCancel.hidden = !(dati.piano !== 'gratis' && dati.stato === 'attivo');
}

function renderCronologiaPagamenti(pagamenti) {
  const tbody = document.getElementById('billing-history-body');
  if (!tbody) return;

  if (!pagamenti || pagamenti.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No transactions yet.</td></tr>';
    return;
  }

  tbody.innerHTML = pagamenti
    .map((p) => {
      const data = new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const importo = (p.amount_cents / 100).toLocaleString('en-US', { style: 'currency', currency: (p.currency || 'eur').toUpperCase() });
      return `<tr><td>${data}</td><td>${PIANO_LABELS[p.plan] || p.plan}</td><td>${importo}</td><td>${PAGAMENTO_STATO_LABELS[p.status] || p.status}</td></tr>`;
    })
    .join('');
}

function aggiornaSchedePiani(dati) {
  document.querySelectorAll('.plan-card[data-piano]').forEach((card) => {
    const attuale = card.dataset.piano === dati.piano && dati.stato === 'attivo';
    card.classList.toggle('current', attuale);
  });

  document.querySelectorAll('button[data-piano-choose]').forEach((btn) => {
    const piano = btn.dataset.pianoChoose;
    if (piano === 'enterprise') return; // resta "Contact us": non passa da Stripe Checkout

    const attuale = piano === dati.piano && dati.stato === 'attivo';
    const disponibile = dati.piani_disponibili?.[piano]?.acquistabile;

    btn.textContent = attuale ? 'Current plan' : `Choose ${PIANO_LABELS[piano]}`;
    btn.disabled = attuale || disponibile === false;
    btn.title = !attuale && disponibile === false ? 'Not available yet on this server.' : '';
  });
}

async function caricaAbbonamento() {
  const contenitoreBilling = document.getElementById('billing-plan-name');
  const contenitorePlans = document.querySelector('.plan-card[data-piano]');
  if (!contenitoreBilling && !contenitorePlans) return; // pagina senza queste tab

  let dati;
  try {
    dati = await api('/abbonamento');
  } catch (errore) {
    if (errore.status === 503) {
      const avviso = document.getElementById('billing-unavailable');
      if (avviso) avviso.hidden = false;
      document.getElementById('btn-manage-plan')?.setAttribute('disabled', 'true');
      document.getElementById('btn-payment-method')?.setAttribute('disabled', 'true');
    }
    return;
  }
  if (!dati) return;

  renderPianoAttuale(dati);
  renderCronologiaPagamenti(dati.pagamenti);
  aggiornaSchedePiani(dati);
}

document.querySelectorAll('button[data-piano-choose]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const piano = btn.dataset.pianoChoose;
    if (piano === 'enterprise') {
      window.location.href = 'mailto:?subject=GameFollow%20Enterprise';
      return;
    }

    btn.disabled = true;
    try {
      const dati = await api('/abbonamento/checkout', { method: 'POST', body: { piano } });
      if (dati?.url) window.location.href = dati.url;
    } catch (errore) {
      mostraMessaggio(errore.message, 'errore');
      btn.disabled = false;
    }
  });
});

['btn-manage-plan', 'btn-payment-method', 'btn-view-invoices'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', async (evento) => {
    evento.preventDefault();
    try {
      const dati = await api('/abbonamento/portal', { method: 'POST' });
      if (dati?.url) window.location.href = dati.url;
    } catch (errore) {
      mostraMessaggio(errore.message, 'errore');
    }
  });
});

document.getElementById('btn-cancel-plan')?.addEventListener('click', async () => {
  const confermato = window.confirm(
    'Cancel your subscription? Access stays active until the end of the period already paid.'
  );
  if (!confermato) return;

  try {
    await api('/abbonamento/disdici', { method: 'POST' });
    mostraMessaggio('Subscription set to cancel at the end of the period.', 'successo');
    caricaAbbonamento();
  } catch (errore) {
    mostraMessaggio(errore.message, 'errore');
  }
});

caricaAbbonamento();
