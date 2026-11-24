// Commenti ai progetti: elenco con reazioni (👍 pollice, 🖕 dito medio, DUCE),
// finestra apribile dall'elenco progetti e carosello sulle foto delle card.
window.Commenti = (function () {
  var esc = UI.esc;
  var REAZIONI = [['su', '👍', 'Pollice su'], ['dito', '🖕', 'Dito medio'], ['duce', 'DUCE', 'Duce']];

  function quando(iso) {
    var d = new Date(iso), ora = new Date(), min = Math.round((ora - d) / 60000);
    if (min < 1) return 'adesso';
    if (min < 60) return min + ' min fa';
    if (min < 60 * 24 && d.getDate() === ora.getDate()) return 'oggi ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return UI.data(iso) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  function commentoHtml(c, ctx) {
    var mie = c.mie || [], tuo = ctx.me && ctx.me.id === c.autore.id;
    return '<li class="commento" data-id="' + c.id + '">' +
      '<a href="#/soci/' + esc(c.autore.id) + '" class="c-avatar">' + UI.avatar(c.autore, 34) + '</a>' +
      '<div class="c-corpo">' +
        '<p class="c-testa"><b>' + esc(c.autore.nome) + '</b> <span class="muted">' + esc(quando(c.data)) + '</span>' +
          ((tuo || (ctx.me && ctx.me.admin)) ? '<button type="button" class="c-elimina" data-elimina="' + c.id + '" aria-label="Elimina commento">✕</button>' : '') + '</p>' +
        '<p class="c-testo">' + esc(c.testo) + '</p>' +
        '<div class="reazioni">' + REAZIONI.map(function (r) {
          var n = Number(c.reazioni[r[0]]) || 0, mia = mie.indexOf(r[0]) >= 0;
          return '<button type="button" class="reazione r-' + r[0] + (mia ? ' mia' : '') + '" data-reazione="' + r[0] + '" aria-pressed="' + mia + '" title="' + r[2] + '"' +
            (ctx.me ? '' : ' disabled') + '><span class="r-ico">' + r[1] + '</span>' + (n ? '<span class="r-n">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
      '</div></li>';
  }

  // elenco con campo per scrivere; onCambio(numeroCommenti) dopo ogni modifica
  function monta(el, progettoId, ctx, onCambio) {
    el.innerHTML = '<div class="carica-commenti">' + UI.caricamento() + '</div>';
    RanchAPI.getCommenti(progettoId, ctx.k).then(function (lista) {
      el.innerHTML =
        (ctx.me ?
          '<form class="scrivi-commento" novalidate>' + UI.avatar(ctx.me, 34) +
            '<textarea name="testo" rows="1" maxlength="500" placeholder="Scrivi un commento…" aria-label="Scrivi un commento"></textarea>' +
            '<button type="submit" class="btn primario piccolo" disabled>Invia</button></form>'
          : '<p class="muted small">Apri il tuo link personale per commentare.</p>') +
        '<ul class="lista-commenti">' + (lista.length ? lista.map(function (c) { return commentoHtml(c, ctx); }).join('')
          : '<li class="nessuno muted">Ancora nessun commento: rompi il ghiaccio!</li>') + '</ul>';
      var f = el.querySelector('.scrivi-commento');
      if (f) {
        var ta = f.testo, bt = f.querySelector('button');
        ta.addEventListener('input', function () {
          bt.disabled = !ta.value.trim();
          ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
        });
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var t = ta.value.trim(); if (!t) return;
          bt.disabled = true;
          RanchAPI.commenta(ctx.k, progettoId, t).then(function (c) {
            ta.value = ''; ta.style.height = '';
            var ul = el.querySelector('.lista-commenti'), vuoto = ul.querySelector('.nessuno');
            if (vuoto) vuoto.remove();
            ul.insertAdjacentHTML('afterbegin', commentoHtml(c, ctx));
            if (onCambio) onCambio(ul.querySelectorAll('.commento').length);
          }).catch(function (e2) { bt.disabled = false; UI.toast(e2.message); });
        });
      }
      el.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-reazione], [data-elimina]');
        if (!b || !ctx.me) return;
        var li = b.closest('.commento'), id = Number(li.getAttribute('data-id'));
        if (b.hasAttribute('data-reazione')) {
          b.disabled = true;
          RanchAPI.reagisci(ctx.k, id, b.getAttribute('data-reazione')).then(function (c) {
            li.outerHTML = commentoHtml(c, ctx);
          }).catch(function (e2) { b.disabled = false; UI.toast(e2.message); });
        } else {
          if (b.getAttribute('data-conferma') !== '1') {   // doppio tocco per eliminare
            b.setAttribute('data-conferma', '1'); b.textContent = 'Elimina?'; b.classList.add('conferma');
            setTimeout(function () { if (b.isConnected) { b.removeAttribute('data-conferma'); b.textContent = '✕'; b.classList.remove('conferma'); } }, 3000);
            return;
          }
          RanchAPI.eliminaCommento(ctx.k, id).then(function () {
            li.remove();
            var n = el.querySelectorAll('.commento').length;
            if (!n) el.querySelector('.lista-commenti').innerHTML = '<li class="nessuno muted">Ancora nessun commento: rompi il ghiaccio!</li>';
            if (onCambio) onCambio(n);
            UI.toast('Commento eliminato');
          }).catch(function (e2) { UI.toast(e2.message); });
        }
      });
    }).catch(function (e) { el.innerHTML = UI.errore(e); });
  }

  // finestra a scomparsa dal basso, apribile dall'elenco progetti
  function apri(p, ctx, onCambio) {
    var w = document.createElement('div');
    w.className = 'modal-bg foglio-bg';
    w.innerHTML = '<div class="foglio" role="dialog" aria-modal="true" aria-label="Commenti a ' + esc(p.titolo) + '">' +
      '<div class="foglio-testa"><span class="maniglia" aria-hidden="true"></span><h2>💬 ' + esc(p.titolo) + '</h2>' +
      '<button type="button" class="chiudi" aria-label="Chiudi">✕</button></div>' +
      '<div class="foglio-corpo"></div></div>';
    document.body.appendChild(w);
    document.body.classList.add('no-scroll');
    function chiudi() { w.remove(); document.body.classList.remove('no-scroll'); }
    w.addEventListener('click', function (e) { if (e.target === w || e.target.closest('.chiudi')) chiudi(); });
    monta(w.querySelector('.foglio-corpo'), p.id, ctx, onCambio);
  }

  // carosello dei commenti sopra la foto di una card
  function caroselloHtml(p) {
    var a = p.anteprimaCommenti || [];
    if (!a.length) return '';
    return '<div class="carosello-commenti" aria-hidden="true">' + a.map(function (c, i) {
      return '<div class="cc-item' + (i === 0 ? ' attivo' : '') + '">' + UI.avatar(c, 22) +
        '<span><b>' + esc(String(c.nome).split(' ')[0]) + '</b> ' + esc(c.testo) + '</span></div>';
    }).join('') + '</div>';
  }
  var timer = null;
  function avviaCaroselli(root) {
    if (timer) clearInterval(timer);
    var ridotto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer = setInterval(function () {
      if (!root.isConnected) { clearInterval(timer); timer = null; return; }
      if (ridotto || document.hidden) return;
      root.querySelectorAll('.carosello-commenti').forEach(function (car) {
        var it = car.querySelectorAll('.cc-item');
        if (it.length < 2) return;
        var i = Array.prototype.findIndex.call(it, function (x) { return x.classList.contains('attivo'); });
        it[i].classList.remove('attivo');
        it[(i + 1) % it.length].classList.add('attivo');
      });
    }, 3800);
  }

  return { monta: monta, apri: apri, caroselloHtml: caroselloHtml, avviaCaroselli: avviaCaroselli };
})();
