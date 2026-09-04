/* Unico punto di contatto tra l'applicazione e il database.
 *
 * Sceglie il driver in base a config.dbDriver ed esporta le funzioni
 * con nomi neutri, che non dicono quale database c'e' sotto:
 *   init, findUserByEmail, findOrgById, updateOrg,
 *   creaOrganizzazioneEUtente, trovaUtentePerTokenVerifica,
 *   impostaEmailVerificata, impostaNuovoTokenVerifica,
 *   listGames, createGame, findGameById,
 *   listReviews, getReview, updateReview, insertReview, stats,
 *   contaRecensioniMese, listIntegrations, setIntegration,
 *   listKnownIssues, createKnownIssue, updateKnownIssue, deleteKnownIssue,
 *   findOrgByStripeCustomerId, insertPayment, listPayments,
 *   listOrgUsers, findUserById, creaInvito, trovaUtentePerTokenInvito,
 *   impostaNuovoTokenInvito, accettaInvito, updateUserRole, deleteUser,
 *   getNotificationPreferences, setNotificationPreferences
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
  creaOrganizzazioneEUtente,
  trovaUtentePerTokenVerifica,
  impostaEmailVerificata,
  impostaNuovoTokenVerifica,
  listGames,
  createGame,
  findGameById,
  listReviews,
  getReview,
  updateReview,
  insertReview,
  stats,
  contaRecensioniMese,
  listIntegrations,
  listIntegrationsOrg,
  setIntegration,
  getIntegrationSecret,
  listKnownIssues,
  createKnownIssue,
  updateKnownIssue,
  deleteKnownIssue,
  findOrgByStripeCustomerId,
  insertPayment,
  listPayments,
  listOrgUsers,
  findUserById,
  creaInvito,
  trovaUtentePerTokenInvito,
  impostaNuovoTokenInvito,
  accettaInvito,
  updateUserRole,
  deleteUser,
  getNotificationPreferences,
  setNotificationPreferences,
} = driver;
