/* Abbonamento e transazioni.
 *
 * GET  /api/abbonamento             piano attuale, limiti, storico pagamenti
 * POST /api/abbonamento/checkout    { piano } -> apre una Stripe Checkout Session
 * POST /api/abbonamento/portal      apre il portale clienti Stripe (carta, fatture, disdetta)
 * POST /api/abbonamento/disdici     annulla a fine periodo
 * POST /api/abbonamento/webhook     NON protetta da login: la chiama Stripe
 *
 * Il piano si aggiorna SOLO dal webhook, mai su richiesta diretta del
 * frontend — altrimenti chiunque potrebbe attivarsi l'abbonamento da solo
 * cambiando una chiamata fetch. /checkout si limita a creare la sessione
 * di pagamento e restituire l'url a cui mandare il cliente.
 *
 * Finche' STRIPE_SECRET_KEY non e' impostata (account non ancora creato,
 * o niente P.IVA per incassare per davvero) queste route rispondono 503:
 * il resto del sito resta usabile, solo l'abbonamento a pagamento non lo e'.
 */
import { Router, raw } from 'express';
import Stripe from 'stripe';
import * as db from '../db/index.js';
import * as email from '../services/email.js';
import { config } from '../config.js';
import { PIANI, pianoAcquistabile, pianoEffettivo, pianoEffettivoId } from '../piani.js';
import { richiedeLogin } from '../middleware/auth.js';
import { jobQueue } from '../services/queue.js';

const router = Router();

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

function stripeNonConfigurato(res) {
  res.status(503).json({
    errore: 'Pagamenti non ancora configurati (manca STRIPE_SECRET_KEY nel .env).',
  });
}

// price_... -> id del piano, per risalire al piano da un evento Stripe
// (che conosce solo il price, non il nostro vocabolario 'indie'/'studio'/...).
function pianoDaPriceId(priceId) {
  return Object.entries(PIANI).find(([, p]) => p.stripe_price_id === priceId)?.[0];
}

router.get('/', richiedeLogin, async (req, res) => {
  const org = await db.findOrgById(req.orgId);
  const pagamenti = await db.listPayments(req.orgId);

  // pianoAttuale e' quello EFFETTIVO, non organizations.plan cosi' com'e':
  // se il pagamento e' fallito o l'abbonamento e' scaduto per davvero, qui
  // deve comparire gia' 'Free' con i suoi limiti — vedi pianoEffettivo in
  // piani.js per il perche' (e per la finestra di grazia fino a
  // current_period_end quando lo stato e' 'in_scadenza').
  const pianoAttualeId = pianoEffettivoId(org);
  const pianoAttuale = pianoEffettivo(org);

  res.json({
    piano: pianoAttualeId,
    piano_nome: pianoAttuale.nome,
    prezzo_mensile: pianoAttuale.prezzo_mensile,
    limiti: pianoAttuale.limiti,
    features: pianoAttuale.features,
    stato: org.plan_status,
    prossimo_addebito: org.current_period_end,
    pagamenti,
    piani_disponibili: Object.fromEntries(
      Object.entries(PIANI)
        .filter(([id]) => id !== 'gratis')
        .map(([id, p]) => [
          id,
          { nome: p.nome, prezzo_mensile: p.prezzo_mensile, limiti: p.limiti, features: p.features, acquistabile: pianoAcquistabile(id) },
        ])
    ),
  });
});

router.post('/checkout', richiedeLogin, async (req, res) => {
  if (!stripe) return stripeNonConfigurato(res);

  const { piano } = req.body ?? {};
  if (!pianoAcquistabile(piano)) {
    return res.status(400).json({ errore: 'Piano non valido o non ancora disponibile.' });
  }

  const org = await db.findOrgById(req.orgId);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PIANI[piano].stripe_price_id, quantity: 1 }],
    // Se l'organizzazione ha gia' un customer Stripe (da un abbonamento
    // precedente) lo riusa, altrimenti Stripe ne crea uno nuovo dall'email
    // e il webhook lo collega all'org al primo checkout completato.
    ...(org.stripe_customer_id
      ? { customer: org.stripe_customer_id }
      : { customer_email: req.session.email }),
    client_reference_id: String(req.orgId),
    metadata: { org_id: String(req.orgId), piano },
    subscription_data: { metadata: { org_id: String(req.orgId), piano } },
    success_url: `${config.appUrl}/fatturazione.html?stato=ok`,
    cancel_url: `${config.appUrl}/fatturazione.html?stato=annullato`,
  });

  res.json({ url: session.url });
});

router.post('/disdici', richiedeLogin, async (req, res) => {
  const org = await db.findOrgById(req.orgId);

  if (stripe && org.stripe_subscription_id) {
    // cancel_at_period_end, non una cancellazione immediata: il cliente ha
    // gia' pagato il periodo in corso, l'accesso resta fino alla scadenza.
    // Lo stato locale si aggiorna per riflettere subito la richiesta
    // nell'interfaccia; la conferma definitiva arriva comunque dal webhook
    // customer.subscription.updated.
    await stripe.subscriptions.update(org.stripe_subscription_id, { cancel_at_period_end: true });
  }

  const orgAggiornata = await db.updateOrg(req.orgId, { plan_status: 'in_scadenza' });

  const destinatario = req.session.email;
  if (destinatario) {
    jobQueue.accoda(`email-disdetta:${req.orgId}`, () =>
      email.inviaEmail(
        destinatario,
        'Disdetta registrata',
        "Abbiamo registrato la disdetta del tuo abbonamento. Il servizio resta attivo fino alla fine del periodo gia' pagato."
      )
    );
  }

  res.json({ ok: true, piano: orgAggiornata.plan, stato: orgAggiornata.plan_status });
});

// Apre il portale clienti ospitato da Stripe: cambio carta, storico
// fatture scaricabili in PDF, cancellazione — senza dover ricostruire
// nessuna di queste schermate a mano. Serve solo un customer Stripe gia'
// esistente (cioe' aver completato almeno un checkout in passato).
router.post('/portal', richiedeLogin, async (req, res) => {
  if (!stripe) return stripeNonConfigurato(res);

  const org = await db.findOrgById(req.orgId);
  if (!org.stripe_customer_id) {
    return res.status(400).json({ errore: 'Nessun abbonamento collegato: attiva prima un piano a pagamento.' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${config.appUrl}/impostazioni.html`,
  });

  res.json({ url: session.url });
});

// Non protetta da richiedeLogin: chi la chiama e' Stripe, non un browser
// con una sessione utente. req.body qui e' un Buffer grezzo (vedi il
// express.raw montato in server.js prima di questa route): la verifica
// della firma richiede i byte esatti ricevuti, non il JSON ri-serializzato.
router.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
  } catch (err) {
    console.error('Firma webhook Stripe non valida:', err.message);
    return res.status(400).send(`Webhook: firma non valida.`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = Number(session.client_reference_id ?? session.metadata?.org_id);
        const piano = session.metadata?.piano;
        if (!orgId || !piano) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await db.updateOrg(orgId, {
          plan: piano,
          plan_status: 'attivo',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });
        break;
      }

      // Ogni fattura pagata e' una transazione: e' qui che si costruisce
      // lo storico mostrato in fatturazione.html.
      case 'invoice.paid': {
        const invoice = event.data.object;
        const org = await db.findOrgByStripeCustomerId(invoice.customer);
        if (!org) break;

        const priceId = invoice.lines?.data?.[0]?.price?.id;
        await db.insertPayment(org.id, {
          stripe_event_id: event.id,
          stripe_invoice_id: invoice.id,
          plan: pianoDaPriceId(priceId) ?? org.plan,
          amount_cents: invoice.amount_paid,
          currency: invoice.currency,
          status: 'pagato',
        });

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await db.updateOrg(org.id, {
            plan_status: 'attivo',
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const org = await db.findOrgByStripeCustomerId(invoice.customer);
        if (!org) break;

        await db.insertPayment(org.id, {
          stripe_event_id: event.id,
          stripe_invoice_id: invoice.id,
          plan: org.plan,
          amount_cents: invoice.amount_due,
          currency: invoice.currency,
          status: 'fallito',
        });
        await db.updateOrg(org.id, { plan_status: 'in_scadenza' });

        if (invoice.customer_email) {
          jobQueue.accoda(`email-pagamento-fallito:${org.id}`, () =>
            email.inviaEmail(
              invoice.customer_email,
              'Pagamento non riuscito',
              'Non siamo riusciti ad addebitare il rinnovo del tuo abbonamento GameFollow. Aggiorna il metodo di pagamento per evitare interruzioni del servizio.'
            )
          );
        }
        break;
      }

      // L'abbonamento e' arrivato a fine periodo (disdetto in precedenza,
      // o rifiutato dopo troppi tentativi falliti): si torna al piano gratis.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const org = await db.findOrgByStripeCustomerId(subscription.customer);
        if (!org) break;

        await db.updateOrg(org.id, {
          plan: 'gratis',
          plan_status: 'scaduto',
          stripe_subscription_id: null,
          current_period_end: null,
        });
        break;
      }

      default:
        // Eventi che non ci servono (es. customer.updated): ignorati
        // volutamente, non e' un errore non gestirli tutti.
        break;
    }
  } catch (err) {
    // L'evento e' autentico (la firma sopra l'ha gia' verificato) ma
    // qualcosa e' andato storto nel gestirlo: rispondere comunque 200
    // farebbe perdere l'evento per sempre (Stripe non lo ritenterebbe).
    console.error('Errore gestendo il webhook Stripe:', err);
    return res.status(500).json({ errore: 'Errore interno.' });
  }

  res.status(200).json({ ricevuto: true });
});

export default router;
