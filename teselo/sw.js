/* Teselo web service worker (build.py write_pwa, web build only). Cache-first for this build's own files, so the game
   starts offline once it has been opened; the whole set is one cache per release (key = VERSION + content hash), and a
   new release installs, takes over (skipWaiting + clients.claim) and deletes the older teselo-* caches (only those:
   ces107.github.io is shared with other sites). Cross-origin requests (gamekit-api, store links) never touch the cache. */
'use strict';
const CACHE = 'teselo-0.12.2-e5b46d39ae';
const API = 'https://gamekit-api.onrender.com';
const FILES = ["apple-touch-icon.png", "game.js", "icon-192.png", "icon-512.png", "index.html", "manifest.webmanifest", "style.css"];
const ROOT = new URL('./', self.location).href;
const INDEX = new URL('index.html', ROOT).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('teselo-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cached = (req, opts) => caches.open(CACHE).then((c) => c.match(req, opts));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.href.startsWith(API)) return;   // network only
  if (req.mode === 'navigate') {
    const path = url.origin + url.pathname;
    if (path === ROOT || path === INDEX) {   // the game, with any query (?nivel=CODE share links, ?api=off): cache first
      e.respondWith(cached(INDEX).then((hit) => hit || fetch(req)));
    } else {   // privacy.html, terms.html, r/: the network; offline, the game with the same query
      e.respondWith(fetch(req).catch(() => Response.redirect(ROOT + url.search, 302)));
    }
    return;
  }
  e.respondWith(cached(req).then((hit) => hit || fetch(req)));
});
