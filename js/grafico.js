// Grafico dell'andamento dei progetti, disegnato in SVG senza librerie.
// Barre: somma cumulata dei costi totali dei progetti, posizionata alla loro scadenza.
// Linea: totale raccolto nel tempo (cumulato giorno per giorno).
window.Grafico = (function () {
  var esc = UI.esc;
  var W = 640, H = 300, M = { s: 48, d: 12, a: 16, b: 34 };
  var GIORNO = 864e5;

  function data(iso) { return new Date(iso + 'T12:00:00').getTime(); }
  function etichettaMese(t) { return new Date(t).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }); }
  function etichettaGiorno(t) { return new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function euroBreve(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k €' : Math.round(n) + ' €'; }
  function passoBello(max) {
    var grezzo = max / 4, p = Math.pow(10, Math.floor(Math.log10(grezzo || 1)));
    var r = grezzo / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
  }

  function apri() {
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<div class="modal grafico" role="dialog" aria-modal="true" aria-label="Andamento dei progetti">' +
        '<div class="testa-grafico"><h2>Andamento dei progetti</h2>' +
        '<button type="button" class="btn piccolo" data-a="no" aria-label="Chiudi">Chiudi</button></div>' +
        '<div id="corpo-grafico">' + UI.caricamento() + '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || (e.target.getAttribute && e.target.getAttribute('data-a') === 'no')) wrap.remove();
    });
    RanchAPI.getAndamento().then(function (d) {
      disegna(wrap.querySelector('#corpo-grafico'), d);
    }).catch(function (e) { wrap.querySelector('#corpo-grafico').innerHTML = UI.errore(e); });
  }

  function disegna(el, d) {
    if (!d.progetti.length) { el.innerHTML = '<p class="muted pad">Nessun progetto da mostrare.</p>'; return; }
    // il disegno usa la larghezza reale, così le scritte restano leggibili anche sul telefono
    W = Math.max(300, Math.round(el.clientWidth || 640));
    H = W < 500 ? 240 : 300;
    if (!el._ridisegna) {
      el._ridisegna = true;
      var ultimaW = W;
      window.addEventListener('resize', function () {
        if (!document.body.contains(el)) return;
        if (Math.abs((el.clientWidth || 0) - ultimaW) > 40) { ultimaW = el.clientWidth; disegna(el, d); }
      });
    }
    var oggi = data(d.oggi);

    // barre: una per data di scadenza, altezza = somma cumulata dei totali fino a quella data
    var perData = {};
    d.progetti.forEach(function (p) {
      var x = perData[p.scadenza] || (perData[p.scadenza] = { t: data(p.scadenza), totale: 0, progetti: [] });
      x.totale += Number(p.totale);
      x.progetti.push(p);
    });
    var barre = Object.keys(perData).sort().map(function (k) { return perData[k]; });
    var cum = 0;
    barre.forEach(function (b) { cum += b.totale; b.cumulato = cum; });

    // linea: raccolto cumulato giorno per giorno
    var punti = [], somma = 0;
    d.raccolta.forEach(function (r) { somma += Number(r.importo); punti.push({ t: data(r.giorno), v: somma }); });

    var t0 = Math.min(oggi, punti.length ? punti[0].t : oggi, barre[0].t) - 7 * GIORNO;
    var t1 = Math.max(oggi, barre[barre.length - 1].t) + 10 * GIORNO;
    var yMax = Math.max(cum, somma, 1);
    var passo = passoBello(yMax), yTop = Math.ceil(yMax / passo) * passo;
    var X = function (t) { return M.s + (t - t0) / (t1 - t0) * (W - M.s - M.d); };
    var Y = function (v) { return H - M.b - v / yTop * (H - M.a - M.b); };
    function raccoltoAl(t) { var v = 0; punti.forEach(function (p) { if (p.t <= t) v = p.v; }); return v; }
    function obiettivoAl(t) { var v = 0; barre.forEach(function (b) { if (b.t <= t) v = b.cumulato; }); return v; }

    var svg = '';
    // griglia e asse y
    for (var v = 0; v <= yTop + 1e-9; v += passo) {
      svg += '<line class="g-griglia" x1="' + M.s + '" x2="' + (W - M.d) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>' +
        '<text class="g-asse" x="' + (M.s - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + euroBreve(v) + '</text>';
    }
    // asse x: inizio di ogni mese
    var m = new Date(t0); m.setDate(1); m.setMonth(m.getMonth() + 1);
    var mesi = [];
    while (m.getTime() < t1) { mesi.push(m.getTime()); m.setMonth(m.getMonth() + 1); }
    var ogni = Math.max(1, Math.ceil(mesi.length / Math.max(3, Math.floor((W - M.s) / 70))));
    mesi.forEach(function (t, i) {
      if (i % ogni) return;
      svg += '<line class="g-tacca" x1="' + X(t) + '" x2="' + X(t) + '" y1="' + (H - M.b) + '" y2="' + (H - M.b + 4) + '"/>' +
        '<text class="g-asse" x="' + X(t) + '" y="' + (H - M.b + 18) + '" text-anchor="middle">' + etichettaMese(t) + '</text>';
    });
    svg += '<line class="g-base" x1="' + M.s + '" x2="' + (W - M.d) + '" y1="' + (H - M.b) + '" y2="' + (H - M.b) + '"/>';
    // oggi
    svg += '<line class="g-oggi" x1="' + X(oggi) + '" x2="' + X(oggi) + '" y1="' + M.a + '" y2="' + (H - M.b) + '"/>' +
      '<text class="g-asse" x="' + (X(oggi) + 4) + '" y="' + (M.a + 10) + '">oggi</text>';
    // barre (angoli superiori arrotondati, base dritta sull'asse)
    var lb = 12;
    barre.forEach(function (b, i) {
      var x = X(b.t) - lb / 2, y = Y(b.cumulato), h = H - M.b - y, r = Math.min(4, h);
      svg += '<path class="g-barra" data-i="' + i + '" d="M' + x + ' ' + (H - M.b) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
        'H' + (x + lb - r) + 'Q' + (x + lb) + ' ' + y + ' ' + (x + lb) + ' ' + (y + r) + 'V' + (H - M.b) + 'Z"/>';
    });
    // linea del raccolto: a gradini, da sinistra fino a oggi
    var d0 = 'M' + X(t0) + ' ' + Y(0), ultimo = 0;
    punti.forEach(function (p) { d0 += 'H' + X(p.t) + 'V' + Y(p.v); ultimo = p.v; });
    d0 += 'H' + X(oggi);
    svg += '<path class="g-linea" d="' + d0 + '"/>' +
      '<circle class="g-punto" cx="' + X(oggi) + '" cy="' + Y(ultimo) + '" r="4.5"/>' +
      '<text class="g-valore" x="' + (X(oggi) + 8) + '" y="' + (Math.min(Y(ultimo), H - M.b - 8) - 10) + '">' + UI.euro(ultimo) + ' raccolti</text>';
    // etichetta diretta sull'ultima barra
    var ub = barre[barre.length - 1];
    svg += '<text class="g-valore" x="' + Math.min(X(ub.t), W - M.d - 4) + '" y="' + (Y(ub.cumulato) - 8) + '" text-anchor="end">' + UI.euro(ub.cumulato) + '</text>';
    // cursore per il tooltip
    svg += '<line class="g-cursore" id="g-cursore" x1="0" x2="0" y1="' + M.a + '" y2="' + (H - M.b) + '" visibility="hidden"/>';

    el.innerHTML =
      '<div class="legenda">' +
        '<span><i class="lg-barra"></i>Costo totale dei progetti, cumulato alle scadenze</span>' +
        '<span><i class="lg-linea"></i>Totale raccolto</span>' +
      '</div>' +
      '<div class="area-grafico">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Costo totale dei progetti cumulato alle scadenze e totale raccolto nel tempo">' + svg + '</svg>' +
        '<div class="g-tooltip" id="g-tip" hidden></div>' +
      '</div>' +
      '<p class="muted small">Tocca o passa sul grafico per leggere i valori di una data.</p>' +
      '<details class="tabella-grafico"><summary>Tabella delle scadenze</summary><table>' +
        '<thead><tr><th>Scadenza</th><th>Progetto</th><th>Totale</th><th>Cumulato</th></tr></thead><tbody>' +
        barre.map(function (b) {
          return b.progetti.map(function (p, j) {
            return '<tr><td>' + (j ? '' : UI.data(p.scadenza)) + '</td><td>' + esc(p.titolo) + '</td><td>' + UI.euro(p.totale) + '</td><td>' +
              (j === b.progetti.length - 1 ? UI.euro(b.cumulato) : '') + '</td></tr>';
          }).join('');
        }).join('') +
      '</tbody></table></details>';

    // tooltip: segue il dito o il mouse; sopra una barra mostra i progetti di quella scadenza
    var area = el.querySelector('.area-grafico'), s = area.querySelector('svg'), tip = el.querySelector('#g-tip'), cur = el.querySelector('#g-cursore');
    function mostra(ev) {
      var r = s.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
      if (x < M.s || x > W - M.d) { nascondi(); return; }
      var t = t0 + (x - M.s) / (W - M.s - M.d) * (t1 - t0);
      var vicina = null;
      barre.forEach(function (b) { if (Math.abs(X(b.t) - x) <= 10 && (!vicina || Math.abs(X(b.t) - x) < Math.abs(X(vicina.t) - x))) vicina = b; });
      if (vicina) t = vicina.t;
      cur.setAttribute('x1', X(t)); cur.setAttribute('x2', X(t)); cur.setAttribute('visibility', 'visible');
      tip.innerHTML = '<b>' + etichettaGiorno(t) + '</b>' +
        (vicina ? vicina.progetti.map(function (p) { return '<span>Scade: ' + esc(p.titolo) + ' · ' + UI.euro(p.totale) + '</span>'; }).join('') : '') +
        '<span><i class="lg-barra"></i>Costo cumulato: ' + UI.euro(obiettivoAl(t)) + '</span>' +
        (t <= oggi ? '<span><i class="lg-linea"></i>Raccolto: ' + UI.euro(raccoltoAl(t)) + '</span>' : '');
      tip.hidden = false;
      var px = X(t) / W * r.width;
      tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
    }
    function nascondi() { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); }
    s.addEventListener('pointermove', mostra);
    s.addEventListener('pointerdown', mostra);
    s.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') nascondi(); });
  }

  return { apri: apri };
})();
