/* Service Worker: macht die App nach dem ersten Laden offline nutzbar.
   Strategie „Netz zuerst, Cache als Rückfall“: Online kommt immer die neueste Fassung (Updates sind sofort da, Versionsparameter ?v=… in
   index.html bleibt maßgeblich); ohne Netz wird die zuletzt geladene Fassung aus dem Cache geliefert. Gecacht wird nur dieselbe Herkunft
   (kein Google Fonts/Fremdinhalt); data/inhalt.enc.json ist bereits verschlüsselt. Geltungsbereich = dieser Ordner, andere Apps der Domain bleiben unberührt. */
const CACHE = 'dof-cache-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dof-cache-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if(r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if(res.ok && res.status === 200){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}); }
    return res;
  }).catch(async () => (await caches.match(r)) || (await caches.match(r, { ignoreSearch: true })) || Response.error()));
});
