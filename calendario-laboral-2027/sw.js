/* Calendario laboral 2027 - service worker (generado por build.py desde sw.src.js) */
'use strict';
var VERSION = 'cl27-14c548765f';
var SHELL = ["/calendario-laboral-2027/", "/calendario-laboral-2027/app.css?v=fffbafb85c", "/calendario-laboral-2027/app.js?v=efe97bf4fa", "/calendario-laboral-2027/manifest.webmanifest", "/calendario-laboral-2027/icons/icon-192.png", "/calendario-laboral-2027/icons/icon-512.png"];
var SCOPE = self.registration.scope;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('cl27-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Cache-first para esta carpeta; la red refresca la copia en segundo plano.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.url.indexOf(SCOPE) !== 0) return;
  var nav = req.mode === 'navigate';
  var url = new URL(req.url);
  var key = nav ? url.origin + url.pathname : req;
  var net = caches.open(VERSION).then(function (c) {
    return fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') c.put(key, res.clone());
      return res;
    });
  });
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(key).then(function (hit) {
      return hit || net.catch(function () { return nav ? c.match(SCOPE) : Response.error(); });
    });
  }));
  e.waitUntil(net.catch(function () {}));
});
