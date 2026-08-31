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

// Ogni testo finto porta con se' il range di voto plausibile per il suo
// sentiment (min/max stelle), cosi' il voto casuale resta coerente con
// quello che la recensione dice invece di poter uscire, es., a 5 stelle
// su un testo che si lamenta di crash continui.
const TESTI_FINTI = [
  { testo: 'Amazing game! The atmosphere is incredible.', min: 4, max: 5 },
  { testo: 'The game is good but the multiplayer is terrible.', min: 2, max: 3 },
  { testo: 'Some bugs in the UI, but overall fun.', min: 3, max: 4 },
  { testo: 'Crashes every time I try to load the second level.', min: 1, max: 2 },
  { testo: 'Great art style, controls feel a bit clunky though.', min: 3, max: 4 },
  { testo: null, min: 1, max: 5 },
];

export function urlAutorizzazione(orgId) {
  return `https://accounts.google.com/o/oauth2/auth?mock=1&org=${encodeURIComponent(orgId)}`;
}

// piattaforme: elenco dei provider di gruppo 'piattaforme' che l'org ha
// davvero collegato (vedi routes/integrations.js) — le recensioni finte
// vengono distribuite su quelle, cosi' il riepilogo per piattaforma in
// Issue Detection riflette account per account cosa e' stato collegato,
// invece di mostrare sempre le stesse tre piattaforme per tutti.
// Se l'org non ne ha ancora collegata nessuna, si ripiega su 'steam'.
//
// Autore e testo avanzano con moduli diversi (autore ogni riga, testo ogni
// AUTORI_FINTI.length righe) invece dello stesso indice: cosi' le coppie
// autore+testo non si ripetono finche' non si esauriscono tutte le
// combinazioni (6 autori x 6 testi = 36), invece di ripetersi identiche
// gia' dal settimo elemento come succedeva con "i % 6" su entrambi.
export async function scaricaNuoveRecensioni(quante = 10, piattaforme = ['steam']) {
  const disponibili = piattaforme.length > 0 ? piattaforme : ['steam'];

  return Array.from({ length: quante }, (_, i) => {
    const voce = TESTI_FINTI[Math.floor(i / AUTORI_FINTI.length) % TESTI_FINTI.length];
    const voto = voce.min + Math.floor(Math.random() * (voce.max - voce.min + 1));
    return {
      author: AUTORI_FINTI[i % AUTORI_FINTI.length],
      rating: voto,
      text: voce.testo,
      review_date: new Date(Date.now() - i * 3_600_000).toISOString(),
      platform: disponibili[i % disponibili.length],
    };
  });
}

export async function pubblicaRisposta(reviewId, testo) {
  console.log(`[google:mock] pubblicata risposta alla recensione ${reviewId}: "${testo}"`);
  return { ok: true };
}
