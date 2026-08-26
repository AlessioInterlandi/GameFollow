import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './src/config.js';
import * as db from './src/db/index.js';
import { apiLimiter, loginLimiter } from './src/middleware/rateLimit.js';

import authRoutes from './src/routes/auth.js';
import reviewsRoutes from './src/routes/reviews.js';
import settingsRoutes from './src/routes/settings.js';
import billingRoutes from './src/routes/billing.js';
import integrationsRoutes from './src/routes/integrations.js';
import issuesRoutes from './src/routes/issues.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Dietro un reverse proxy (Render, Railway, nginx...) serve per far leggere
// a express-rate-limit e ai cookie "secure" l'IP/protocollo reali.
if (config.trustProxy) app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());

// Il corpo del webhook Stripe deve restare grezzo per la verifica della
// firma (vedi routes/billing.js, che applica express.raw() da solo su
// quella singola route): qui saltiamo il parsing JSON generico solo per
// quel percorso, altrimenti express.json() lo consumerebbe prima che il
// webhook possa leggerlo.
app.use((req, res, next) => {
  if (req.path === '/api/abbonamento/webhook') return next();
  express.json({ limit: '100kb' })(req, res, next);
});

app.use(
  session({
    name: 'gamefollow.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.env === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    // MemoryStore va bene per una singola istanza. Se il servizio scala su
    // piu' processi/macchine, va sostituito con uno store condiviso
    // (es. connect-redis) altrimenti ogni istanza vede sessioni diverse.
  })
);

// Applica il rate limit specifico PRIMA di montare le route: la richiesta
// di login viene contata una sola volta, sul percorso piu' stretto.
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/recensioni', reviewsRoutes);
app.use('/api/impostazioni', settingsRoutes);
app.use('/api/abbonamento', billingRoutes);
app.use('/api/integrazioni', integrationsRoutes);
app.use('/api/problemi', issuesRoutes);

// dotfiles: 'deny' per difesa in profondita'. Il .env vero e proprio non
// sta comunque dentro public/, quindi non e' mai raggiungibile da qui.
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));

app.get('/', (_req, res) => {
  res.redirect('/index.html');
});

app.use((_req, res) => {
  res.status(404).send('Pagina non trovata.');
});

// Gestore errori centrale: niente stack trace nella risposta, mai in
// produzione. I dettagli restano nel log del server.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ errore: 'Errore interno.' });
});

let server;

async function avvia() {
  await db.init();
  server = app.listen(config.port, () => {
    console.log(`App disponibile su http://localhost:${config.port}`);
  });
}

function spegni(segnale) {
  console.log(`${segnale} ricevuto, chiusura in corso...`);
  server?.close(() => process.exit(0));
}

process.on('SIGTERM', () => spegni('SIGTERM'));
process.on('SIGINT', () => spegni('SIGINT'));

avvia();

export default app;
