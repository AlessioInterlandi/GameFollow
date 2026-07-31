/* Ponte verso n8n.
 *
 * Esporta: lanciaWorkflow(nome, payload)
 * Fa una POST al webhook n8n corrispondente.
 * Se config.n8nWebhookUrl e' vuoto, scrive solo nel log (modalita' sviluppo).
 *
 * n8n resta il motore che esegue le automazioni, ma il cliente non lo vede
 * mai: parla solo con il tuo sito, che a sua volta chiama n8n.
 */
