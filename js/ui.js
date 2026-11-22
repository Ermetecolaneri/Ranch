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

  // interi senza decimali ("6.100 €"), altrimenti sempre due ("762,50 €"); separatore delle migliaia anche a 4 cifre
  function formatoEuro(dec) {
    try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' }); }
    catch (e) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  }
  var fmtEuro0 = formatoEuro(0), fmtEuro2 = formatoEuro(2);
  var fmtEuro = { format: function (n) { var r = Math.round(n * 100) / 100; return (Number.isInteger(r) ? fmtEuro0 : fmtEuro2).format(r); } };
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

  // "sabato 12 dicembre 2026", "12–13 dicembre 2026", "30 dic 2026 – 2 gen 2027"
  function intervallo(inizio, fine) {
    if (!inizio) return '';
    var a = new Date(inizio + 'T12:00:00'), b = new Date((fine || inizio) + 'T12:00:00');
    if (!fine || fine === inizio) return a.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
      return a.getDate() + '–' + b.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    var f = { day: 'numeric', month: 'short', year: 'numeric' };
    return a.toLocaleDateString('it-IT', f) + ' – ' + b.toLocaleDateString('it-IT', f);
  }
  function giornoBreve(iso) {
    var d = new Date(iso + 'T12:00:00');
    return { sett: d.toLocaleDateString('it-IT', { weekday: 'short' }), giorno: d.getDate(), mese: d.toLocaleDateString('it-IT', { month: 'short' }) };
  }

  // Joint: la fogliolina
  function foglia(px) { return '<svg class="foglia" viewBox="0 0 24 24" width="' + (px || 16) + '" height="' + (px || 16) + '" aria-hidden="true"><g transform="translate(12 15.5)" fill="#3f8f3a"><path transform="rotate(0)" d="M0 0C1.9 -3.3 1.5 -8.2 0 -11.0C-1.5 -8.2 -1.9 -3.3 0 0Z"/><path transform="rotate(30)" d="M0 0C1.7 -2.9 1.4 -7.2 0 -9.6C-1.4 -7.2 -1.7 -2.9 0 0Z"/><path transform="rotate(-30)" d="M0 0C1.7 -2.9 1.4 -7.2 0 -9.6C-1.4 -7.2 -1.7 -2.9 0 0Z"/><path transform="rotate(62)" d="M0 0C1.5 -2.3 1.2 -5.7 0 -7.6C-1.2 -5.7 -1.5 -2.3 0 0Z"/><path transform="rotate(-62)" d="M0 0C1.5 -2.3 1.2 -5.7 0 -7.6C-1.2 -5.7 -1.5 -2.3 0 0Z"/><path transform="rotate(98)" d="M0 0C1.1 -1.4 0.9 -3.6 0 -4.8C-0.9 -3.6 -1.1 -1.4 0 0Z"/><path transform="rotate(-98)" d="M0 0C1.1 -1.4 0.9 -3.6 0 -4.8C-0.9 -3.6 -1.1 -1.4 0 0Z"/><path d="M-.5 0h1v7h-1z"/></g></svg>'; }
  function fattore(x) { return '×' + (Number(x) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(x) { return Math.round((Number(x) || 0) * 100) + '%'; }
  // ricompensa in Joint accanto a un'azione (solo se i Joint sono attivi)
  function premioPunti(azione, molt) {
    var j = window.RanchJoint;
    if (!j || !j.attivo || !j.reward) return 0;
    return Math.round((Number(j.reward[azione]) || 0) * (molt == null ? 1 : molt));
  }
  function premio(azione, molt) {
    var n = premioPunti(azione, molt);
    return n > 0 ? '<span class="premio" title="Ricompensa in Joint">+' + n.toLocaleString('it-IT') + ' ' + foglia(13) + '</span>' : '';
  }
  function joint(n, px) { return '<span class="joint-pill">' + foglia(px || 14) + '<b>' + (Number(n) || 0).toLocaleString('it-IT') + '</b></span>'; }
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

  return { fattore: fattore, pct: pct, foglia: foglia, joint: joint, premio: premio, premioPunti: premioPunti, esc: esc, avatar: avatar, numero: numero, FONT_NUMERO: FONT_NUMERO, COLORI_NUMERO: COLORI_NUMERO,euro: euro, euroSegno: euroSegno, data: data, meseAnno: meseAnno,
           intervallo: intervallo, giornoBreve: giornoBreve, toast: toast, caricamento: caricamento, errore: errore };
})();
