// Fuochi d'artificio per i progetti chiusi. Fuochi.lancia(durataMs)
window.Fuochi = (function () {
  var COLORI = ['#2b9348', '#55a630', '#80b918', '#fcbf49', '#ffffff', '#4cc9f0', '#ff4d9d'];

  function lancia(durata) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    durata = durata || 3500;
    var c = document.createElement('canvas');
    c.className = 'fuochi';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    var g = c.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    function misura() { c.width = innerWidth * dpr; c.height = innerHeight * dpr; }
    misura();
    window.addEventListener('resize', misura);

    var particelle = [], inizio = performance.now(), prossimo = 0;
    function scoppio() {
      var x = (0.15 + Math.random() * 0.7) * c.width, y = (0.12 + Math.random() * 0.35) * c.height;
      var col = COLORI[Math.floor(Math.random() * COLORI.length)], n = 60 + Math.floor(Math.random() * 30);
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n, v = (2 + Math.random() * 3.5) * dpr;
        particelle.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vita: 1, col: col });
      }
    }
    function frame(t) {
      var trascorso = t - inizio;
      if (trascorso < durata && t > prossimo) { scoppio(); prossimo = t + 350 + Math.random() * 350; }
      g.clearRect(0, 0, c.width, c.height);
      particelle = particelle.filter(function (p) { return p.vita > 0; });
      particelle.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05 * dpr; p.vx *= 0.985; p.vy *= 0.985; p.vita -= 0.012;
        g.globalAlpha = Math.max(p.vita, 0);
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, 2.2 * dpr, 0, Math.PI * 2); g.fill();
      });
      if (trascorso < durata || particelle.length) requestAnimationFrame(frame);
      else { window.removeEventListener('resize', misura); c.remove(); }
    }
    requestAnimationFrame(frame);
  }

  return { lancia: lancia };
})();
