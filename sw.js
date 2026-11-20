// Service worker de Akira Motors: permite instalar la web como app.
// Siempre prioriza la red (para no mostrar precios ni código viejos). El caché solo se usa sin internet.
// El panel (admin.html), la API y Firebase nunca se guardan en caché.
var VERSION = 'akira-v1';
var SHELL = ['/offline.html', '/assets/icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var path = url.pathname;
  if (path.indexOf('/api/') === 0 || path.indexOf('/p/') === 0) return;
  var isAdmin = path === '/admin.html' || path.indexOf('/assets/js/admin/') === 0;
  if (isAdmin) {
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).catch(function () { return caches.match('/offline.html'); }));
    }
    return;
  }
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('/offline.html') : Response.error());
      });
    })
  );
});
