/* Ponte verso scripts/analisi_problemi.py — la parte di Issue Detection
 * che e' solo calcoli matematici (conteggi, percentuali, andamenti) e per
 * questo e' scritta in Python invece che qui: e' il layer giusto per farlo
 * a mano (niente AI, niente costi, facile da capire riga per riga).
 *
 * Node resta responsabile di tutto il resto (login, piano, database, HTTP):
 * qui c'e' solo il ponte via child_process, che manda le recensioni allo
 * script via stdin e legge JSON (o un PNG) da stdout.
 *
 * Se Python non e' installato o non e' nel PATH, le funzioni sotto
 * rifiutano la Promise con ERRORE_PYTHON_MANCANTE: le route lo intercettano
 * e rispondono 503, stesso pattern gia' usato per Stripe non configurato —
 * il resto del sito continua a funzionare, solo Issue Detection no.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'analisi_problemi.py');

export const ERRORE_PYTHON_MANCANTE = 'ERRORE_PYTHON_MANCANTE';

// Nomi diversi a seconda del sistema operativo e di come Python e' stato
// installato: su Windows di solito e' 'python' (o 'py', il launcher
// ufficiale), su Mac/Linux di solito 'python3'. Si prova il primo della
// lista giusta per l'OS in corso, e solo se manca (ENOENT) si passa al
// successivo — invece di obbligare l'utente a sapere quale dei tre ha lui.
const ESEGUIBILI_PYTHON = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

function eseguiScript(argomenti, input) {
  return new Promise((resolve, reject) => {
    const tentaCon = (indice) => {
      if (indice >= ESEGUIBILI_PYTHON.length) {
        return reject(new Error(ERRORE_PYTHON_MANCANTE));
      }

      const proc = spawn(ESEGUIBILI_PYTHON[indice], [SCRIPT, ...argomenti]);
      const stdoutChunks = [];
      const stderrChunks = [];

      proc.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));

      proc.on('error', (err) => {
        if (err.code === 'ENOENT') return tentaCon(indice + 1);
        reject(err);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`analisi_problemi.py uscito con codice ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`));
        }
        resolve(Buffer.concat(stdoutChunks));
      });

      proc.stdin.write(input);
      proc.stdin.end();
    };

    tentaCon(0);
  });
}

function recensioniPerAnalisi(recensioni) {
  // Solo i campi che servono all'analisi: niente autore/risposte/id, per
  // tenere il payload piccolo e non far girare dati non necessari fuori
  // dal processo Node.
  return recensioni.map((r) => ({
    rating: r.rating,
    text: r.text,
    review_date: r.review_date,
    platform: r.platform,
  }));
}

export async function rileva(recensioni) {
  const output = await eseguiScript([], JSON.stringify(recensioniPerAnalisi(recensioni)));
  return JSON.parse(output.toString('utf8'));
}

export async function generaGrafico(recensioni) {
  return eseguiScript(['--grafico'], JSON.stringify(recensioniPerAnalisi(recensioni)));
}
