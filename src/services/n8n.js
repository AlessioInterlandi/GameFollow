/* Ponte verso n8n.
 *
 * Esporta: lanciaWorkflow(nome, payload)
 * Fa una POST al webhook n8n corrispondente. Se config.n8nWebhookUrl e'
 * vuoto, scrive solo nel log (modalita' sviluppo).
 *
 * n8n resta il motore che esegue le automazioni, ma il cliente non lo vede
 * mai: parla solo con il sito, che a sua volta chiama n8n.
 */
import { config } from '../config.js';

export async function lanciaWorkflow(nome, payload) {
  if (!config.n8nWebhookUrl) {
    console.log(`[n8n:mock] workflow "${nome}"`, payload);
    return { ok: true, simulato: true };
  }

  const risposta = await fetch(config.n8nWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow: nome, payload }),
  });

  if (!risposta.ok) {
    throw new Error(`n8n ha risposto ${risposta.status} per il workflow "${nome}"`);
  }

  return risposta.json().catch(() => ({ ok: true }));
}
