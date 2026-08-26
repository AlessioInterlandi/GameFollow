/* Unico punto di contatto tra l'applicazione e il database.
 *
 * Sceglie il driver in base a config.dbDriver ed esporta le funzioni
 * con nomi neutri, che non dicono quale database c'e' sotto:
 *   init, findUserByEmail, findOrgById, updateOrg,
 *   listReviews, getReview, updateReview, insertReview, stats,
 *   contaRecensioniMese, listIntegrations, setIntegration,
 *   findOrgByStripeCustomerId, insertPayment, listPayments
 *
 * Le route importano SOLO da qui. Cambiare database significa scrivere
 * un nuovo driver con le stesse funzioni e cambiare una riga nel .env.
 *
 * Import dinamico (non statico) apposta: cosi' con DB_DRIVER=sqlite non
 * serve avere @supabase/supabase-js installato, e viceversa.
 */
import { config } from '../config.js';

const driver = config.dbDriver === 'supabase'
  ? await import('./supabase.js')
  : await import('./sqlite.js');

export const {
  init,
  findUserByEmail,
  findOrgById,
  updateOrg,
  listReviews,
  getReview,
  updateReview,
  insertReview,
  stats,
  contaRecensioniMese,
  listIntegrations,
  setIntegration,
  getIntegrationSecret,
  findOrgByStripeCustomerId,
  insertPayment,
  listPayments,
} = driver;
