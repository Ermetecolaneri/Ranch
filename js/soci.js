// Sezione Soci: elenco e scheda, con modifica del proprio profilo.
window.Soci = (function () {
  var esc = UI.esc;

  function lista(view, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getSoci().then(function (d) {
      var mioId = ctx.me && ctx.me.id;
      view.innerHTML =
        '<div class="metriche una">' +
          '<div class="metrica"><span>Fondocassa</span><strong>' + UI.euro(d.totali.credito) + '</strong></div>' +
        '</div>' +
        '<div class="griglia-soci">' +
          d.soci.map(function (s) {
            return '<a class="card-socio' + (s.id === mioId ? ' io' : '') + '" href="#/soci/' + esc(s.id) + '">' +
              '<span class="testa">' + UI.avatar(s, 52) + UI.numero(s, 44) + '</span>' +
              '<span class="nome">' + esc(s.nome) + (s.id === mioId ? ' <em>(tu)</em>' : '') + '</span>' +
              '<span class="riga"><span>Credito</span><b>' + UI.euro(s.credito) + '</b></span>' +
            '</a>';
          }).join('') +
        '</div>';
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  function scheda(view, id, ctx) {
    view.innerHTML = UI.caricamento();
    Promise.all([RanchAPI.getSocio(id), RanchAPI.getRateSocio(id).catch(function () { return []; })]).then(function (res) {
      var d = res[0], s = d.socio, rate = res[1];
      var admin = !!(ctx.me && ctx.me.admin);
      var pendenti = rate.filter(function (r) { return !r.pagataIl; }), pagate = rate.filter(function (r) { return r.pagataIl; });
      var oggiIso = new Date().toISOString().slice(0, 10);
      var mia = ctx.me && ctx.me.id === s.id;
      view.innerHTML =
        '<a class="indietro" href="#/soci">← Tutti i soci</a>' +
        '<section class="scheda">' +
          '<div class="testata">' +
            '<div class="foto-wrap">' + UI.avatar(s, 88) + UI.numero(s, 64) + '</div>' +
            '<div class="dati">' +
              '<h1>' + esc(s.nome) + '</h1>' +
              (s.dataIngresso ? '<p class="muted">Socio da ' + esc(UI.meseAnno(s.dataIngresso)) + '</p>' : '') +
              (s.bio ? '<p class="bio">' + esc(s.bio) + '</p>' : '') +
            '</div>' +
          '</div>' +
          (mia ? '<button type="button" class="btn" id="modifica">Modifica profilo</button>' : '') +
          '<div class="metriche">' +
            '<div class="metrica"><span>Credito disponibile</span><strong>' + UI.euro(s.credito) + '</strong></div>' +
            '<div class="metrica"><span>Totale investito</span><strong>' + UI.euro(s.investito) + '</strong></div>' +
          '</div>' +
          (rate.length ?
            '<h2>Rate</h2>' +
            (pendenti.length ?
              '<ul class="elenco rate-socio">' + pendenti.map(function (r) {
                var vis = r.visibile !== false;
                return '<li' + (vis ? '' : ' class="nascosta"') + '><span><b>' + esc(r.titolo) + '</b><span class="sotto-voce">scade ' + esc(UI.data(r.scadenza)) +
                  (!vis ? ' · non ancora aperta' : r.scadenza < oggiIso ? ' · <span class="neg">scaduta</span>' : '') + '</span></span>' +
                  '<span class="rata-azione"><b>' + UI.euro(r.importo) + '</b>' +
                  (vis && (mia || admin) ? '<button type="button" class="btn primario piccolo" data-paga="' + esc(r.id) + '|' + esc(s.id) + '">' + (mia ? 'Pagata' : 'Segna pagata') + '</button>' : '') +
                  '</span></li>';
              }).join('') + '</ul>' +
              '<p class="muted small">Da pagare: <b>' + UI.euro(pendenti.reduce(function (t, r) { return t + Number(r.importo); }, 0)) + '</b></p>'
              : '<p class="muted">Tutte le rate sono pagate. ✓</p>') +
            (pagate.length ?
              '<details class="rate-pagate"><summary>' + pagate.length + (pagate.length === 1 ? ' rata pagata' : ' rate pagate') + '</summary><ul class="elenco">' +
              pagate.map(function (r) {
                return '<li><span>' + esc(r.titolo) + '<span class="sotto-voce pos">✓ pagata il ' + esc(UI.data(r.pagataIl)) + '</span></span><b>' + UI.euro(r.importo) + '</b></li>';
              }).join('') + '</ul></details>' : '')
            : '') +
          '<h2>Progetti finanziati</h2>' +
          (d.progetti.length ?
            '<ul class="elenco">' + d.progetti.map(function (p) {
              return '<li><span>' + esc(p.nome) + '</span><span class="muted">' + p.quote + (p.quote === 1 ? ' quota' : ' quote') +
                ' · ' + UI.euro(p.importo) + '</span></li>';
            }).join('') + '</ul>'
            : '<p class="muted">Nessun progetto finanziato.</p>') +
          '<h2>Ultimi movimenti</h2>' +
          (d.movimenti.length ?
            '<ul class="elenco">' + d.movimenti.map(function (m) {
              var testo = m.progetto ? m.progetto + (m.causale ? ', ' + m.causale : '') : m.causale || m.tipo;
              return '<li><span><span class="muted data">' + UI.data(m.data) + '</span> ' + esc(testo) + '</span>' +
                '<b class="' + (m.importo > 0 ? 'pos' : '') + '">' + UI.euroSegno(m.importo) + '</b></li>';
            }).join('') + '</ul>'
            : '<p class="muted">Nessun movimento.</p>') +
        '</section>';

      Cassa.collegaPagamenti(view, rate.map(function (r) {
        return { id: r.id, titolo: r.titolo, importo: r.importo, soci: [{ id: s.id, nome: s.nome, pagataIl: r.pagataIl }] };
      }), ctx, function () { scheda(view, id, ctx); });
      if (mia) {
        view.querySelector('#modifica').addEventListener('click', function () {
          modificaProfilo(s, ctx, function () { scheda(view, id, ctx); });
        });
      }
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  function modificaProfilo(s, ctx, aggiorna) {
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<form class="modal" role="dialog" aria-modal="true" aria-label="Modifica profilo" novalidate>' +
        '<h2>Modifica profilo</h2>' +
        '<div class="foto-riga"><span id="anteprima">' + UI.avatar(s, 72) + '</span>' +
          '<label class="btn">Cambia foto<input type="file" accept="image/*" hidden></label></div>' +
        '<fieldset class="numero-editor">' +
          '<legend>Numero di gara</legend>' +
          '<div class="numero-riga">' +
            '<input name="numeroGara" type="number" inputmode="numeric" min="1" max="999" placeholder="23" value="' + esc(s.numeroGara || '') + '" aria-label="Numero di gara">' +
            '<span class="numero-anteprima" id="anteprima-num"></span>' +
          '</div>' +
          '<p class="sotto">Stile</p>' +
          '<div class="scelte-font">' + Object.keys(UI.FONT_NUMERO).map(function (f) {
            return '<label class="scelta-font"><input type="radio" name="numeroFont" value="' + f + '"' +
              ((s.numeroFont || 'corsa') === f ? ' checked' : '') + '>' +
              '<span class="nf-' + f + '">' + UI.FONT_NUMERO[f].nome + '</span></label>';
          }).join('') + '</div>' +
          '<p class="sotto">Colore</p>' +
          '<div class="scelte-colore">' + Object.keys(UI.COLORI_NUMERO).map(function (c) {
            return '<label class="scelta-colore" title="' + c + '"><input type="radio" name="numeroColore" value="' + c + '"' +
              ((s.numeroColore || 'rosso') === c ? ' checked' : '') + ' aria-label="' + c + '">' +
              '<span style="background:' + UI.COLORI_NUMERO[c] + '"></span></label>';
          }).join('') + '</div>' +
        '</fieldset>' +
        '<label class="campo"><span>Bio <em class="muted" id="cont"></em></span>' +
          '<textarea name="bio" rows="3" maxlength="200" placeholder="Curva La Parente in terza piena.">' + esc(s.bio) + '</textarea></label>' +
        '<p class="errore" id="err" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
          '<button type="submit" class="btn primario">Salva</button></div>' +
      '</form>';
    document.body.appendChild(wrap);

    var form = wrap.querySelector('form');
    var err = wrap.querySelector('#err');
    var bio = form.bio, cont = wrap.querySelector('#cont');
    function conta() { cont.textContent = bio.value.length + '/200'; }
    bio.addEventListener('input', function () { conta(); err.hidden = true; });
    function valoreRadio(nome) { var r = form.querySelector('input[name=' + nome + ']:checked'); return r ? r.value : ''; }
    function anteprimaNumero() {
      var n = form.numeroGara.value.trim();
      wrap.querySelector('#anteprima-num').innerHTML = n
        ? UI.numero({ numeroGara: n, numeroFont: valoreRadio('numeroFont'), numeroColore: valoreRadio('numeroColore') }, 56)
        : '<span class="muted small">Scrivi un numero per vedere l\'anteprima</span>';
    }
    form.numeroGara.addEventListener('input', function () { err.hidden = true; anteprimaNumero(); });
    form.addEventListener('change', function (e) { if (/^numero(Font|Colore)$/.test(e.target.name)) anteprimaNumero(); });
    anteprimaNumero();
    conta();

    function mostraErrore(msg) { err.textContent = msg; err.hidden = false; }
    var cambiato = false;
    function chiudi() { wrap.remove(); if (cambiato) aggiorna(); }

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.getAttribute('data-a') === 'no') chiudi();
    });

    wrap.querySelector('input[type=file]').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      Cropper.open(file).then(function (dataUrl) {
        if (!dataUrl) return;
        wrap.querySelector('#anteprima').innerHTML = UI.avatar({ id: s.id, nome: s.nome, foto: dataUrl }, 72);
        return RanchAPI.caricaFoto(ctx.k, dataUrl).then(function (r) {
          s.foto = r.foto;
          cambiato = true;
          if (ctx.me) { ctx.me.foto = r.foto; ctx.aggiornaMe(); }
          UI.toast('Foto aggiornata');
        });
      }).catch(function (e2) { mostraErrore(e2.message || 'Caricamento non riuscito. Riprova.'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var num = form.numeroGara.value.trim();
      if (num && !/^\d{1,3}$/.test(num)) return mostraErrore('Il numero di gara va da 1 a 999.');
      if (num && (Number(num) < 1 || Number(num) > 999)) return mostraErrore('Il numero di gara va da 1 a 999.');
      if (bio.value.trim().length > 200) return mostraErrore('La bio può avere al massimo 200 caratteri.');
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Salvataggio…';
      RanchAPI.aggiornaProfilo(ctx.k, { numeroGara: num, bio: bio.value.trim(),
        numeroFont: valoreRadio('numeroFont'), numeroColore: valoreRadio('numeroColore') }).then(function () {
        cambiato = true;
        UI.toast('Profilo salvato');
        chiudi();
      }).catch(function (e2) {
        btn.disabled = false;
        btn.textContent = 'Salva';
        mostraErrore(e2.message || 'Salvataggio non riuscito. Riprova.');
      });
    });
  }

  return { lista: lista, scheda: scheda };
})();
