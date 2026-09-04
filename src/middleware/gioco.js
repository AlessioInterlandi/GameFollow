/* Guardia del gioco attivo, da mettere DOPO richiedeLogin (serve req.orgId
 * dalla sessione) su ogni route che legge/scrive dati specifici di UN
 * gioco (recensioni, integrazioni...).
 *
 * Stesso principio di sicurezza di richiedeLogin per org_id: il gioco
 * attivo non arriva MAI da req.body, req.query o req.params — solo dalla
 * sessione (req.session.gameId), e viene sempre ri-validato contro
 * l'elenco vero dei giochi dell'organizzazione. Senza questo controllo,
 * un cliente potrebbe modificare un numero nella richiesta e leggere le
 * recensioni di un gioco che nella UI non ha mai selezionato (anche se
 * resterebbe comunque dentro la propria organizzazione: qui la posta in
 * gioco e' la coerenza dei dati mostrati, non un confine tra clienti
 * diversi come per org_id).
 *
 * Se in sessione non c'e' un gameId valido (primo accesso dopo il login,
 * o il gioco selezionato e' stato nel frattempo eliminato) si sceglie in
 * automatico il primo gioco dell'organizzazione — ogni organizzazione ne
 * ha sempre almeno uno, vedi creaOrganizzazioneEUtente e la migrazione in
 * sqlite.js/schema.supabase.sql.
 */
import * as db from '../db/index.js';

export async function richiedeGiocoAttivo(req, res, next) {
  const giochi = await db.listGames(req.orgId);

  if (giochi.length === 0) {
    // Non dovrebbe mai succedere (vedi commento sopra): se capita e' un
    // bug nella migrazione/creazione dell'account, non qualcosa che
    // l'utente puo' risolvere da solo.
    console.error(`Nessun gioco trovato per org_id=${req.orgId}: dato mancante, controllare la migrazione.`);
    return res.status(500).json({ errore: 'Nessun videogioco configurato per questo account.' });
  }

  let gioco = giochi.find((g) => g.id === req.session.gameId);
  if (!gioco) {
    gioco = giochi[0];
    req.session.gameId = gioco.id;
  }

  req.gameId = gioco.id;
  req.gioco = gioco;
  req.giochiOrg = giochi;
  next();
}
