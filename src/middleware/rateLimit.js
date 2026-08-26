/* Rate limiting sull'accesso alle API.
 *
 * loginLimiter: molto piu' stretto, solo su /api/auth/login — e' l'unica
 * route dove un attaccante puo' provare tante password di fila (brute force
 * / credential stuffing). Conta i tentativi per IP, non per account: cosi'
 * un attaccante non puo' bloccare l'accesso a un utente vero cambiando
 * solo la password nei tentativi.
 *
 * apiLimiter: rete piu' larga su tutte le /api, protezione generica da
 * abusi e da un singolo client che martella il server.
 */
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// In test (node --test, vedi test/api.test.mjs) il limite andrebbe in giro
// falsamente positivo: tanti account diversi, stessa macchina, stesso IP.
// Va disattivato solo li', non in sviluppo ne' in produzione.
const disattivoInTest = () => config.env === 'test';

export const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  limit: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: disattivoInTest,
  message: { errore: 'Troppi tentativi di accesso. Riprova piu tardi.' },
});

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  limit: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: disattivoInTest,
  message: { errore: 'Troppe richieste. Riprova piu tardi.' },
});
