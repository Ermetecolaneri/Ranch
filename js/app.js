// Avvio, riconoscimento del socio dal link personale e navigazione tra le sezioni.
(function () {
  var view = document.getElementById('view');
  var meBox = document.getElementById('me');
  var CHIAVE = 'ranch_k';

  // Il link personale è ?k=CODICE. Lo ricordiamo sul dispositivo e lo togliamo dalla barra indirizzi.
  var params = new URLSearchParams(location.search);
  var k = params.get('k');
  try {
    if (k) localStorage.setItem(CHIAVE, k);
    else k = localStorage.getItem(CHIAVE);
  } catch (e) { /* storage non disponibile: vale solo per questa visita */ }
  if (!k && RanchAPI.demo) k = window.RANCH_CONFIG.DEMO_K || null;
  if (params.has('k')) {
    params.delete('k');
    var q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  var ctx = { k: k || null, me: null, aggiornaMe: disegnaMe };

  function disegnaMe() {
    if (!ctx.me) { meBox.hidden = true; return; }
    meBox.hidden = false;
    meBox.innerHTML = '<a href="#/soci/' + UI.esc(ctx.me.id) + '">' + UI.avatar(ctx.me, 32) +
      '<span>' + UI.esc(ctx.me.nome.split(' ')[0]) + '</span></a>';
  }

  var IN_ARRIVO = { mezzi: 'Mezzi', progetti: 'Progetti', telemetria: 'Telemetria', eventi: 'Eventi', cassa: 'Cassa' };

  function route() {
    var parti = (location.hash.replace(/^#\/?/, '') || 'soci').split('/');
    var sez = parti[0];
    document.querySelectorAll('#tabs a').forEach(function (a) {
      a.classList.toggle('attiva', a.getAttribute('data-sec') === sez);
      if (a.getAttribute('data-sec') === sez) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    if (sez === 'soci') {
      if (parti[1]) Soci.scheda(view, decodeURIComponent(parti[1]), ctx);
      else Soci.lista(view, ctx);
    } else if (IN_ARRIVO[sez]) {
      view.innerHTML = '<p class="muted pad">La sezione ' + IN_ARRIVO[sez] + ' è in costruzione.</p>';
    } else {
      location.hash = '#/soci';
    }
  }

  if (RanchAPI.demo) document.getElementById('demo-banner').hidden = false;
  window.addEventListener('hashchange', route);

  var pronto = ctx.k ? RanchAPI.whoami(ctx.k).then(function (me) {
    ctx.me = me;
    if (!me) { try { localStorage.removeItem(CHIAVE); } catch (e) {} ctx.k = null; }
    disegnaMe();
  }).catch(function () {}) : Promise.resolve();
  pronto.then(route);
})();
