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
        (d.jointAttivo ? '<section class="classifica" id="classifica"></section>' : '') +
        '<div class="griglia-soci">' +
          d.soci.map(function (s) {
            return '<a class="card-socio' + (s.id === mioId ? ' io' : '') + '" href="#/soci/' + esc(s.id) + '">' +
              '<span class="testa">' + UI.avatar(s, 52) + UI.numero(s, 44) + '</span>' +
              '<span class="nome">' + (UI.nomeLogo(s) || esc(s.nome)) + (s.id === mioId ? ' <em>(tu)</em>' : '') + '</span>' +
              '<span class="riga"><span>Credito</span><b>' + UI.euro(s.credito) + '</b></span>' +
              (d.jointAttivo ? '<span class="riga"><span>Joint</span>' + UI.joint(s.joint) + '</span>' : '') +
            '</a>';
          }).join('') +
        '</div>';
      if (d.jointAttivo) classifica(view.querySelector('#classifica'), mioId);
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  // classifica Joint: podio dei primi tre e il resto in fila
  function classifica(el, mioId) {
    RanchAPI.getJoint().then(function (j) {
      if (!j.attivo || !j.classifica.length) { el.remove(); return; }
      var l = j.classifica, max = Math.max(1, l[0].joint);
      var podio = [l[1], l[0], l[2]].filter(Boolean);
      el.innerHTML = '<div class="classifica-testa"><h2>' + UI.foglia(22) + ' Classifica Joint</h2><span class="muted small">più Joint = più credito Ranch da gestire</span></div>' +
        '<div class="podio">' + podio.map(function (s) {
          var pos = l.indexOf(s) + 1;
          return '<a class="gradino g' + pos + (s.id === mioId ? ' io' : '') + '" href="#/soci/' + esc(s.id) + '">' +
            '<span class="medaglia">' + ['🥇', '🥈', '🥉'][pos - 1] + '</span>' + UI.avatar(s, pos === 1 ? 56 : 44) +
            '<span class="nome">' + esc(s.nome.split(' ')[0]) + '</span>' + UI.joint(s.joint) +
            '<span class="fatt-mini">' + UI.fattore(s.fattore) + '</span>' +
            '<span class="base"></span></a>';
        }).join('') + '</div>' +
        (l.length > 3 ? '<ol class="resto" start="4">' + l.slice(3).map(function (s) {
          return '<li' + (s.id === mioId ? ' class="io"' : '') + '><span class="pos"></span>' + UI.avatar(s, 26) + '<span class="nome">' + esc(s.nome) + '</span>' +
            '<span class="barretta"><span style="width:' + Math.round(s.joint / max * 100) + '%"></span></span>' + UI.joint(s.joint) +
            '<span class="fatt-mini">' + UI.fattore(s.fattore) + '</span></li>';
        }).join('') + '</ol>' : '') +
        '<details class="recap-joint"><summary>Recap: credito Ranch di ognuno</summary>' +
          '<p class="muted small">Fattore = (1 + Joint del socio ÷ ' + (j.jointTotali || 0) + ' Joint totali) × ' + UI.fattore(j.riequilibrio).slice(1) +
            ' di riequilibrio, così la somma resta uguale alla cassa. Credito Ranch = versato × fattore − già usato.</p>' +
          '<div class="tabella-wrap"><table class="tabella">' +
            '<thead><tr><th>Socio</th><th class="n">Versato</th><th class="n">Fattore</th><th class="n">Gestibile</th><th class="n">Credito</th></tr></thead><tbody>' +
            l.map(function (s) {
              return '<tr' + (s.id === mioId ? ' class="ora"' : '') + '><td>' + esc(s.nome.split(' ')[0]) +
                '<span class="sotto-voce">' + s.joint + ' Joint · ' + UI.pct(s.quota) + '</span></td>' +
                '<td class="n">' + UI.euro(s.versato) + '</td>' +
                '<td class="n"><b>' + UI.fattore(s.fattore) + '</b><span class="sotto-voce">(1+' + Number(s.quota).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ')×' +
                  Number(j.riequilibrio).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '</span></td>' +
                '<td class="n">' + UI.euro(s.gestibile) + '</td>' +
                '<td class="n"><b>' + UI.euro(s.credito) + '</b>' + (Number(s.speso) > 0.005 ? '<span class="sotto-voce">−' + UI.euro(s.speso) + ' usati</span>' : '') + '</td></tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</details>';
    }).catch(function () { el.remove(); });
  }

  var tendinaAperta = {}; // resta aperta dopo un pagamento
  function plurale(n, uno, tanti) { return n + ' ' + (n === 1 ? uno : tanti); }
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
              (UI.nomeLogo(s) ? '<h1 class="h1-logo">' + UI.nomeLogo(s) + '</h1><p class="nome-sotto">' + esc(s.nome) + '</p>' : '<h1>' + esc(s.nome) + '</h1>') +
              (s.dataIngresso ? '<p class="muted">Socio da ' + esc(UI.meseAnno(s.dataIngresso)) + '</p>' : '') +
              (s.bio ? '<p class="bio">' + esc(s.bio) + '</p>' : '') +
            '</div>' +
          '</div>' +
          (mia ? '<button type="button" class="btn" id="modifica">Modifica profilo' +
            (!(s.foto && s.numeroGara && s.bio) ? ' ' + UI.premio('profilo_completo') : '') + '</button>' +
            (!(s.foto && s.numeroGara && s.bio) && UI.premioPunti('profilo_completo') > 0 ? '<p class="muted small">Completa foto, numero e bio per guadagnare i Joint.</p>' : '') : '') +
          (mia && window.RanchInstalla && !window.RanchInstalla.standalone ?
            '<div class="installa-box"><span class="tg-ico"><img src="img/icone/icona-192.png" alt="" width="36" height="36"></span>' +
            '<span class="tg-testo"><b>Installa l\'app</b><small>Icona sulla Home, a schermo intero</small></span>' +
            '<button type="button" class="btn primario piccolo" id="installa">Installa</button></div>' : '') +
          (mia ? '<div class="telegram-box" id="telegram-box"></div>' : '') +
          '<div class="metriche">' +
            '<div class="metrica"><span>Credito disponibile</span><strong>' + UI.euro(s.credito) + '</strong></div>' +
            '<div class="metrica"><span>Totale investito</span><strong>' + UI.euro(s.investito) + '</strong></div>' +
          '</div>' +
          (rate.length ?
            '<details class="tendina-rate" id="tendina-rate"' + (tendinaAperta[s.id] ? ' open' : '') + '>' +
            '<summary><span class="tr-titolo"><b>Rate</b><span class="sotto-voce">' +
              (pendenti.length ? plurale(pendenti.length, 'rata', 'rate') + ' da pagare · ' + UI.euro(pendenti.reduce(function (t, r) { return t + Number(r.importo); }, 0)) : 'Tutte pagate ✓') +
            '</span></span><span class="tr-cta"><span class="tr-chiusa">Scopri le rate</span><span class="tr-aperta">Chiudi</span> <span class="tr-freccia" aria-hidden="true">›</span></span></summary>' +
            '<div class="tr-corpo">' +
            (pendenti.length ?
              '<ul class="elenco rate-socio">' + pendenti.map(function (r) {
                var vis = r.visibile !== false;
                return '<li' + (vis ? '' : ' class="nascosta"') + '><span><b>' + esc(r.titolo) + '</b><span class="sotto-voce">scade ' + esc(UI.data(r.scadenza)) +
                  (!vis ? ' · non ancora aperta' : r.scadenza < oggiIso ? ' · <span class="neg">scaduta</span>' : '') + '</span></span>' +
                  '<span class="rata-azione"><b>' + UI.euro(r.importo) + '</b>' +
                  (vis && (mia || admin) && r.scadenza >= oggiIso ? UI.premio('rata_in_tempo') : '') +
                  (vis && (mia || admin) ? '<button type="button" class="btn primario piccolo" data-paga="' + esc(r.id) + '|' + esc(s.id) + '">' + (mia ? 'Pagata' : 'Segna pagata') + '</button>' : '') +
                  '</span></li>';
              }).join('') + '</ul>' +
              '<p class="muted small">Da pagare: <b>' + UI.euro(pendenti.reduce(function (t, r) { return t + Number(r.importo); }, 0)) + '</b></p>'
              : '<p class="muted">Tutte le rate sono pagate. ✓</p>') +
            (pagate.length ?
              '<details class="rate-pagate"><summary>' + pagate.length + (pagate.length === 1 ? ' rata pagata' : ' rate pagate') + '</summary><ul class="elenco">' +
              pagate.map(function (r) {
                return '<li><span>' + esc(r.titolo) + '<span class="sotto-voce pos">✓ pagata il ' + esc(UI.data(r.pagataIl)) + '</span></span><b>' + UI.euro(r.importo) + '</b></li>';
              }).join('') + '</ul></details>' : '') +
            '</div></details>'
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

      var tendina = view.querySelector('#tendina-rate');
      if (tendina) tendina.addEventListener('toggle', function () { tendinaAperta[s.id] = tendina.open; });
      Cassa.collegaPagamenti(view, rate.map(function (r) {
        return { id: r.id, titolo: r.titolo, importo: r.importo, soci: [{ id: s.id, nome: s.nome, pagataIl: r.pagataIl }] };
      }), ctx, function () { scheda(view, id, ctx); });
      if (mia) boxTelegram(view.querySelector('#telegram-box'), ctx);
      var bi = view.querySelector('#installa');
      if (bi) bi.addEventListener('click', istruzioniInstalla);
      if (mia) {
        view.querySelector('#modifica').addEventListener('click', function () {
          modificaProfilo(s, ctx, function () { scheda(view, id, ctx); });
        });
      }
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  function istruzioniInstalla() {
    var I = window.RanchInstalla || {};
    if (I.prompt) {   // Android / Chrome: finestra di installazione del browser
      I.prompt.prompt();
      I.prompt.userChoice.then(function (r) { if (r.outcome === 'accepted') UI.toast('App installata 🎉'); I.prompt = null; });
      return;
    }
    var safari = I.ios && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    var passi = I.ios
      ? ['Tocca <b>Condividi</b> <span class="ico-share">⬆︎</span> in basso' + (safari ? '' : ' (o nel menu del browser)'),
         'Scorri e scegli <b>Aggiungi alla schermata Home</b>',
         'Conferma con <b>Aggiungi</b>: trovi l\'icona Ranch sulla Home']
      : ['Apri il menu del browser <b>⋮</b> in alto a destra',
         'Scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>)',
         'Conferma: trovi l\'icona Ranch tra le app'];
    var w = document.createElement('div');
    w.className = 'modal-bg';
    w.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Installa l\'app">' +
      '<h2>📲 Installa l\'app Ranch</h2><ol class="passi-installa">' + passi.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>' +
      (I.ios ? '<p class="muted small">Fallo da questa pagina: l\'app si aprirà già con il tuo profilo.</p>' : '') +
      '<div class="azioni"><button type="button" class="btn primario" data-a="no">Ho capito</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (e) { if (e.target === w || e.target.getAttribute('data-a') === 'no') w.remove(); });
  }

  var ICONA_TG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21.5 4.2 2.9 11.4c-1 .4-1 1.6 0 1.9l4.6 1.5 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6l3.2-15c.2-.9-.7-1.6-1.5-1.2zM9.7 14.4l-.5 3.4-1.1-3.6 9.6-6.3-8 6.5z" fill="currentColor"/></svg>';
  function boxTelegram(box, ctx) {
    if (!box) return;
    RanchAPI.telegramStato(ctx.k).then(function (st) {
      box.innerHTML = st.collegato
        ? '<span class="tg-ico">' + ICONA_TG + '</span><span class="tg-testo"><b>Telegram collegato</b><small>Ricevi gli avvisi su @' + esc(st.bot || '') + '</small></span>' +
          '<button type="button" class="btn piccolo" id="tg-off">Scollega</button>'
        : '<span class="tg-ico">' + ICONA_TG + '</span><span class="tg-testo"><b>Avvisi su Telegram</b><small>Rate, progetti ed eventi direttamente in chat</small></span>' +
          '<button type="button" class="btn primario piccolo" id="tg-on">Collega</button>';
      box.classList.toggle('on', !!st.collegato);
      var on = box.querySelector('#tg-on'), off = box.querySelector('#tg-off');
      if (on) on.addEventListener('click', function () {
        on.disabled = true; on.textContent = 'Apro Telegram…';
        RanchAPI.telegramCollega(ctx.k).then(function (r) {
          UI.toast('Premi "Avvia" nella chat del bot');
          setTimeout(function () { boxTelegram(box, ctx); }, 4000);
          window.location.href = r.url;
        }).catch(function (e) { on.disabled = false; on.textContent = 'Collega'; UI.toast(e.message); });
      });
      if (off) off.addEventListener('click', function () {
        RanchAPI.telegramScollega(ctx.k).then(function () { UI.toast('Telegram scollegato'); boxTelegram(box, ctx); });
      });
    }).catch(function () { box.hidden = true; });
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
