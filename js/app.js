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

  var ctx = { k: k || null, me: null, aggiornaMe: disegnaMe, ricaricaMe: ricaricaMe };

  // rilegge chi sono (credito aggiornato dopo un acquisto)
  function ricaricaMe() {
    if (!ctx.k) return Promise.resolve();
    return RanchAPI.whoami(ctx.k).then(function (me) { ctx.me = me; disegnaMe(); }).catch(function () {});
  }

  function disegnaMe() {
    document.getElementById('tab-admin').hidden = !(ctx.me && ctx.me.admin);
    if (!ctx.me) { meBox.hidden = true; return; }
    meBox.hidden = false;
    meBox.innerHTML = '<a href="#/soci/' + UI.esc(ctx.me.id) + '">' + UI.avatar(ctx.me, 32) +
      '<span>' + UI.esc(ctx.me.nome.split(' ')[0]) + '</span></a>';
  }

  var IN_ARRIVO = {};

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
    } else if (sez === 'progetti') {
      if (parti[1]) Progetti.scheda(view, decodeURIComponent(parti[1]), ctx);
      else Progetti.lista(view, ctx);
    } else if (sez === 'eventi') {
      if (parti[1]) Eventi.scheda(view, decodeURIComponent(parti[1]), ctx);
      else Eventi.lista(view, ctx);
    } else if (sez === 'cassa') {
      Cassa.mostra(view, ctx);
    } else if (sez === 'admin') {
      Admin.mostra(view, parti[1], ctx);
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
