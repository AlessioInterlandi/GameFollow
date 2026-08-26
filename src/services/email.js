/* Invio email.
 *
 * Esporta: inviaEmail(destinatario, oggetto, corpo)
 *
 * Se SMTP non e' configurato (sviluppo), scrive solo nel log: nessuna
 * dipendenza esterna necessaria per lavorare in locale. In produzione usa
 * nodemailer con le credenziali SMTP lette da config (mai da process.env
 * direttamente, vedi src/config.js).
 *
 * Va sempre chiamata tramite services/queue.js: l'invio e' una chiamata di
 * rete lenta, non deve mai bloccare la risposta HTTP.
 */
import { config } from '../config.js';

let transporterPromise;

function getTransporter() {
  if (!config.smtpHost) return null;

  if (!transporterPromise) {
    transporterPromise = import('nodemailer').then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      })
    );
  }
  return transporterPromise;
}

export async function inviaEmail(destinatario, oggetto, corpo) {
  const transporter = await getTransporter();

  if (!transporter) {
    console.log(`[email:mock] a=${destinatario} oggetto="${oggetto}"\n${corpo}`);
    return { ok: true, simulato: true };
  }

  await transporter.sendMail({ from: config.emailFrom, to: destinatario, subject: oggetto, text: corpo });
  return { ok: true };
}
