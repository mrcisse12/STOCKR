// Engram hors-ligne : l'app s'ouvre sans réseau une fois installée.
// Page : le réseau d'abord (pour recevoir les mises à jour), la copie locale s'il échoue ou traîne plus de 3 s.
// Polices et icônes : la copie locale d'abord, rafraîchie en arrière-plan.
// L'IA (/api/…) ne passe jamais par le cache.
// « Partager vers Engram » (Android, ordinateur) : fichiers et texte reçus attendent la page dans le cache engram-share.
const VERSION = 'engram-__BUILD__';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'engram-share').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rappel du planning touché : l'app (ouverte ou non) lance la séance du moment.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#now', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'engram-now' }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
// La page demande quelle version la sert : elle signale une mise à jour sans se tromper de cache.
self.addEventListener('message', e => { if (e.data?.type === 'version') e.ports[0]?.postMessage({ version: VERSION.slice(7) }); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData(), c = await caches.open('engram-share');
      await Promise.all((await c.keys()).map(k => c.delete(k)));
      let i = 0;
      for (const f of form.getAll('files')) if (f && f.size) await c.put(`shared/${i++}`, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'fichier') } }));
      const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n');
      if (text) await c.put('shared/text', new Response(text));
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/api/')) return;
  const same = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  const libs = /(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)$/.test(url.hostname);
  if (!same && !fonts && !libs) return;
  if (req.mode === 'navigate') {
    // Seule l'app passe par le cache : la page de présentation et le dossier ne remplacent jamais sa copie.
    const app = new URL('./', self.registration.scope).pathname;
    if (!same || (url.pathname !== app && url.pathname !== app + 'index.html')) return;
    // Le réseau a 3 secondes : sur une connexion qui traîne, la copie locale s'ouvre sans attendre, et la page
    // du réseau, si elle arrive, la remplace pour la fois suivante. Une page d'erreur ne remplace jamais la copie.
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); } return res; });
    const local = () => caches.match('index.html').then(r => r || caches.match('./'));
    e.respondWith(new Promise(resolve => {
      let done = false; const give = r => { if (!done && r) { done = true; resolve(r); } };
      const slow = setTimeout(() => local().then(give), 3000);
      net.then(res => { clearTimeout(slow); if (res.ok) give(res); else local().then(r => give(r || res)); })
        .catch(() => { clearTimeout(slow); local().then(r => give(r || Response.error())); });
    }));
    e.waitUntil(net.catch(() => { }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
