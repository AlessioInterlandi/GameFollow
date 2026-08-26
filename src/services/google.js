/* Sorgente esterna delle recensioni (Google Play / Steam a seconda della
 * piattaforma collegata). Per ora finta: restituisce dati inventati.
 *
 * Esporta:
 *   urlAutorizzazione(orgId)              dove mandare il cliente per autorizzare
 *   scaricaNuoveRecensioni(quante)        legge le recensioni nuove
 *   pubblicaRisposta(reviewId, testo)     scrive la risposta
 *
 * Tieni le firme cosi' come sono: quando ci saranno le credenziali OAuth
 * vere, si riscrive solo il contenuto di queste tre funzioni, nient'altro
 * nel progetto deve cambiare.
 *
 * Il token OAuth di ogni cliente andra' salvato nel database, legato al suo
 * org_id, e non deve mai arrivare al frontend.
 */
const AUTORI_FINTI = ['ShadowPlayer_98', 'AlexM', 'GameHunter_42', 'QuestSeeker', 'IndieLover99', 'RetroFan'];
const TESTI_FINTI = [
  'Amazing game! The atmosphere is incredible.',
  'The game is good but the multiplayer is terrible.',
  'Some bugs in the UI, but overall fun.',
  'Crashes every time I try to load the second level.',
  'Great art style, controls feel a bit clunky though.',
  null,
];

export function urlAutorizzazione(orgId) {
  return `https://accounts.google.com/o/oauth2/auth?mock=1&org=${encodeURIComponent(orgId)}`;
}

export async function scaricaNuoveRecensioni(quante = 10) {
  return Array.from({ length: quante }, (_, i) => {
    const testo = TESTI_FINTI[i % TESTI_FINTI.length];
    return {
      author: AUTORI_FINTI[i % AUTORI_FINTI.length],
      rating: 1 + Math.floor(Math.random() * 5),
      text: testo,
      review_date: new Date(Date.now() - i * 3_600_000).toISOString(),
    };
  });
}

export async function pubblicaRisposta(reviewId, testo) {
  console.log(`[google:mock] pubblicata risposta alla recensione ${reviewId}: "${testo}"`);
  return { ok: true };
}
