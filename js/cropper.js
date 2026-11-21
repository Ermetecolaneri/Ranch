// Ritaglio quadrato della foto profilo, tutto nel browser.
// Cropper.open(file) -> Promise<dataUrl JPEG 256x256 | null se annullato>
window.Cropper = (function () {
  var OUT = 256, VIEW = 280;

  function open(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Scegli un file immagine.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { mostra(img, url, resolve); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Non riesco ad aprire questa immagine.')); };
      img.src = url;
    });
  }

  function mostra(img, url, resolve) {
    var wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Ritaglia la foto">' +
        '<h2>Ritaglia la foto</h2>' +
        '<p class="muted small">Trascina per spostare, usa lo zoom per ingrandire.</p>' +
        '<div class="crop-area"><canvas width="' + VIEW + '" height="' + VIEW + '"></canvas></div>' +
        '<label class="zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>' +
        '<div class="azioni"><button type="button" class="btn" data-a="no">Annulla</button>' +
        '<button type="button" class="btn primario" data-a="si">Usa foto</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var canvas = wrap.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var slider = wrap.querySelector('input[type=range]');
    var base = VIEW / Math.min(img.naturalWidth, img.naturalHeight); // scala minima che copre il quadrato
    var zoom = 1, ox = 0, oy = 0; // spostamento del centro, in pixel di vista

    function limita() {
      var w = img.naturalWidth * base * zoom, h = img.naturalHeight * base * zoom;
      var mx = (w - VIEW) / 2, my = (h - VIEW) / 2;
      ox = Math.max(-mx, Math.min(mx, ox));
      oy = Math.max(-my, Math.min(my, oy));
    }
    function disegna(c, size) {
      var k = size / VIEW, s = base * zoom * k;
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      var c2 = c.getContext('2d');
      c2.fillStyle = '#fff';
      c2.fillRect(0, 0, size, size);
      c2.imageSmoothingQuality = 'high';
      c2.drawImage(img, (size - w) / 2 + ox * k, (size - h) / 2 + oy * k, w, h);
    }
    function ridisegna() { limita(); disegna(canvas, VIEW); }
    ridisegna();

    var trascina = null;
    canvas.addEventListener('pointerdown', function (e) {
      trascina = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!trascina) return;
      var r = canvas.getBoundingClientRect(), k = VIEW / r.width;
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
        out.width = out.height = OUT;
        disegna(out, OUT);
        chiudi(out.toDataURL('image/jpeg', 0.85));
      }
    });
  }

  return { open: open };
})();
