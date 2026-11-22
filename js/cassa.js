// Sezione Cassa: piano dei versamenti dei soci e flussi della società. L'admin può modificare tutto.
window.Cassa = (function () {
  var esc = UI.esc;

  function meseLabel(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
  }
  function meseAttuale() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function num(v) { return Number(v) || 0; }

  // tutti i numeri del piano, calcolati dalle righe
  function calcola(p) {
    var perSocio = p.rate.reduce(function (t, r) { return t + num(r.quotaMoto) + num(r.quotaCassa); }, 0);
    var mesi = {};
    p.rate.forEach(function (r) {
      var k = r.mese.slice(0, 7), m = mesi[k] || (mesi[k] = { mese: r.mese, entrate: 0, uscite: 0, voci: [] });
      m.entrate += (num(r.quotaMoto) + num(r.quotaCassa)) * p.soci;
    });
    function uscita(mese, importo, voce) {
      var k = mese.slice(0, 7), m = mesi[k] || (mesi[k] = { mese: mese.slice(0, 7) + '-01', entrate: 0, uscite: 0, voci: [] });
      m.uscite += num(importo);
      m.voci.push(voce);
    }
    (p.progetti || []).forEach(function (x) { uscita(x.scadenza, x.totale, x.titolo); });
    p.uscite.forEach(function (u) { uscita(u.mese, u.importo, u.voce); });
    var righe = Object.keys(mesi).sort().map(function (k) { return mesi[k]; }), saldo = 0;
    righe.forEach(function (m) { saldo += m.entrate - m.uscite; m.saldo = saldo; });
    var entrate = righe.reduce(function (t, m) { return t + m.entrate; }, 0);
    var uscite = righe.reduce(function (t, m) { return t + m.uscite; }, 0);
    return { perSocio: perSocio, entrate: entrate, uscite: uscite, finale: entrate - uscite, mesi: righe,
             negativo: righe.some(function (m) { return m.saldo < -0.005; }) };
  }

  function mostra(view, ctx) {
    view.innerHTML = UI.caricamento();
    RanchAPI.getPiano().then(function (p) {
      var c = calcola(p), ora = meseAttuale(), admin = ctx.me && ctx.me.admin;
      var totMoto = p.rate.reduce(function (t, r) { return t + num(r.quotaMoto); }, 0);
      var totCassa = p.rate.reduce(function (t, r) { return t + num(r.quotaCassa); }, 0);
      var r = p.reale || { versato: 0, speso: 0, creditoLibero: 0, quoteAperte: 0, raccoltoEsecuzione: 0 };
      var inCassa = num(r.versato) - num(r.speso);
      var quadra = Math.abs(inCassa - (num(r.creditoLibero) + num(r.quoteAperte))) < 0.005;
      view.innerHTML =
        '<h2 class="primo">Situazione reale</h2>' +
        '<div class="kpi-griglia tre">' +
          '<div class="kpi"><span>Versato dai soci</span><strong>' + UI.euro(r.versato) + '</strong></div>' +
          '<div class="kpi"><span>Speso (progetti in esecuzione)</span><strong>' + UI.euro(r.speso) + '</strong></div>' +
          '<div class="kpi evidenza"><span>In cassa ora</span><strong>' + UI.euro(inCassa) + '</strong></div>' +
        '</div>' +
        '<p class="quadratura ' + (quadra ? 'ok' : 'ko') + '">' + (quadra ? '✓ Quadra: ' : '⚠ Non quadra: ') +
          'in cassa ' + UI.euro(inCassa) + ' = credito libero dei soci ' + UI.euro(r.creditoLibero) + ' + quote raccolte su progetti aperti ' + UI.euro(r.quoteAperte) +
          (quadra ? '' : ' (differenza ' + UI.euro(inCassa - num(r.creditoLibero) - num(r.quoteAperte)) + ': un progetto in esecuzione non è stato pagato tutto con le quote)') + '</p>' +
        '<div class="piano-testa">' +
          '<div><p class="muted small">Piano in corso</p><h1>' + esc(p.titolo) + '</h1>' +
          '<p class="muted small">' + p.soci + ' soci' + (p.note ? ' · ' + esc(p.note) : '') + '</p></div>' +
          (admin ? '<button type="button" class="btn primario" id="mod-piano">Modifica piano</button>' : '') +
        '</div>' +
        '<div class="kpi-griglia">' +
          '<div class="kpi"><span>Versato da ogni socio</span><strong>' + UI.euro(c.perSocio) + '</strong></div>' +
          '<div class="kpi"><span>Entrate della società</span><strong>' + UI.euro(c.entrate) + '</strong></div>' +
          '<div class="kpi"><span>Uscite (progetti e altro)</span><strong>' + UI.euro(c.uscite) + '</strong></div>' +
          '<div class="kpi evidenza"><span>Fondocassa a fine piano</span><strong>' + UI.euro(c.finale) + '</strong></div>' +
        '</div>' +
        (c.negativo ? '<p class="avviso-cassa">Attenzione: in almeno un mese il saldo della società va sotto zero.</p>' : '') +

        '<h2>Rate per socio</h2>' +
        '<div class="tabella-wrap"><table class="tabella">' +
          '<thead><tr><th>Mese</th><th class="solo-largo">Voce</th><th class="n">Rata</th><th class="n">Moto</th><th class="n">Cassa</th></tr></thead><tbody>' +
          p.rate.map(function (r) {
            var k = r.mese.slice(0, 7);
            return '<tr class="' + (k === ora ? 'ora' : k < ora ? 'passato' : '') + '">' +
              '<td>' + esc(meseLabel(r.mese)) + '<span class="sotto-voce solo-stretto">' + esc(r.voce) + '</span></td>' +
              '<td class="solo-largo">' + esc(r.voce) + '</td>' +
              '<td class="n"><b>' + UI.euro(num(r.quotaMoto) + num(r.quotaCassa)) + '</b></td>' +
              '<td class="n">' + UI.euro(r.quotaMoto) + '</td><td class="n">' + UI.euro(r.quotaCassa) + '</td></tr>';
          }).join('') +
          '</tbody><tfoot><tr><td>Totale</td><td class="solo-largo"></td><td class="n"><b>' + UI.euro(c.perSocio) + '</b></td>' +
          '<td class="n">' + UI.euro(totMoto) + '</td><td class="n">' + UI.euro(totCassa) + '</td></tr></tfoot>' +
        '</table></div>' +

        '<h2>Uscite previste: i progetti</h2>' +
        '<p class="muted small">Ogni progetto pesa sulla cassa con il suo costo totale nel mese della scadenza. Passa in esecuzione solo quando è finanziato al 100%.</p>' +
        '<div class="tabella-wrap"><table class="tabella">' +
          '<thead><tr><th>Progetto</th><th class="n">Totale</th><th class="n">Raccolto</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
          (p.progetti || []).map(function (x) {
            var pct = x.totale > 0 ? Math.round(num(x.raccolto) / num(x.totale) * 100) : 0;
            return '<tr><td><a href="#/progetti/' + esc(x.id) + '">' + esc(x.titolo) + '</a>' +
              '<span class="sotto-voce">' + esc(meseLabel(x.scadenza.slice(0, 7) + '-01')) + ' · ' + x.quoteTotali + ' × ' + UI.euro(x.costoQuota) + ' · ' +
              (STATI[x.stato] || x.stato) + '</span></td>' +
              '<td class="n"><b>' + UI.euro(x.totale) + '</b></td>' +
              '<td class="n">' + UI.euro(x.raccolto) + '<span class="sotto-voce">' + pct + '%</span></td>' +
              (admin ? '<td class="n"><button type="button" class="btn piccolo" data-modp="' + esc(x.id) + '">Modifica</button></td>' : '') + '</tr>';
          }).join('') +
          '</tbody><tfoot><tr><td>Totale progetti</td><td class="n"><b>' + UI.euro((p.progetti || []).reduce(function (t, x) { return t + num(x.totale); }, 0)) + '</b></td>' +
          '<td class="n">' + UI.euro((p.progetti || []).reduce(function (t, x) { return t + num(x.raccolto); }, 0)) + '</td>' + (admin ? '<td></td>' : '') + '</tr></tfoot>' +
        '</table></div>' +
        (p.uscite.length ? '<p class="muted small">Altre uscite: ' + p.uscite.map(function (u) { return esc(u.voce) + ' ' + UI.euro(u.importo) + ' (' + esc(meseLabel(u.mese)) + ')'; }).join(' · ') + '</p>' : '') +

        '<h2>Cassa della società</h2>' +
        '<div class="tabella-wrap"><table class="tabella">' +
          '<thead><tr><th>Mese</th><th class="n">Entrate</th><th class="n">Uscite</th><th class="n">Saldo</th></tr></thead><tbody>' +
          c.mesi.map(function (m) {
            var k = m.mese.slice(0, 7);
            return '<tr class="' + (k === ora ? 'ora' : k < ora ? 'passato' : '') + '">' +
              '<td>' + esc(meseLabel(m.mese)) + (m.voci.length ? '<span class="sotto-voce">' + m.voci.map(esc).join(' · ') + '</span>' : '') + '</td>' +
              '<td class="n">' + (m.entrate ? UI.euro(m.entrate) : '—') + '</td>' +
              '<td class="n">' + (m.uscite ? '−' + UI.euro(m.uscite) : '—') + '</td>' +
              '<td class="n"><b class="' + (m.saldo < -0.005 ? 'neg' : '') + '">' + UI.euro(m.saldo) + '</b></td></tr>';
          }).join('') +
          '</tbody></table></div>' +
        '<p class="muted small">Entrate = rata per socio × ' + p.soci + ' soci. Aggiornato il ' + UI.data(p.aggiornatoIl) + '.</p>';

      var b = view.querySelector('#mod-piano');
      if (b) b.addEventListener('click', function () { editor(p, ctx, function () { mostra(view, ctx); }); });
      view.querySelectorAll('[data-modp]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          var x = p.progetti.filter(function (y) { return y.id === bt.getAttribute('data-modp'); })[0];
          modificaProgetto(x, ctx, function () { mostra(view, ctx); });
        });
      });
    }).catch(function (e) { view.innerHTML = UI.errore(e); });
  }

  // ---------- editor del piano (admin) ----------
  function editor(p, ctx, fatto) {
    var rate = p.rate.map(function (r) { return { mese: r.mese.slice(0, 7), voce: r.voce, quotaMoto: num(r.quotaMoto), quotaCassa: num(r.quotaCassa) }; });
    var uscite = p.uscite.map(function (u) { return { mese: u.mese.slice(0, 7), voce: u.voce, importo: num(u.importo) }; });
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<form class="modal largo editor-piano" role="dialog" aria-modal="true" aria-label="Modifica piano" novalidate>' +
        '<h2>Modifica piano</h2>' +
        '<div class="due"><label class="campo"><span>Titolo</span><input name="titolo" maxlength="80" value="' + esc(p.titolo) + '"></label>' +
        '<label class="campo"><span>Numero di soci</span><input name="soci" type="number" inputmode="numeric" min="1" max="100" value="' + p.soci + '"></label></div>' +
        '<label class="campo"><span>Note</span><textarea name="note" rows="2" maxlength="500">' + esc(p.note) + '</textarea></label>' +
        '<h3>Rate per socio</h3><div id="righe-rate"></div><button type="button" class="btn piccolo" id="agg-rata">+ Aggiungi rata</button>' +
        '<h3>Altre uscite (oltre ai progetti)</h3><div id="righe-uscite"></div><button type="button" class="btn piccolo" id="agg-uscita">+ Aggiungi uscita</button>' +
        '<div class="riepilogo" id="riep"></div>' +
        '<p class="errore" id="err-p" hidden></p>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button><button type="submit" class="btn primario">Salva piano</button></div>' +
      '</form>';
    document.body.appendChild(wrap);
    var f = wrap.querySelector('form'), err = wrap.querySelector('#err-p');

    function disegna() {
      wrap.querySelector('#righe-rate').innerHTML = rate.map(function (r, i) {
        return '<div class="riga-piano">' +
          '<label class="mese"><span>Mese</span><input type="month" data-r="' + i + '" data-k="mese" value="' + esc(r.mese) + '"></label>' +
          '<label class="voce"><span>Voce</span><input data-r="' + i + '" data-k="voce" maxlength="60" value="' + esc(r.voce) + '"></label>' +
          '<label><span>Moto €</span><input type="number" inputmode="decimal" step="0.01" min="0" data-r="' + i + '" data-k="quotaMoto" value="' + r.quotaMoto + '"></label>' +
          '<label><span>Cassa €</span><input type="number" inputmode="decimal" step="0.01" min="0" data-r="' + i + '" data-k="quotaCassa" value="' + r.quotaCassa + '"></label>' +
          '<button type="button" class="btn piccolo togli" data-via-r="' + i + '" aria-label="Togli rata">×</button></div>';
      }).join('');
      wrap.querySelector('#righe-uscite').innerHTML = uscite.length ? uscite.map(function (u, i) {
        return '<div class="riga-piano uscita">' +
          '<label class="mese"><span>Mese</span><input type="month" data-u="' + i + '" data-k="mese" value="' + esc(u.mese) + '"></label>' +
          '<label class="voce"><span>Voce</span><input data-u="' + i + '" data-k="voce" maxlength="60" value="' + esc(u.voce) + '"></label>' +
          '<label><span>Importo €</span><input type="number" inputmode="decimal" step="0.01" min="0" data-u="' + i + '" data-k="importo" value="' + u.importo + '"></label>' +
          '<button type="button" class="btn piccolo togli" data-via-u="' + i + '" aria-label="Togli uscita">×</button></div>';
      }).join('') : '<p class="muted small">Nessuna uscita.</p>';
      riepilogo();
    }
    function riepilogo() {
      var soci = Number(f.soci.value) || 0;
      var c = calcola({ soci: soci, rate: rate.filter(function (r) { return r.mese; }).map(function (r) { return { mese: r.mese + '-01', quotaMoto: r.quotaMoto, quotaCassa: r.quotaCassa }; }),
                        uscite: uscite.filter(function (u) { return u.mese; }).map(function (u) { return { mese: u.mese + '-01', importo: u.importo, voce: u.voce }; }) });
      wrap.querySelector('#riep').innerHTML = 'Ogni socio versa <b>' + UI.euro(c.perSocio) + '</b> · entrate ' + UI.euro(c.entrate) +
        ' · uscite ' + UI.euro(c.uscite) + ' · fondocassa finale <b class="' + (c.finale < 0 ? 'neg' : '') + '">' + UI.euro(c.finale) + '</b>' +
        (c.negativo ? '<br><span class="neg">In almeno un mese il saldo va sotto zero.</span>' : '');
    }
    disegna();

    f.addEventListener('input', function (e) {
      err.hidden = true;
      var t = e.target, k = t.getAttribute('data-k');
      if (t.hasAttribute('data-r')) rate[Number(t.getAttribute('data-r'))][k] = k === 'mese' || k === 'voce' ? t.value : num(t.value);
      if (t.hasAttribute('data-u')) uscite[Number(t.getAttribute('data-u'))][k] = k === 'mese' || k === 'voce' ? t.value : num(t.value);
      riepilogo();
    });
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (t === wrap || t.getAttribute('data-a') === 'no') { wrap.remove(); return; }
      if (t.id === 'agg-rata') {
        var ultima = rate[rate.length - 1], m = ultima && ultima.mese ? prossimoMese(ultima.mese) : meseAttuale();
        rate.push({ mese: m, voce: 'Rata', quotaMoto: ultima ? ultima.quotaMoto : 0, quotaCassa: ultima ? ultima.quotaCassa : 0 });
        disegna();
      }
      if (t.id === 'agg-uscita') { uscite.push({ mese: meseAttuale(), voce: '', importo: 0 }); disegna(); }
      if (t.hasAttribute('data-via-r')) { rate.splice(Number(t.getAttribute('data-via-r')), 1); disegna(); }
      if (t.hasAttribute('data-via-u')) { uscite.splice(Number(t.getAttribute('data-via-u')), 1); disegna(); }
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = !f.titolo.value.trim() ? 'Scrivi un titolo per il piano.'
        : !(Number(f.soci.value) >= 1) ? 'Indica il numero di soci.'
        : !rate.length ? 'Serve almeno una rata.'
        : rate.some(function (r) { return !r.mese; }) ? 'Ogni rata deve avere un mese.'
        : rate.some(function (r) { return r.quotaMoto + r.quotaCassa <= 0; }) ? 'Ogni rata deve avere un importo maggiore di zero.'
        : uscite.some(function (u) { return !u.mese || !(u.importo > 0); }) ? 'Ogni uscita deve avere mese e importo maggiore di zero.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Salvataggio…';
      RanchAPI.adminPianoSalva(ctx.k, {
        titolo: f.titolo.value.trim(), soci: Number(f.soci.value), note: f.note.value.trim(),
        rate: rate.map(function (r) { return { mese: r.mese + '-01', voce: r.voce, quotaMoto: r.quotaMoto, quotaCassa: r.quotaCassa }; }),
        uscite: uscite.map(function (u) { return { mese: u.mese + '-01', voce: u.voce, importo: u.importo }; })
      }).then(function () {
        wrap.remove(); UI.toast('Piano salvato'); fatto();
      }).catch(function (e2) {
        btn.disabled = false; btn.textContent = 'Salva piano';
        err.textContent = e2.message; err.hidden = false;
      });
    });
  }
  var STATI = { raccolta: 'in raccolta', sviluppo: 'in esecuzione', chiuso: 'chiuso' };

  // l'admin cambia quote, costo quota e scadenza di un progetto direttamente dalla cassa
  function modificaProgetto(x, ctx, fatto) {
    var esecuzione = x.stato === 'sviluppo' || x.stato === 'chiuso';
    var bloccato = x.quoteVendute > 0 || esecuzione;
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<form class="modal" role="dialog" aria-modal="true" aria-label="Modifica ' + esc(x.titolo) + '" novalidate>' +
        '<h2>' + esc(x.titolo) + '</h2>' +
        '<div class="due"><label class="campo"><span>Quote totali</span><input name="q" type="number" inputmode="numeric" min="' + Math.max(1, x.quoteVendute) + '" value="' + x.quoteTotali + '"' + (esecuzione ? ' disabled' : '') + '></label>' +
        '<label class="campo"><span>Costo quota (€)</span><input name="c" type="number" inputmode="decimal" step="0.01" min="0.01" value="' + num(x.costoQuota) + '"' + (bloccato ? ' disabled' : '') + '></label></div>' +
        (esecuzione ? '<p class="muted small">Il progetto è in esecuzione: quote e costo sono bloccati. Per cambiarli riportalo prima in raccolta dalla sua pagina.</p>'
          : bloccato ? '<p class="muted small">Il costo quota è bloccato perché ci sono già ' + x.quoteVendute + ' quote vendute; le quote totali non possono scendere sotto questo numero.</p>' : '') +
        '<label class="campo"><span>Scadenza (mese in cui pesa sulla cassa)</span><input name="s" type="date" value="' + esc(x.scadenza) + '"></label>' +
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
      RanchAPI.modificaProgetto(ctx.k, x.id, { titolo: x.titolo, descrizione: x.descrizione || '', quoteTotali: esecuzione ? x.quoteTotali : Number(f.q.value),
        costoQuota: bloccato ? num(x.costoQuota) : Number(f.c.value), scadenza: f.s.value })
        .then(function () { wrap.remove(); UI.toast('Progetto aggiornato'); fatto(); })
        .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
    });
  }

  function prossimoMese(m) {
    var a = Number(m.slice(0, 4)), b = Number(m.slice(5, 7)) + 1;
    if (b > 12) { b = 1; a++; }
    return a + '-' + String(b).padStart(2, '0');
  }

  return { mostra: mostra };
})();
