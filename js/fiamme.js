// Fiamme animate attorno a un riquadro (il progetto più amato).
// Particelle su canvas con fusione additiva; si vedono solo fuori dal riquadro, così il contenuto resta leggibile.
window.Fiamme = (function () {
  var PAD = 34;               // spazio attorno al riquadro per le fiamme
  var sprite = null;

  // quattro "gocce" di fuoco pre-disegnate: dal cuore bianco-giallo al rosso scuro
  function preparaSprite() {
    if (sprite) return sprite;
    var colori = [[255, 214, 80], [255, 150, 20], [245, 80, 0], [200, 30, 0]];
    sprite = colori.map(function (c) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + c + ',1)');
      gr.addColorStop(0.45, 'rgba(' + c + ',.6)');
      gr.addColorStop(1, 'rgba(' + c + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return cv;
    });
    return sprite;
  }

  function accendi(wrap) {
    if (!wrap || wrap.querySelector('canvas.fiamme')) return;
    var ridotto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cv = document.createElement('canvas');
    cv.className = 'fiamme'; cv.setAttribute('aria-hidden', 'true');
    wrap.appendChild(cv);
    if (ridotto) return;
    var ctx = cv.getContext('2d'), sp = preparaSprite();
    var W = 0, H = 0, dpr = 1, raggio = 16, particelle = [], t = 0;

    function misura() {
      var r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width + PAD * 2; H = r.height + PAD * 2;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    misura();
    if (window.ResizeObserver) new ResizeObserver(misura).observe(wrap);

    // punto casuale sul bordo del riquadro (più fiamme ai lati e sotto, che salgono lungo i fianchi)
    function nasci() {
      var w = W - PAD * 2, h = H - PAD * 2, x, y, lato = Math.random(), forza = 1;
      if (lato < 0.32) { x = PAD + Math.random() * 3; y = PAD + Math.random() * h; }            // sinistra
      else if (lato < 0.64) { x = PAD + w - Math.random() * 3; y = PAD + Math.random() * h; }   // destra
      else if (lato < 0.86) { x = PAD + Math.random() * w; y = PAD + Math.random() * 3; forza = 1.25; } // sopra
      else { x = PAD + Math.random() * w; y = PAD + h - Math.random() * 3; forza = 0.7; }        // sotto
      var vita = 38 + Math.random() * 42;
      particelle.push({ x: x, y: y, vx: (Math.random() - 0.5) * 0.6, vy: -(0.7 + Math.random() * 1.3) * forza,
                        vita: vita, eta: 0, r: (9 + Math.random() * 13) * forza, fase: Math.random() * 6.28 });
    }

    function ritaglio() {
      // disegna solo fuori dal riquadro (rettangolo esterno meno quello arrotondato del riquadro)
      var x = PAD, y = PAD, w = W - PAD * 2, h = H - PAD * 2, r = raggio;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x, y, x, y + h, r); ctx.arcTo(x, y + h, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x + w, y, r); ctx.arcTo(x + w, y, x, y, r);
      ctx.closePath();
      ctx.clip('evenodd');
    }

    function frame() {
      if (!wrap.isConnected) return;               // la pagina è cambiata: stop
      requestAnimationFrame(frame);
      if (document.hidden) return;
      t++;
      var perimetro = 2 * (W + H), n = Math.round(perimetro / 120);
      for (var i = 0; i < n; i++) nasci();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ritaglio();
      ctx.globalCompositeOperation = 'source-over';
      for (var j = particelle.length - 1; j >= 0; j--) {
        var p = particelle[j];
        p.eta++;
        if (p.eta >= p.vita) { particelle.splice(j, 1); continue; }
        var k = p.eta / p.vita;                       // 0 → 1 lungo la vita
        p.vy -= 0.035;                                // il fuoco accelera verso l'alto
        p.x += p.vx + Math.sin(t * 0.09 + p.fase) * 0.45;   // tremolio
        p.y += p.vy;
        var s = p.r * (1 - k * 0.75), idx = k < 0.18 ? 0 : k < 0.45 ? 1 : k < 0.75 ? 2 : 3;
        ctx.globalAlpha = (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * 0.42;
        ctx.drawImage(sp[idx], p.x - s * 0.8, p.y - s * 1.6, s * 1.6, s * 3.2);   // goccia allungata verso l'alto
      }
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  return { accendi: accendi };
})();
