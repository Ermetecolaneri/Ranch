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

  var fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
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

  return { esc: esc, avatar: avatar, euro: euro, euroSegno: euroSegno, data: data, meseAnno: meseAnno,
           toast: toast, caricamento: caricamento, errore: errore };
})();
