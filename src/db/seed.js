/* Popola il database con dati finti per lo sviluppo.
 *
 * Due aziende diverse, ognuna con un utente e alcune recensioni: e' l'unico
 * modo per accorgersi con gli occhi se l'isolamento tra clienti funziona.
 *
 * Nota: creare un'organizzazione e un utente non fa parte delle funzioni
 * esposte da db/index.js (quello serve alle route, che non ne hanno
 * bisogno). Il seed, script di solo sviluppo, parla direttamente al
 * driver sqlite per queste due operazioni.
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import * as db from './index.js';
import * as password from '../services/password.js';

const AZIENDE = [
  {
    org: { name: 'Pixel Forge Studio', tone: 'amichevole e diretto' },
    utente: { email: 'dev@pixelforge.test', password: 'pixelforge123' },
    recensioni: [
      { author: 'ShadowPlayer_98', rating: 4, text: 'The game is good but the multiplayer is terrible. I keep getting disconnected.', review_date: giorniFa(0) },
      { author: 'AlexM', rating: 5, text: 'Amazing game! The atmosphere is incredible.', review_date: giorniFa(0) },
      { author: 'GameHunter_42', rating: 3, text: 'Some bugs in the UI, but overall fun.', review_date: giorniFa(1) },
      { author: 'RetroFan', rating: 5, text: null, review_date: giorniFa(2) },
      { author: 'MadTitan', rating: 1, text: 'You stole my money, this game is unplayable and I want a refund.', review_date: giorniFa(3) },
    ],
  },
  {
    org: { name: 'Nova Interactive', tone: 'professionale' },
    utente: { email: 'team@novainteractive.test', password: 'novainteractive123' },
    recensioni: [
      { author: 'QuestSeeker', rating: 2, text: 'Crashes every time I try to load the second level.', review_date: giorniFa(0) },
      { author: 'IndieLover99', rating: 5, text: 'Best indie game I played this year!', review_date: giorniFa(1) },
      { author: 'PlayerOne', rating: 4, text: 'Great art style, controls feel a bit clunky though.', review_date: giorniFa(4) },
    ],
  },
];

function giorniFa(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

async function seed() {
  await db.init();

  if (config.dbDriver !== 'sqlite') {
    throw new Error('Il seed di sviluppo funziona solo con DB_DRIVER=sqlite.');
  }

  const sqlite = new DatabaseSync(path.resolve(config.sqliteFile));

  for (const azienda of AZIENDE) {
    const utenteEsistente = await db.findUserByEmail(azienda.utente.email);
    if (utenteEsistente) {
      console.log(`Salto "${azienda.org.name}": esiste gia' (${azienda.utente.email}).`);
      continue;
    }

    // Account di test = piano Publisher (il massimo) e abbonamento sempre
    // attivo: cosi' si puo' provare Issue Detection, invio automatico e
    // tutti i limiti piu' larghi senza dover passare da un vero checkout
    // Stripe ogni volta. E' una comodita' SOLO per lo sviluppo — non tocca
    // in nessun modo cosa vede un account vero che paga per davvero.
    const orgId = sqlite
      .prepare(
        `INSERT INTO organizations (name, tone, plan, plan_status, current_period_end)
         VALUES (?, ?, 'publisher', 'attivo', datetime('now', '+1 year'))`
      )
      .run(azienda.org.name, azienda.org.tone).lastInsertRowid;

    // email_verified_at valorizzato subito: sono account di sviluppo, non
    // devono passare dal flusso di conferma email (vedi routes/auth.js).
    // Senza, il login di questi account risponderebbe sempre 403 "email non
    // confermata" — bug preesistente, non legato al multi-gioco, scoperto
    // rieseguendo la suite di test del progetto dopo le modifiche di oggi.
    const passwordHash = await password.hash(azienda.utente.password);
    sqlite
      .prepare("INSERT INTO users (org_id, email, password_hash, email_verified_at) VALUES (?, ?, ?, datetime('now'))")
      .run(orgId, azienda.utente.email, passwordHash);

    // Multi-gioco: ogni organizzazione ha bisogno di almeno un gioco per
    // poter avere recensioni (vedi creaOrganizzazioneEUtente, che fa lo
    // stesso per la registrazione self-service — qui e' a mano perche' il
    // seed parla direttamente a sqlite, non passa da li').
    const gameId = sqlite
      .prepare('INSERT INTO games (org_id, name) VALUES (?, ?)')
      .run(orgId, `${azienda.org.name} (main game)`).lastInsertRowid;

    for (const recensione of azienda.recensioni) {
      await db.insertReview(orgId, gameId, recensione);
    }

    console.log(`Creata "${azienda.org.name}" — login: ${azienda.utente.email} / ${azienda.utente.password}`);
  }

  sqlite.close();
  console.log('Seed completato.');
}

seed().catch((err) => {
  console.error('Seed fallito:', err);
  process.exit(1);
});
