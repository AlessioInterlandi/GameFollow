/* Coda di job in background, in-process.
 *
 * Disaccoppia il tempo di risposta HTTP dalle chiamate lente: AI, email,
 * webhook n8n. La route accoda il lavoro e risponde subito; il job aggiorna
 * lo stato (es. review.status) quando finisce.
 *
 * E' pensata per un singolo processo Node: quando servira' scalare su piu'
 * istanze, si sostituisce con BullMQ + Redis mantenendo la stessa firma
 * accoda(nome, task) — nessuna route andra' toccata.
 */
import { EventEmitter } from 'node:events';

const CONCORRENZA_MASSIMA = 3;
const TENTATIVI_MASSIMI = 3;

class JobQueue extends EventEmitter {
  #coda = [];
  #inEsecuzione = 0;

  accoda(nome, task, { tentativi = TENTATIVI_MASSIMI } = {}) {
    this.#coda.push({ nome, task, tentativi, tentativoCorrente: 0 });
    setImmediate(() => this.#avanza());
  }

  #avanza() {
    while (this.#inEsecuzione < CONCORRENZA_MASSIMA && this.#coda.length > 0) {
      const job = this.#coda.shift();
      this.#inEsecuzione += 1;
      this.#esegui(job).finally(() => {
        this.#inEsecuzione -= 1;
        this.#avanza();
      });
    }
  }

  async #esegui(job) {
    job.tentativoCorrente += 1;
    try {
      await job.task();
      this.emit('completato', { nome: job.nome });
    } catch (err) {
      console.error(`[job:${job.nome}] tentativo ${job.tentativoCorrente} fallito:`, err.message);

      if (job.tentativoCorrente < job.tentativi) {
        const attesaMs = 500 * 2 ** (job.tentativoCorrente - 1);
        setTimeout(() => {
          this.#coda.push(job);
          this.#avanza();
        }, attesaMs);
      } else {
        this.emit('fallito', { nome: job.nome, errore: err });
      }
    }
  }
}

export const jobQueue = new JobQueue();

jobQueue.on('fallito', ({ nome, errore }) => {
  console.error(`[job:${nome}] fallito definitivamente:`, errore.message);
});
