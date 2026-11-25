// Service worker dell'app Ranch: avvio veloce e funzionamento anche con poca rete.
//  * pagine: prima la rete, se non c'è la copia salvata
//  * css/js/font/immagini dell'app: dalla copia salvata (hanno ?v= nel nome, quindi cambiano a ogni versione)
//  * dati (Supabase): sempre dalla rete, mai salvati
var CACHE = 'ranch-v44';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', 'index.html', 'manifest.webmanifest', 'img/icone/icona-192.png']); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Supabase & co.: sempre rete
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copia = r.clone(); caches.open(CACHE).then(function (c) { c.put('index.html', copia); });
      return r;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var copia = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
      return r;
    });
  }));
});

// ---------- notifiche push ----------
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { testo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titolo || 'Ranch', {
    body: d.testo || '',
    icon: 'img/icone/icona-192.png',
    badge: 'img/icone/badge-96.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var dest = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].url.indexOf(self.registration.scope) === 0 && 'focus' in lista[i]) {
        lista[i].navigate(dest).catch(function () {});
        return lista[i].focus();
      }
    }
    return self.clients.openWindow(dest);
  }));
});
