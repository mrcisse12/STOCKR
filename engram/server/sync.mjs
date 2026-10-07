// Synchronisation des paquets entre appareils.
// Même découpage que la synchronisation de l'app Claude (Store.connect) : un document par paquet
// (« deck_<id> », et « deck_<id>~p1 »… pour les gros paquets), un par image (« img_<id> »), et « profile ».
//
//   GET    /api/sync            → { docs: [{ id, data }], quota }  tout l'espace
//   PUT    /api/sync/doc/<id>   ← le document (JSON)             → { ok: true }
//   DELETE /api/sync/doc/<id>                                    → { ok: true }
//
// Qui ? Avec un compte (en-tête x-engram-session, voir account.mjs) : l'espace « u_<compte> », 25 Mo en
// gratuit, 300 Mo avec un abonnement en cours. Sans compte, l'abonné Pro ou Élite est reconnu par son code
// d'abonnement (en-tête x-engram-license, signé par pay.mjs) : son espace porte le numéro de client Stripe.
// Stockage : Netlify Blobs en ligne (magasin « engram-sync »), des fichiers ailleurs (ENGRAM_SYNC_DIR,
// par défaut server/data). Garde-fous : 2,5 Mo par document, 4 000 documents, 300 Mo par espace.
//
// Les « backends » servent aussi aux comptes (account.mjs) : list, size, get, put, create (seulement s'il
// n'existe pas encore), del, clear (tout un espace).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseSecret, readLicense } from './pay.mjs';

const MB = 1024 * 1024;
const MAX_DOC = 2.5 * MB, MAX_DOCS = 4000, MAX_TOTAL = 300 * MB, FREE_TOTAL = 25 * MB;
const ID_RE = /^[A-Za-z0-9_~.-]{1,160}$/;

/** Des fichiers : un dossier par espace, un fichier par document. */
export function fileBackend(dir) {
  const file = (user, id) => path.join(dir, user, id + '.json');
  return {
    async list(user) {
      const names = await fs.readdir(path.join(dir, user)).catch(() => []);
      return Promise.all(names.filter(n => n.endsWith('.json')).map(async n => {
        const raw = await fs.readFile(path.join(dir, user, n), 'utf8');
        return { id: n.slice(0, -5), data: JSON.parse(raw), size: raw.length };
      }));
    },
    async size(user) { const names = await fs.readdir(path.join(dir, user)).catch(() => []); let n = 0, total = 0; for (const f of names) { n++; total += (await fs.stat(path.join(dir, user, f)).catch(() => ({ size: 0 }))).size; } return { n, total }; },
    async get(user, id) { try { return await fs.readFile(file(user, id), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async put(user, id, raw) { await fs.mkdir(path.join(dir, user), { recursive: true }); const tmp = file(user, id) + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp'; await fs.writeFile(tmp, raw); await fs.rename(tmp, file(user, id)); },
    async create(user, id, raw) {
      await fs.mkdir(path.join(dir, user), { recursive: true });
      try { await fs.writeFile(file(user, id), raw, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
    },
    async del(user, id) { await fs.rm(file(user, id), { force: true }); },
    async clear(user) { await fs.rm(path.join(dir, user), { recursive: true, force: true }); }
  };
}

/** Netlify Blobs : un magasin (« engram-sync » par défaut), une clé « <espace>/<document> ».
 *  usage : tient le compte des tailles par espace (« _usage/<espace> »), pour que le quota en Mo tienne aussi en ligne. */
export function blobsBackend({ name = 'engram-sync', usage = true } = {}) {
  let store = null;
  const open = async () => store || (store = (await import('@netlify/blobs')).getStore({ name, consistency: 'strong' }));
  const U = user => '_usage/' + user;
  async function sizes(s, user) {
    const raw = await s.get(U(user), { type: 'text' });
    if (raw) try { return JSON.parse(raw); } catch { /* refait ci-dessous */ }
    const { blobs } = await s.list({ prefix: user + '/' }), m = {};
    for (const b of blobs) { const r = await s.get(b.key, { type: 'text' }); if (r != null) m[b.key.slice(user.length + 1)] = r.length; }
    return m;
  }
  async function track(s, user, id, n) { if (!usage) return; const m = await sizes(s, user); if (n == null) delete m[id]; else m[id] = n; await s.set(U(user), JSON.stringify(m)); }
  return {
    async list(user) {
      const s = await open(), { blobs } = await s.list({ prefix: user + '/' });
      return (await Promise.all(blobs.map(async b => { const raw = await s.get(b.key, { type: 'text' }); return raw == null ? null : { id: b.key.slice(user.length + 1), data: JSON.parse(raw), size: raw.length }; }))).filter(Boolean);
    },
    async size(user) {
      const s = await open();
      if (!usage) { const { blobs } = await s.list({ prefix: user + '/' }); return { n: blobs.length, total: 0 }; }
      const v = Object.values(await sizes(s, user));
      return { n: v.length, total: v.reduce((a, b) => a + b, 0) };
    },
    async get(user, id) { return (await open()).get(user + '/' + id, { type: 'text' }); },
    async put(user, id, raw) { const s = await open(); await s.set(user + '/' + id, raw); await track(s, user, id, raw.length); },
    async create(user, id, raw) { const s = await open(); if ((await s.get(user + '/' + id, { type: 'text' })) != null) return false; await s.set(user + '/' + id, raw); await track(s, user, id, raw.length); return true; },
    async del(user, id) { const s = await open(); await s.delete(user + '/' + id); await track(s, user, id, null); },
    async clear(user) { const s = await open(), { blobs } = await s.list({ prefix: user + '/' }); for (const b of blobs) await s.delete(b.key); if (usage) await s.delete(U(user)); }
  };
}

/** Le stockage par défaut : Netlify Blobs en ligne, des fichiers ailleurs. */
export function defaultBackend(env = process.env) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return env.NETLIFY || env.NETLIFY_BLOBS_CONTEXT ? blobsBackend() : fileBackend(env.ENGRAM_SYNC_DIR || path.join(here, 'data'));
}

export function createSync(env = process.env, { backend, accounts = null } = {}) {
  const LIC = licenseSecret(env);
  const store = backend || defaultBackend(env);
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  /** Le code d'abonnement présenté (Pro ou Élite, en cours de validité). */
  const licenseOf = request => {
    const d = LIC && readLicense(LIC, request.headers.get('x-engram-license') || '');
    return d && !d.expired && ['pro', 'elite'].includes(d.p) && d.c ? d : null;
  };
  /** L'espace et son quota : le compte (x-engram-session), sinon l'abonné (x-engram-license). */
  async function spaceOf(request) {
    const tok = request.headers.get('x-engram-session');
    if (tok && accounts) {
      const u = await accounts.sessionUser(tok);
      if (!u) return { error: 'bad_session' };
      const lic = licenseOf(request);
      const paid = u.paid || !!(lic && u.stripe?.customer && lic.c === u.stripe.customer);
      return { space: 'u_' + u.id, quota: paid ? MAX_TOTAL : FREE_TOTAL };
    }
    const d = licenseOf(request);
    const space = d && (String(d.c).replace(/[^A-Za-z0-9_]/g, '').slice(0, 60) || null);
    return space ? { space, quota: MAX_TOTAL } : { error: 'not_granted' };
  }
  return {
    async handle(request) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith('/api/sync')) return null;
      if (!LIC && !accounts) return json(503, { code: 'sync_off' });
      try {
        const who = await spaceOf(request);
        if (who.error) return json(401, { code: who.error });
        const user = who.space;
        if (pathname === '/api/sync' && request.method === 'GET') {
          const docs = await store.list(user);
          return json(200, { docs: docs.map(({ id, data }) => ({ id, data })), quota: who.quota });
        }
        const m = pathname.match(/^\/api\/sync\/doc\/([^/]+)$/);
        let id = null;
        try { id = m && decodeURIComponent(m[1]); } catch { /* %XX mal formé */ }
        if (!id || !ID_RE.test(id)) return json(400, { code: 'bad_id' });
        if (request.method === 'DELETE') { await store.del(user, id); return json(200, { ok: true }); }
        if (request.method === 'PUT') {
          const raw = await request.text();
          if (raw.length > MAX_DOC) return json(413, { code: 'quota' });
          try { JSON.parse(raw); } catch { return json(400, { code: 'bad_json' }); }
          const { n, total } = await store.size(user);
          if (n >= MAX_DOCS || total + raw.length > who.quota) return json(413, { code: 'quota', quota: who.quota });
          await store.put(user, id, raw);
          return json(200, { ok: true });
        }
        return json(405, { code: 'method' });
      } catch (e) {
        console.error('[engram] sync', e?.message || e);
        return json(500, { code: 'sync_error' });
      }
    }
  };
}
