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

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseSecret, readLicense, stripeMode } from './pay.mjs';

const MB = 1024 * 1024;
const MAX_DOC = 2.5 * MB, MAX_DOCS = 4000, MAX_TOTAL = 300 * MB, FREE_TOTAL = 25 * MB;
const ID_RE = /^[A-Za-z0-9_~.-]{1,160}$/;

/** Une file par clé : le contrôle du quota et l'écriture d'un même espace ne se croisent pas (dans ce processus). */
const queues = new Map();
function serial(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {}); queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}
/** Le quota tient-il avec ce document ? La place qu'il prenait déjà est rendue (une fiche réenregistrée sans grandir passe). */
const fits = (limit, { n, total }, old, size) => !limit || (old != null || n < limit.docs) && total - (old || 0) + size <= limit.quota;

/** Des fichiers : un dossier par espace, un fichier par document. */
export function fileBackend(dir) {
  const file = (user, id) => path.join(dir, user, id + '.json');
  const sizeOf = async (user, id) => { try { return (await fs.stat(file(user, id))).size; } catch { return null; } };
  async function size(user) { const names = (await fs.readdir(path.join(dir, user)).catch(() => [])).filter(f => f.endsWith('.json')); let n = 0, total = 0; for (const f of names) { n++; total += (await fs.stat(path.join(dir, user, f)).catch(() => ({ size: 0 }))).size; } return { n, total }; }
  return {
    quota: true, size,
    async list(user) {
      const names = await fs.readdir(path.join(dir, user)).catch(() => []);
      return Promise.all(names.filter(n => n.endsWith('.json')).map(async n => {
        const raw = await fs.readFile(path.join(dir, user, n), 'utf8');
        return { id: n.slice(0, -5), data: JSON.parse(raw), size: raw.length };
      }));
    },
    async get(user, id) { try { return await fs.readFile(file(user, id), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    /** limit { quota, docs } : refuse (false) si le document ne tient pas ; contrôle et écriture sous la file de l'espace. */
    put(user, id, raw, limit) {
      return serial(dir + '\0' + user, async () => {
        if (limit && !fits(limit, await size(user), await sizeOf(user, id), Buffer.byteLength(raw))) return false;
        await fs.mkdir(path.join(dir, user), { recursive: true });
        const tmp = file(user, id) + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
        try { await fs.writeFile(tmp, raw); await fs.rename(tmp, file(user, id)); } catch (e) { await fs.rm(tmp, { force: true }); throw e; }
        return true;
      });
    },
    async create(user, id, raw) {
      await fs.mkdir(path.join(dir, user), { recursive: true });
      try { await fs.writeFile(file(user, id), raw, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
    },
    del(user, id) { return serial(dir + '\0' + user, () => fs.rm(file(user, id), { force: true })); },
    clear(user) { return serial(dir + '\0' + user, () => fs.rm(path.join(dir, user), { recursive: true, force: true })); }
  };
}

/** Netlify Blobs : un magasin (« engram-sync » par défaut), une clé « <espace>/<document> ».
 *  usage : tient le compte des tailles par espace, pour que le quota en Mo tienne aussi en ligne. Une clé vide par document,
 *  « _sz/<espace>/<document>/<octets> » : une liste suffit pour faire le compte, et deux écritures simultanées ne s'effacent
 *  pas (pas de total relu puis réécrit). Une écriture sous quota pose d'abord sa clé (réservation), puis fait le compte :
 *  des envois simultanés se voient entre eux, même d'une instance à l'autre de la fonction. */
export function blobsBackend({ name = 'engram-sync', usage = true } = {}) {
  let store = null;
  const open = async () => store || (store = (await import('@netlify/blobs')).getStore({ name, consistency: 'strong' }));
  const SZ = user => '_sz/' + user + '/';
  /** Les clés de taille d'un espace : { id: [[clé, octets], …] }. */
  async function sizeKeys(s, user) {
    const { blobs } = await s.list({ prefix: SZ(user) }), m = {};
    for (const b of blobs) { const rest = b.key.slice(SZ(user).length), i = rest.lastIndexOf('/'); if (i < 1) continue; (m[rest.slice(0, i)] ||= []).push([b.key, +rest.slice(i + 1) || 0]); }
    return m;
  }
  const count = (m, skip) => { let n = 0, total = 0; for (const [id, ks] of Object.entries(m)) if (id !== skip) { n++; total += Math.max(...ks.map(k => k[1])); } return { n, total }; };
  return {
    quota: usage,
    async list(user) {
      const s = await open(), { blobs } = await s.list({ prefix: user + '/' });
      return (await Promise.all(blobs.map(async b => { const raw = await s.get(b.key, { type: 'text' }); return raw == null ? null : { id: b.key.slice(user.length + 1), data: JSON.parse(raw), size: raw.length }; }))).filter(Boolean);
    },
    async size(user) {
      const s = await open();
      if (!usage) { const { blobs } = await s.list({ prefix: user + '/' }); return { n: blobs.length, total: 0 }; }
      return count(await sizeKeys(s, user));
    },
    async get(user, id) { return (await open()).get(user + '/' + id, { type: 'text' }); },
    put(user, id, raw, limit) {
      return serial(name + '\0' + user, async () => {
        const s = await open();
        if (!usage) { await s.set(user + '/' + id, raw); return true; }
        const size = Buffer.byteLength(raw), mine = SZ(user) + id + '/' + size;
        let m = await sizeKeys(s, user);
        const had = (m[id] || []).map(k => k[0]), fresh = !had.includes(mine);
        if (limit) {
          if (fresh) { await s.set(mine, ''); m = await sizeKeys(s, user); }
          const others = count(m, id), old = had.length ? 0 : null;
          if (!fits(limit, others, old, size)) { if (fresh) await s.delete(mine); return false; }
        } else if (fresh) await s.set(mine, '');
        await s.set(user + '/' + id, raw);
        for (const k of had) if (k !== mine) await s.delete(k);
        return true;
      });
    },
    async create(user, id, raw) {
      const s = await open();
      if ((await s.get(user + '/' + id, { type: 'text' })) != null) return false;
      await s.set(user + '/' + id, raw);
      if (usage) await s.set(SZ(user) + id + '/' + Buffer.byteLength(raw), '');
      return true;
    },
    del(user, id) {
      return serial(name + '\0' + user, async () => {
        const s = await open(); await s.delete(user + '/' + id);
        if (usage) for (const [k] of (await sizeKeys(s, user))[id] || []) await s.delete(k);
      });
    },
    async clear(user) {
      const s = await open();
      for (const prefix of [user + '/', ...(usage ? [SZ(user)] : [])]) { const { blobs } = await s.list({ prefix }); for (const b of blobs) await s.delete(b.key); }
    }
  };
}

/** Compteur du quota gratuit d'IA dans Netlify Blobs (magasin « engram-quota »), partagé par toutes les instances de la fonction.
 *  Une clé par jour et par visiteur (empreinte de son adresse) ; les jours passés sont effacés au fil des appels. */
export function blobsCounter({ name = 'engram-quota' } = {}) {
  let store = null;
  const open = async () => store || (store = (await import('@netlify/blobs')).getStore({ name, consistency: 'strong' }));
  const day = (d = 0) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  return {
    async over(key, max) {
      const s = await open(), k = day() + '/' + crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
      const n = (+(await s.get(k, { type: 'text' })) || 0) + 1;
      await s.set(k, String(n));
      if (Math.random() < 0.01) (async () => { for (let d = 2; d <= 5; d++) { const { blobs } = await s.list({ prefix: day(d) + '/' }); for (const b of blobs) await s.delete(b.key); } })().catch(() => {});
      return n > max;
    }
  };
}

/** Le stockage par défaut : Netlify Blobs en ligne, des fichiers ailleurs. */
export function defaultBackend(env = process.env) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return env.NETLIFY || env.NETLIFY_BLOBS_CONTEXT ? blobsBackend() : fileBackend(env.ENGRAM_SYNC_DIR || path.join(here, 'data'));
}

export function createSync(env = process.env, { backend, accounts = null } = {}) {
  const LIC = licenseSecret(env), MODE = stripeMode(env);
  const store = backend || defaultBackend(env);
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  /** Le code d'abonnement présenté (Pro ou Élite, en cours de validité). */
  const licenseOf = request => {
    const d = LIC && readLicense(LIC, request.headers.get('x-engram-license') || '', MODE);
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
          if (Buffer.byteLength(raw) > MAX_DOC) return json(413, { code: 'quota' });
          try { JSON.parse(raw); } catch { return json(400, { code: 'bad_json' }); }
          const limit = { quota: who.quota, docs: MAX_DOCS };
          // Les stockages d'Engram contrôlent le quota au moment d'écrire (sans course entre deux envois) ; un autre, avant.
          if (store.quota) { if (!(await store.put(user, id, raw, limit))) return json(413, { code: 'quota', quota: who.quota }); }
          else {
            const old = await store.get(user, id);
            if (!fits(limit, await store.size(user), old == null ? null : Buffer.byteLength(old), Buffer.byteLength(raw))) return json(413, { code: 'quota', quota: who.quota });
            await store.put(user, id, raw);
          }
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
