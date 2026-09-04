/* Guardia di accesso, da mettere davanti a tutte le route protette.
 *
 * org_id non arriva MAI da req.body, req.query o req.params: solo dalla
 * sessione. E' l'unico modo per impedire che un cliente, cambiando un
 * numero nella richiesta, legga i dati di un altro. Stesso principio per
 * role (vedi middleware/ruolo.js): scritto in sessione solo al login
 * (routes/auth.js) e a un cambio ruolo/accettazione invito che rigenera
 * la sessione (routes/team.js), mai leggibile/scrivibile dal client.
 *
 * req.role puo' mancare su sessioni aperte PRIMA che esistesse questo
 * campo (vedi la stessa nota in routes/auth.js): 'owner' come fallback,
 * lo stesso ruolo che la migrazione da' a chi esisteva gia'.
 */
export function richiedeLogin(req, res, next) {
  if (!req.session?.userId || !req.session?.orgId) {
    return res.status(401).json({ errore: 'Accesso richiesto.' });
  }

  req.orgId = req.session.orgId;
  req.userId = req.session.userId;
  req.role = req.session.role || 'owner';
  next();
}
