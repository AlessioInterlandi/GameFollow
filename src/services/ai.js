/* Astrazione sul modello AI.
 *
 * Esporta:
 *   generaRisposta(recensione, tono)   testo della risposta
 *   classificaRischio(recensione)      'auto' | 'approvazione' | 'solo_umano'
 *
 * Implementazioni sotto, scelte da config.aiProvider: mock, openai, anthropic.
 * Il resto dell'app non sa quale fornitore c'e' sotto: i modelli cambiano
 * ogni pochi mesi, il nome vive solo qui.
 *
 * Sviluppa sempre con mock: istantaneo, zero costo. Accendi il modello vero
 * solo per valutare la qualita' delle risposte.
 */
import { config } from '../config.js';

const PROMPT_SISTEMA = (tono) =>
  `Sei l'assistente di uno studio di sviluppo videogiochi che risponde alle recensioni dei giocatori. ` +
  `Scrivi una risposta breve (massimo 3 frasi), in inglese, con tono ${tono || 'professionale e cordiale'}. ` +
  `Non inventare fatti che non sono presenti nella recensione. Non promettere rimborsi o compensazioni.`;

// Parole che escludono SEMPRE la pubblicazione automatica: minacce legali,
// accuse di frode, richieste di rimborso. Meglio un falso positivo (una
// recensione innocua finita in "solo umano") che il contrario.
const PAROLE_AD_ALTO_RISCHIO = [
  'refund', 'rimborso', 'scam', 'truffa', 'stolen', 'rubato',
  'lawsuit', 'legal action', 'azione legale', 'sue you', 'fraud',
];

export async function generaRisposta(recensione, tono) {
  switch (config.aiProvider) {
    case 'openai':
      return generaConOpenAI(recensione, tono);
    case 'anthropic':
      return generaConAnthropic(recensione, tono);
    case 'mock':
    default:
      return generaMock(recensione);
  }
}

export function classificaRischio(recensione) {
  const testo = (recensione.text || '').toLowerCase();

  if (PAROLE_AD_ALTO_RISCHIO.some((parola) => testo.includes(parola))) {
    return 'solo_umano';
  }
  if (recensione.rating >= 4) {
    return 'auto';
  }
  return 'approvazione';
}

function generaMock(recensione) {
  if (recensione.rating >= 4) {
    return `Thank you so much, ${recensione.author}! We're really glad you're enjoying the game.`;
  }
  if (recensione.rating === 3) {
    return `Thanks for the feedback, ${recensione.author} — we're taking note and working on improvements.`;
  }
  return `Hi ${recensione.author}, sorry to hear about this. We're looking into it — thanks for reporting it.`;
}

async function generaConOpenAI(recensione, tono) {
  const risposta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.aiApiKey}`,
    },
    body: JSON.stringify({
      model: config.aiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROMPT_SISTEMA(tono) },
        { role: 'user', content: `Recensione (${recensione.rating}/5): ${recensione.text || '(nessun testo)'}` },
      ],
      max_tokens: 200,
    }),
  });

  if (!risposta.ok) {
    throw new Error(`OpenAI ha risposto ${risposta.status}: ${await risposta.text()}`);
  }

  const dati = await risposta.json();
  return dati.choices?.[0]?.message?.content?.trim();
}

async function generaConAnthropic(recensione, tono) {
  const risposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.aiApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.aiModel || 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: PROMPT_SISTEMA(tono),
      messages: [
        { role: 'user', content: `Recensione (${recensione.rating}/5): ${recensione.text || '(nessun testo)'}` },
      ],
    }),
  });

  if (!risposta.ok) {
    throw new Error(`Anthropic ha risposto ${risposta.status}: ${await risposta.text()}`);
  }

  const dati = await risposta.json();
  return dati.content?.[0]?.text?.trim();
}
