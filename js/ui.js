// Piccoli aiuti condivisi da tutte le sezioni.
window.UI = (function () {
  var TINTE = ['violet', 'aqua', 'orange', 'green', 'blue', 'magenta', 'yellow', 'red'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function iniziali(nome) {
    var p = String(nome || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  function tinta(id) {
    var h = 0;
    String(id).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    return TINTE[h % TINTE.length];
  }

  // Avatar usato in tutta l'app: foto se c'è, altrimenti iniziali su cerchio colorato
  function avatar(socio, px) {
    px = px || 40;
    var stile = 'width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.36) + 'px';
    if (socio.foto) {
      return '<img class="avatar" src="' + esc(socio.foto) + '" alt="" style="' + stile + '" loading="lazy">';
    }
    return '<span class="avatar avatar-' + tinta(socio.id) + '" style="' + stile + '" aria-hidden="true">' +
      esc(iniziali(socio.nome)) + '</span>';
  }

  // Stili del numero di gara: devono coincidere con i valori ammessi dal database
  var FONT_NUMERO = {
    corsa:     { nome: 'Corsa',     famiglia: "'Racing Sans One', system-ui, sans-serif" },
    squadrato: { nome: 'Squadrato', famiglia: "'Bungee', system-ui, sans-serif" },
    stencil:   { nome: 'Stencil',   famiglia: "'Black Ops One', system-ui, sans-serif" }
  };
  var COLORI_NUMERO = {
    rosso: '#d62828', arancione: '#f77f00', giallo: '#fcbf49', oro: '#c9a227',
    verde: '#2b9348', acqua: '#00a6a6', azzurro: '#4cc9f0', blu: '#1d4ed8',
    viola: '#7b2cbf', rosa: '#ff4d9d', nero: '#111111', bianco: '#ffffff'
  };

  // Numero di gara grande, con il font e il colore scelti dal socio
  function numero(socio, px) {
    if (!socio.numeroGara) return '';
    var f = FONT_NUMERO[socio.numeroFont] ? socio.numeroFont : 'corsa';
    var c = COLORI_NUMERO[socio.numeroColore] ? socio.numeroColore : 'rosso';
    return '<span class="numero-gara nf-' + f + ' nc-' + c + '" style="font-size:' + (px || 40) + 'px" ' +
      'aria-label="Numero ' + esc(socio.numeroGara) + '">' + esc(socio.numeroGara) + '</span>';
  }

  var fmtEuro =new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
  function euro(n) { return fmtEuro.format(Number(n) || 0); }
  function euroSegno(n) { n = Number(n) || 0; return (n > 0 ? '+' : n < 0 ? '−' : '') + fmtEuro.format(Math.abs(n)); }

  function data(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function meseAnno(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2200);
    setTimeout(function () { t.remove(); }, 2700);
  }

  function caricamento() { return '<p class="muted pad">Caricamento…</p>'; }
  function errore(e) {
    var msg = e && e.utente ? e.message : 'Non riesco a caricare i dati. Controlla la connessione e riprova.';
    return '<p class="errore pad">' + esc(msg) + '</p>';
  }

  return { esc: esc, avatar: avatar, numero: numero, FONT_NUMERO: FONT_NUMERO, COLORI_NUMERO: COLORI_NUMERO,euro: euro, euroSegno: euroSegno, data: data, meseAnno: meseAnno,
           toast: toast, caricamento: caricamento, errore: errore };
})();
