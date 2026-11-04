// App shell: cache-first. Dictionary/translation requests: stale-while-revalidate,
// so words already looked up open instantly and also work offline.
const SHELL = 'shell-v2', DATA = 'data-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'sources.js', 'wikitext.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const DATA_HOSTS = ['de.wiktionary.org', 'api.mymemory.translated.net'];
const MAX_DATA = 400;

self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
  } else if (DATA_HOSTS.includes(url.hostname) && url.searchParams.get('action') !== 'opensearch') {
    e.respondWith(staleWhileRevalidate(e));
  }
});

async function staleWhileRevalidate(e) {
  const cache = await caches.open(DATA);
  const cached = await cache.match(e.request);
  const network = fetch(e.request).then(async r => {
    if (r.ok) { await cache.put(e.request, r.clone()); trim(cache); }
    return r;
  });
  if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
  return network;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DATA))) await cache.delete(k);
}
