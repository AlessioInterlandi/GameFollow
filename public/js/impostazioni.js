function attivaTab(tab) {
  const bottone = document.querySelector(`.settings-nav button[data-tab="${tab}"]`);
  if (!bottone) return false;

  document.querySelectorAll('.settings-nav button').forEach((b) => b.classList.remove('active'));
  bottone.classList.add('active');
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
  return true;
}

document.querySelectorAll('.settings-nav button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => attivaTab(btn.dataset.tab));
});

// Arrivo diretto su una sezione (es. i pulsanti "Upgrade plan" in giro per
// il sito puntano a impostazioni.html#plans): l'hash nell'URL apre subito
// la tab giusta invece di lasciare l'utente sul tab Profile di default.
if (location.hash) attivaTab(location.hash.slice(1));

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
    limiti.membri != null ? `${limiti.membri} team seat${limiti.membri === 1 ? '' : 's'}` : 'Unlimited team seats',
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

/* Lingua del sito (tab App settings -> General settings).
 * Oggi cambia solo le pagine pubbliche (landing/login/registrazione, vedi
 * js/i18n.js) — la dashboard resta in inglese finche' non viene tradotta
 * anche lei. Salvata sull'organizzazione (persistente, la ritrovi anche da
 * un altro browser) e specchiata in localStorage sotto la stessa chiave
 * 'gf_lang' che leggono le pagine pubbliche, cosi' la scelta vale anche
 * dopo il logout, quando non c'e' piu' nessuna sessione da interrogare.
 */
const selettoreLingua = document.getElementById('a-lang');

async function caricaLingua() {
  if (!selettoreLingua) return;
  try {
    const dati = await api('/impostazioni');
    if (dati?.lingua_sito) selettoreLingua.value = dati.lingua_sito;
  } catch {
    // pagina senza questa tab, o utente non ancora loggato: /api gia'
    // gestisce il redirect al login se serve, qui non c'e' altro da fare.
  }
}

selettoreLingua?.addEventListener('change', async () => {
  const lingua = selettoreLingua.value;
  try {
    await api('/impostazioni', { method: 'PUT', body: { lingua_sito: lingua } });
    try { localStorage.setItem('gf_lang', lingua); } catch { /* privacy mode: pazienza */ }
    mostraMessaggio('Site language updated.', 'successo');
  } catch (errore) {
    mostraMessaggio(errore.message, 'errore');
  }
});

caricaLingua();

/* Team members (tab Team): sostituisce la vetrina statica (nomi finti, il
 * bottone "Invite member" che non faceva nulla) con l'elenco reale
 * (GET /api/team), l'invito vero (POST /api/team/invite) e le azioni su
 * ogni riga — cambio ruolo, rinvia invito, rimuovi. L'API applica gia' i
 * permessi per davvero (solo owner puo' scrivere, vedi routes/team.js):
 * qui ci limitiamo a NASCONDERE i controlli che chi guarda non potrebbe
 * comunque usare, per non mostrare pulsanti che risponderebbero sempre 403.
 */
const RUOLO_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };
const RUOLO_PERMESSI = { owner: 'All', editor: 'Reviews, Replies, Analytics', viewer: 'Read-only' };

let mioRuoloTeam = null;

function escapeHtmlTeam(testo) {
  const div = document.createElement('div');
  div.textContent = testo ?? '';
  return div.innerHTML;
}

function creaRigaMembro(membro) {
  const tr = document.createElement('tr');
  const sonoOwner = mioRuoloTeam === 'owner';

  const tdMembro = document.createElement('td');
  tdMembro.innerHTML = `<b>${escapeHtmlTeam(membro.email)}</b>${membro.tu ? ' <small style="color:var(--muted)">(you)</small>' : ''}`;
  tr.appendChild(tdMembro);

  const tdRuolo = document.createElement('td');
  // Un owner puo' cambiare il ruolo di chiunque (compreso il proprio, se
  // non e' l'unico owner rimasto — il server rifiuta con un messaggio
  // chiaro se lo e', vedi routes/team.js): un select modificabile. Chi non
  // e' owner vede solo l'etichetta, come prima.
  if (sonoOwner) {
    const select = document.createElement('select');
    select.style.cssText = 'height:30px;font-size:12px;padding:0 6px;border:1px solid var(--border-strong);border-radius:6px;background:var(--input-bg);color:var(--ink)';
    ['owner', 'editor', 'viewer'].forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = RUOLO_LABEL[r];
      opt.selected = r === membro.ruolo;
      select.appendChild(opt);
    });
    select.addEventListener('change', async () => {
      const ruoloScelto = select.value;
      select.disabled = true;
      try {
        await api(`/team/${membro.id}/role`, { method: 'PUT', body: { ruolo: ruoloScelto } });
        mostraMessaggio('Role updated.', 'successo');
        caricaTeam();
      } catch (errore) {
        mostraMessaggio(errore.message, 'errore');
        select.value = membro.ruolo;
        select.disabled = false;
      }
    });
    tdRuolo.appendChild(select);
  } else {
    tdRuolo.innerHTML = `<span class="role-badge${membro.ruolo === 'owner' ? ' owner' : ''}">${RUOLO_LABEL[membro.ruolo] || membro.ruolo}</span>`;
  }
  tr.appendChild(tdRuolo);

  const tdPermessi = document.createElement('td');
  tdPermessi.textContent = RUOLO_PERMESSI[membro.ruolo] || '—';
  tr.appendChild(tdPermessi);

  const tdStato = document.createElement('td');
  tdStato.innerHTML = `<span class="status-badge ${membro.stato}">${membro.stato === 'active' ? 'Active' : 'Invited'}</span>`;
  tr.appendChild(tdStato);

  const tdAzioni = document.createElement('td');
  if (sonoOwner && !membro.tu) {
    if (membro.stato === 'invited') {
      const btnResend = document.createElement('button');
      btnResend.type = 'button';
      btnResend.textContent = 'Resend';
      btnResend.style.cssText = 'font-size:11px;padding:5px 9px;margin-right:6px';
      btnResend.addEventListener('click', async () => {
        btnResend.disabled = true;
        try {
          await api(`/team/${membro.id}/resend`, { method: 'POST' });
          mostraMessaggio('Invite email resent.', 'successo');
        } catch (errore) {
          mostraMessaggio(errore.message, 'errore');
        }
        btnResend.disabled = false;
      });
      tdAzioni.appendChild(btnResend);
    }

    const btnRimuovi = document.createElement('button');
    btnRimuovi.type = 'button';
    btnRimuovi.textContent = 'Remove';
    btnRimuovi.style.cssText = 'font-size:11px;padding:5px 9px;color:var(--red);border-color:rgba(248,113,113,.35)';
    btnRimuovi.addEventListener('click', async () => {
      const confermato = window.confirm(`Remove ${membro.email} from the team?`);
      if (!confermato) return;
      try {
        await api(`/team/${membro.id}`, { method: 'DELETE' });
        mostraMessaggio('Member removed.', 'successo');
        caricaTeam();
      } catch (errore) {
        mostraMessaggio(errore.message, 'errore');
      }
    });
    tdAzioni.appendChild(btnRimuovi);
  }
  tr.appendChild(tdAzioni);

  return tr;
}

async function caricaTeam() {
  const nota = document.getElementById('team-nota');
  const tabella = document.getElementById('team-tabella');
  const corpo = document.getElementById('team-corpo');
  const noteLimite = document.getElementById('team-limite-nota');
  const btnInvita = document.getElementById('btn-invita-membro');
  if (!nota || !tabella || !corpo) return; // pagina senza questa tab

  try {
    const [membri, identita, abbonamento] = await Promise.all([
      api('/team'),
      api('/auth/me'),
      api('/abbonamento').catch(() => null),
    ]);
    if (!membri || !identita) return; // 401 -> api() ha gia' rimandato al login

    mioRuoloTeam = identita.role;

    corpo.innerHTML = '';
    membri.forEach((m) => corpo.appendChild(creaRigaMembro(m)));
    nota.hidden = true;
    tabella.hidden = false;

    const limite = abbonamento?.limiti?.membri;
    if (btnInvita) btnInvita.hidden = mioRuoloTeam !== 'owner';
    if (noteLimite) {
      noteLimite.textContent = limite != null
        ? `${membri.length} / ${limite} team member${limite === 1 ? '' : 's'} on your plan.`
        : `${membri.length} team member${membri.length === 1 ? '' : 's'} — unlimited on your plan.`;
    }
  } catch {
    // GET /api/team e' aperta a tutti i ruoli (vedi routes/team.js): un
    // errore qui e' quindi di rete/server, mai di permessi.
    nota.textContent = 'Could not load team members right now.';
  }
}

const modaleInvita = document.getElementById('modale-invita-membro');
const invitaEmail = document.getElementById('invita-email');
const invitaRuolo = document.getElementById('invita-ruolo');
const invitaErrore = document.getElementById('invita-errore');

document.getElementById('btn-invita-membro')?.addEventListener('click', () => {
  if (!modaleInvita) return;
  invitaEmail.value = '';
  invitaRuolo.value = 'editor';
  invitaErrore.style.display = 'none';
  modaleInvita.showModal();
  invitaEmail.focus();
});

document.getElementById('invita-annulla')?.addEventListener('click', () => modaleInvita?.close());

document.getElementById('invita-salva')?.addEventListener('click', async () => {
  const email = invitaEmail?.value.trim() || '';
  const ruolo = invitaRuolo?.value || 'editor';

  if (!email) {
    invitaErrore.textContent = 'Please enter an email address.';
    invitaErrore.style.display = 'block';
    return;
  }

  try {
    await api('/team/invite', { method: 'POST', body: { email, ruolo } });
    modaleInvita?.close();
    mostraMessaggio('Invite sent.', 'successo');
    caricaTeam();
  } catch (errore) {
    invitaErrore.textContent = errore.dati?.errore || 'Could not send the invite.';
    invitaErrore.style.display = 'block';
  }
});

caricaTeam();

/* Notification preferences (tab Notifications): sostituisce i toggle
 * statici (mai salvati da nessuna parte) con GET/PUT /api/notifiche —
 * personali per ogni utente, non dell'organizzazione (vedi routes/notifiche.js).
 * Slack/Discord/Mentions non ci sono piu': nessun canale li invia
 * davvero (Slack/Discord restano collegabili in Integrations, ma quella e'
 * una cosa diversa — qui parliamo di CHI riceve una notifica, non di quale
 * account e' collegato), quindi niente preferenza finta da mostrare.
 */
const CAMPI_NOTIFICHE = [
  'email_enabled', 'inapp_enabled',
  'event_new_reviews', 'event_critical_issues', 'event_replies_pending', 'event_weekly_digest', 'event_billing',
];

async function caricaNotifiche() {
  const nota = document.getElementById('notifiche-nota');
  const contenuto = document.getElementById('notifiche-contenuto');
  if (!nota || !contenuto) return; // pagina senza questa tab

  let preferenze;
  try {
    preferenze = await api('/notifiche');
  } catch {
    nota.textContent = 'Could not load your notification preferences right now.';
    return;
  }
  if (!preferenze) return;

  CAMPI_NOTIFICHE.forEach((campo) => {
    const input = document.getElementById(`notif-${campo}`);
    if (input) input.checked = !!preferenze[campo];
  });

  nota.hidden = true;
  contenuto.hidden = false;
}

CAMPI_NOTIFICHE.forEach((campo) => {
  const input = document.getElementById(`notif-${campo}`);
  if (!input) return;
  input.addEventListener('change', async () => {
    input.disabled = true;
    try {
      await api('/notifiche', { method: 'PUT', body: { [campo]: input.checked } });
    } catch (errore) {
      input.checked = !input.checked; // torna indietro: il salvataggio e' fallito
      mostraMessaggio(errore.message, 'errore');
    }
    input.disabled = false;
  });
});

caricaNotifiche();
