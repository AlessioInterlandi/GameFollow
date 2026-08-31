/* Banner di consenso cookie — GameFollow
 *
 * Regole seguite (linee guida Garante Privacy):
 * - i cookie tecnici (es. la sessione di login "gamefollow.sid") sono
 *   sempre attivi: servono a far funzionare il sito, non richiedono consenso.
 * - qualunque cookie NON essenziale (analytics, marketing) deve restare
 *   spento finche' l'utente non da' un consenso esplicito e informato.
 * - il banner offre un rifiuto facile quanto l'accettazione (niente "X"
 *   che accetta tutto di nascosto), piu' un livello di scelta granulare.
 * - la scelta si puo' cambiare in ogni momento (link "Preferenze cookie"
 *   nel footer, che richiama gfCookieConsent.open()).
 * - non si ripropone il banner piu' spesso di ogni 6 mesi.
 *
 * Oggi GameFollow non installa nessun cookie non essenziale: questo script
 * prepara solo il meccanismo. Quando in futuro verra' aggiunto uno script
 * di analytics, va caricato SOLO dopo aver controllato
 * gfCookieConsent.get().analytics === true.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'gf_cookie_consent';
  var SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;

  function leggiConsenso() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var dato = JSON.parse(raw);
      if (!dato || !dato.ts) return null;
      if (Date.now() - dato.ts > SIX_MONTHS_MS) return null;
      return dato;
    } catch (e) {
      return null;
    }
  }

  function salvaConsenso(analytics) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ essential: true, analytics: !!analytics, ts: Date.now() })
      );
    } catch (e) {
      /* localStorage non disponibile: il banner ricompare al giro
         successivo, non e' un problema bloccante. */
    }
  }

  var stileIniettato = false;
  function iniettaStile() {
    if (stileIniettato) return;
    stileIniettato = true;
    var css = [
      '.gfcc-wrap{position:fixed;left:0;right:0;bottom:0;z-index:9999;',
      'display:flex;justify-content:center;padding:16px;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;}',
      '.gfcc-card{width:100%;max-width:720px;background:rgba(23,17,9,.92);',
      'border:1px solid rgba(255,157,0,.24);border-radius:14px;',
      'backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);',
      'box-shadow:0 24px 48px -16px rgba(0,0,0,.7);padding:20px 22px;color:#F7F2E9;}',
      '.gfcc-title{font-size:14px;font-weight:650;margin:0 0 6px}',
      '.gfcc-text{font-size:13px;line-height:1.55;color:#AFA189;margin:0 0 14px}',
      '.gfcc-text a{color:#FF9D00;text-decoration:underline;text-underline-offset:2px}',
      '.gfcc-panel{display:none;margin:0 0 14px;padding:12px 14px;background:rgba(255,255,255,.02);',
      'border:1px solid #2E2416;border-radius:10px}',
      '.gfcc-panel.gfcc-open{display:block}',
      '.gfcc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;',
      'padding:7px 0;font-size:12.5px;color:#AFA189}',
      '.gfcc-row+.gfcc-row{border-top:1px solid #2E2416}',
      '.gfcc-row b{color:#F7F2E9;font-weight:600;display:block;font-size:13px}',
      '.gfcc-switch{position:relative;width:36px;height:20px;flex-shrink:0}',
      '.gfcc-switch input{opacity:0;width:0;height:0}',
      '.gfcc-slider{position:absolute;inset:0;background:#2E2416;border-radius:999px;transition:background .15s ease;cursor:pointer}',
      '.gfcc-slider:before{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;',
      'background:#AFA189;border-radius:50%;transition:transform .15s ease,background .15s ease}',
      '.gfcc-switch input:checked+.gfcc-slider{background:rgba(255,157,0,.35)}',
      '.gfcc-switch input:checked+.gfcc-slider:before{transform:translateX(16px);background:#FF9D00}',
      '.gfcc-switch input:disabled+.gfcc-slider{opacity:.5;cursor:not-allowed}',
      '.gfcc-actions{display:flex;gap:10px;flex-wrap:wrap}',
      '.gfcc-btn{font:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:9px;',
      'cursor:pointer;border:1px solid transparent;transition:opacity .15s ease,transform .15s ease}',
      '.gfcc-btn:hover{transform:translateY(-1px)}',
      '.gfcc-btn-primary{background:#FF9D00;color:#1A1206}',
      '.gfcc-btn-primary:hover{opacity:.92}',
      '.gfcc-btn-ghost{background:rgba(255,255,255,.02);border-color:#4A3A22;color:#F7F2E9}',
      '.gfcc-btn-ghost:hover{border-color:#FF9D00}',
      '.gfcc-btn-link{background:none;border:none;padding:9px 4px;color:#AFA189;text-decoration:underline;',
      'text-underline-offset:2px}',
      '.gfcc-btn-link:hover{color:#F7F2E9}',
      '@media(max-width:520px){.gfcc-actions{flex-direction:column}.gfcc-actions .gfcc-btn{width:100%;text-align:center}}',
    ].join('');
    var tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  var elementoBanner = null;

  function costruisciBanner() {
    var host = document.createElement('div');
    host.className = 'gfcc-wrap';
    host.innerHTML =
      '<div class="gfcc-card" role="dialog" aria-label="Preferenze cookie">' +
      '  <p class="gfcc-title">Usiamo i cookie</p>' +
      '  <p class="gfcc-text">Quelli tecnici (es. il login) servono a far funzionare GameFollow e sono sempre attivi. Quelli non essenziali si attivano solo se li accetti. Dettagli nella <a href="cookie-policy.html">Cookie Policy</a>.</p>' +
      '  <div class="gfcc-panel" data-gfcc-panel>' +
      '    <div class="gfcc-row"><div><b>Tecnici</b>necessari al funzionamento del sito (es. sessione di login)</div>' +
      '      <label class="gfcc-switch"><input type="checkbox" checked disabled><span class="gfcc-slider"></span></label></div>' +
      '    <div class="gfcc-row"><div><b>Analitici</b>ci aiutano a capire come viene usato il sito, oggi non attivi</div>' +
      '      <label class="gfcc-switch"><input type="checkbox" data-gfcc-analytics><span class="gfcc-slider"></span></label></div>' +
      '  </div>' +
      '  <div class="gfcc-actions">' +
      '    <button type="button" class="gfcc-btn gfcc-btn-primary" data-gfcc-accept-all>Accetta tutti</button>' +
      '    <button type="button" class="gfcc-btn gfcc-btn-ghost" data-gfcc-reject>Rifiuta non essenziali</button>' +
      '    <button type="button" class="gfcc-btn gfcc-btn-link" data-gfcc-customize>Personalizza</button>' +
      '    <button type="button" class="gfcc-btn gfcc-btn-primary" data-gfcc-save style="display:none">Salva preferenze</button>' +
      '  </div>' +
      '</div>';
    return host;
  }

  function nascondiBanner() {
    if (elementoBanner && elementoBanner.parentNode) {
      elementoBanner.parentNode.removeChild(elementoBanner);
    }
    elementoBanner = null;
  }

  function mostraBanner() {
    if (elementoBanner) return;
    iniettaStile();
    elementoBanner = costruisciBanner();
    document.body.appendChild(elementoBanner);

    var pannello = elementoBanner.querySelector('[data-gfcc-panel]');
    var checkboxAnalytics = elementoBanner.querySelector('[data-gfcc-analytics]');
    var bottoneSalva = elementoBanner.querySelector('[data-gfcc-save]');
    var bottoneCustomize = elementoBanner.querySelector('[data-gfcc-customize]');

    elementoBanner.querySelector('[data-gfcc-accept-all]').addEventListener('click', function () {
      salvaConsenso(true);
      nascondiBanner();
    });
    elementoBanner.querySelector('[data-gfcc-reject]').addEventListener('click', function () {
      salvaConsenso(false);
      nascondiBanner();
    });
    bottoneCustomize.addEventListener('click', function () {
      pannello.classList.add('gfcc-open');
      bottoneCustomize.style.display = 'none';
      bottoneSalva.style.display = '';
    });
    bottoneSalva.addEventListener('click', function () {
      salvaConsenso(checkboxAnalytics.checked);
      nascondiBanner();
    });
  }

  function apriPreferenze() {
    nascondiBanner();
    mostraBanner();
    var pannello = elementoBanner.querySelector('[data-gfcc-panel]');
    var bottoneCustomize = elementoBanner.querySelector('[data-gfcc-customize]');
    var bottoneSalva = elementoBanner.querySelector('[data-gfcc-save]');
    var checkboxAnalytics = elementoBanner.querySelector('[data-gfcc-analytics]');
    var attuale = leggiConsenso();
    checkboxAnalytics.checked = !!(attuale && attuale.analytics);
    pannello.classList.add('gfcc-open');
    bottoneCustomize.style.display = 'none';
    bottoneSalva.style.display = '';
  }

  // API pubblica: window.gfCookieConsent.open() riapre il banner in
  // qualunque momento (link "Preferenze cookie" nel footer);
  // window.gfCookieConsent.get() legge la scelta corrente (o null).
  window.gfCookieConsent = {
    open: apriPreferenze,
    get: leggiConsenso,
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!leggiConsenso()) mostraBanner();
  });
})();
