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

    const orgId = sqlite
      .prepare('INSERT INTO organizations (name, tone) VALUES (?, ?)')
      .run(azienda.org.name, azienda.org.tone).lastInsertRowid;

    const passwordHash = await password.hash(azienda.utente.password);
    sqlite
      .prepare('INSERT INTO users (org_id, email, password_hash) VALUES (?, ?, ?)')
      .run(orgId, azienda.utente.email, passwordHash);

    for (const recensione of azienda.recensioni) {
      await db.insertReview(orgId, recensione);
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
