// service-worker.js — 離線快取（cache-first）。改檔後把 CACHE_VERSION +1。
const CACHE_VERSION = 'jp-v7';
const ASSETS = [
  './', './index.html', './styles.css',
  './app.js', './romaji.js', './srs.js', './store.js', './jlp.js', './ai.js',
  './vendor/kuromoji.js',
  './manifest.json', './icons/icon.svg',
];
// 註：kuromoji 字典（dict/*.dat.gz，~17MB）不放這裡預快取，
// 改由 fetch 事件在「第一次自動注音」時才下載並快取，避免拖慢安裝。
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});
