/* Motore di traduzione delle pagine pubbliche (landing, login, registrazione,
 * conferma email). Vanilla JS, nessuna dipendenza, stesso approccio
 * "self-contained" di cookie-consent.js: legge attributi data-i18n-* sugli
 * elementi e applica un dizionario caricato da /i18n/<pagina>.json.
 *
 * Lingue supportate: it, en, es, fr. La scelta si salva in localStorage
 * sotto 'gf_lang' — la stessa chiave che scrive il selettore "Site language"
 * nelle Impostazioni (vedi js/impostazioni.js): un utente loggato che sceglie
 * la lingua la ritrova anche qui dopo il logout, sullo stesso browser.
 *
 * Attributi riconosciuti su un elemento:
 *   data-i18n="chiave"              -> imposta textContent
 *   data-i18n-html="chiave"         -> imposta innerHTML (per stringhe con <span>/<b>)
 *   data-i18n-placeholder="chiave"  -> imposta l'attributo placeholder
 *   data-i18n-switch                -> il <select> del selettore lingua stesso
 *
 * Ogni pagina dichiara il proprio dizionario con <html data-i18n-page="login">
 * (o "index", "registrati", "verifica-email"): il motore carica sempre
 * /i18n/common.json (stringhe condivise: link legali, "Accedi/Log in"...)
 * unito a /i18n/<pagina>.json.
 */
(function () {
  'use strict';

  var LINGUE = ['it', 'en', 'es', 'fr'];
  var STORAGE_KEY = 'gf_lang';

  function lingueBrowser() {
    var lingue = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < lingue.length; i++) {
      var codice = String(lingue[i]).slice(0, 2).toLowerCase();
      if (LINGUE.indexOf(codice) !== -1) return codice;
    }
    return 'en';
  }

  function leggiLinguaSalvata() {
    try {
      var salvata = localStorage.getItem(STORAGE_KEY);
      return LINGUE.indexOf(salvata) !== -1 ? salvata : null;
    } catch (e) {
      return null;
    }
  }

  function salvaLingua(lingua) {
    try { localStorage.setItem(STORAGE_KEY, lingua); } catch (e) { /* privacy mode: pazienza */ }
  }

  var linguaCorrente = leggiLinguaSalvata() || lingueBrowser();
  var dizionarioAttivo = {};
  var fileCache = {}; // { common: {it:{...}, en:{...}, ...}, login: {...} }

  function nomePagina() {
    return document.documentElement.getAttribute('data-i18n-page') || 'common';
  }

  function caricaFile(nome) {
    if (fileCache[nome]) return Promise.resolve(fileCache[nome]);
    return fetch('i18n/' + nome + '.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (dati) {
        fileCache[nome] = dati || {};
        return fileCache[nome];
      });
  }

  function dizionarioPer(lingua) {
    var pagina = nomePagina();
    return Promise.all([caricaFile('common'), pagina === 'common' ? {} : caricaFile(pagina)])
      .then(function (risultati) {
        var comune = risultati[0] || {};
        var specifico = risultati[1] || {};
        return Object.assign({}, comune[lingua] || comune.en || {}, specifico[lingua] || specifico.en || {});
      });
  }

  function applica(dizionario) {
    dizionarioAttivo = dizionario;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var chiave = el.getAttribute('data-i18n');
      if (dizionario[chiave] !== undefined) el.textContent = dizionario[chiave];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var chiave = el.getAttribute('data-i18n-html');
      if (dizionario[chiave] !== undefined) el.innerHTML = dizionario[chiave];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var chiave = el.getAttribute('data-i18n-placeholder');
      if (dizionario[chiave] !== undefined) el.setAttribute('placeholder', dizionario[chiave]);
    });

    document.documentElement.setAttribute('lang', linguaCorrente);
  }

  function imposta(lingua) {
    if (LINGUE.indexOf(lingua) === -1) return Promise.resolve();
    linguaCorrente = lingua;
    salvaLingua(lingua);
    return dizionarioPer(lingua).then(function (dizionario) {
      applica(dizionario);
      document.querySelectorAll('[data-i18n-switch]').forEach(function (sel) { sel.value = lingua; });
      document.dispatchEvent(new CustomEvent('gf-lang-changed', { detail: { lang: lingua } }));
    });
  }

  // t(chiave): lettura puntuale dal dizionario attivo, per gli script di
  // pagina (login.js, registrati.js, verifica-email.js) che devono mostrare
  // testo tradotto generato a runtime (messaggi di errore/successo), non
  // solo testo statico gia' presente nell'HTML.
  function t(chiave, fallback) {
    return dizionarioAttivo[chiave] !== undefined ? dizionarioAttivo[chiave] : (fallback || chiave);
  }

  function avvia() {
    document.querySelectorAll('[data-i18n-switch]').forEach(function (sel) {
      sel.value = linguaCorrente;
      sel.addEventListener('change', function () { imposta(sel.value); });
    });
    dizionarioPer(linguaCorrente).then(applica);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }

  window.gfI18n = { set: imposta, get: function () { return linguaCorrente; }, t: t };
})();
