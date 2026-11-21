// Sezione Soci: elenco e scheda, con modifica del proprio profilo.
window.Soci = (function () {
  var esc = UI.esc;

  function lista(view, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getSoci().then(function (d) {
      var mioId = ctx.me && ctx.me.id;
      view.innerHTML =
        '<div class="metriche">' +
          '<div class="metrica"><span>Soci</span><strong>' + d.totali.soci + '</strong></div>' +
          '<div class="metrica"><span>Credito disponibile</span><strong>' + UI.euro(d.totali.credito) + '</strong></div>' +
        '</div>' +
        '<div class="griglia-soci">' +
          d.soci.map(function (s) {
            return '<a class="card-socio' + (s.id === mioId ? ' io' : '') + '" href="#/soci/' + esc(s.id) + '">' +
              UI.avatar(s, 48) +
              '<span class="nome">' + esc(s.nome) + (s.id === mioId ? ' <em>(tu)</em>' : '') + '</span>' +
              (s.numeroGara ? '<span class="numero">#' + esc(s.numeroGara) + '</span>' : '<span class="numero vuoto">senza numero</span>') +
              '<span class="riga"><span>Credito</span><b>' + UI.euro(s.credito) + '</b></span>' +
              '<span class="riga"><span>Investito</span><b>' + UI.euro(s.investito) + '</b></span>' +
            '</a>';
          }).join('') +
        '</div>';
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  function scheda(view, id, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getSocio(id).then(function (d) {
      var s = d.socio;
      var mia = ctx.me && ctx.me.id === s.id;
      view.innerHTML =
        '<a class="indietro" href="#/soci">← Tutti i soci</a>' +
        '<section class="scheda">' +
          '<div class="testata">' +
            '<div class="foto-wrap">' + UI.avatar(s, 88) + '</div>' +
            '<div class="dati">' +
              '<h1>' + esc(s.nome) + '</h1>' +
              '<p class="muted">' + (s.numeroGara ? 'Numero di gara <b>#' + esc(s.numeroGara) + '</b> · ' : '') +
                (s.dataIngresso ? 'Socio da ' + esc(UI.meseAnno(s.dataIngresso)) : '') + '</p>' +
              (s.bio ? '<p class="bio">' + esc(s.bio) + '</p>' : '') +
            '</div>' +
          '</div>' +
          (mia ? '<button type="button" class="btn" id="modifica">Modifica profilo</button>' : '') +
          '<div class="metriche">' +
            '<div class="metrica"><span>Credito disponibile</span><strong>' + UI.euro(s.credito) + '</strong></div>' +
            '<div class="metrica"><span>Totale investito</span><strong>' + UI.euro(s.investito) + '</strong></div>' +
          '</div>' +
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
        '<label class="campo"><span>Numero di gara</span>' +
          '<input name="numeroGara" type="number" inputmode="numeric" min="1" max="999" placeholder="23" value="' + esc(s.numeroGara || '') + '"></label>' +
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
    form.numeroGara.addEventListener('input', function () { err.hidden = true; });
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
      RanchAPI.aggiornaProfilo(ctx.k, { numeroGara: num, bio: bio.value.trim() }).then(function () {
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
