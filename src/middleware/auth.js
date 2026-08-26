/* Guardia di accesso, da mettere davanti a tutte le route protette.
 *
 * org_id non arriva MAI da req.body, req.query o req.params: solo dalla
 * sessione. E' l'unico modo per impedire che un cliente, cambiando un
 * numero nella richiesta, legga i dati di un altro.
 */
export function richiedeLogin(req, res, next) {
  if (!req.session?.userId || !req.session?.orgId) {
    return res.status(401).json({ errore: 'Accesso richiesto.' });
  }

  req.orgId = req.session.orgId;
  req.userId = req.session.userId;
  next();
}
