// Sezione Cassa: soldi veri della società.
//  * flusso di cassa: entrate effettive (rate pagate, accrediti) − progetti realizzati
//  * disponibile = credito libero dei soci + quote bloccate nei progetti in raccolta
//  * progetti in corso (quote bloccate), progetti realizzati, rate dei soci (l'admin le crea, il socio le segna pagate)
window.Cassa = (function () {
  var esc = UI.esc;

  function num(v) { return Number(v) || 0; }
  function meseLabel(k) { // 'YYYY-MM'
    return new Date(k + '-15T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }
  function meseAttuale() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function oggi() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function realizzato(x) { return x.stato === 'sviluppo' || x.stato === 'chiuso'; }
  function plurale(n, uno, tanti) { return n + ' ' + (n === 1 ? uno : tanti); }

  function calcola(c) {
    var mesi = {};
    function mese(k) { return mesi[k] || (mesi[k] = { mese: k, entrate: 0, uscite: 0, voci: [] }); }
    c.entrate.forEach(function (e) {
      var m = mese(e.mese);
      m.entrate += num(e.importo);
      m.voci.push(e.causale + (e.soci > 1 ? ' ×' + e.soci : ''));
    });
    var fatti = c.progetti.filter(realizzato), inCorso = c.progetti.filter(function (x) { return x.stato === 'raccolta'; });
    inCorso.sort(function (a, b) {
      var pa = a.totale > 0 ? num(a.raccolto) / num(a.totale) : 0, pb = b.totale > 0 ? num(b.raccolto) / num(b.totale) : 0;
      return (pb - pa) || String(a.scadenza).localeCompare(String(b.scadenza)) || a.titolo.localeCompare(b.titolo, 'it');
    });
    fatti.forEach(function (x) {
      var m = mese(String(x.eseguitoIl || x.scadenza).slice(0, 7));
      m.uscite += num(x.totale);
      m.voci.push(x.titolo);
    });
    var righe = Object.keys(mesi).sort().map(function (k) { return mesi[k]; }), saldo = 0;
    righe.forEach(function (m) { saldo += m.entrate - m.uscite; m.saldo = saldo; });
    var entrate = c.entrate.reduce(function (t, e) { return t + num(e.importo); }, 0);
    var uscite = fatti.reduce(function (t, x) { return t + num(x.totale); }, 0);
    var bloccato = inCorso.reduce(function (t, x) { return t + num(x.raccolto); }, 0);
    var future = 0, scadute = 0, oggiIso = oggi();
    c.rate.forEach(function (r) {
      r.soci.forEach(function (s) {
        if (s.pagataIl) return;
        future += num(r.importo);
        if (r.scadenza < oggiIso) scadute += num(r.importo);
      });
    });
    var disponibile = entrate - uscite;
    return { mesi: righe, entrate: entrate, uscite: uscite, disponibile: disponibile, bloccato: bloccato,
             libero: num(c.creditoLibero), future: future, scadute: scadute, fatti: fatti, inCorso: inCorso,
             attivi: inCorso.reduce(function (t, x) { return t + num(x.totale); }, 0),
             quadra: Math.abs(disponibile - (num(c.creditoLibero) + bloccato)) < 0.005 };
  }

  // cash flow: disponibile + rate future − costo stimato dei progetti attivi = balance
  // (l'immobilizzato è a parte: i beni dei progetti chiusi)
  function bilancio(t) {
    var entrate = t.disponibile + t.future, uscite = t.attivi, balance = entrate - uscite, ok = balance >= -0.005;
    var scala = Math.max(entrate, uscite, 1);
    var chiusi = t.fatti.filter(function (x) { return x.stato === 'chiuso'; });
    var immob = chiusi.reduce(function (s, x) { return s + num(x.totale); }, 0);
    function w(v) { return (Math.max(0, v) / scala * 100).toFixed(2) + '%'; }
    function seg(v, cls, nome) { return v > 0.005 ? '<span class="s ' + cls + '" style="width:' + w(v) + '" title="' + esc(nome + ': ' + UI.euro(v)) + '"></span>' : ''; }
    var IN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v13M6 11l6 6 6-6M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var OUT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20V7M6 13l6-6 6 6M5 4h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var pctBl = uscite > 0 ? Math.round(t.bloccato / uscite * 100) : 0;
    function barra(v, cls, nome) {
      return '<div class="bil-bar"><span class="s ' + cls + '" style="width:' + w(v) + '" title="' + esc(nome + ': ' + UI.euro(v)) + '"></span></div>';
    }
    return '<section class="bil" aria-label="Bilancio della cassa">' +
      '<div class="bil-col entrate">' +
        '<header><span class="ico">' + IN + '</span><span class="tit">Cassa<small>in cassa ora' +
          (t.bloccato > 0.005 ? ' · di cui bloccati ' + UI.euro(t.bloccato) : '') + '</small></span><strong>' + UI.euro(t.disponibile) + '</strong></header>' +
        barra(t.disponibile, 'pieno', 'Cassa') +
        '<div class="figli">' +
          '<div class="figlio fut"><div class="riga"><span>Rate future<small>' +
            (t.scadute > 0 ? '<span class="neg">' + UI.euro(t.scadute) + ' scadute</span>' : 'ancora da incassare') + '</small></span><b>+' + UI.euro(t.future) + '</b></div>' +
            barra(t.future, 'righe', 'Rate future') + '</div>' +
          '<div class="figlio tot"><div class="riga"><span>Totale futuro<small>cassa + rate future</small></span><b>' + UI.euro(entrate) + '</b></div>' +
            barra(entrate, 'totale', 'Totale futuro') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="bil-col uscite">' +
        '<header><span class="ico">' + OUT + '</span><span class="tit">Uscite<small>costo stimato · ' + plurale(t.inCorso.length, 'progetto', 'progetti') + ' in raccolta</small></span><strong>' + UI.euro(uscite) + '</strong></header>' +
        '<div class="traccia-wrap" style="width:' + w(uscite) + '">' +
          '<div class="bil-bar traccia"><span class="s pieno" style="width:' + pctBl + '%" title="' + esc('Bloccati: ' + UI.euro(t.bloccato)) + '"></span></div>' +
          checkpoint(t.inCorso, uscite) +
        '</div>' +
        '<p class="rapporto"><b>' + UI.euro(t.bloccato) + '</b> bloccati / ' + UI.euro(uscite) + ' da bloccare per i progetti <span class="pct">' + pctBl + '%</span></p>' +
      '</div>' +
      '<div class="bil-saldo ' + (ok ? 'ok' : 'ko') + '">' +
        '<span class="lab">Balance<small>totale futuro − uscite</small></span>' +
        '<span class="pill"><i aria-hidden="true">' + (ok ? '✓' : '!') + '</i>' + (balance > 0.005 ? '+' : balance < -0.005 ? '−' : '') + UI.euro(Math.abs(balance)) + '</span>' +
      '</div>' +
    '</section>' +
    '<button type="button" class="immobilizzato" id="apri-immob">' +
      '<span class="im-icona" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>' +
      '<span class="im-testo"><span>Immobilizzato · beni della società</span><strong>' + UI.euro(immob) + '</strong>' +
        '<small>' + (chiusi.length ? plurale(chiusi.length, 'progetto chiuso', 'progetti chiusi') : 'nessun progetto chiuso') + '</small></span>' +
      '<span class="im-cta">Vedi ›</span>' +
    '</button>';
  }

  // sigla: iniziali delle prime 3 parole + ultimo carattere ("Valtinsu EM5 Ultra #1" → VEU1)
  function sigla(titolo) {
    var parole = String(titolo).trim().split(/\s+/), t = String(titolo).trim();
    return (parole.slice(0, 3).map(function (p) { return p.charAt(0); }).join('') + t.charAt(t.length - 1)).toUpperCase();
  }
  // triangolini sulla barra delle uscite: un checkpoint alla fine di ogni progetto, in ordine di scadenza
  function checkpoint(progetti, totale) {
    if (!(totale > 0) || !progetti.length) return '';
    var lista = progetti.slice().sort(function (a, b) { return String(a.scadenza).localeCompare(String(b.scadenza)) || a.titolo.localeCompare(b.titolo, 'it'); });
    var cum = 0, ultimi = [-99, -99, -99];
    var html = lista.map(function (x) {
      cum += num(x.totale);
      var pos = Math.min(100, cum / totale * 100), riga = 0;
      while (riga < 2 && pos - ultimi[riga] < 11) riga++;
      ultimi[riga] = pos;
      var fatto = num(x.raccolto) >= num(x.totale) - 0.005;
      return '<span class="cp riga' + riga + (fatto ? ' fatto' : '') + '" style="left:' + pos.toFixed(2) + '%" title="' +
        esc(x.titolo + ' · scade ' + UI.data(x.scadenza) + ' · ' + UI.euro(x.totale) + ' (progressivo ' + UI.euro(cum) + ')') + '">' +
        '<i></i><span>' + esc(sigla(x.titolo)) + '</span></span>';
    }).join('');
    var righe = Math.max.apply(null, ultimi.map(function (v, i) { return v > -99 ? i : 0; }));
    return '<div class="checkpoint r' + righe + '">' + html + '</div>';
  }

  function apriImmobilizzato(t) {
    var chiusi = t.fatti.filter(function (x) { return x.stato === 'chiuso'; })
      .sort(function (a, b) { return String(b.chiusoIl || '').localeCompare(String(a.chiusoIl || '')); });
    var w = document.createElement('div');
    w.className = 'modal-bg';
    w.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Immobilizzato">' +
      '<h2>Immobilizzato</h2>' +
      (chiusi.length ?
        '<ul class="elenco">' + chiusi.map(function (x) {
          return '<li><span><a href="#/progetti/' + esc(x.id) + '" data-chiudi>' + esc(x.titolo) + '</a>' +
            '<span class="sotto-voce">chiuso il ' + esc(x.chiusoIl ? UI.data(x.chiusoIl) : '—') + '</span></span><b>' + UI.euro(x.totale) + '</b></li>';
        }).join('') + '</ul>' +
        '<p class="anteprima">Totale: <b>' + UI.euro(chiusi.reduce(function (s, x) { return s + num(x.totale); }, 0)) + '</b></p>'
        : '<p class="muted">Nessun progetto chiuso. Quando l\'admin chiude un progetto, il suo valore finisce qui.</p>') +
      '<div class="azioni"><button type="button" class="btn" data-a="no">Chiudi</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (e) {
      if (e.target === w || (e.target.getAttribute && e.target.getAttribute('data-a') === 'no') || e.target.hasAttribute('data-chiudi')) w.remove();
    });
  }

  function mostra(view, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getCassa().then(function (c) {
      var t = calcola(c), ora = meseAttuale(), admin = !!(ctx.me && ctx.me.admin), io = ctx.me && ctx.me.id;
      // si apre solo la prima rata che devo ancora pagare
      var primaMia = c.rate.filter(function (r) { return r.visibile !== false && r.soci.some(function (x) { return x.id === io && !x.pagataIl; }); })[0];
      view.innerHTML =
        bilancio(t) +
        '<h2>Flusso di cassa</h2>' +
        (t.mesi.length ?
          '<div class="tabella-wrap"><table class="tabella">' +
            '<thead><tr><th>Mese</th><th class="n">Entrate</th><th class="n">Uscite</th><th class="n">Saldo</th></tr></thead><tbody>' +
            t.mesi.map(function (m) {
              return '<tr class="' + (m.mese === ora ? 'ora' : '') + '">' +
                '<td>' + esc(meseLabel(m.mese)) + '<span class="sotto-voce">' + m.voci.map(esc).join(' · ') + '</span></td>' +
                '<td class="n">' + (m.entrate ? UI.euro(m.entrate) : '—') + '</td>' +
                '<td class="n">' + (m.uscite ? '−' + UI.euro(m.uscite) : '—') + '</td>' +
                '<td class="n"><b class="' + (m.saldo < -0.005 ? 'neg' : '') + '">' + UI.euro(m.saldo) + '</b></td></tr>';
            }).join('') +
            '</tbody><tfoot><tr><td>Totale</td><td class="n">' + UI.euro(t.entrate) + '</td><td class="n">' + (t.uscite ? '−' + UI.euro(t.uscite) : '—') +
            '</td><td class="n"><b>' + UI.euro(t.disponibile) + '</b></td></tr></tfoot>' +
          '</table></div>'
          : '<p class="muted">Nessun movimento di cassa.</p>') +

        '<h2>Progetti in corso</h2>' +
        '<p class="muted small">Le quote comprate restano bloccate nel progetto finché è finanziato al 100% e passa in esecuzione.</p>' +
        (t.inCorso.length ?
          '<div class="tabella-wrap"><table class="tabella">' +
            '<thead><tr><th>Progetto</th><th class="n">Quote bloccate</th><th class="n">Bloccato</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
            t.inCorso.map(function (x) {
              var pct = x.quoteTotali > 0 ? Math.min(100, Math.round(x.quoteVendute / x.quoteTotali * 100)) : 0;
              return '<tr><td><a href="#/progetti/' + esc(x.id) + '">' + esc(x.titolo) + '</a>' +
                '<span class="sotto-voce">scade ' + esc(UI.data(x.scadenza)) + ' · ' + plurale(x.sostenitori, 'sostenitore', 'sostenitori') + '</span>' +
                '<div class="barra' + (pct >= 100 ? ' completa' : '') + '"><span style="width:' + pct + '%"></span></div></td>' +
                '<td class="n"><b>' + x.quoteVendute + '</b> / ' + x.quoteTotali + '<span class="sotto-voce">' + pct + '%</span></td>' +
                '<td class="n"><b>' + UI.euro(x.raccolto) + '</b><span class="sotto-voce">su ' + UI.euro(x.totale) + '</span></td>' +
                (admin ? '<td class="n"><button type="button" class="btn piccolo" data-modp="' + esc(x.id) + '">Modifica</button></td>' : '') + '</tr>';
            }).join('') +
            '</tbody><tfoot><tr><td>Totale</td><td></td><td class="n"><b>' + UI.euro(t.bloccato) + '</b><span class="sotto-voce">su ' +
              UI.euro(t.inCorso.reduce(function (s, x) { return s + num(x.totale); }, 0)) + '</span></td>' + (admin ? '<td></td>' : '') + '</tr></tfoot>' +
          '</table></div>'
          : '<p class="muted">Nessun progetto in raccolta.</p>') +

        '<h2>Progetti realizzati</h2>' +
        (t.fatti.length ?
          '<div class="tabella-wrap"><table class="tabella">' +
            '<thead><tr><th>Progetto</th><th class="n">Pagato</th></tr></thead><tbody>' +
            t.fatti.map(function (x) {
              return '<tr><td><a href="#/progetti/' + esc(x.id) + '">' + esc(x.titolo) + '</a>' +
                '<span class="sotto-voce">' + (x.stato === 'chiuso' ? 'chiuso' : 'in esecuzione') +
                (x.eseguitoIl ? ' dal ' + esc(UI.data(x.eseguitoIl)) : '') + '</span></td>' +
                '<td class="n"><b>' + UI.euro(x.totale) + '</b></td></tr>';
            }).join('') +
            '</tbody></table></div>'
          : '<p class="muted">Ancora nessuno: un progetto esce dalla cassa quando passa in esecuzione.</p>') +

        '<div class="titolo-azione"><h2>Rate</h2>' +
          (admin ? '<button type="button" class="btn primario piccolo" id="nuova-rata">+ Nuova rata</button>' : '') + '</div>' +
        (c.rate.length ? '<div class="rate">' + c.rate.map(function (r) { return rataHtml(r, admin, io, r === primaMia); }).join('') + '</div>'
          : '<p class="muted">Nessuna rata.</p>');

      view.querySelectorAll('[data-modp]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          var x = c.progetti.filter(function (y) { return y.id === bt.getAttribute('data-modp'); })[0];
          modificaProgetto(x, ctx, function () { mostra(view, ctx); });
        });
      });
      var nr = view.querySelector('#nuova-rata');
      if (nr) nr.addEventListener('click', function () { editorRata(null, ctx, function () { mostra(view, ctx); }); });
      view.querySelectorAll('[data-modr]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          var r = c.rate.filter(function (y) { return y.id === bt.getAttribute('data-modr'); })[0];
          editorRata(r, ctx, function () { mostra(view, ctx); });
        });
      });
      collegaPagamenti(view, c.rate, ctx, function () { mostra(view, ctx); });
      view.querySelector('#apri-immob').addEventListener('click', function () { apriImmobilizzato(t); });
      view.querySelectorAll('[data-vis]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          var v = bt.getAttribute('data-vis').split('|');
          bt.disabled = true;
          RanchAPI.adminRataVisibile(ctx.k, v[0], v[1] === '1').then(function () {
            UI.toast(v[1] === '1' ? 'Rata visibile: ora si può pagare' : 'Rata non visibile');
            mostra(view, ctx);
          }).catch(function (e) { bt.disabled = false; UI.toast(e.message); });
        });
      });
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  function rataHtml(r, admin, io, aperta) {
    var pagati = r.soci.filter(function (s) { return s.pagataIl; }).length, n = r.soci.length;
    var scaduta = r.scadenza < oggi() && pagati < n, visibile = r.visibile !== false;
    return '<details class="rata' + (pagati === n ? ' saldata' : '') + (visibile ? '' : ' nascosta') + '"' + (aperta ? ' open' : '') + '>' +
      '<summary><span class="rata-titolo"><b>' + esc(r.titolo) + '</b>' +
        '<span class="sotto-voce">' + UI.euro(r.importo) + ' a testa · scade ' + esc(UI.data(r.scadenza)) +
        (!visibile ? ' · non visibile' : scaduta ? ' · <span class="neg">scaduta</span>' : '') + '</span></span>' +
        '<span class="rata-stato"><b>' + pagati + '/' + n + '</b><span class="sotto-voce">' + UI.euro(pagati * num(r.importo)) + ' di ' + UI.euro(n * num(r.importo)) + '</span></span>' +
      '</summary>' +
      '<ul class="elenco rata-soci">' + r.soci.map(function (s) {
        var azione = '';
        if (!s.pagataIl && visibile && (admin || s.id === io))
          azione = '<button type="button" class="btn primario piccolo" data-paga="' + esc(r.id) + '|' + esc(s.id) + '">' + (s.id === io ? 'L\'ho pagata' : 'Segna pagata') + '</button>';
        else if (s.pagataIl && admin)
          azione = '<button type="button" class="btn piccolo" data-annulla="' + esc(r.id) + '|' + esc(s.id) + '">Annulla</button>';
        return '<li><span class="rata-socio">' + UI.avatar(s, 28) + '<span>' + esc(s.nome) +
          '<span class="sotto-voce">' + (s.pagataIl ? '<span class="pos">✓ pagata il ' + esc(UI.data(s.pagataIl)) + '</span>' : 'da pagare') + '</span></span></span>' +
          azione + '</li>';
      }).join('') + '</ul>' +
      (admin ? '<div class="rata-admin"><button type="button" class="btn piccolo" data-modr="' + esc(r.id) + '">Modifica rata</button>' +
        '<button type="button" class="btn piccolo" data-vis="' + esc(r.id) + '|' + (visibile ? '0' : '1') + '">' + (visibile ? 'Rendi non visibile' : 'Rendi visibile') + '</button></div>' : '') +
    '</details>';
  }

  // pulsanti "pagata" / "annulla" (usati sia in Cassa sia nella scheda del socio)
  function collegaPagamenti(root, rate, ctx, fatto) {
    function trova(v) {
      var p = v.split('|'), r = rate.filter(function (x) { return x.id === p[0]; })[0];
      var s = r && (r.soci ? r.soci.filter(function (y) { return y.id === p[1]; })[0] : null);
      return { rata: p[0], socio: p[1], r: r, s: s };
    }
    root.querySelectorAll('[data-paga]').forEach(function (bt) {
      bt.addEventListener('click', function () {
        var x = trova(bt.getAttribute('data-paga'));
        var mia = ctx.me && ctx.me.id === x.socio;
        conferma(mia ? 'Hai pagato questa rata?' : 'Segnare la rata come pagata?',
          '<b>' + esc(x.r.titolo) + '</b>, ' + UI.euro(x.r.importo) + (mia ? '' : ' di ' + esc(x.s ? x.s.nome : '')) +
          '. L\'importo entra in cassa e diventa credito ' + (mia ? 'tuo' : 'del socio') + ' da usare sui progetti.',
          'Sì, pagata', function () {
            bt.disabled = true;
            RanchAPI.rataPaga(ctx.k, x.rata, x.socio).then(function () {
              UI.toast('Rata pagata: +' + UI.euro(x.r.importo) + ' di credito');
              if (mia && ctx.ricaricaMe) ctx.ricaricaMe();
              fatto();
            }).catch(function (e) { bt.disabled = false; UI.toast(e.message); });
          });
      });
    });
    root.querySelectorAll('[data-annulla]').forEach(function (bt) {
      bt.addEventListener('click', function () {
        var x = trova(bt.getAttribute('data-annulla'));
        conferma('Annullare il pagamento?', '<b>' + esc(x.r.titolo) + '</b> di ' + esc(x.s ? x.s.nome : '') + ' torna da pagare e gli vengono tolti ' +
          UI.euro(x.r.importo) + ' di credito.', 'Annulla pagamento', function () {
            bt.disabled = true;
            RanchAPI.adminRataAnnulla(ctx.k, x.rata, x.socio).then(function () {
              UI.toast('Pagamento annullato'); fatto();
            }).catch(function (e) { bt.disabled = false; UI.toast(e.message); });
          }, true);
      });
    });
  }

  // ---------- nuova / modifica rata (admin) ----------
  function editorRata(r, ctx, fatto) {
    RanchAPI.getSoci().then(function (d) {
      var pagati = {}, scelti = {};
      if (r) r.soci.forEach(function (s) { scelti[s.id] = true; if (s.pagataIl) pagati[s.id] = true; });
      else d.soci.forEach(function (s) { scelti[s.id] = true; });
      var soci = d.soci.slice();
      if (r) r.soci.forEach(function (s) { if (!soci.some(function (y) { return y.id === s.id; })) soci.push(s); });
      var qualcunoPaga = Object.keys(pagati).length > 0;
      var wrap = document.createElement('div');
      wrap.className = 'modal-bg';
      wrap.innerHTML =
        '<form class="modal largo" role="dialog" aria-modal="true" aria-label="' + (r ? 'Modifica rata' : 'Nuova rata') + '" novalidate>' +
          '<h2>' + (r ? 'Modifica rata' : 'Nuova rata') + '</h2>' +
          '<label class="campo"><span>Nome</span><input name="titolo" maxlength="80" placeholder="Terra e fondocassa · maggio" value="' + esc(r ? r.titolo : '') + '"></label>' +
          '<div class="due"><label class="campo"><span>Importo a testa (€)</span><input name="importo" type="number" inputmode="decimal" step="0.01" min="0.01" value="' + (r ? num(r.importo) : '') + '"' + (qualcunoPaga ? ' disabled' : '') + '></label>' +
          '<label class="campo"><span>Scadenza</span><input name="scadenza" type="date" value="' + esc(r ? r.scadenza : '') + '"></label></div>' +
          (qualcunoPaga ? '<p class="muted small">L\'importo è bloccato perché qualcuno ha già pagato.</p>' : '') +
          '<fieldset class="scelta-soci"><legend>Soci <button type="button" class="link" id="tutti">tutti</button> · <button type="button" class="link" id="nessuno">nessuno</button></legend>' +
            soci.map(function (s) {
              return '<label><input type="checkbox" name="soci" value="' + esc(s.id) + '"' + (scelti[s.id] ? ' checked' : '') + (pagati[s.id] ? ' disabled' : '') + '> ' +
                esc(s.nome) + (pagati[s.id] ? ' <span class="muted small">(ha pagato)</span>' : '') + '</label>';
            }).join('') +
          '</fieldset>' +
          '<p class="anteprima" id="tot-r"></p>' +
          '<p class="errore" id="err-r" hidden></p>' +
          '<div class="azioni">' + (r && !qualcunoPaga ? '<button type="button" class="btn pericolo" data-a="elimina">Elimina</button>' : '') +
            '<button type="button" class="btn" data-a="no">Annulla</button><button type="submit" class="btn primario">Salva</button></div>' +
        '</form>';
      document.body.appendChild(wrap);
      var f = wrap.querySelector('form'), err = wrap.querySelector('#err-r');
      function ids() { return Array.prototype.map.call(f.querySelectorAll('input[name=soci]:checked'), function (i) { return i.value; }); }
      function tot() {
        var n = ids().length, imp = num(f.importo.value);
        wrap.querySelector('#tot-r').innerHTML = plurale(n, 'socio', 'soci') + ' × ' + UI.euro(imp) + ' = <b>' + UI.euro(n * imp) + '</b> in arrivo';
      }
      tot();
      f.addEventListener('input', function () { err.hidden = true; tot(); });
      f.addEventListener('change', tot);
      wrap.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-a');
        if (e.target === wrap || a === 'no') wrap.remove();
        if (e.target.id === 'tutti' || e.target.id === 'nessuno') {
          f.querySelectorAll('input[name=soci]:not(:disabled)').forEach(function (i) { i.checked = e.target.id === 'tutti'; });
          tot();
        }
        if (a === 'elimina') {
          RanchAPI.adminRataElimina(ctx.k, r.id).then(function () { wrap.remove(); UI.toast('Rata eliminata'); fatto(); })
            .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
        }
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var imp = qualcunoPaga ? num(r.importo) : Number(f.importo.value), sel = ids();
        var msg = !f.titolo.value.trim() ? 'Scrivi il nome della rata.'
          : !(imp > 0) ? 'Indica un importo maggiore di zero.'
          : !f.scadenza.value ? 'Scegli la scadenza.'
          : !sel.length ? 'Scegli almeno un socio.' : '';
        if (msg) { err.textContent = msg; err.hidden = false; return; }
        var btn = f.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Salvataggio…';
        RanchAPI.adminRataSalva(ctx.k, { id: r ? r.id : null, titolo: f.titolo.value.trim(), importo: imp, scadenza: f.scadenza.value, soci: sel })
          .then(function () { wrap.remove(); UI.toast(r ? 'Rata aggiornata' : 'Rata creata'); fatto(); })
          .catch(function (e2) { btn.disabled = false; btn.textContent = 'Salva'; err.textContent = e2.message; err.hidden = false; });
      });
    }).catch(function (e) { UI.toast(e.message); });
  }

  // ---------- l'admin cambia quote, costo quota e scadenza di un progetto in raccolta ----------
  function modificaProgetto(x, ctx, fatto) {
    var bloccato = x.quoteVendute > 0;
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<form class="modal" role="dialog" aria-modal="true" aria-label="Modifica ' + esc(x.titolo) + '" novalidate>' +
        '<h2>' + esc(x.titolo) + '</h2>' +
        '<div class="due"><label class="campo"><span>Quote totali</span><input name="q" type="number" inputmode="numeric" min="' + Math.max(1, x.quoteVendute) + '" value="' + x.quoteTotali + '"></label>' +
        '<label class="campo"><span>Costo quota (€)</span><input name="c" type="number" inputmode="decimal" step="0.01" min="0.01" value="' + num(x.costoQuota) + '"' + (bloccato ? ' disabled' : '') + '></label></div>' +
        (bloccato ? '<p class="muted small">Il costo quota è bloccato perché ci sono già ' + x.quoteVendute + ' quote vendute; le quote totali non possono scendere sotto questo numero.</p>' : '') +
        '<label class="campo"><span>Scadenza</span><input name="s" type="date" value="' + esc(x.scadenza) + '"></label>' +
        '<p class="anteprima" id="tot-p"></p>' +
        '<p class="errore" id="err-mp" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button><button type="submit" class="btn primario">Salva</button></div>' +
      '</form>';
    document.body.appendChild(wrap);
    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-mp');
    function tot() { wrap.querySelector('#tot-p').innerHTML = 'Costo totale: <b>' + UI.euro(num(f.q.value) * num(f.c.value)) + '</b>'; }
    f.addEventListener('input', function () { err.hidden = true; tot(); });
    tot();
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.getAttribute('data-a') === 'no') wrap.remove(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.s.value) { err.textContent = 'Scegli una scadenza.'; err.hidden = false; return; }
      RanchAPI.modificaProgetto(ctx.k, x.id, { titolo: x.titolo, descrizione: x.descrizione || '', quoteTotali: Number(f.q.value),
        costoQuota: bloccato ? num(x.costoQuota) : Number(f.c.value), scadenza: f.s.value })
        .then(function () { wrap.remove(); UI.toast('Progetto aggiornato'); fatto(); })
        .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
    });
  }

  function conferma(titolo, testoHtml, etichetta, siFn, pericolo) {
    var w = document.createElement('div');
    w.className = 'modal-bg';
    w.innerHTML = '<div class="modal" role="alertdialog" aria-modal="true" aria-label="' + esc(titolo) + '">' +
      '<h2>' + esc(titolo) + '</h2><p>' + testoHtml + '</p>' +
      '<div class="azioni"><button type="button" class="btn" data-a="no">Indietro</button>' +
      '<button type="button" class="btn ' + (pericolo ? 'pericolo-pieno' : 'primario') + '" data-a="si">' + esc(etichetta) + '</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (ev) {
      var a = ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (ev.target === w || a === 'no') w.remove();
      if (a === 'si') { w.remove(); siFn(); }
    });
  }

  return { mostra: mostra, collegaPagamenti: collegaPagamenti };
})();
