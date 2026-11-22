// Pagina admin: crediti, soci, storico. Visibile e utilizzabile solo dall'admin (riconosciuto dal link personale).
window.Admin = (function () {
  var esc = UI.esc;
  var SCHEDE = { crediti: 'Crediti', soci: 'Soci', storico: 'Storico', messaggi: 'Messaggi' };
  var TIPI = { accredito: 'Accredito', addebito: 'Addebito', acquisto: 'Acquisto', storno: 'Storno', rimborso: 'Rimborso' };
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  function mostra(view, scheda, ctx) {
    if (!ctx.me || !ctx.me.admin) {
      view.innerHTML = '<p class="muted pad">Questa pagina è riservata all\'admin.</p>';
      return;
    }
    scheda = SCHEDE[scheda] ? scheda : 'crediti';
    view.innerHTML = UI.caricamento();
    RanchAPI.adminGet(ctx.k).then(function (d) {
      view.innerHTML =
        '<div class="metriche una"><div class="metrica"><span>Fondocassa</span><strong>' + UI.euro(d.fondocassa) + '</strong></div></div>' +
        '<nav class="sottoschede">' + Object.keys(SCHEDE).map(function (s) {
          return '<a href="#/admin/' + s + '"' + (s === scheda ? ' class="attiva" aria-current="page"' : '') + '>' + SCHEDE[s] + '</a>';
        }).join('') + '</nav>' +
        '<div id="admin-corpo"></div>';
      var corpo = view.querySelector('#admin-corpo');
      var ricarica = function () { mostra(view, scheda, ctx); if (ctx.ricaricaMe) ctx.ricaricaMe(); };
      if (scheda === 'crediti') crediti(corpo, d, ctx, ricarica);
      if (scheda === 'soci') soci(corpo, d, ctx, ricarica);
      if (scheda === 'storico') storico(corpo, d, ctx, ricarica);
      if (scheda === 'messaggi') messaggi(corpo, ctx);
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  // ---------------- Crediti ----------------
  function crediti(el, d, ctx, ricarica) {
    var attivi = d.soci.filter(function (s) { return s.attivo; });
    var ora = new Date();
    var causaleDefault = 'Quota ' + MESI[ora.getMonth()] + ' ' + ora.getFullYear();
    el.innerHTML =
      '<form class="riquadro" id="tutti" novalidate>' +
        '<h2>Applica a tutti</h2>' +
        '<div class="due">' +
          '<label class="campo"><span>Importo per socio (€)</span><input name="importo" type="number" inputmode="decimal" step="0.01" value="25"></label>' +
          '<label class="campo"><span>Causale</span><input name="causale" maxlength="120" value="' + esc(causaleDefault) + '"></label>' +
        '</div>' +
        (d.causaliRecenti.length ? '<div class="chip-causali"><span class="muted small">Usate di recente:</span> ' + d.causaliRecenti.map(function (c) {
          return '<button type="button" class="chip" data-causale="' + esc(c) + '">' + esc(c) + '</button>';
        }).join('') + '</div>' : '') +
        '<div class="sel-soci">' +
          '<div class="sel-azioni"><button type="button" class="link" data-sel="tutti">Tutti</button> · <button type="button" class="link" data-sel="nessuno">Nessuno</button></div>' +
          attivi.map(function (s) {
            return '<label class="sel-socio"><input type="checkbox" name="socio" value="' + esc(s.id) + '" checked>' +
              UI.avatar(s, 28) + '<span>' + esc(s.nome) + '</span><em class="muted">' + UI.euro(s.credito) + '</em></label>';
          }).join('') +
        '</div>' +
        '<p class="anteprima" id="anteprima"></p>' +
        '<p class="errore" id="err-tutti" hidden></p>' +
        '<button type="submit" class="btn primario largo" id="btn-tutti">Accredita</button>' +
      '</form>' +
      '<h2>Credito per socio</h2>' +
      '<ul class="righe-admin">' + attivi.map(function (s) {
        return '<li>' + UI.avatar(s, 36) + '<span class="nome">' + esc(s.nome) + '</span>' +
          '<b>' + UI.euro(s.credito) + '</b>' +
          '<button type="button" class="btn piccolo" data-singolo="' + esc(s.id) + '">± Credito</button></li>';
      }).join('') + '</ul>';

    var f = el.querySelector('#tutti'), err = el.querySelector('#err-tutti');
    function scelti() { return Array.prototype.map.call(f.querySelectorAll('input[name=socio]:checked'), function (c) { return c.value; }); }
    function anteprima() {
      var n = scelti().length, imp = Number(f.importo.value);
      el.querySelector('#anteprima').innerHTML = n && imp
        ? n + (n === 1 ? ' socio' : ' soci') + ' × ' + UI.euro(imp) + ' = <b>' + UI.euro(n * imp) + '</b>'
        : '<span class="muted">Scegli importo e soci</span>';
      el.querySelector('#btn-tutti').textContent = imp < 0 ? 'Addebita' : 'Accredita';
    }
    f.addEventListener('input', function () { err.hidden = true; anteprima(); });
    f.addEventListener('click', function (e) {
      var c = e.target.getAttribute('data-causale');
      if (c) { f.causale.value = c; err.hidden = true; }
      var sel = e.target.getAttribute('data-sel');
      if (sel) { f.querySelectorAll('input[name=socio]').forEach(function (x) { x.checked = sel === 'tutti'; }); anteprima(); }
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var ids = scelti(), imp = Number(f.importo.value), causale = f.causale.value.trim();
      var msg = !ids.length ? 'Scegli almeno un socio.' : !imp ? 'Scrivi un importo diverso da zero.' : !causale ? 'Scrivi una causale.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      accredita(ctx, ids, imp, causale, el.querySelector('#btn-tutti'), err, ricarica);
    });
    anteprima();

    el.querySelectorAll('[data-singolo]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = attivi.filter(function (x) { return x.id === b.getAttribute('data-singolo'); })[0];
        creditoSingolo(s, ctx, ricarica);
      });
    });
  }

  // Esegue l'accredito; se la causale è già stata usata chiede conferma e riprova forzando
  function accredita(ctx, ids, imp, causale, btn, err, fatto, forza) {
    var testo = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';
    return RanchAPI.adminAccredita(ctx.k, ids, imp, causale, forza).then(function (r) {
      btn.disabled = false;
      btn.textContent = testo;
      if (r.ok) {
        UI.toast((imp > 0 ? 'Accreditati ' : 'Addebitati ') + UI.euro(Math.abs(r.totale)) + ' a ' + r.soci + (r.soci === 1 ? ' socio' : ' soci'));
        fatto();
        return true;
      }
      conferma('Causale già usata',
        '“' + esc(causale) + '” risulta già registrata per: <b>' + r.doppi.map(esc).join(', ') + '</b>. Vuoi registrarla di nuovo?',
        'Sì, registra', function () { accredita(ctx, ids, imp, causale, btn, err, fatto, true); });
      return false;
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = testo;
      err.textContent = e.message;
      err.hidden = false;
    });
  }

  function creditoSingolo(s, ctx, ricarica) {
    var wrap = modale(
      '<form class="modal" role="dialog" aria-modal="true" aria-label="Credito di ' + esc(s.nome) + '" novalidate>' +
        '<h2>' + UI.avatar(s, 32) + ' ' + esc(s.nome) + '</h2>' +
        '<p class="muted">Credito attuale: <b>' + UI.euro(s.credito) + '</b></p>' +
        '<div class="segmenti" role="group" aria-label="Tipo">' +
          '<button type="button" class="btn attivo" data-segno="1" aria-pressed="true">+ Aggiungi</button>' +
          '<button type="button" class="btn" data-segno="-1" aria-pressed="false">− Togli</button>' +
        '</div>' +
        '<label class="campo"><span>Importo (€)</span><input name="importo" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="25"></label>' +
        '<label class="campo"><span>Causale</span><input name="causale" maxlength="120" placeholder="Versamento extra"></label>' +
        '<p class="errore" id="err-s" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
        '<button type="submit" class="btn primario" id="ok-s">Salva</button></div>' +
      '</form>');
    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-s'), segno = 1;
    f.addEventListener('click', function (e) {
      var sg = e.target.getAttribute('data-segno');
      if (!sg) return;
      segno = Number(sg);
      f.querySelectorAll('[data-segno]').forEach(function (b) {
        var on = b === e.target; b.classList.toggle('attivo', on); b.setAttribute('aria-pressed', on);
      });
    });
    f.addEventListener('input', function () { err.hidden = true; });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var imp = Math.abs(Number(f.importo.value)), causale = f.causale.value.trim();
      var msg = !imp ? 'Scrivi un importo.' : !causale ? 'Scrivi una causale.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      accredita(ctx, [s.id], segno * imp, causale, wrap.querySelector('#ok-s'), err, function () { wrap.remove(); ricarica(); });
    });
  }

  // ---------------- Soci ----------------
  function soci(el, d, ctx, ricarica) {
    el.innerHTML =
      '<div class="azioni-sezione"><button type="button" class="btn primario" id="nuovo-socio">+ Aggiungi socio</button></div>' +
      '<ul class="righe-admin soci-admin">' + d.soci.map(function (s) {
        return '<li class="' + (s.attivo ? '' : 'spento') + '">' + UI.avatar(s, 40) +
          '<div class="nome"><b>' + esc(s.nome) + '</b>' + (s.admin ? ' <span class="badge st-raccolta">admin</span>' : '') +
            (s.attivo ? '' : ' <span class="badge st-scaduto">disattivato</span>') +
            '<span class="muted small">' + (s.dataIngresso ? 'Socio da ' + UI.data(s.dataIngresso) : 'Data ingresso non indicata') + ' · credito ' + UI.euro(s.credito) + '</span></div>' +
          '<button type="button" class="btn piccolo" data-apri="' + esc(s.id) + '">Gestisci</button></li>';
      }).join('') + '</ul>';
    el.querySelector('#nuovo-socio').addEventListener('click', function () { schedaSocio(null, ctx, ricarica); });
    el.querySelectorAll('[data-apri]').forEach(function (b) {
      b.addEventListener('click', function () {
        schedaSocio(d.soci.filter(function (s) { return s.id === b.getAttribute('data-apri'); })[0], ctx, ricarica);
      });
    });
  }

  function linkPersonale(codice) {
    return location.origin + location.pathname + '?k=' + encodeURIComponent(codice);
  }

  function schedaSocio(s, ctx, ricarica) {
    var nuovo = !s, io = s && ctx.me && s.id === ctx.me.id;
    var wrap = modale(
      '<form class="modal" role="dialog" aria-modal="true" aria-label="' + (nuovo ? 'Nuovo socio' : esc(s.nome)) + '" novalidate>' +
        '<h2>' + (nuovo ? 'Nuovo socio' : UI.avatar(s, 32) + ' ' + esc(s.nome)) + '</h2>' +
        '<label class="campo"><span>Nome</span><input name="nome" maxlength="60" placeholder="Mario Rossi" value="' + esc(s ? s.nome : '') + '"></label>' +
        '<label class="campo"><span>Data ingresso</span><input name="dataIngresso" type="date" value="' + esc(s && s.dataIngresso ? s.dataIngresso : '') + '"></label>' +
        (nuovo || io ? '' : '<label class="spunta"><input type="checkbox" name="attivo"' + (s.attivo ? ' checked' : '') + '> Socio attivo (i disattivati non compaiono e il loro link non funziona)</label>') +
        (nuovo ? '' :
          '<div class="link-box"><span class="muted small">Link personale</span>' +
            '<code id="link-socio">' + esc(linkPersonale(s.codice)) + '</code>' +
            '<div class="riga-btn"><button type="button" class="btn piccolo" id="copia">Copia link</button>' +
            (io ? '' : '<button type="button" class="btn piccolo" id="rigenera">Rigenera link</button>') +
            (s.foto ? '<button type="button" class="btn piccolo" id="via-foto">Rimuovi foto</button>' : '') + '</div>' +
          '</div>') +
        '<p class="errore" id="err-so" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Chiudi</button>' +
        '<button type="submit" class="btn primario">' + (nuovo ? 'Aggiungi' : 'Salva') + '</button></div>' +
      '</form>');
    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-so');
    function errore(m) { err.textContent = m; err.hidden = false; }
    f.addEventListener('input', function () { err.hidden = true; });

    var copia = wrap.querySelector('#copia');
    if (copia) copia.addEventListener('click', function () {
      var testo = wrap.querySelector('#link-socio').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(testo) : Promise.reject()).then(function () {
        UI.toast('Link copiato');
      }, function () { errore('Copia non riuscita: seleziona il link e copialo a mano.'); });
    });
    var rig = wrap.querySelector('#rigenera');
    if (rig) rig.addEventListener('click', function () {
      conferma('Rigenerare il link?', 'Il link attuale di ' + esc(s.nome) + ' smetterà di funzionare e dovrai mandargli quello nuovo.', 'Rigenera', function () {
        RanchAPI.adminRigenera(ctx.k, s.id).then(function (r) {
          s.codice = r.codice;
          wrap.querySelector('#link-socio').textContent = linkPersonale(r.codice);
          UI.toast('Nuovo link pronto: mandalo a ' + s.nome.split(' ')[0]);
        }).catch(function (e) { errore(e.message); });
      });
    });
    var vf = wrap.querySelector('#via-foto');
    if (vf) vf.addEventListener('click', function () {
      RanchAPI.adminRimuoviFoto(ctx.k, s.id).then(function () { vf.remove(); UI.toast('Foto rimossa'); }).catch(function (e) { errore(e.message); });
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = f.nome.value.trim();
      if (!nome) return errore('Scrivi il nome.');
      var dati = { nome: nome, dataIngresso: f.dataIngresso.value, attivo: f.attivo ? f.attivo.checked : true };
      RanchAPI.adminSocioSalva(ctx.k, s ? s.id : null, dati).then(function (r) {
        if (nuovo) {
          wrap.remove();
          var w2 = modale('<div class="modal" role="dialog" aria-modal="true" aria-label="Socio aggiunto">' +
            '<h2>' + esc(r.nome) + ' è un nuovo socio</h2>' +
            '<p>Mandagli questo link personale:</p><div class="link-box"><code>' + esc(linkPersonale(r.codice)) + '</code></div>' +
            '<div class="azioni"><button type="button" class="btn primario" data-a="no">Fatto</button></div></div>');
          w2.addEventListener('click', function (ev) { if (ev.target.getAttribute('data-a') === 'no') ricarica(); });
        } else {
          wrap.remove();
          UI.toast('Socio salvato');
          ricarica();
        }
      }).catch(function (e2) { errore(e2.message); });
    });
  }

  // ---------------- Storico ----------------
  function storico(el, d, ctx, ricarica) {
    el.innerHTML =
      '<div class="filtri">' +
        '<label><span class="muted small">Socio</span><select id="f-socio"><option value="">Tutti</option>' +
          d.soci.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.nome) + '</option>'; }).join('') + '</select></label>' +
        '<label><span class="muted small">Mese</span><input type="month" id="f-mese"></label>' +
        '<label><span class="muted small">Tipo</span><select id="f-tipo"><option value="">Tutti</option>' +
          Object.keys(TIPI).map(function (t) { return '<option value="' + t + '">' + TIPI[t] + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<div id="lista-mov"></div>';
    var lista = el.querySelector('#lista-mov');
    function carica() {
      lista.innerHTML = UI.caricamento();
      RanchAPI.adminStorico(ctx.k, {
        socio: el.querySelector('#f-socio').value, mese: el.querySelector('#f-mese').value, tipo: el.querySelector('#f-tipo').value
      }).then(function (mov) {
        if (!mov.length) { lista.innerHTML = '<p class="muted pad">Nessun movimento con questi filtri.</p>'; return; }
        var tot = mov.reduce(function (t, m) { return t + Number(m.importo); }, 0);
        lista.innerHTML = '<p class="muted small">' + mov.length + (mov.length === 1 ? ' movimento' : ' movimenti') + ' · saldo ' + UI.euroSegno(tot) + '</p>' +
          '<ul class="storico">' + mov.map(function (m) {
            var cosa = m.progetto ? '<a href="#/progetti/' + esc(m.progetto.id) + '">' + esc(m.progetto.titolo) + '</a>' + (m.causale ? ' · ' + esc(m.causale) : '') : esc(m.causale);
            return '<li>' +
              '<div class="sx">' + UI.avatar(m.socio, 32) + '</div>' +
              '<div class="cx"><p><b>' + esc(m.socio.nome) + '</b> <span class="badge tipo-' + m.tipo + '">' + TIPI[m.tipo] + '</span></p>' +
                '<p class="small">' + cosa + '</p>' +
                (m.messaggio ? '<p class="small muted">“' + esc(m.messaggio) + '”</p>' : '') +
                '<p class="small muted">' + UI.data(m.data) + ' ' + new Date(m.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
                  ' · da ' + esc(m.fattoDa) + '</p></div>' +
              '<div class="dx"><b class="' + (m.importo > 0 ? 'pos' : '') + '">' + UI.euroSegno(m.importo) + '</b>' +
                (m.tipo === 'acquisto' && m.stornabili > 0 && (!m.progetto || m.progetto.stato !== 'eliminato')
                  ? '<button type="button" class="btn piccolo" data-storna="' + esc(m.id) + '" data-max="' + m.stornabili + '">Storna</button>' : '') +
              '</div></li>';
          }).join('') + '</ul>';
        lista.querySelectorAll('[data-storna]').forEach(function (b) {
          b.addEventListener('click', function () {
            var m = mov.filter(function (x) { return String(x.id) === b.getAttribute('data-storna'); })[0];
            storna(m, ctx, function () { carica(); if (ctx.ricaricaMe) ctx.ricaricaMe(); });
          });
        });
      }).catch(function (e) { lista.innerHTML = UI.errore(e); });
    }
    el.querySelectorAll('.filtri select, .filtri input').forEach(function (x) { x.addEventListener('change', carica); });
    carica();
  }

  function storna(m, ctx, fatto) {
    var unit = -m.importo / m.quote;
    var wrap = modale(
      '<form class="modal" role="dialog" aria-modal="true" aria-label="Storna acquisto" novalidate>' +
        '<h2>Storna acquisto</h2>' +
        '<p>' + esc(m.socio.nome) + ' · ' + esc(m.progetto ? m.progetto.titolo : '') + ' · ' + m.quote + (m.quote === 1 ? ' quota' : ' quote') + ' da ' + UI.euro(unit) + '</p>' +
        '<label class="campo"><span>Quote da stornare (max ' + m.stornabili + ')</span>' +
          '<input name="quote" type="number" inputmode="numeric" min="1" max="' + m.stornabili + '" value="' + m.stornabili + '"></label>' +
        '<label class="campo"><span>Causale <em class="muted">facoltativa</em></span><input name="causale" maxlength="120" placeholder="Acquisto per errore"></label>' +
        '<p class="anteprima" id="rest"></p>' +
        '<p class="errore" id="err-st" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
        '<button type="submit" class="btn primario">Storna</button></div>' +
      '</form>');
    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-st');
    function anteprima() {
      var q = Number(f.quote.value);
      wrap.querySelector('#rest').innerHTML = q > 0 ? 'Tornano a ' + esc(m.socio.nome.split(' ')[0]) + ' <b>' + UI.euro(q * unit) + '</b>' : '';
    }
    f.addEventListener('input', function () { err.hidden = true; anteprima(); });
    anteprima();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = Number(f.quote.value);
      if (!(q >= 1 && q <= m.stornabili && Number.isInteger(q))) { err.textContent = 'Scegli da 1 a ' + m.stornabili + ' quote.'; err.hidden = false; return; }
      RanchAPI.adminStorna(ctx.k, m.id, q, f.causale.value.trim()).then(function (r) {
        wrap.remove();
        UI.toast('Stornati ' + UI.euro(r.importo));
        fatto();
      }).catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
    });
  }

  // ---------------- utilità ----------------
  function modale(html) {
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || (e.target.getAttribute && e.target.getAttribute('data-a') === 'no')) wrap.remove();
    });
    return wrap;
  }
  // ---------------- Messaggi Telegram ----------------
  var TIPI_MSG = { comunicazione: ['📣', 'Comunicazione'], promozione: ['🏷️', 'Promozione'], urgente: ['🚨', 'Urgente'] };
  function messaggi(el, ctx) {
    el.innerHTML = UI.caricamento();
    RanchAPI.adminMessaggi(ctx.k).then(function (d) {
      var coll = d.soci.filter(function (s) { return s.collegato; }), tipo = 'comunicazione';
      el.innerHTML =
        '<form class="riquadro" id="msg" novalidate>' +
          '<h2>Nuovo messaggio Telegram</h2>' +
          '<p class="muted small">' + coll.length + ' di ' + d.soci.length + ' soci hanno collegato Telegram' +
            (coll.length < d.soci.length ? ' · gli altri lo fanno dal loro profilo con "Collega"' : '') + '</p>' +
          '<div class="segmenti" role="group" aria-label="Tipo di messaggio">' + Object.keys(TIPI_MSG).map(function (t) {
            return '<button type="button" class="btn piccolo' + (t === tipo ? ' attivo' : '') + '" data-tipo="' + t + '">' + TIPI_MSG[t][0] + ' ' + TIPI_MSG[t][1] + '</button>';
          }).join('') + '</div>' +
          '<label class="campo"><span>Testo <em class="muted" id="cont-msg"></em></span>' +
            '<textarea name="testo" rows="5" maxlength="2000" placeholder="Domenica giornata lavori in pista: ci vediamo alle 9 alla curva La Parente!"></textarea></label>' +
          '<div class="sel-soci">' +
            '<div class="sel-azioni"><button type="button" class="link" data-sel="tutti">Tutti</button> · <button type="button" class="link" data-sel="nessuno">Nessuno</button></div>' +
            d.soci.map(function (s) {
              return '<label class="sel-socio' + (s.collegato ? '' : ' off') + '"><input type="checkbox" name="dest" value="' + esc(s.id) + '"' +
                (s.collegato ? ' checked' : ' disabled') + '>' + UI.avatar(s, 28) + '<span>' + esc(s.nome) + '</span>' +
                '<em class="muted">' + (s.collegato ? '' : 'non collegato') + '</em></label>';
            }).join('') +
          '</div>' +
          '<div class="anteprima-tg" id="anteprima-tg" hidden><span class="bolla"></span></div>' +
          '<p class="errore" id="err-msg" hidden></p>' +
          '<button type="submit" class="btn primario largo" id="invia-msg">Invia</button>' +
        '</form>' +
        '<h2>Messaggi inviati</h2>' +
        (d.storico.length ? '<ul class="storico-msg">' + d.storico.map(function (m) {
          var stato = m.consegnati >= m.destinatari ? '✓ consegnato a ' + m.consegnati + '/' + m.destinatari
            : m.falliti > 0 ? '⚠ ' + m.consegnati + '/' + m.destinatari + ' consegnati, ' + m.falliti + ' non riusciti'
            : '⏳ in invio… ' + m.consegnati + '/' + m.destinatari;
          return '<li><span class="ico-msg">' + (TIPI_MSG[m.tipo] || ['📣'])[0] + '</span><div><p class="testo-msg">' + esc(m.testo) + '</p>' +
            '<p class="muted small">' + UI.data(m.data) + ' ' + new Date(m.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ' · ' + stato + '</p></div></li>';
        }).join('') + '</ul>' : '<p class="muted">Nessun messaggio inviato.</p>');

      var f = el.querySelector('#msg'), err = el.querySelector('#err-msg'), btn = el.querySelector('#invia-msg');
      function scelti() { return Array.prototype.map.call(f.querySelectorAll('input[name=dest]:checked'), function (c) { return c.value; }); }
      function aggiorna() {
        var n = scelti().length, t = f.testo.value.trim();
        el.querySelector('#cont-msg').textContent = f.testo.value.length + '/2000';
        btn.textContent = n ? 'Invia a ' + n + (n === 1 ? ' socio' : ' soci') : 'Invia';
        btn.disabled = !n || !t;
        var a = el.querySelector('#anteprima-tg');
        a.hidden = !t;
        a.querySelector('.bolla').textContent = TIPI_MSG[tipo][0] + ' ' + t;
      }
      aggiorna();
      f.addEventListener('input', function () { err.hidden = true; aggiorna(); });
      f.addEventListener('click', function (e) {
        var t = e.target.getAttribute && e.target.getAttribute('data-tipo');
        if (t) {
          tipo = t;
          f.querySelectorAll('[data-tipo]').forEach(function (b) { b.classList.toggle('attivo', b.getAttribute('data-tipo') === t); });
          aggiorna();
        }
        var sel = e.target.getAttribute && e.target.getAttribute('data-sel');
        if (sel) { f.querySelectorAll('input[name=dest]:not(:disabled)').forEach(function (x) { x.checked = sel === 'tutti'; }); aggiorna(); }
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var ids = scelti(), testo = f.testo.value.trim();
        if (!testo) { err.textContent = 'Scrivi il messaggio.'; err.hidden = false; return; }
        if (!ids.length) { err.textContent = 'Scegli almeno un socio collegato.'; err.hidden = false; return; }
        conferma('Inviare il messaggio?', 'Arriva su Telegram a <b>' + ids.length + (ids.length === 1 ? ' socio' : ' soci') + '</b> entro un minuto. Non si può ritirare.', 'Invia', function () {
          btn.disabled = true; btn.textContent = 'Invio…';
          RanchAPI.adminMessaggioInvia(ctx.k, tipo, testo, ids).then(function (r) {
            UI.toast('Messaggio in invio a ' + r.destinatari + (r.destinatari === 1 ? ' socio' : ' soci'));
            messaggi(el, ctx);
          }).catch(function (e2) { err.textContent = e2.message; err.hidden = false; aggiorna(); });
        });
      });
    }).catch(function (e) { el.innerHTML = UI.errore(e); });
  }

  function conferma(titolo, testoHtml, etichetta, siFn) {
    var wrap = modale('<div class="modal" role="alertdialog" aria-modal="true" aria-label="' + esc(titolo) + '">' +
      '<h2>' + esc(titolo) + '</h2><p>' + testoHtml + '</p>' +
      '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
      '<button type="button" class="btn primario" data-a="si">' + esc(etichetta) + '</button></div></div>');
    wrap.querySelector('[data-a=si]').addEventListener('click', function () { wrap.remove(); siFn(); });
  }

  return { mostra: mostra };
})();
