// Ritaglio della foto nel browser.
// Cropper.open(file)                                   -> avatar tondo, JPEG 256x256
// Cropper.open(file, { larghezza: 1600, altezza: 900 }) -> rettangolo, JPEG 1600x900
// Restituisce una Promise con il dataUrl JPEG, oppure null se annullato.
window.Cropper = (function () {
  function open(file, opzioni) {
    var o = Object.assign({ larghezza: 256, altezza: 256, tondo: true, qualita: 0.85 }, opzioni || {});
    if (opzioni && opzioni.tondo === undefined) o.tondo = o.larghezza === o.altezza;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Scegli un file immagine.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { mostra(img, url, o, resolve); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Non riesco ad aprire questa immagine.')); };
      img.src = url;
    });
  }

  function mostra(img, url, o, resolve) {
    var VW = 320, VH = Math.round(VW * o.altezza / o.larghezza);
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Ritaglia la foto">' +
        '<h2>Ritaglia la foto</h2>' +
        '<p class="muted small">Trascina per spostare, usa lo zoom per ingrandire.</p>' +
        '<div class="crop-area"><canvas width="' + VW + '" height="' + VH + '" class="' + (o.tondo ? 'tondo' : 'rett') + '"></canvas></div>' +
        '<label class="zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
        '<button type="button" class="btn primario" data-a="si">Usa foto</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var canvas = wrap.querySelector('canvas');
    var slider = wrap.querySelector('input[type=range]');
    var base = Math.max(VW / img.naturalWidth, VH / img.naturalHeight); // scala minima che copre il riquadro
    var zoom = 1, ox = 0, oy = 0;

    function limita() {
      var w = img.naturalWidth * base * zoom, h = img.naturalHeight * base * zoom;
      var mx = (w - VW) / 2, my = (h - VH) / 2;
      ox = Math.max(-mx, Math.min(mx, ox));
      oy = Math.max(-my, Math.min(my, oy));
    }
    function disegna(c, W, H) {
      var k = W / VW, s = base * zoom * k;
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      var g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, W, H);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (W - w) / 2 + ox * k, (H - h) / 2 + oy * k, w, h);
    }
    function ridisegna() { limita(); disegna(canvas, VW, VH); }
    ridisegna();

    var trascina = null;
    canvas.addEventListener('pointerdown', function (e) {
      trascina = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!trascina) return;
      var r = canvas.getBoundingClientRect(), k = VW / r.width;
      ox = trascina.ox + (e.clientX - trascina.x) * k;
      oy = trascina.oy + (e.clientY - trascina.y) * k;
      ridisegna();
    });
    canvas.addEventListener('pointerup', function () { trascina = null; });
    canvas.addEventListener('pointercancel', function () { trascina = null; });
    slider.addEventListener('input', function () { zoom = Number(slider.value); ridisegna(); });

    function chiudi(valore) {
      wrap.remove();
      URL.revokeObjectURL(url);
      resolve(valore);
    }
    wrap.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'no' || e.target === wrap) chiudi(null);
      if (a === 'si') {
        var out = document.createElement('canvas');
        out.width = o.larghezza;
        out.height = o.altezza;
        disegna(out, o.larghezza, o.altezza);
        chiudi(out.toDataURL('image/jpeg', o.qualita));
      }
    });
  }

  return { open: open };
})();
