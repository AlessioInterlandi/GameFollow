/* Guardia sui permessi per ruolo, da usare DOPO richiedeLogin (serve
 * req.role dalla sessione — mai da req.body/query/params, stesso principio
 * di org_id/game_id: un utente non puo' cambiare il proprio ruolo
 * scrivendo un valore diverso nella richiesta).
 *
 * Tre ruoli (vedi schema.sql su users.role):
 *   owner   accesso completo, incluso billing/team/integrazioni
 *   editor  lettura ovunque + scrittura su Reviews/Replies
 *   viewer  sola lettura ovunque
 *
 * richiedeRuolo('owner') protegge una route owner-only (team, billing,
 * integrazioni, aggiungere giochi, Knowledge Base). richiedeRuolo('owner',
 * 'editor') protegge le azioni di scrittura su Reviews/Replies, lasciando
 * fuori solo i viewer. Le GET restano fuori da questa guardia (tutti e tre
 * i ruoli leggono gli stessi dati) — e' solo la scrittura ad essere
 * ristretta, route per route.
 */
export function richiedeRuolo(...ruoliConsentiti) {
  return (req, res, next) => {
    if (!ruoliConsentiti.includes(req.role)) {
      return res.status(403).json({
        errore: 'Il tuo ruolo nel team non permette questa azione.',
        ruolo_richiesto: ruoliConsentiti,
      });
    }
    next();
  };
}
