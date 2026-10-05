// Synchronisation des paquets entre appareils, pour les abonnés Pro et Élite.
// Même découpage que la synchronisation de l'app Claude (Store.connect) : un document par paquet
// (« deck_<id> », et « deck_<id>~p1 »… pour les gros paquets), un par image (« img_<id> »), et « profile ».
//
//   GET    /api/sync            → { docs: [{ id, data }] }       tout l'espace de l'abonné
//   PUT    /api/sync/doc/<id>   ← le document (JSON)             → { ok: true }
//   DELETE /api/sync/doc/<id>                                    → { ok: true }
//
// L'abonné est reconnu par son code d'abonnement (en-tête x-engram-license, signé par pay.mjs) :
// son espace porte le numéro de client Stripe, le même sur tous ses appareils.
// Stockage : Netlify Blobs en ligne (magasin « engram-sync »), des fichiers ailleurs (ENGRAM_SYNC_DIR,
// par défaut server/data). Garde-fous : 2,5 Mo par document, 4 000 documents, 300 Mo par abonné.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseSecret, readLicense } from './pay.mjs';

const MAX_DOC = 2.5 * 1024 * 1024, MAX_DOCS = 4000, MAX_TOTAL = 300 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_~.-]{1,160}$/;

/** Des fichiers : un dossier par abonné, un fichier par document. */
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
    async put(user, id, raw) { await fs.mkdir(path.join(dir, user), { recursive: true }); const tmp = file(user, id) + '.tmp'; await fs.writeFile(tmp, raw); await fs.rename(tmp, file(user, id)); },
    async del(user, id) { await fs.rm(file(user, id), { force: true }); }
  };
}

/** Netlify Blobs : un magasin « engram-sync », une clé « <abonné>/<document> ». */
export function blobsBackend() {
  let store = null;
  const get = async () => store || (store = (await import('@netlify/blobs')).getStore({ name: 'engram-sync', consistency: 'strong' }));
  return {
    async list(user) {
      const s = await get(), { blobs } = await s.list({ prefix: user + '/' });
      return (await Promise.all(blobs.map(async b => { const raw = await s.get(b.key, { type: 'text' }); return raw == null ? null : { id: b.key.slice(user.length + 1), data: JSON.parse(raw), size: raw.length }; }))).filter(Boolean);
    },
    async size(user) { const s = await get(), { blobs } = await s.list({ prefix: user + '/' }); return { n: blobs.length, total: 0 }; },
    async put(user, id, raw) { await (await get()).set(user + '/' + id, raw); },
    async del(user, id) { await (await get()).delete(user + '/' + id); }
  };
}

export function createSync(env = process.env, { backend } = {}) {
  const LIC = licenseSecret(env);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const store = backend || (env.NETLIFY || env.NETLIFY_BLOBS_CONTEXT ? blobsBackend() : fileBackend(env.ENGRAM_SYNC_DIR || path.join(here, 'data')));
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  /** L'abonné derrière le code d'abonnement (Pro ou Élite, en cours de validité). */
  const userOf = request => {
    const d = readLicense(LIC, request.headers.get('x-engram-license') || '');
    if (!d || d.expired || !['pro', 'elite'].includes(d.p) || !d.c) return null;
    return String(d.c).replace(/[^A-Za-z0-9_]/g, '').slice(0, 60) || null;
  };
  return {
    async handle(request) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith('/api/sync')) return null;
      if (!LIC) return json(503, { code: 'sync_off' });
      const user = userOf(request);
      if (!user) return json(401, { code: 'not_granted' });
      try {
        if (pathname === '/api/sync' && request.method === 'GET') {
          const docs = await store.list(user);
          return json(200, { docs: docs.map(({ id, data }) => ({ id, data })) });
        }
        const m = pathname.match(/^\/api\/sync\/doc\/([^/]+)$/);
        const id = m && decodeURIComponent(m[1]);
        if (!id || !ID_RE.test(id)) return json(400, { code: 'bad_id' });
        if (request.method === 'DELETE') { await store.del(user, id); return json(200, { ok: true }); }
        if (request.method === 'PUT') {
          const raw = await request.text();
          if (raw.length > MAX_DOC) return json(413, { code: 'quota' });
          try { JSON.parse(raw); } catch { return json(400, { code: 'bad_json' }); }
          const { n, total } = await store.size(user);
          if (n >= MAX_DOCS || total + raw.length > MAX_TOTAL) return json(413, { code: 'quota' });
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
