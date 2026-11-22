// Sezione Progetti: catalogo a schede, dettaglio, proposta e modifica, acquisto quote, gestione admin.
window.Progetti = (function () {
  var esc = UI.esc;
  var STATI = {
    raccolta: { nome: 'In raccolta', cls: 'st-raccolta' },
    sviluppo: { nome: 'In esecuzione', cls: 'st-sviluppo' },
    chiuso:   { nome: 'Chiuso',      cls: 'st-chiuso' }
  };

  // ---------- pezzi riutilizzati ----------
  function badge(p) {
    if (p.stato === 'raccolta' && p.scaduto) return '<span class="badge st-scaduto">Scaduto</span>';
    var s = STATI[p.stato] || STATI.raccolta;
    return '<span class="badge ' + s.cls + '">' + s.nome + '</span>';
  }
  function foto(p, cls) {
    if (p.foto) return '<img class="' + cls + '" src="' + esc(p.foto) + '" alt="" loading="lazy">';
    return '<div class="' + cls + ' foto-vuota" aria-hidden="true"><span>' + esc((p.titolo || '?').charAt(0).toUpperCase()) + '</span></div>';
  }
  function percentuale(p) { return p.totale > 0 ? Math.min(100, Math.round(p.raccolto / p.totale * 100)) : 0; }
  function barra(p) {
    return '<div class="barra' + (p.stato === 'chiuso' ? ' completa' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      percentuale(p) + '"><span style="width:' + percentuale(p) + '%"></span></div>';
  }
  function scadenza(p) {
    if (p.stato === 'raccolta' && p.scaduto) return 'Scaduto il ' + UI.data(p.scadenza);
    if (p.stato !== 'raccolta') return 'Scadenza ' + UI.data(p.scadenza);
    var giorni = Math.round((new Date(p.scadenza + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
    if (giorni === 0) return 'Scade oggi';
    if (giorni === 1) return 'Scade domani';
    return 'Scade il ' + UI.data(p.scadenza) + (giorni <= 30 ? ' · tra ' + giorni + ' giorni' : '');
  }
  function plurale(n, uno, molti) { return n + ' ' + (n === 1 ? uno : molti); }

  // ---------- elenco ----------
  function lista(view, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getProgetti(ctx.k).then(function (d) {
      // in ordine di completamento: prima i più vicini al 100%
      function pct(p) { return p.totale > 0 ? Number(p.raccolto) / Number(p.totale) : 0; }
      d.progetti.sort(function (a, b) { return (pct(b) - pct(a)) || String(a.scadenza).localeCompare(String(b.scadenza)) || a.titolo.localeCompare(b.titolo, 'it'); });
      // il più amato (più cuori, almeno uno) si accende
      var maxCuori = d.progetti.reduce(function (m, p) { return Math.max(m, Number(p.cuori) || 0); }, 0);
      var amato = maxCuori > 0 ? d.progetti.filter(function (p) { return Number(p.cuori) === maxCuori; })[0] : null;
      view.innerHTML =
        boxCredito(ctx.me) +
        '<div class="kpi-centro">' +
          '<div class="kpi"><span>Progetti</span><strong>' + d.kpi.progetti + '</strong></div>' +
          '<div class="kpi"><span>Raccolti</span><strong>' + UI.euro(d.kpi.raccolto) + ' <small>/ ' + UI.euro(d.kpi.totale) + '</small></strong></div>' +
          '<button type="button" class="kpi kpi-btn" id="apri-grafico" aria-label="Apri il grafico dell\'andamento">' +
            '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 20V10M10 20V6M16 20v-8M3 20h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M4 9l6-4 6 5 5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<span>Grafico</span></button>' +
        '</div>' +
        (ctx.me ? '<div class="azioni-sezione"><button type="button" class="btn primario" id="nuovo">+ Proponi un progetto</button></div>' : '') +
        (d.progetti.length ?
          '<div class="griglia-progetti">' + d.progetti.map(function (p) {
            var top = p === amato;
            return '<a class="card-progetto' + (top ? ' amato' : '') + '" href="#/progetti/' + esc(p.id) + '">' +
              '<div class="foto-box">' + foto(p, 'foto-progetto') + badge(p) + bottoneCuore(p) +
                (top ? '<span class="nastro-amato">🔥 Il più amato</span>' : '') + '</div>' +
              '<div class="corpo">' +
                '<h2>' + esc(p.titolo) + '</h2>' +
                (p.descrizione ? '<p class="descr">' + esc(p.descrizione) + '</p>' : '') +
                barra(p) +
                '<p class="soldi"><b>' + UI.euro(p.raccolto) + '</b> <span class="muted">/ ' + UI.euro(p.totale) + '</span></p>' +
                '<p class="meta"><span>' + plurale(p.sostenitori, 'sostenitore', 'sostenitori') + '</span><span>' + esc(scadenza(p)) + '</span></p>' +
              '</div>' +
            '</a>';
          }).join('') + '</div>'
          : '<div class="vuoto"><h2>Nessun progetto per ora</h2><p class="muted">Il primo progetto del ranch può essere il tuo.</p></div>');
      var b = view.querySelector('#nuovo');
      if (b) b.addEventListener('click', function () { form(ctx, null); });
      view.querySelector('#apri-grafico').addEventListener('click', Grafico.apri);
      view.querySelectorAll('[data-cuore]').forEach(function (c) {
        c.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          clickCuore(c, ctx);
        });
      });
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  // ---------- credito del socio, ben visibile ----------
  function boxCredito(me) {
    if (!me) return '';
    var c = Number(me.credito) || 0;
    return '<div class="box-credito' + (c > 0 ? '' : ' vuoto') + '" role="status">' +
      '<div class="testo"><span>Il tuo credito da usare</span><strong>' + UI.euro(c) + '</strong></div>' +
      '<div class="nota">' + (c > 0 ? 'Usalo per comprare quote dei progetti' : 'Nessun credito disponibile al momento') + '</div>' +
    '</div>';
  }

  // ---------- cuori ----------
  var CUORE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.1C1 8.3 2.9 4.5 6.6 4.5c2.2 0 3.9 1.3 5.4 3.3 1.5-2 3.2-3.3 5.4-3.3 3.7 0 5.6 3.8 4.2 6.9-2.1 4.5-9.6 9.1-9.6 9.1z"/></svg>';
  function bottoneCuore(p) {
    return '<button type="button" class="cuore' + (p.mioCuore ? ' acceso' : '') + '" data-cuore="' + esc(p.id) + '" aria-pressed="' + !!p.mioCuore + '" ' +
      'aria-label="' + (p.mioCuore ? 'Togli il cuore' : 'Metti un cuore') + '">' + CUORE + '<span>' + (p.cuori || 0) + '</span></button>';
  }
  function clickCuore(c, ctx) {
    if (!ctx.k || !ctx.me) { UI.toast('Apri il tuo link personale per mettere un cuore'); return; }
    if (c.classList.contains('attesa')) return;
    var acceso = !c.classList.contains('acceso'), n = Number(c.querySelector('span').textContent) || 0;
    // aggiorna subito, poi conferma con il database
    function imposta(on, num) {
      c.classList.toggle('acceso', on);
      c.setAttribute('aria-pressed', on);
      c.setAttribute('aria-label', on ? 'Togli il cuore' : 'Metti un cuore');
      c.querySelector('span').textContent = num;
    }
    imposta(acceso, n + (acceso ? 1 : -1));
    if (acceso) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    c.classList.add('attesa');
    RanchAPI.cuore(ctx.k, c.getAttribute('data-cuore')).then(function (r) {
      imposta(r.mioCuore, r.cuori);
    }).catch(function (e) {
      imposta(!acceso, n);
      UI.toast(e.message || 'Non riuscito, riprova');
    }).then(function () { c.classList.remove('attesa'); });
  }

  // ---------- dettaglio ----------
  function siglaAuto(titolo) {
    var t = String(titolo || '').trim(), parole = t.split(/\s+/);
    return t ? (parole.slice(0, 3).map(function (w) { return w.charAt(0); }).join('') + t.charAt(t.length - 1)).toUpperCase().slice(0, 4) : '';
  }
  function conferma(titolo, testoHtml, etichetta, siFn) {
    var w = document.createElement('div');
    w.className = 'modal-bg';
    w.innerHTML = '<div class="modal" role="alertdialog" aria-modal="true" aria-label="' + esc(titolo) + '"><h2>' + esc(titolo) + '</h2><p>' + testoHtml + '</p>' +
      '<div class="azioni"><button type="button" class="btn" data-a="no">Indietro</button><button type="button" class="btn pericolo-pieno" data-a="si">' + esc(etichetta) + '</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (ev.target === w || a === 'no') w.remove();
      if (a === 'si') { w.remove(); siFn(); }
    });
  }
  function scheda(view, id, ctx, festeggia) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getProgetto(id).then(function (d) {
      var p = d.progetto, me = ctx.me;
      var mio = me && p.creatoDa && me.id === p.creatoDa.id;
      var resto = p.quoteTotali - p.quoteVendute;
      var nette = {};
      d.finanziatori.forEach(function (f) { nette[f.socio.id] = (nette[f.socio.id] || 0) + Number(f.quote); });
      var acquisti = d.finanziatori.filter(function (f) { return f.tipo === 'acquisto' && nette[f.socio.id] > 0; });
      var mieQuote = me ? (nette[me.id] || 0) : 0;
      var mioImporto = me ? d.finanziatori.filter(function (f) { return f.socio.id === me.id; }).reduce(function (t, f) { return t + Number(f.importo); }, 0) : 0;

      view.innerHTML =
        '<a class="indietro" href="#/progetti">← Tutti i progetti</a>' +
        boxCredito(me) +
        '<article class="dettaglio-progetto' + (p.stato === 'chiuso' ? ' chiuso' : '') + '">' +
          '<div class="foto-box grande">' + foto(p, 'foto-progetto') + badge(p) + '</div>' +
          (p.stato === 'chiuso' ? '<div class="banner-chiuso">Progetto completato. Grazie a tutti i sostenitori!</div>' : '') +
          '<div class="corpo">' +
            '<h1>' + esc(p.titolo) + '</h1>' +
            '<a class="proposto" href="#/soci/' + esc(p.creatoDa.id) + '">' + UI.avatar(p.creatoDa, 28) +
              '<span>Proposto da <b>' + esc(p.creatoDa.nome) + '</b> il ' + UI.data(p.creatoIl) + '</span></a>' +
            (p.descrizione ? '<p class="descr-lunga">' + esc(p.descrizione) + '</p>' : '') +
            barra(p) +
            '<p class="soldi grande"><b>' + UI.euro(p.raccolto) + '</b> <span class="muted">raccolti su ' + UI.euro(p.totale) + '</span></p>' +
            '<div class="dati-progetto">' +
              '<div><span>Quote</span><b>' + p.quoteVendute + ' / ' + p.quoteTotali + '</b></div>' +
              '<div><span>Costo quota</span><b>' + UI.euro(p.costoQuota) + '</b></div>' +
              '<div><span>Sostenitori</span><b>' + p.sostenitori + '</b></div>' +
              '<div><span>Scadenza</span><b>' + UI.data(p.scadenza) + '</b></div>' +
            '</div>' +
            (mieQuote > 0 ?
              '<div class="mia-partecipazione"><div><span class="muted small">La tua partecipazione</span><b>' + plurale(mieQuote, 'quota', 'quote') + ' · ' + UI.euro(mioImporto) + '</b></div>' +
                (p.stato === 'raccolta' ? '<button type="button" class="btn pericolo piccolo" id="annulla-part">Annulla partecipazione</button>'
                  : '<span class="muted small">Non più annullabile: il progetto è in esecuzione</span>') + '</div>' : '') +
            boxAcquisto(p, me, resto) +
            ((mio || (me && me.admin)) ? '<button type="button" class="btn" id="modifica-p">Modifica progetto</button>' : '') +
            (me && me.admin ? boxAdmin(p) : '') +
            '<h2>Sostenitori</h2>' +
            (acquisti.length ? '<ul class="finanziatori">' + acquisti.map(function (f) {
              return '<li>' +
                '<a class="chi" href="#/soci/' + esc(f.socio.id) + '">' + UI.avatar(f.socio, 40) + '</a>' +
                '<div class="cosa">' +
                  '<p><a href="#/soci/' + esc(f.socio.id) + '"><b>' + esc(f.socio.nome) + '</b></a> ' + UI.numero(f.socio, 18) + '</p>' +
                  '<p class="muted small">' + UI.data(f.data) + ' · ' + plurale(f.quote, 'quota', 'quote') + ' · ' + UI.euro(f.importo) + '</p>' +
                  (f.messaggio ? '<p class="messaggio">“' + esc(f.messaggio) + '”</p>' : '') +
                '</div></li>';
            }).join('') + '</ul>' : '<p class="muted">Nessun sostenitore ancora. Il primo può essere tu.</p>') +
          '</div>' +
        '</article>';

      collegaAcquisto(view, p, ctx, resto);
      var ba = view.querySelector('#annulla-part');
      if (ba) ba.addEventListener('click', function () {
        conferma('Annullare la partecipazione?', 'Ritiri le tue ' + plurale(mieQuote, 'quota', 'quote') + ' da “' + esc(p.titolo) + '” e ti tornano <b>' + UI.euro(mioImporto) + '</b> di credito.',
          'Annulla partecipazione', function () {
            ba.disabled = true;
            RanchAPI.annullaPartecipazione(ctx.k, p.id).then(function (r) {
              UI.toast('Partecipazione annullata: +' + UI.euro(r.importo) + ' di credito');
              if (ctx.ricaricaMe) ctx.ricaricaMe();
              scheda(view, id, ctx, false);
            }).catch(function (e) { ba.disabled = false; UI.toast(e.message); });
          });
      });
      var bm = view.querySelector('#modifica-p');
      if (bm) bm.addEventListener('click', function () { form(ctx, p); });
      if (me && me.admin) collegaAdmin(view, p, ctx);
      if (p.stato === 'chiuso' && festeggia !== false) Fuochi.lancia();
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  function boxAcquisto(p, me, resto) {
    if (p.stato !== 'raccolta' || p.scaduto) return '';
    if (resto <= 0) return '<div class="box-acquisto"><p><b>Tutte le quote sono state vendute.</b></p></div>';
    if (!me) return '<div class="box-acquisto"><p class="muted">Apri il tuo link personale per sostenere questo progetto.</p></div>';
    var max = Math.min(resto, Math.floor((me.credito || 0) / p.costoQuota + 1e-9));
    if (max < 1) {
      return '<div class="box-acquisto"><p>Il tuo credito è <b>' + UI.euro(me.credito || 0) + '</b>: non basta per una quota da ' +
        UI.euro(p.costoQuota) + '.</p></div>';
    }
    return '<form class="box-acquisto" id="acquisto" novalidate>' +
      '<h2>Sostieni il progetto</h2>' +
      '<p class="muted small">Il tuo credito: <b>' + UI.euro(me.credito) + '</b> · restano ' + plurale(resto, 'quota', 'quote') + '</p>' +
      '<div class="stepper">' +
        '<button type="button" class="btn" data-d="-1" aria-label="Una quota in meno">−</button>' +
        '<input id="n-quote" type="number" inputmode="numeric" min="1" max="' + max + '" value="1" aria-label="Numero di quote">' +
        '<button type="button" class="btn" data-d="1" aria-label="Una quota in più">+</button>' +
        '<span class="muted">' + 'quote da ' + UI.euro(p.costoQuota) + '</span>' +
      '</div>' +
      '<p class="limite" id="limite" aria-live="polite"></p>' +
      '<p class="muted small" id="dopo"></p>' +
      '<label class="campo"><span>Messaggio <em class="muted">facoltativo</em></span>' +
        '<input name="messaggio" maxlength="200" placeholder="Forza ranch!"></label>' +
      '<p class="errore" id="err-acq" hidden></p>' +
      '<button type="submit" class="btn primario largo" id="compra"></button>' +
    '</form>';
  }

  function collegaAcquisto(view, p, ctx, resto) {
    var f = view.querySelector('#acquisto');
    if (!f) return;
    var credito = Number(ctx.me.credito) || 0;
    var perCredito = Math.floor(credito / p.costoQuota + 1e-9);
    var max = Math.min(resto, perCredito);
    var n = 1, inp = f.querySelector('#n-quote'), btn = f.querySelector('#compra'), err = f.querySelector('#err-acq');
    var meno = f.querySelector('[data-d="-1"]'), piu = f.querySelector('[data-d="1"]'), limite = f.querySelector('#limite');

    // spiega perché non si può andare oltre
    function motivoMassimo() {
      return perCredito <= resto
        ? 'Con il tuo credito (' + UI.euro(credito) + ') puoi comprare al massimo ' + plurale(max, 'quota', 'quote') + '.'
        : 'Restano solo ' + plurale(resto, 'quota', 'quote') + ' per questo progetto.';
    }
    function avvisa(testo) { limite.textContent = testo; limite.hidden = !testo; }
    function aggiorna() {
      inp.value = n;
      btn.textContent = 'Acquista ' + plurale(n, 'quota', 'quote') + ' · ' + UI.euro(n * p.costoQuota);
      meno.classList.toggle('al-limite', n <= 1);
      piu.classList.toggle('al-limite', n >= max);
      meno.setAttribute('aria-disabled', n <= 1);
      piu.setAttribute('aria-disabled', n >= max);
      f.querySelector('#dopo').textContent = 'Credito dopo l\'acquisto: ' + UI.euro(credito - n * p.costoQuota);
    }
    function imposta(valore) {
      err.hidden = true;
      if (!(valore >= 1)) { n = 1; avvisa('Il minimo è 1 quota.'); }
      else if (valore > max) { n = max; avvisa(motivoMassimo()); }
      else { n = Math.floor(valore); avvisa(''); }
      aggiorna();
    }
    meno.addEventListener('click', function () { imposta(n - 1); });
    piu.addEventListener('click', function () { imposta(n + 1); });
    // scrittura a mano: corregge solo quando il campo è completo, così si può cancellare e riscrivere
    inp.addEventListener('change', function () { imposta(Number(inp.value)); });
    inp.addEventListener('input', function () {
      var v = Number(inp.value);
      if (inp.value === '') return;
      if (v > max) imposta(v);
      else if (v >= 1) { n = Math.floor(v); avvisa(''); btn.textContent = 'Acquista ' + plurale(n, 'quota', 'quote') + ' · ' + UI.euro(n * p.costoQuota);
        f.querySelector('#dopo').textContent = 'Credito dopo l\'acquisto: ' + UI.euro(credito - n * p.costoQuota);
        meno.classList.toggle('al-limite', n <= 1); piu.classList.toggle('al-limite', n >= max); }
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      imposta(Number(inp.value));
      btn.disabled = true;
      btn.textContent = 'Acquisto in corso…';
      RanchAPI.acquistaQuote(ctx.k, p.id, n, f.messaggio.value.trim()).then(function () {
        UI.toast('Grazie! Hai acquistato ' + plurale(n, 'quota', 'quote'));
        return ctx.ricaricaMe();
      }).then(function () {
        scheda(view, p.id, ctx);
      }).catch(function (e2) {
        err.textContent = e2.message || 'Acquisto non riuscito. Riprova.';
        err.hidden = false;
        btn.disabled = false;
        aggiorna();
      });
    });
    avvisa('');
    aggiorna();
  }

  function boxAdmin(p) {
    return '<div class="box-admin">' +
      '<h2>Gestione <span class="muted small">(solo admin)</span></h2>' +
      '<div class="segmenti" role="group" aria-label="Stato del progetto">' +
        Object.keys(STATI).map(function (s) {
          return '<button type="button" class="btn' + (p.stato === s ? ' attivo' : '') + '" data-stato="' + s + '"' +
            (p.stato === s ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + STATI[s].nome + '</button>';
        }).join('') +
      '</div>' +
      '<button type="button" class="btn pericolo" id="elimina">Elimina progetto</button>' +
      '<p class="errore" id="err-adm" hidden></p>' +
    '</div>';
  }

  function collegaAdmin(view, p, ctx) {
    var err = view.querySelector('#err-adm');
    view.querySelectorAll('[data-stato]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-stato');
        if (s === p.stato) return;
        b.disabled = true;
        RanchAPI.impostaStato(ctx.k, p.id, s).then(function () {
          UI.toast('Stato: ' + STATI[s].nome);
          scheda(view, p.id, ctx, s === 'chiuso');
        }).catch(function (e) { err.textContent = e.message; err.hidden = false; b.disabled = false; });
      });
    });
    view.querySelector('#elimina').addEventListener('click', function () { confermaElimina(p, ctx); });
  }

  function confermaElimina(p, ctx) {
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<div class="modal" role="alertdialog" aria-modal="true" aria-label="Elimina progetto">' +
        '<h2>Eliminare “' + esc(p.titolo) + '”?</h2>' +
        (p.raccolto > 0
          ? '<p>' + UI.euro(p.raccolto) + ' tornano come credito a ' + plurale(p.sostenitori, 'sostenitore', 'sostenitori') + '. Il progetto sparisce dall\'elenco.</p>'
          : '<p>Il progetto sparisce dall\'elenco. Nessuno ha ancora comprato quote.</p>') +
        '<p class="errore" id="err-el" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
        '<button type="button" class="btn pericolo-pieno" data-a="si">Elimina</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'no' || e.target === wrap) wrap.remove();
      if (a === 'si') {
        e.target.disabled = true;
        RanchAPI.eliminaProgetto(ctx.k, p.id).then(function (r) {
          wrap.remove();
          UI.toast(r.rimborsati ? 'Progetto eliminato, ' + UI.euro(r.importo) + ' rimborsati' : 'Progetto eliminato');
          return ctx.ricaricaMe();
        }).then(function () { location.hash = '#/progetti'; })
          .catch(function (e2) {
            var er = wrap.querySelector('#err-el'); er.textContent = e2.message; er.hidden = false; e.target.disabled = false;
          });
      }
    });
  }

  // ---------- proposta e modifica ----------
  function form(ctx, p) {
    var nuovo = !p;
    var bloccato = !nuovo && p.quoteVendute > 0;
    var oggi = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    var nuovaFoto = null;
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<form class="modal largo" role="dialog" aria-modal="true" aria-label="' + (nuovo ? 'Proponi un progetto' : 'Modifica progetto') + '" novalidate>' +
        '<h2>' + (nuovo ? 'Proponi un progetto' : 'Modifica progetto') + '</h2>' +
        '<div class="foto-box modulo" id="anteprima-foto">' + foto(p || { titolo: '+' }, 'foto-progetto') + '</div>' +
        '<label class="btn">' + (p && p.foto ? 'Cambia foto' : 'Scegli foto') + '<input type="file" accept="image/*" hidden></label>' +
        '<div class="titolo-sigla">' +
          '<label class="campo"><span>Titolo</span><input name="titolo" maxlength="80" placeholder="Tribuna in legno" value="' + esc(p ? p.titolo : '') + '"></label>' +
          '<label class="campo sigla"><span>Sigla <em class="muted">max 4</em></span><input name="sigla" maxlength="4" autocapitalize="characters" placeholder="' + esc(p ? siglaAuto(p.titolo) : 'TRIO') + '" value="' + esc(p ? (p.sigla || '') : '') + '"></label>' +
        '</div>' +
        '<p class="muted small nota-sigla">La sigla compare sui triangolini del bilancio in Cassa. Se la lasci vuota la calcolo dal titolo.</p>' +
        '<label class="campo"><span>Descrizione <em class="muted" id="cont-d"></em></span>' +
          '<textarea name="descrizione" rows="4" maxlength="1000" placeholder="Cosa vuoi realizzare e perché serve al ranch.">' + esc(p ? p.descrizione : '') + '</textarea></label>' +
        '<div class="due">' +
          '<label class="campo"><span>Quote totali</span><input name="quoteTotali" type="number" inputmode="numeric" min="' + (bloccato ? p.quoteVendute : 1) + '" max="10000" placeholder="50" value="' + (p ? p.quoteTotali : '') + '"></label>' +
          '<label class="campo"><span>Costo quota (€)</span><input name="costoQuota" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="10" value="' + (p ? p.costoQuota : '') + '"' + (bloccato ? ' disabled' : '') + '></label>' +
        '</div>' +
        (bloccato ? '<p class="muted small">Il costo quota è bloccato perché ci sono già acquisti; le quote totali non possono scendere sotto ' + p.quoteVendute + '.</p>' : '') +
        '<p class="totale-calc">Costo totale: <b id="tot">—</b></p>' +
        '<label class="campo"><span>Data di scadenza</span><input name="scadenza" type="date" min="' + oggi + '" value="' + esc(p ? p.scadenza : '') + '"></label>' +
        '<p class="errore" id="err-f" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
          '<button type="submit" class="btn primario">' + (nuovo ? 'Pubblica progetto' : 'Salva') + '</button></div>' +
      '</form>';
    document.body.appendChild(wrap);

    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-f');
    function totale() {
      var q = Number(f.quoteTotali.value), c = Number(f.costoQuota.value);
      wrap.querySelector('#tot').textContent = q > 0 && c > 0 ? UI.euro(q * c) + ' (' + plurale(q, 'quota', 'quote') + ' da ' + UI.euro(c) + ')' : '—';
    }
    function conta() { wrap.querySelector('#cont-d').textContent = f.descrizione.value.length + '/1000'; }
    f.addEventListener('input', function () { err.hidden = true; totale(); conta(); });
    totale(); conta();

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || (e.target.getAttribute && e.target.getAttribute('data-a') === 'no')) wrap.remove();
    });
    wrap.querySelector('input[type=file]').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      Cropper.open(file, { larghezza: 1600, altezza: 900, tondo: false, qualita: 0.82 }).then(function (url) {
        if (!url) return;
        nuovaFoto = url;
        wrap.querySelector('#anteprima-foto').innerHTML = '<img class="foto-progetto" src="' + url + '" alt="">';
      }).catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var dati = {
        titolo: f.titolo.value.trim(), descrizione: f.descrizione.value.trim(),
        sigla: (f.sigla.value.trim() || siglaAuto(f.titolo.value)).toUpperCase().slice(0, 4),
        quoteTotali: f.quoteTotali.value, costoQuota: bloccato ? p.costoQuota : f.costoQuota.value, scadenza: f.scadenza.value
      };
      var msg = !dati.titolo ? 'Scrivi un titolo.'
        : !(Number(dati.quoteTotali) >= 1) || !Number.isInteger(Number(dati.quoteTotali)) ? 'Indica quante quote servono (numero intero).'
        : !(Number(dati.costoQuota) > 0) ? 'Indica il costo di una quota.'
        : !dati.scadenza ? 'Scegli una data di scadenza.'
        : (nuovo && dati.scadenza < oggi) ? 'La scadenza non può essere nel passato.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Salvataggio…';
      var salva = nuovo ? RanchAPI.creaProgetto(ctx.k, dati) : RanchAPI.modificaProgetto(ctx.k, p.id, dati);
      salva.then(function (pr) {
        if (!nuovaFoto) return pr;
        btn.textContent = 'Caricamento foto…';
        return RanchAPI.caricaFotoProgetto(ctx.k, pr.id, nuovaFoto).then(function () { return pr; }, function () {
          UI.toast('Progetto salvato, ma la foto non è stata caricata. Riprova da Modifica.');
          return pr;
        });
      }).then(function (pr) {
        wrap.remove();
        UI.toast(nuovo ? 'Progetto pubblicato' : 'Progetto salvato');
        var dest = '#/progetti/' + pr.id;
        if (location.hash === dest) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = dest;
      }).catch(function (e2) {
        err.textContent = e2.message || 'Salvataggio non riuscito. Riprova.';
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = nuovo ? 'Pubblica progetto' : 'Salva';
      });
    });
  }

  return { lista: lista, scheda: scheda };
})();
