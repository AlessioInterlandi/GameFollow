/* Tutte le variabili d'ambiente lette in un posto solo.
 *
 * Regola: process.env non deve comparire da nessun'altra parte nel progetto.
 * Se un giorno cambi il nome di una variabile, cambi solo questo file.
 */
import 'dotenv/config';

function bool(valore, predefinito = false) {
  if (valore === undefined || valore === '') return predefinito;
  return valore === '1' || valore.toLowerCase() === 'true';
}

function numero(valore, predefinito) {
  const n = Number(valore);
  return valore === undefined || valore === '' || Number.isNaN(n) ? predefinito : n;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: numero(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET,
  trustProxy: bool(process.env.TRUST_PROXY, false),

  // Base pubblica dell'app: serve a costruire gli URL di successo/annullo
  // che Stripe Checkout usa per tornare al sito dopo il pagamento.
  appUrl: process.env.APP_URL || `http://localhost:${numero(process.env.PORT, 3000)}`,

  dbDriver: process.env.DB_DRIVER || 'sqlite',
  sqliteFile: process.env.SQLITE_FILE || './data/app.db',

  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,

  aiProvider: process.env.AI_PROVIDER || 'mock',
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL,

  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || '',

  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: numero(process.env.SMTP_PORT, 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'no-reply@gamefollow.app',

  // Stripe: SECRET_KEY e WEBHOOK_SECRET restano vuote finche' non esiste un
  // account Stripe collegato. Con la chiave assente le route di
  // /api/abbonamento rispondono 503 invece di andare in errore a meta'
  // richiesta (vedi routes/billing.js) — cosi' il resto del sito continua
  // a funzionare anche prima di avere Stripe configurato.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    prezzoIndie: process.env.STRIPE_PRICE_INDIE || '',
    prezzoStudio: process.env.STRIPE_PRICE_STUDIO || '',
    prezzoPublisher: process.env.STRIPE_PRICE_PUBLISHER || '',
  },

  rateLimit: {
    loginWindowMs: numero(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000),
    loginMax: numero(process.env.RATE_LIMIT_LOGIN_MAX, 10),
    apiWindowMs: numero(process.env.RATE_LIMIT_API_WINDOW_MS, 15 * 60 * 1000),
    apiMax: numero(process.env.RATE_LIMIT_API_MAX, 300),
  },
};

// Se manca la base di tutto, meglio fermarsi subito con un errore chiaro
// che scoprirlo alla prima richiesta.
if (!config.sessionSecret) {
  throw new Error('SESSION_SECRET mancante: copia .env.example in .env e impostane uno.');
}

if (config.dbDriver === 'supabase' && (!config.supabaseUrl || !config.supabaseServiceKey)) {
  throw new Error(
    'DB_DRIVER=supabase ma mancano SUPABASE_URL o SUPABASE_SERVICE_KEY nel .env.'
  );
}

if (config.dbDriver !== 'sqlite' && config.dbDriver !== 'supabase') {
  throw new Error(`DB_DRIVER sconosciuto: "${config.dbDriver}". Valori validi: sqlite, supabase.`);
}
