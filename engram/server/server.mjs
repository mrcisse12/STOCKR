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

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = +env.PORT || 8787;
const HOST = env.HOST || '0.0.0.0';
const ROOT = env.ENGRAM_STATIC_DIR || path.join(here, '..');
const engram = createEngram(env);

const clientIp = req => (env.ENGRAM_TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > engram.MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 'prompt_too_large' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Passe une requête Node au relais (objets Web standard) et recopie la réponse, en flux. */
async function relay(req, res) {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  let body;
  if (req.method === 'POST') {
    try { body = await readBody(req); }
    catch (e) {
      res.writeHead(e.code === 'prompt_too_large' ? 413 : 400, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ code: e.code === 'prompt_too_large' ? 'prompt_too_large' : 'upstream_error', message: 'bad body' }));
    }
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request('http://engram.local' + req.url, { method: req.method, headers, body, signal: ac.signal });
  const response = await engram.handle(request, { ip: clientIp(req) });
  if (!response) return false;
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    try { for await (const chunk of response.body) { if (res.destroyed) break; res.write(chunk); } }
    catch { /* connexion fermée par la page */ }
  }
  res.end();
  return true;
}

// L'application elle-même : index.html, le dossier de présentation et les fichiers de l'app installable.
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/dossier.html': ['dossier.html', 'text/html; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icons/icon.svg': ['icons/icon.svg', 'image/svg+xml'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'],
  '/icons/maskable-512.png': ['icons/maskable-512.png', 'image/png'],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png']
};
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(self), microphone=(self)' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/ai') && await relay(req, res)) return;
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
server.requestTimeout = 0; // les réponses longues arrivent en flux
server.listen(PORT, HOST, () => {
  const T = engram.TIERS;
  console.log(`Engram → http://localhost:${PORT}`);
  console.log(`  modèles : rapide ${T.quick.model} (${T.quick.effort}) · standard ${T.default.model} (${T.default.effort}) · expert ${T.complex.model} (${T.complex.effort})`);
  console.log(`  repli automatique : ${engram.FALLBACKS ? 'activé' : 'désactivé'} · code d'accès : ${engram.locked ? 'oui' : 'non'} · ${engram.RATE_PER_MIN} requêtes/min par adresse`);
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) console.warn('  ⚠ ANTHROPIC_API_KEY absente : les appels à l\'IA échoueront.');
});
