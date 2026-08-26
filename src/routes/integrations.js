/* Integrazioni: piattaforme di gioco e strumenti collegati all'account
 * dello studio. Due modi diversi di collegarsi:
 *
 *   tipo 'chiave_api'  Steam, Google Play, App Store, Xbox — lo studio
 *                      incolla la propria chiave API, salvata cifrata
 *                      (vedi services/secrets.js). Mai restituita al
 *                      frontend: solo le ultime 4 cifre, per conferma.
 *
 *   tipo 'oauth'       GitHub, Jira, Trello, Slack, Discord — si collegano
 *                      aprendo una finestra di autorizzazione (popup). Per
 *                      ora la finestra e' quella finta in
 *                      public/oauth-mock.html: quando ci saranno le vere
 *                      app OAuth registrate su ogni servizio, cambia solo
 *                      l'url restituito da /autorizza, il resto del flusso
 *                      (popup + postMessage) resta identico.
 *
 * GET  /api/integrazioni                     stato di tutte le integrazioni note
 * GET  /api/integrazioni/:provider/autorizza  url della finestra di autorizzazione (solo oauth)
 * POST /api/integrazioni/:provider/collega    chiave_api: richiede { chiave_api } nel body
 *                                              oauth: la chiama solo oauth-mock.html
 * POST /api/integrazioni/:provider/scollega   la segna come scollegata (e cancella la chiave, se c'era)
 */
import { Router } from 'express';
import * as db from '../db/index.js';
import { richiedeLogin } from '../middleware/auth.js';
import { verificaLimite } from '../middleware/piano.js';

const router = Router();
router.use(richiedeLogin);

const PROVIDER_DEFS = [
  { provider: 'steam', nome: 'Steam', gruppo: 'piattaforme', tipo: 'chiave_api' },
  { provider: 'google_play', nome: 'Google Play', gruppo: 'piattaforme', tipo: 'chiave_api' },
  { provider: 'app_store', nome: 'App Store', gruppo: 'piattaforme', tipo: 'chiave_api' },
  { provider: 'xbox', nome: 'Xbox', gruppo: 'piattaforme', tipo: 'chiave_api' },
  { provider: 'github', nome: 'GitHub', gruppo: 'strumenti', tipo: 'oauth' },
  { provider: 'jira', nome: 'Jira', gruppo: 'strumenti', tipo: 'oauth' },
  { provider: 'trello', nome: 'Trello', gruppo: 'strumenti', tipo: 'oauth' },
  { provider: 'slack', nome: 'Slack', gruppo: 'strumenti', tipo: 'oauth' },
  { provider: 'discord', nome: 'Discord', gruppo: 'strumenti', tipo: 'oauth' },
];
const PROVIDER_MAPPA = new Map(PROVIDER_DEFS.map((p) => [p.provider, p]));

router.get('/', async (req, res) => {
  const salvate = await db.listIntegrations(req.orgId);
  const mappaSalvate = new Map(salvate.map((r) => [r.provider, r]));

  res.json(
    PROVIDER_DEFS.map((def) => {
      const riga = mappaSalvate.get(def.provider);
      return {
        provider: def.provider,
        nome: def.nome,
        gruppo: def.gruppo,
        tipo: def.tipo,
        connesso: riga?.connected ?? false,
        connesso_il: riga?.connected_at ?? null,
        chiave_finale: def.tipo === 'chiave_api' ? riga?.api_key_hint ?? null : null,
      };
    })
  );
});

router.get('/:provider/autorizza', (req, res) => {
  const def = PROVIDER_MAPPA.get(req.params.provider);
  if (!def) return res.status(404).json({ errore: 'Integrazione sconosciuta.' });
  if (def.tipo !== 'oauth') return res.status(400).json({ errore: 'Questa integrazione non usa una finestra di autorizzazione.' });

  const url = `/oauth-mock.html?provider=${encodeURIComponent(def.provider)}&nome=${encodeURIComponent(def.nome)}`;
  res.json({ url });
});

router.post('/:provider/collega', async (req, res) => {
  const def = PROVIDER_MAPPA.get(req.params.provider);
  if (!def) return res.status(404).json({ errore: 'Integrazione sconosciuta.' });

  // Il limite piattaforme del piano si applica solo al gruppo 'piattaforme'
  // (Steam, Google Play, App Store, Xbox), non a 'strumenti' (GitHub,
  // Slack...), e solo quando si collega una piattaforma NUOVA: ricollegare
  // (o riscrivere la chiave di) una gia' connessa non deve mai essere
  // bloccato dal limite, altrimenti basterebbe un pagamento fallito per
  // impedire anche solo di aggiornare una chiave scaduta.
  if (def.gruppo === 'piattaforme') {
    const salvate = await db.listIntegrations(req.orgId);
    const giaConnessa = salvate.some((r) => r.provider === def.provider && r.connected);

    if (!giaConnessa) {
      const org = await db.findOrgById(req.orgId);
      const connesse = salvate.filter((r) => r.connected && PROVIDER_MAPPA.get(r.provider)?.gruppo === 'piattaforme').length;
      const limite = verificaLimite(org, 'piattaforme', connesse);
      if (!limite.ok) {
        return res.status(403).json({
          errore: `Il tuo piano permette di collegare al massimo ${limite.limite} piattaforme. Scollegane una o fai l'upgrade del piano.`,
        });
      }
    }
  }

  if (def.tipo === 'chiave_api') {
    const { chiave_api: chiaveApi } = req.body ?? {};
    if (typeof chiaveApi !== 'string' || chiaveApi.trim().length < 8) {
      return res.status(400).json({ errore: 'Chiave API non valida (minimo 8 caratteri).' });
    }

    const risultato = await db.setIntegration(req.orgId, def.provider, true, chiaveApi.trim());
    return res.json({ provider: def.provider, connected: true, chiave_finale: risultato.api_key_hint });
  }

  // oauth: nessuna chiave da salvare, la chiama solo la finestra di
  // autorizzazione dopo che l'utente ha "autorizzato" il collegamento.
  const risultato = await db.setIntegration(req.orgId, def.provider, true);
  res.json({ provider: def.provider, connected: risultato.connected });
});

router.post('/:provider/scollega', async (req, res) => {
  const def = PROVIDER_MAPPA.get(req.params.provider);
  if (!def) return res.status(404).json({ errore: 'Integrazione sconosciuta.' });

  const risultato = await db.setIntegration(req.orgId, def.provider, false);
  res.json({ provider: def.provider, connected: risultato.connected });
});

export default router;
