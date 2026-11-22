// Sezione Eventi: li gestisce solo l'admin. Da programmare = date candidate con cuori (anche più di uno a testa).
window.Eventi = (function () {
  var esc = UI.esc;
  var CUORE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.1C1 8.3 2.9 4.5 6.6 4.5c2.2 0 3.9 1.3 5.4 3.3 1.5-2 3.2-3.3 5.4-3.3 3.7 0 5.6 3.8 4.2 6.9-2.1 4.5-9.6 9.1-9.6 9.1z"/></svg>';
  var CAL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function badge(e) {
    if (e.concluso) return '<span class="badge st-scaduto">Concluso</span>';
    if (e.stato === 'programmato') return '<span class="badge st-chiuso">Programmato</span>';
    return '<span class="badge st-sviluppo">Da programmare</span>';
  }
  function foto(e, cls) {
    if (e.foto) return '<img class="' + cls + '" src="' + esc(e.foto) + '" alt="" loading="lazy">';
    return '<div class="' + cls + ' foto-vuota evento" aria-hidden="true"><span>' + CAL.replace(/18/g, '64') + '</span></div>';
  }
  function plurale(n, uno, molti) { return n + ' ' + (n === 1 ? uno : molti); }
  function totaleVoti(e) { return e.date.reduce(function (t, d) { return t + d.voti; }, 0); }

  // ---------- elenco ----------
  function lista(view, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getEventi(ctx.k).then(function (l) {
      var admin = ctx.me && ctx.me.admin;
      view.innerHTML =
        (admin ? '<div class="azioni-sezione"><button type="button" class="btn primario" id="nuovo-ev">+ Nuovo evento</button></div>' : '') +
        (l.length ? '<div class="griglia-progetti">' + l.map(function (e) {
          var quando = e.stato === 'programmato'
            ? '<p class="quando">' + CAL + '<span>' + esc(UI.intervallo(e.dataInizio, e.dataFine)) + '</span></p>'
            : '<p class="quando proposte">' + CAL + '<span>' + plurale(e.date.length, 'data proposta', 'date proposte') + ' · ' +
                plurale(totaleVoti(e), 'preferenza', 'preferenze') + '</span></p>' +
              '<div class="mini-date">' + e.date.slice(0, 4).map(function (d) {
                var g = UI.giornoBreve(d.dataInizio);
                return '<span class="mini-data' + (d.mioVoto ? ' mia' : '') + '"><b>' + g.giorno + '</b> ' + esc(g.mese) + (d.voti ? ' · ♥ ' + d.voti : '') + '</span>';
              }).join('') + (e.date.length > 4 ? '<span class="mini-data">+' + (e.date.length - 4) + '</span>' : '') + '</div>';
          return '<a class="card-progetto card-evento' + (e.concluso ? ' passato' : '') + '" href="#/eventi/' + esc(e.id) + '">' +
            '<div class="foto-box">' + foto(e, 'foto-progetto') + badge(e) + '</div>' +
            '<div class="corpo"><h2>' + esc(e.titolo) + '</h2>' +
              (e.descrizione ? '<p class="descr">' + esc(e.descrizione) + '</p>' : '') + quando +
            '</div></a>';
        }).join('') + '</div>'
        : '<div class="vuoto"><h2>Nessun evento per ora</h2><p class="muted">' + (admin ? 'Crea il primo evento del ranch.' : 'Quando ci saranno eventi li troverai qui.') + '</p></div>');
      var b = view.querySelector('#nuovo-ev');
      if (b) b.addEventListener('click', function () { form(ctx, null); });
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  // ---------- dettaglio ----------
  function scheda(view, id, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getEvento(id, ctx.k).then(function (e) {
      var admin = ctx.me && ctx.me.admin;
      var maxVoti = Math.max.apply(null, [0].concat(e.date.map(function (d) { return d.voti; })));
      view.innerHTML =
        '<a class="indietro" href="#/eventi">← Tutti gli eventi</a>' +
        '<article class="dettaglio-progetto">' +
          '<div class="foto-box grande">' + foto(e, 'foto-progetto') + badge(e) + '</div>' +
          '<div class="corpo">' +
            '<h1>' + esc(e.titolo) + '</h1>' +
            (e.stato === 'programmato' ? '<p class="quando grande">' + CAL + '<span>' + esc(UI.intervallo(e.dataInizio, e.dataFine)) + '</span></p>' : '') +
            (e.descrizione ? '<p class="descr-lunga">' + esc(e.descrizione) + '</p>' : '') +
            (e.stato === 'da_programmare' ?
              '<h2>Quando ti va bene?</h2>' +
              '<p class="muted small">' + (ctx.me ? 'Tocca il cuore su tutte le date in cui puoi esserci.' +
                (e.date.some(function (d) { return d.mioVoto; }) ? '' : ' ' + UI.premio('voto_evento')) : 'Apri il tuo link personale per scegliere le date.') + '</p>' +
              '<ul class="date-candidate">' + e.date.map(function (d) {
                var g = UI.giornoBreve(d.dataInizio);
                return '<li' + (d.voti && d.voti === maxVoti ? ' class="top"' : '') + '>' +
                  '<div class="cal"><span>' + esc(g.sett) + '</span><b>' + g.giorno + '</b><span>' + esc(g.mese) + '</span></div>' +
                  '<div class="info"><p>' + esc(UI.intervallo(d.dataInizio, d.dataFine)) + '</p>' +
                    (d.voti && d.voti === maxVoti ? '<p class="small piu-votata">La più scelta</p>' : '') +
                    '<div class="votanti">' + d.votanti.slice(0, 7).map(function (s) {
                      return '<span title="' + esc(s.nome) + '">' + UI.avatar(s, 24) + '</span>';
                    }).join('') + (d.votanti.length > 7 ? '<em>+' + (d.votanti.length - 7) + '</em>' : '') + '</div>' +
                    (admin ? '<button type="button" class="btn piccolo" data-fissa="' + esc(d.id) + '">Fissa questa data</button>' : '') +
                  '</div>' +
                  '<button type="button" class="cuore-data' + (d.mioVoto ? ' acceso' : '') + '" data-voto="' + esc(d.id) + '" aria-pressed="' + !!d.mioVoto + '" ' +
                    'aria-label="' + (d.mioVoto ? 'Togli il cuore da ' : 'Metti il cuore su ') + esc(UI.intervallo(d.dataInizio, d.dataFine)) + '">' + CUORE + '<span>' + d.voti + '</span></button>' +
                '</li>';
              }).join('') + '</ul>'
            : '') +
            (admin ? '<div class="box-admin"><h2>Gestione <span class="muted small">(solo admin)</span></h2>' +
              '<div class="riga-btn"><button type="button" class="btn" id="mod-ev">Modifica evento</button>' +
              '<button type="button" class="btn pericolo" id="del-ev">Elimina evento</button></div>' +
              '<p class="errore" id="err-ev" hidden></p></div>' : '') +
          '</div>' +
        '</article>';

      view.querySelectorAll('[data-voto]').forEach(function (b) {
        b.addEventListener('click', function () { vota(b, ctx, view, e.id); });
      });
      view.querySelectorAll('[data-fissa]').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = e.date.filter(function (x) { return x.id === b.getAttribute('data-fissa'); })[0];
          conferma('Fissare questa data?', '“' + esc(e.titolo) + '” diventa programmato per <b>' + esc(UI.intervallo(d.dataInizio, d.dataFine)) + '</b>. Le preferenze non si potranno più cambiare.', 'Fissa', function () {
            RanchAPI.adminEventoFissa(ctx.k, d.id).then(function () { UI.toast('Evento programmato'); scheda(view, e.id, ctx); })
              .catch(function (er) { mostraErrore(view, er.message); });
          });
        });
      });
      if (admin) {
        view.querySelector('#mod-ev').addEventListener('click', function () { form(ctx, e); });
        view.querySelector('#del-ev').addEventListener('click', function () {
          conferma('Eliminare “' + esc(e.titolo) + '”?', 'L\'evento e le preferenze sulle date vengono cancellati.', 'Elimina', function () {
            RanchAPI.adminEventoElimina(ctx.k, e.id).then(function () { UI.toast('Evento eliminato'); location.hash = '#/eventi'; })
              .catch(function (er) { mostraErrore(view, er.message); });
          }, true);
        });
      }
    }).catch(function (er) { view.innerHTML = UI.errore(er); });
  }
  function mostraErrore(view, m) { var el = view.querySelector('#err-ev'); if (el) { el.textContent = m; el.hidden = false; } else UI.toast(m); }

  function vota(b, ctx, view, idEvento) {
    if (!ctx.me) { UI.toast('Apri il tuo link personale per scegliere le date'); return; }
    if (b.classList.contains('attesa')) return;
    b.classList.add('attesa');
    var on = !b.classList.contains('acceso');
    b.classList.toggle('acceso', on);
    if (on) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    RanchAPI.votaData(ctx.k, b.getAttribute('data-voto')).then(function () {
      setTimeout(function () { scheda(view, idEvento, ctx); }, on ? 300 : 0); // ricarica per aggiornare avatar e "più scelta"
    }).catch(function (er) {
      b.classList.toggle('acceso', !on);
      b.classList.remove('attesa');
      UI.toast(er.message || 'Non riuscito, riprova');
    });
  }

  // ---------- creazione e modifica (admin) ----------
  function form(ctx, e) {
    var nuovo = !e, nuovaFoto = null;
    var stato = e ? e.stato : 'da_programmare';
    var date = e && e.date.length ? e.date.map(function (d) { return { id: d.id, dataInizio: d.dataInizio, dataFine: d.dataFine === d.dataInizio ? '' : d.dataFine, voti: d.voti }; })
                                  : [{ dataInizio: '', dataFine: '' }];
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<form class="modal largo" role="dialog" aria-modal="true" aria-label="' + (nuovo ? 'Nuovo evento' : 'Modifica evento') + '" novalidate>' +
        '<h2>' + (nuovo ? 'Nuovo evento' : 'Modifica evento') + '</h2>' +
        '<div class="foto-box modulo" id="ante-ev">' + foto(e || {}, 'foto-progetto') + '</div>' +
        '<label class="btn">' + (e && e.foto ? 'Cambia foto' : 'Scegli foto') + '<input type="file" accept="image/*" hidden></label>' +
        '<label class="campo"><span>Titolo</span><input name="titolo" maxlength="80" placeholder="Gara sociale d\'inverno" value="' + esc(e ? e.titolo : '') + '"></label>' +
        '<label class="campo"><span>Descrizione</span><textarea name="descrizione" rows="3" maxlength="1000" placeholder="Programma, cosa portare, dove ci si trova.">' + esc(e ? e.descrizione : '') + '</textarea></label>' +
        '<div class="segmenti" role="group" aria-label="Stato">' +
          '<button type="button" class="btn" data-st="da_programmare">Da programmare</button>' +
          '<button type="button" class="btn" data-st="programmato">Programmato</button>' +
        '</div>' +
        '<div id="blocco-prog" class="due">' +
          '<label class="campo"><span>Inizio</span><input name="dataInizio" type="date" value="' + esc(e && e.dataInizio || '') + '"></label>' +
          '<label class="campo"><span>Fine <em class="muted">se dura più giorni</em></span><input name="dataFine" type="date" value="' + esc(e && e.dataFine && e.dataFine !== e.dataInizio ? e.dataFine : '') + '"></label>' +
        '</div>' +
        '<div id="blocco-date">' +
          '<p class="muted small">Date tra cui i soci possono scegliere (anche più di una a testa).</p>' +
          '<div id="righe-date"></div>' +
          '<button type="button" class="btn piccolo" id="agg-data">+ Aggiungi data</button>' +
        '</div>' +
        '<p class="errore" id="err-fe" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
          '<button type="submit" class="btn primario">' + (nuovo ? 'Crea evento' : 'Salva') + '</button></div>' +
      '</form>';
    document.body.appendChild(wrap);
    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-fe');
    function errore(m) { err.textContent = m; err.hidden = false; }

    function leggiDate() {
      wrap.querySelectorAll('.riga-data').forEach(function (r, i) {
        date[i].dataInizio = r.querySelector('[data-k=i]').value;
        date[i].dataFine = r.querySelector('[data-k=f]').value;
      });
    }
    function disegnaDate() {
      wrap.querySelector('#righe-date').innerHTML = date.map(function (d, i) {
        return '<div class="riga-data">' +
          '<label><span class="muted small">Dal</span><input type="date" data-k="i" value="' + esc(d.dataInizio || '') + '"></label>' +
          '<label><span class="muted small">Al <em>(facoltativo)</em></span><input type="date" data-k="f" value="' + esc(d.dataFine || '') + '"></label>' +
          '<button type="button" class="btn piccolo togli" data-togli="' + i + '" aria-label="Togli questa data">×</button>' +
          (d.voti ? '<span class="muted small voti-n">♥ ' + d.voti + '</span>' : '') +
        '</div>';
      }).join('');
    }
    function disegnaStato() {
      f.querySelectorAll('[data-st]').forEach(function (b) {
        var on = b.getAttribute('data-st') === stato;
        b.classList.toggle('attivo', on); b.setAttribute('aria-pressed', on);
      });
      wrap.querySelector('#blocco-prog').hidden = stato !== 'programmato';
      wrap.querySelector('#blocco-date').hidden = stato !== 'da_programmare';
    }
    disegnaDate(); disegnaStato();

    wrap.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t === wrap || t.getAttribute('data-a') === 'no') { wrap.remove(); return; }
      if (t.getAttribute('data-st')) { stato = t.getAttribute('data-st'); err.hidden = true; disegnaStato(); }
      if (t.id === 'agg-data') { leggiDate(); date.push({ dataInizio: '', dataFine: '' }); disegnaDate(); }
      if (t.hasAttribute('data-togli')) {
        leggiDate();
        var i = Number(t.getAttribute('data-togli'));
        var via = function () { date.splice(i, 1); if (!date.length) date.push({ dataInizio: '', dataFine: '' }); disegnaDate(); };
        if (date[i].voti) conferma('Togliere questa data?', 'Ha già ' + plurale(date[i].voti, 'preferenza', 'preferenze') + ' che verranno perse.', 'Togli', via, true);
        else via();
      }
    });
    f.addEventListener('input', function () { err.hidden = true; });
    wrap.querySelector('input[type=file]').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; ev.target.value = '';
      if (!file) return;
      Cropper.open(file, { larghezza: 1600, altezza: 900, tondo: false, qualita: 0.82 }).then(function (url) {
        if (!url) return;
        nuovaFoto = url;
        wrap.querySelector('#ante-ev').innerHTML = '<img class="foto-progetto" src="' + url + '" alt="">';
      }).catch(function (er) { errore(er.message); });
    });

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      leggiDate();
      var titolo = f.titolo.value.trim();
      if (!titolo) return errore('Scrivi un titolo.');
      var dati = { titolo: titolo, descrizione: f.descrizione.value.trim(), stato: stato };
      if (stato === 'programmato') {
        if (!f.dataInizio.value) return errore('Scegli la data di inizio.');
        if (f.dataFine.value && f.dataFine.value < f.dataInizio.value) return errore('La data di fine non può essere prima dell\'inizio.');
        dati.dataInizio = f.dataInizio.value; dati.dataFine = f.dataFine.value || f.dataInizio.value;
      }
      var valide = date.filter(function (d) { return d.dataInizio; });
      if (date.some(function (d) { return d.dataFine && d.dataInizio && d.dataFine < d.dataInizio; })) return errore('In una data proposta la fine è prima dell\'inizio.');
      if (stato === 'da_programmare' && !valide.length) return errore('Aggiungi almeno una data da proporre.');
      // le date candidate si conservano anche se l'evento viene programmato a mano
      dati.date = valide.map(function (d) { return { id: d.id || '', dataInizio: d.dataInizio, dataFine: d.dataFine || d.dataInizio }; });
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Salvataggio…';
      RanchAPI.adminEventoSalva(ctx.k, e ? e.id : null, dati).then(function (r) {
        if (!nuovaFoto) return r;
        btn.textContent = 'Caricamento foto…';
        return RanchAPI.caricaFotoEvento(ctx.k, r.id, nuovaFoto).then(function () { return r; }, function () {
          UI.toast('Evento salvato, ma la foto non è stata caricata. Riprova da Modifica.'); return r;
        });
      }).then(function (r) {
        wrap.remove();
        UI.toast(nuovo ? 'Evento creato' : 'Evento salvato');
        var dest = '#/eventi/' + r.id;
        if (location.hash === dest) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = dest;
      }).catch(function (er) {
        btn.disabled = false; btn.textContent = nuovo ? 'Crea evento' : 'Salva';
        errore(er.message || 'Salvataggio non riuscito. Riprova.');
      });
    });
  }

  function conferma(titolo, testoHtml, etichetta, siFn, pericolo) {
    var w = document.createElement('div');
    w.className = 'modal-bg';
    w.innerHTML = '<div class="modal" role="alertdialog" aria-modal="true" aria-label="' + titolo.replace(/<[^>]+>/g, '') + '">' +
      '<h2>' + titolo + '</h2><p>' + testoHtml + '</p>' +
      '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
      '<button type="button" class="btn ' + (pericolo ? 'pericolo-pieno' : 'primario') + '" data-a="si">' + esc(etichetta) + '</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (ev.target === w || a === 'no') w.remove();
      if (a === 'si') { w.remove(); siFn(); }
    });
  }

  return { lista: lista, scheda: scheda };
})();
