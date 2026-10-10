// Serveur d'Engram : sert l'application et relaie l'API Claude.
// La clé d'API reste ici, jamais dans le navigateur.
//
//   ANTHROPIC_API_KEY=... node server.mjs        → http://localhost:8787
//
// Le relais lui-même (protocole, modèles, garde-fous) est dans core.mjs, partagé
// avec la fonction Netlify (netlify/functions/ai.mjs).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngram } from './core.mjs';
import { createPay } from './pay.mjs';
import { createReader } from './read.mjs';
import { createSync, defaultBackend } from './sync.mjs';
import { createAccount } from './account.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = +env.PORT || 8787;
const HOST = env.HOST || '0.0.0.0';
const ROOT = env.ENGRAM_STATIC_DIR || path.join(here, '..');
const engram = createEngram(env);
const store = defaultBackend(env); // un seul stockage : espaces de synchronisation, et comptes sous acct/…
const account = createAccount(env, { backend: store });
const pay = createPay(env, { accounts: account });
const reader = createReader(env);
const sync = createSync(env, { backend: store, accounts: account });

// Filet : une promesse rejetée par une requête ne doit jamais arrêter le serveur (et les flux des autres).
process.on('unhandledRejection', e => console.error('[engram] unhandledRejection', e));

// ENGRAM_TRUST_PROXY = nombre de relais de confiance devant le serveur (1, ou « true », pour un seul).
// Chacun ajoute l'adresse qu'il voit à droite de X-Forwarded-For : on compte depuis la droite,
// car tout ce qui est plus à gauche a pu être écrit par le client lui-même.
const TP = String(env.ENGRAM_TRUST_PROXY || '').trim();
const HOPS = !TP || /^(0|off|false|no)$/i.test(TP) ? 0 : parseInt(TP, 10) || 1;
const clientIp = req => {
  const xff = HOPS ? String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  return xff[xff.length - HOPS] || req.socket.remoteAddress || '?';
};

// Taille de corps admise par route, vérifiée avant de lire (Content-Length) puis en lisant : un compte ou un paiement
// n'envoie que quelques Ko, un document de synchronisation au plus 2,5 Mo ; seule l'IA reçoit des photos (ENGRAM_MAX_BODY_MB).
const KB = 1024;
const bodyLimit = pathname => pathname.startsWith('/api/ai') ? engram.MAX_BODY : pathname.startsWith('/api/sync') ? 2600 * KB : 64 * KB;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code: 'prompt_too_large' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Passe une requête Node au relais (objets Web standard) et recopie la réponse, en flux. */
async function relay(req, res, url, target = engram) {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const ip = clientIp(req);
  // POST /api/ai : accès, débit et taille annoncée sont vérifiés avant de lire le corps : une requête refusée ne met
  // rien en mémoire (Node jette le reste du corps).
  const ai = target === engram && req.method === 'POST' && url.pathname === '/api/ai';
  let response = ai ? engram.precheck(headers, ip) : null;
  if (!response) {
    let body;
    if (req.method === 'POST' || req.method === 'PUT') {
      const limit = bodyLimit(url.pathname);
      try {
        if (+(req.headers['content-length'] || 0) > limit) throw Object.assign(new Error('too large'), { code: 'prompt_too_large' });
        body = await readBody(req, limit);
      }
      catch (e) {
        res.writeHead(e.code === 'prompt_too_large' ? 413 : 400, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ code: e.code === 'prompt_too_large' ? 'prompt_too_large' : 'upstream_error', message: 'bad body' }));
      }
    }
    const request = new Request('http://engram.local' + url.pathname + url.search, { method: req.method, headers, body, signal: ac.signal });
    response = await target.handle(request, { ip, checked: ai });
    if (!response) return false;
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    try { for await (const chunk of response.body) { if (res.destroyed) break; res.write(chunk); } }
    catch { /* connexion fermée par la page */ }
  }
  res.end();
  return true;
}

// L'application elle-même : index.html, la page de présentation (decouvrir/), le dossier et les fichiers de l'app installable.
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/dossier.html': ['dossier.html', 'text/html; charset=utf-8'],
  '/decouvrir/': ['decouvrir/index.html', 'text/html; charset=utf-8'],
  '/decouvrir/index.html': ['decouvrir/index.html', 'text/html; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icons/icon.svg': ['icons/icon.svg', 'image/svg+xml'],
  '/icons/favicon.svg': ['icons/favicon.svg', 'image/svg+xml'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'],
  '/icons/maskable-512.png': ['icons/maskable-512.png', 'image/png'],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png']
};
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(self), microphone=(self)' };

const server = http.createServer(async (req, res) => {
  try {
    // Node accepte des cibles que l'analyseur d'URL refuse (« //a:b/ ») : réponse 400, pas d'arrêt du serveur.
    let url;
    try { url = new URL(req.url, 'http://x'); }
    catch { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Bad request'); }
    if (url.pathname.startsWith('/api/ai') && await relay(req, res, url)) return;
    if (url.pathname.startsWith('/api/pay') && await relay(req, res, url, pay)) return;
    if (url.pathname === '/api/read' && await relay(req, res, url, reader)) return;
    if (url.pathname.startsWith('/api/sync') && await relay(req, res, url, sync)) return;
    if (url.pathname.startsWith('/api/account') && await relay(req, res, url, account)) return;
    // Les liens d'invitation mènent à la page de présentation : /decouvrir sans barre finale y mène aussi.
    if (url.pathname === '/decouvrir' && req.method === 'GET') { res.writeHead(301, { location: '/decouvrir/' + url.search }); return res.end(); }
    const file = STATIC[url.pathname];
    if (file && req.method === 'GET') {
      const p = path.join(ROOT, file[0]);
      if (fs.existsSync(p)) { res.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-cache', ...SECURITY }); return fs.createReadStream(p).pipe(res); }
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found');
  } catch (e) {
    console.error('[engram]', e);
    if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ code: 'upstream_error', message: 'server error' })); } else res.end();
  }
});
// Délai pour recevoir toute la requête (photos comprises), pas pour la réponse : les réponses longues
// arrivent en flux sans être coupées. Sans lui, un envoi bloqué à mi-corps garderait sa mémoire indéfiniment.
server.requestTimeout = 300_000;
server.listen(PORT, HOST, () => {
  const T = engram.TIERS;
  console.log(`Engram → http://localhost:${PORT}`);
  console.log(`  modèles : rapide ${T.quick.model} (${T.quick.effort}) · standard ${T.default.model} (${T.default.effort}) · expert ${T.complex.model} (${T.complex.effort})`);
  console.log(`  repli automatique : ${engram.FALLBACKS ? 'activé' : 'désactivé'} · code d'accès : ${engram.locked ? 'oui' : 'non'} · ${engram.RATE_PER_MIN} requêtes/min par adresse`);
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) console.warn('  ⚠ ANTHROPIC_API_KEY absente : les appels à l\'IA échoueront.');
});
