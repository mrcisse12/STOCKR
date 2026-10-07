// Comptes d'Engram : e-mail + mot de passe, clés d'accès (Face ID, Touch ID, Windows Hello),
// « Continuer avec Google » et « Continuer avec Apple ». Écrit avec les objets standard du Web
// (Request, Response), comme core.mjs et pay.mjs : le même module tourne dans server.mjs et dans
// la fonction Netlify (netlify/functions/account.mjs). Aucune dépendance : node:crypto suffit.
//
// La session voyage dans l'en-tête x-engram-session (jamais de cookie, donc pas de CSRF). C'est un jeton
// signé (HMAC) { compte, version de session, émission, fin à 60 jours } : « se déconnecter partout »
// augmente la version et tous les jetons émis avant tombent.
//
//   GET  /api/account/config                          → { enabled, providers: { password, passkey, google, apple }, rpId }
//   POST /api/account/signup   ← { email, password, name? }           → { session, user, recoveryCode }
//   POST /api/account/login    ← { email, password }                   → { session, user }
//   POST /api/account/recover  ← { email, recoveryCode, newPassword }  → { session, user, recoveryCode }
//   GET  /api/account/me       (session) [?fresh=1]                    → { user, sub }  sub = { license, plan, bill, until, ends } | null
//   POST /api/account/update   (session) ← { name }                    → { user }
//   POST /api/account/password (session) ← { password, current? }      → { session, user, recoveryCode? }
//   POST /api/account/recovery-code (session) ← { password? }          → { recoveryCode }
//   POST /api/account/link-license  (session) ← { license }            → { user, sub }   (abonnement pris avant le compte)
//   POST /api/account/logout-all    (session)                          → { ok }
//   POST /api/account/delete        (session) ← { password? }          → { ok }  (mot de passe, ou session de moins de 10 min)
//   POST /api/account/passkey/register/options (session)              → { token, publicKey }
//   POST /api/account/passkey/register/verify  (session) ← { token, credential, label? } → { user }
//   POST /api/account/passkey/login/options                           → { token, publicKey }
//   POST /api/account/passkey/login/verify     ← { token, credential } → { session, user }
//   POST /api/account/passkey/delete (session) ← { id }                → { user }
//   POST /api/account/google   ← { idToken }          (avec une session : lie Google au compte ouvert) → { session, user, created? }
//   POST /api/account/apple    ← { idToken, name? }   (idem)
//
// Variables : ENGRAM_SESSION_SECRET (facultatif : sinon un secret aléatoire de 32 octets est créé une fois
// et gardé dans le stockage), ENGRAM_RP_ID (facultatif : sinon l'hôte de la requête), ENGRAM_RP_ORIGINS
// (origines admises en plus pour les clés d'accès), GOOGLE_CLIENT_ID, APPLE_CLIENT_ID (plusieurs
// identifiants possibles, séparés par des virgules ; le premier est donné à l'app).
//
// Stockage : les « backends » de sync.mjs. Les comptes sont rangés sous « acct/… » (user.<id>, et des index
// email.<h>, google.<h>, apple.<h>, cred.<h>, stripe.<client>) ; l'espace de synchronisation d'un compte
// est « u_<id> ».

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { createPay, GRACE } from './pay.mjs';

const scrypt = promisify(crypto.scrypt);
const b64u = { enc: b => Buffer.from(b).toString('base64url'), dec: s => Buffer.from(typeof s === 'string' ? s : '', 'base64url') };
const sha256 = b => crypto.createHash('sha256').update(b).digest();
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const hkey = s => sha256('engram-acct|' + s).toString('hex').slice(0, 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeEq = (a, b) => { a = Buffer.from(a); b = Buffer.from(b); return a.length === b.length && crypto.timingSafeEqual(a, b); };

const NS = 'acct', NS_CH = 'acct-ch', NS_RL = 'acct-rl';
const MB = 1024 * 1024;
export const QUOTA = { free: 25 * MB, paid: 300 * MB };
const SESSION_TTL = 60 * 864e5, CHALLENGE_TTL = 5 * 60e3, RECENT = 10 * 60e3, PLAN_CACHE = 10 * 60e3;
const WINDOW = 15 * 60e3, LIMITS = { email: 10, ip: 20, signup: 10, passkey: 20, fed: 20 };
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * MB };
const PW_MIN = 8, PW_MAX = 1024, MAX_PASSKEYS = 20, MAX_BODY = 64 * 1024;
const UID_RE = /^[0-9a-f]{24}$/;
const RC_ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 signes, sans 0/O ni 1/I
const ALGS = [-7, -8, -257]; // ES256, EdDSA, RS256
const JWKS = { google: 'https://www.googleapis.com/oauth2/v3/certs', apple: 'https://appleid.apple.com/auth/keys' };
const ISS = { google: ['accounts.google.com', 'https://accounts.google.com'], apple: ['https://appleid.apple.com'] };

const E = (status, code, message) => Object.assign(new Error(message || code), { status, code, http: true });

/* ── CBOR (RFC 8949), juste ce qu'il faut pour WebAuthn ───────────── */
function half(h) { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return s * (e === 0 ? f * 2 ** -24 : e === 31 ? (f ? NaN : Infinity) : (1 + f / 1024) * 2 ** (e - 15)); }
/** Décode un élément CBOR à partir de `start` ; renvoie { value, end }. Octets → Buffer, maps → Map. */
export function cborDecode(input, start = 0) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let pos = start, depth = 0;
  const need = n => { if (n < 0 || pos + n > buf.length) throw new Error('cbor: truncated'); };
  function len(ai) {
    if (ai < 24) return ai;
    if (ai === 24) { need(1); return buf[pos++]; }
    if (ai === 25) { need(2); const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (ai === 26) { need(4); const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (ai === 27) { need(8); const v = buf.readBigUInt64BE(pos); pos += 8; if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: too big'); return Number(v); }
    throw new Error('cbor: indefinite or reserved length');
  }
  function item() {
    if (++depth > 16) throw new Error('cbor: too deep');
    need(1);
    const b = buf[pos++], mt = b >> 5, ai = b & 31;
    let out;
    switch (mt) {
      case 0: out = len(ai); break;
      case 1: out = -1 - len(ai); break;
      case 2: { const n = len(ai); need(n); out = buf.subarray(pos, pos + n); pos += n; break; }
      case 3: { const n = len(ai); need(n); out = buf.toString('utf8', pos, pos + n); pos += n; break; }
      case 4: { const n = len(ai); if (n > 4096) throw new Error('cbor: array too long'); out = []; for (let i = 0; i < n; i++) out.push(item()); break; }
      case 5: { const n = len(ai); if (n > 1024) throw new Error('cbor: map too long'); out = new Map(); for (let i = 0; i < n; i++) { const k = item(); out.set(k, item()); } break; }
      case 6: len(ai); out = item(); break; // étiquette : ignorée
      default:
        if (ai === 20) out = false; else if (ai === 21) out = true; else if (ai === 22) out = null; else if (ai === 23) out = undefined;
        else if (ai === 25) { need(2); out = half(buf.readUInt16BE(pos)); pos += 2; }
        else if (ai === 26) { need(4); out = buf.readFloatBE(pos); pos += 4; }
        else if (ai === 27) { need(8); out = buf.readDoubleBE(pos); pos += 8; }
        else throw new Error('cbor: unsupported simple value');
    }
    depth--;
    return out;
  }
  const value = item();
  return { value, end: pos };
}

/* ── WebAuthn : données de l'authentificateur, clés COSE, signatures ── */
function parseAuthData(ad) {
  if (!Buffer.isBuffer(ad) || ad.length < 37) throw new Error('authenticatorData too short');
  const flags = ad[32];
  const out = { rpIdHash: ad.subarray(0, 32), flags, up: !!(flags & 0x01), uv: !!(flags & 0x04), be: !!(flags & 0x08), bs: !!(flags & 0x10), at: !!(flags & 0x40), count: ad.readUInt32BE(33) };
  if (out.at) {
    if (ad.length < 55) throw new Error('attested credential data truncated');
    const L = ad.readUInt16BE(53);
    if (L < 16 || L > 1023 || ad.length < 55 + L) throw new Error('bad credential id');
    out.credId = ad.subarray(55, 55 + L);
    const { value, end } = cborDecode(ad, 55 + L);
    out.cose = value; out.end = end;
    if (!(flags & 0x80) && end !== ad.length) throw new Error('trailing bytes in authenticatorData');
  }
  return out;
}
const bytes = (v, n) => Buffer.isBuffer(v) && (n == null || v.length === n);
/** Clé COSE → JWK (ES256 P-256, RS256 ≥ 2048 bits, EdDSA Ed25519), validée par node:crypto. */
function coseToJwk(m) {
  if (!(m instanceof Map)) throw new Error('COSE key is not a map');
  const kty = m.get(1), alg = m.get(3);
  let jwk;
  if (kty === 2 && alg === -7 && m.get(-1) === 1 && bytes(m.get(-2), 32) && bytes(m.get(-3), 32)) jwk = { kty: 'EC', crv: 'P-256', x: b64u.enc(m.get(-2)), y: b64u.enc(m.get(-3)) };
  else if (kty === 3 && alg === -257 && bytes(m.get(-1)) && m.get(-1).length >= 256 && bytes(m.get(-2)) && m.get(-2).length <= 8) jwk = { kty: 'RSA', n: b64u.enc(m.get(-1)), e: b64u.enc(m.get(-2)) };
  else if (kty === 1 && alg === -8 && m.get(-1) === 6 && bytes(m.get(-2), 32)) jwk = { kty: 'OKP', crv: 'Ed25519', x: b64u.enc(m.get(-2)) };
  else throw new Error('unsupported key type or algorithm');
  crypto.createPublicKey({ key: jwk, format: 'jwk' }); // lève si la clé n'est pas valable (point hors courbe…)
  return { jwk, alg };
}
function verifySig(alg, jwk, data, sig) {
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    if (alg === -7) return crypto.verify('sha256', data, { key, dsaEncoding: 'der' }, sig);
    if (alg === -257) return crypto.verify('sha256', data, key, sig);
    if (alg === -8) return crypto.verify(null, data, key, sig);
  } catch { /* signature mal formée */ }
  return false;
}

/* ── Petites aides ────────────────────────────────────────────────── */
export function normEmail(v) {
  const s = String(v ?? '').normalize('NFC').trim().toLowerCase();
  return s.length <= 254 && /^[^\s@"<>,;:\\()[\]]{1,64}@[^\s@"<>,;:\\()[\]_]+\.[^\s@"<>,;:\\()[\]_.]{2,}$/.test(s) && !/[\u0000-\u001f\u007f]/.test(s) ? s : null;
}
const cleanName = v => String(typeof v === 'string' ? v : '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanLabel = v => cleanName(v).slice(0, 40);
function checkNewPassword(pw) {
  if (typeof pw !== 'string' || [...pw].length < PW_MIN) throw E(400, 'weak_password', `at least ${PW_MIN} characters`);
  if (pw.length > PW_MAX) throw E(400, 'weak_password', 'too long');
}
const newId = () => crypto.randomBytes(12).toString('hex');
function newRecoveryCode() { let s = ''; for (const x of crypto.randomBytes(20)) s += RC_ALPHA[x & 31]; return s.match(/.{5}/g).join('-'); }
const normCode = c => String(c ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const codeHash = (uid, code) => sha256(`engram-rc|${uid}|${normCode(code)}`).toString('hex');
async function hashPassword(pw) {
  const s = crypto.randomBytes(16), h = await scrypt(pw.normalize('NFC'), s, 32, SCRYPT);
  return { s: s.toString('base64'), h: h.toString('base64'), N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p };
}
const DUMMY_PW = { s: crypto.randomBytes(16).toString('base64'), h: crypto.randomBytes(32).toString('base64'), N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p };
/** Toujours un calcul scrypt complet, même sans compte ou sans mot de passe : le temps de réponse ne trahit rien. */
async function passwordOk(rec, pw) {
  const ref = rec?.pw || DUMMY_PW;
  const N = [2 ** 14, 2 ** 15, 2 ** 16, 2 ** 17].includes(ref.N) ? ref.N : SCRYPT.N;
  const h = await scrypt(String(typeof pw === 'string' ? pw : '').normalize('NFC'), Buffer.from(ref.s, 'base64'), 32, { N, r: ref.r || 8, p: ref.p || 1, maxmem: SCRYPT.maxmem });
  return safeEq(h, Buffer.from(ref.h, 'base64')) && !!rec?.pw;
}
function codeOk(rec, code) {
  const got = Buffer.from(codeHash(rec?.id || 'none', code), 'hex'), want = Buffer.from(rec?.rc?.h || '0'.repeat(64), 'hex');
  return safeEq(got, want) && !!rec?.rc && normCode(code).length === 20;
}
async function readBody(request) {
  const t = await request.text().catch(() => '');
  if (t.length > MAX_BODY) throw E(413, 'too_large');
  try { const j = JSON.parse(t || '{}'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { throw E(400, 'bad_json'); }
}
const spaceOfCustomer = c => String(c).replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);

export function createAccount(env = process.env, { backend, syncBackend, fetchImpl = fetch, pay } = {}) {
  if (!backend || !backend.get) throw new Error('createAccount: a storage backend with get() is required');
  const store = backend, spaces = syncBackend || backend;
  const payer = pay || createPay(env, { fetchImpl });
  const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  const CORS = env.ENGRAM_CORS_ORIGIN || '';
  const CLIENTS = { google: list(env.GOOGLE_CLIENT_ID), apple: list(env.APPLE_CLIENT_ID) };
  const ORIGINS = list(env.ENGRAM_RP_ORIGINS);

  /* ── Stockage ───────────────────────────────────────────────────── */
  const getDoc = async (ns, id) => { const raw = await store.get(ns, id); if (raw == null) return null; try { return JSON.parse(raw); } catch { return null; } };
  const putDoc = (ns, id, o) => store.put(ns, id, JSON.stringify(o));
  const createDoc = async (ns, id, o) => {
    if (store.create) return store.create(ns, id, JSON.stringify(o));
    if ((await store.get(ns, id)) != null) return false;
    await store.put(ns, id, JSON.stringify(o)); return true;
  };
  const getUser = async id => UID_RE.test(id || '') ? getDoc(NS, 'user.' + id) : null;
  const putUser = rec => { rec.updated = Date.now(); return putDoc(NS, 'user.' + rec.id, rec); };
  const byIndex = async key => { const i = await getDoc(NS, key); return i ? getUser(i.u) : null; };
  /** Prend un index s'il est libre (ou s'il pointe depuis plus d'une minute vers un compte disparu). */
  async function claimIndex(key, uid) {
    if (await createDoc(NS, key, { u: uid, t: Date.now() })) return true;
    const i = await getDoc(NS, key);
    if (i?.u === uid) return true;
    if (i && (await getUser(i.u) || i.t > Date.now() - 60e3)) return false;
    await putDoc(NS, key, { u: uid, t: Date.now() }); return true;
  }
  async function dropIndex(key, uid) { const i = await getDoc(NS, key); if (i && i.u === uid) await store.del(NS, key); }
  function prune(ns, expired) {
    if (!store.list || Math.random() > 0.02) return;
    (async () => { for (const d of await store.list(ns)) if (expired(d.data)) await store.del(ns, d.id); })().catch(() => {});
  }

  /* ── Verrous (dans ce processus) : lire-modifier-écrire un compte à la fois ── */
  const locks = new Map();
  function lock(key, fn) {
    const run = (locks.get(key) || Promise.resolve()).then(() => fn());
    const tail = run.then(() => {}, () => {});
    locks.set(key, tail);
    tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    return run;
  }
  const mutate = (uid, fn) => lock('u:' + uid, async () => {
    const rec = await getUser(uid);
    if (!rec) throw E(401, 'no_session', 'account not found');
    await fn(rec); await putUser(rec); return rec;
  });

  /* ── Secret du serveur : variable, sinon tiré une fois et gardé dans le stockage ── */
  let keysP = null;
  function keys() {
    return keysP ||= (async () => {
      let master;
      if (env.ENGRAM_SESSION_SECRET) master = Buffer.from(String(env.ENGRAM_SESSION_SECRET));
      else {
        let d = await getDoc(NS, 'meta.secret');
        if (!d?.k) {
          await createDoc(NS, 'meta.secret', { k: crypto.randomBytes(32).toString('base64'), created: Date.now() });
          if (!store.create) await sleep(300); // deux instances au tout premier démarrage : la dernière écriture gagne, on la relit
          d = await getDoc(NS, 'meta.secret');
        }
        master = Buffer.from(d?.k || '', 'base64');
        if (master.length < 32) throw new Error('session secret unavailable');
      }
      return { session: hmac(master, 'engram-session-v1'), challenge: hmac(master, 'engram-webauthn-challenge-v1') };
    })().catch(e => { keysP = null; throw e; });
  }
  function sign(key, prefix, data) { const body = b64u.enc(JSON.stringify(data)); return `${prefix}.${body}.${b64u.enc(hmac(key, prefix + '.' + body))}`; }
  function unsign(key, prefix, tok) {
    if (typeof tok !== 'string' || tok.length > 2000) return null;
    const parts = tok.trim().split('.');
    if (parts.length !== 3 || parts[0] !== prefix || !parts[1] || !parts[2]) return null;
    if (!safeEq(b64u.dec(parts[2]), hmac(key, prefix + '.' + parts[1]))) return null;
    try { const d = JSON.parse(b64u.dec(parts[1]).toString('utf8')); return d && typeof d === 'object' ? d : null; } catch { return null; }
  }

  /* ── Sessions ───────────────────────────────────────────────────── */
  async function issue(rec) { const now = Date.now(); return sign((await keys()).session, 's1', { u: rec.id, v: rec.sv, i: now, e: now + SESSION_TTL }); }
  async function readSession(tok) {
    if (!tok) return null;
    const d = unsign((await keys()).session, 's1', tok);
    if (!d || !UID_RE.test(d.u || '') || !(d.e > Date.now())) return null;
    const rec = await getUser(d.u);
    return rec && rec.sv === d.v ? { rec, iat: d.i } : null;
  }
  async function auth(request) { const s = await readSession(request.headers.get('x-engram-session')); if (!s) throw E(401, 'no_session', 'sign in again'); return s; }

  /* ── Limites de tentatives : par adresse IP (mémoire) et par e-mail (mémoire + stockage) ── */
  const hits = new Map();
  async function rlGet(key, persist) {
    let e = hits.get(key);
    if (persist) { const d = await getDoc(NS_RL, hkey(key)).catch(() => null); if (d && (!e || d.n > e.n)) e = d; }
    return e && e.t + WINDOW > Date.now() ? e : null;
  }
  async function rlCheck(...rules) {
    let wait = 0;
    for (const [key, max, persist] of rules) { const e = await rlGet(key, persist); if (e && e.n >= max) wait = Math.max(wait, Math.ceil((e.t + WINDOW - Date.now()) / 1000)); }
    if (wait) throw Object.assign(E(429, 'rate_limited', 'too many attempts, try again later'), { retryAfter: wait });
  }
  async function rlHit(key, persist) {
    const old = await rlGet(key, persist), e = old ? { n: old.n + 1, t: old.t } : { n: 1, t: Date.now() };
    hits.set(key, e);
    if (hits.size > 20000) for (const [k, v] of hits) if (v.t + WINDOW <= Date.now()) hits.delete(k);
    if (persist) { await putDoc(NS_RL, hkey(key), e).catch(() => {}); prune(NS_RL, d => !(d?.t + WINDOW > Date.now())); }
  }
  /** Confirme une action sensible : mot de passe, ou session ouverte depuis moins de 10 minutes. */
  async function confirm(s, password, ip) {
    if (typeof password === 'string' && password && s.rec.pw) {
      const k = 'email:' + (s.rec.email || s.rec.id);
      await rlCheck(['ip:' + ip, LIMITS.ip], [k, LIMITS.email, true]);
      if (await passwordOk(s.rec, password)) return;
      await Promise.all([rlHit('ip:' + ip), rlHit(k, true)]);
      throw E(401, 'bad_credentials', 'wrong password');
    }
    if (s.iat > Date.now() - RECENT) return;
    throw E(403, 'reauth_required', 'confirm with your password or sign in again');
  }

  /* ── Comptes ────────────────────────────────────────────────────── */
  async function createUser(fields, extraIndexes = []) {
    const id = fields.id || newId(), now = Date.now();
    const rec = { v: 1, email: null, emailVerified: false, name: '', pw: null, rc: null, google: null, apple: null, passkeys: [], stripe: null, ...fields, id, sv: 1, created: now, updated: now };
    const make = async () => {
      const taken = [];
      for (const k of [rec.email && 'email.' + hkey(rec.email), ...extraIndexes].filter(Boolean)) {
        if (await claimIndex(k, id)) taken.push(k);
        else { for (const t of taken) await dropIndex(t, id); return null; }
      }
      await putDoc(NS, 'user.' + id, rec);
      return rec;
    };
    return rec.email ? lock('e:' + rec.email, make) : make();
  }
  function pub(rec) {
    return {
      id: rec.id, email: rec.email || null, emailVerified: !!rec.emailVerified, name: rec.name || '', created: rec.created,
      providers: [rec.pw && 'password', rec.passkeys?.length && 'passkey', rec.google && 'google', rec.apple && 'apple'].filter(Boolean),
      passkeys: (rec.passkeys || []).map(k => ({ id: k.id, label: k.label || '', created: k.created, lastUsed: k.lastUsed || null })),
      recovery: !!rec.rc, subscription: !!rec.stripe?.customer
    };
  }
  const paidOf = rec => !!(rec?.stripe?.sub?.ok && rec.stripe.sub.until + GRACE > Date.now());
  /** L'abonnement du compte (Stripe), avec un code d'abonnement neuf ; vérifié auprès de Stripe au plus toutes les 10 minutes. */
  async function planOf(rec, fresh) {
    const c = rec.stripe?.customer;
    if (!c || !payer.enabled) return null;
    const cached = rec.stripe.sub;
    const fromCache = () => paidOf(rec) ? { license: payer.licenseFrom({ c, s: cached.s, p: cached.p, b: cached.b, until: cached.until }), plan: cached.p, bill: cached.b, until: cached.until, ends: !!cached.ends, status: cached.status } : null;
    if (!fresh && cached?.checked > Date.now() - PLAN_CACHE) return fromCache();
    let found;
    try { found = await payer.subscriptionFor(c); } catch (e) { console.error('[engram] account plan', e.message); return fromCache(); }
    await mutate(rec.id, r => { if (r.stripe?.customer === c) r.stripe.sub = found ? { ok: true, s: found.sub, p: found.plan, b: found.bill, until: found.until, ends: found.ends, status: found.status, checked: Date.now() } : { ok: false, checked: Date.now() }; });
    return found ? { license: found.license, plan: found.plan, bill: found.bill, until: found.until, ends: found.ends, status: found.status } : null;
  }
  /** Copie l'espace de synchronisation d'un abonné (client Stripe) vers celui de son compte, s'il est vide. */
  async function copySpace(from, to) {
    if (!from || !spaces.list || (await spaces.size(to)).n > 0) return 0;
    const docs = await spaces.list(from);
    for (const d of docs) await spaces.put(to, d.id, JSON.stringify(d.data));
    return docs.length;
  }
  /** Rattache un client Stripe à un compte (paiement fait connecté, ou code d'abonnement présenté). */
  async function linkStripe(uid, customer, found) {
    if (!UID_RE.test(uid || '') || typeof customer !== 'string' || !/^cus_[A-Za-z0-9]{1,80}$/.test(customer)) return false;
    const key = 'stripe.' + spaceOfCustomer(customer);
    try {
      if (!(await getUser(uid)) || !(await claimIndex(key, uid))) return false;
      let before;
      await mutate(uid, r => {
        before = r.stripe?.customer;
        const sub = found ? { ok: true, s: found.sub, p: found.plan, b: found.bill, until: found.until, ends: !!found.ends, status: found.status, checked: Date.now() } : before === customer ? r.stripe.sub : null;
        r.stripe = { customer, sub };
      });
      if (before && before !== customer) await dropIndex('stripe.' + spaceOfCustomer(before), uid);
      if (before !== customer) await copySpace(spaceOfCustomer(customer), 'u_' + uid).catch(e => console.error('[engram] account copy', e.message));
      return true;
    } catch (e) { console.error('[engram] account link', e.message); return false; }
  }
  async function removeAccount(rec) {
    const idx = [rec.email && 'email.' + hkey(rec.email), rec.google && 'google.' + hkey(rec.google.sub), rec.apple && 'apple.' + hkey(rec.apple.sub),
      rec.stripe?.customer && 'stripe.' + spaceOfCustomer(rec.stripe.customer), ...(rec.passkeys || []).map(k => 'cred.' + hkey(k.id))].filter(Boolean);
    await store.del(NS, 'user.' + rec.id); // d'abord : toutes les sessions tombent tout de suite
    for (const k of idx) await dropIndex(k, rec.id);
    const space = 'u_' + rec.id;
    if (spaces.clear) await spaces.clear(space);
    else if (spaces.list) for (const d of await spaces.list(space)) await spaces.del(space, d.id);
  }

  /* ── Clés d'accès (WebAuthn) ─────────────────────────────────────── */
  function rpOf(request) {
    if (env.ENGRAM_RP_ID) return env.ENGRAM_RP_ID.trim().toLowerCase();
    const h = request.headers, host = (h.get('x-forwarded-host') || h.get('host') || new URL(request.url).host).split(',')[0].trim().toLowerCase();
    return host.replace(/:\d+$/, '');
  }
  function originOk(origin, rp) {
    if (typeof origin !== 'string') return false;
    if (origin === 'https://' + rp || ORIGINS.includes(origin)) return true;
    return rp === 'localhost' && /^http:\/\/localhost(:\d{1,5})?$/.test(origin); // développement
  }
  const usedCh = new Map();
  async function consumeChallenge(c, exp) {
    const k = hkey('ch|' + c);
    if (usedCh.has(k)) return false;
    usedCh.set(k, exp);
    if (usedCh.size > 5000) for (const [x, e] of usedCh) if (e < Date.now()) usedCh.delete(x);
    if (!(await createDoc(NS_CH, k, { e: exp }))) return false;
    prune(NS_CH, d => !(d?.e > Date.now()));
    return true;
  }
  async function challenge(kind, rp, uid) {
    const c = b64u.enc(crypto.randomBytes(32)), e = Date.now() + CHALLENGE_TTL;
    return { c, token: sign((await keys()).challenge, 'c1', { c, k: kind, rp, ...(uid ? { u: uid } : {}), e }) };
  }
  async function readChallenge(tok, kind, rp, uid) {
    const d = unsign((await keys()).challenge, 'c1', tok);
    if (!d || d.k !== kind || d.rp !== rp || !(d.e > Date.now()) || (uid && d.u !== uid)) throw new Error('challenge token invalid or expired');
    if (!(await consumeChallenge(d.c, d.e))) throw new Error('challenge already used');
    return d;
  }
  function clientData(raw, type, c, rp) {
    let cd; try { cd = JSON.parse(raw.toString('utf8')); } catch { throw new Error('clientDataJSON unreadable'); }
    if (cd?.type !== type) throw new Error('wrong clientData type');
    const got = b64u.dec(typeof cd.challenge === 'string' ? cd.challenge : '');
    if (got.length !== 32 || !safeEq(got, b64u.dec(c))) throw new Error('challenge mismatch');
    if (!originOk(cd.origin, rp)) throw new Error('origin not allowed');
    if (cd.crossOrigin === true) throw new Error('cross-origin ceremony');
    return cd;
  }

  /* ── Google, Apple : jeton d'identité (JWT RS256) vérifié avec leurs clés publiques ── */
  const jwksCache = {};
  async function jwks(provider, kid) {
    const c = jwksCache[provider], now = Date.now();
    if (c && c.exp > now && (c.keys.some(k => k.kid === kid) || c.at > now - 60e3)) return c.keys;
    const r = await fetchImpl(JWKS[provider], { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('jwks ' + r.status);
    const j = await r.json(), age = +(/max-age=(\d+)/.exec(r.headers?.get?.('cache-control') || '')?.[1]) || 3600;
    jwksCache[provider] = { keys: Array.isArray(j?.keys) ? j.keys : [], at: now, exp: now + Math.min(Math.max(age, 60), 86400) * 1000 };
    return jwksCache[provider].keys;
  }
  async function verifyIdToken(provider, token) {
    if (typeof token !== 'string' || token.length > 8192) throw new Error('missing token');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('malformed token');
    let header, p;
    try { header = JSON.parse(b64u.dec(parts[0]).toString('utf8')); p = JSON.parse(b64u.dec(parts[1]).toString('utf8')); } catch { throw new Error('malformed token'); }
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('unexpected algorithm');
    const jwk = (await jwks(provider, header.kid)).find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (!jwk) throw new Error('unknown key');
    const key = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    if (!crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), key, b64u.dec(parts[2]))) throw new Error('bad signature');
    const now = Date.now() / 1000;
    if (!ISS[provider].includes(p.iss)) throw new Error('wrong issuer');
    if (!(Array.isArray(p.aud) ? p.aud : [p.aud]).some(a => CLIENTS[provider].includes(a))) throw new Error('wrong audience');
    if (!(p.exp > now - 60)) throw new Error('expired');
    if (p.iat > now + 300 || p.nbf > now + 60) throw new Error('not yet valid');
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 255) throw new Error('no subject');
    return p;
  }
  async function federated(provider, request, b, ip) {
    if (!CLIENTS[provider].length) throw E(503, 'provider_off', provider + ' sign-in is not configured');
    await rlCheck(['fed:' + ip, LIMITS.fed]);
    let p;
    try { p = await verifyIdToken(provider, b.idToken); } catch (e) { await rlHit('fed:' + ip); throw E(401, 'token_invalid', e.message); }
    const verified = p.email_verified === true || p.email_verified === 'true';
    if (provider === 'google' && !verified) throw E(401, 'token_invalid', 'email not verified');
    const email = verified ? normEmail(p.email) : null;
    const name = cleanName(provider === 'google' ? p.name : typeof b.name === 'string' ? b.name : [b.name?.firstName, b.name?.lastName].filter(Boolean).join(' '));
    const tok = request.headers.get('x-engram-session');
    const cur = tok ? await readSession(tok) : null;
    if (tok && !cur) throw E(401, 'no_session', 'sign in again');
    const key = provider + '.' + hkey(p.sub), link = { sub: p.sub, email, linked: Date.now() };
    return lock('f:' + key, async () => {
      const owner = await byIndex(key);
      if (owner) {
        if (cur && cur.rec.id !== owner.id) throw E(409, 'already_linked', 'this ' + provider + ' account is linked to another Engram account');
        return { rec: owner };
      }
      const attach = async rec => {
        if (rec[provider] && rec[provider].sub !== p.sub) throw E(409, 'already_linked', 'another ' + provider + ' account is already linked');
        if (!(await claimIndex(key, rec.id))) throw E(409, 'already_linked');
        return { rec: await mutate(rec.id, r => { r[provider] = link; if (email && r.email === email) r.emailVerified = true; if (!r.name && name) r.name = name; }), linked: true };
      };
      if (cur) return attach(cur.rec);
      if (email) {
        const ex = await byIndex('email.' + hkey(email));
        // Un compte créé avec un mot de passe n'a jamais prouvé son adresse : le lier d'office ouvrirait la porte au
        // « pré-détournement » (quelqu'un crée le compte avec votre adresse avant vous). On demande de se connecter d'abord.
        if (ex) { if (!ex.emailVerified) throw E(409, 'link_required', 'an account already uses this email: sign in, then link ' + provider + ' in Settings'); return attach(ex); }
      }
      const rec = await createUser({ email, emailVerified: !!email, name, [provider]: link }, [key]);
      if (!rec) throw E(409, 'link_required', 'an account already uses this email');
      return { rec, created: true };
    });
  }

  /* ── Routes ─────────────────────────────────────────────────────── */
  const ROUTES = {
    async signup(b, request, ip) {
      const email = normEmail(b.email);
      if (!email) throw E(400, 'bad_email', 'invalid email');
      checkNewPassword(b.password);
      await rlCheck(['signup:' + ip, LIMITS.signup]);
      await rlHit('signup:' + ip);
      const pw = await hashPassword(b.password), id = newId(), code = newRecoveryCode();
      const rec = await createUser({ id, email, name: cleanName(b.name), pw, rc: { h: codeHash(id, code), t: Date.now() } });
      if (!rec) throw E(409, 'unavailable', 'this email cannot be used here: sign in, or use your recovery code');
      return [201, { session: await issue(rec), user: pub(rec), recoveryCode: code }];
    },
    async login(b, request, ip) {
      const email = normEmail(b.email);
      if (!email || typeof b.password !== 'string' || !b.password) throw E(400, 'bad_request', 'email and password required');
      await rlCheck(['ip:' + ip, LIMITS.ip], ['email:' + email, LIMITS.email, true]);
      const rec = await byIndex('email.' + hkey(email));
      if (!(await passwordOk(rec, b.password))) {
        await Promise.all([rlHit('ip:' + ip), rlHit('email:' + email, true)]);
        throw E(401, 'bad_credentials', 'wrong email or password');
      }
      return [200, { session: await issue(rec), user: pub(rec) }];
    },
    async recover(b, request, ip) {
      const email = normEmail(b.email);
      if (!email || typeof b.recoveryCode !== 'string') throw E(400, 'bad_request', 'email and recovery code required');
      checkNewPassword(b.newPassword);
      await rlCheck(['ip:' + ip, LIMITS.ip], ['email:' + email, LIMITS.email, true]);
      const rec = await byIndex('email.' + hkey(email));
      const pw = await hashPassword(b.newPassword); // calculé dans tous les cas : même durée
      if (!codeOk(rec, b.recoveryCode)) {
        await Promise.all([rlHit('ip:' + ip), rlHit('email:' + email, true)]);
        throw E(401, 'bad_recovery', 'wrong email or recovery code');
      }
      const code = newRecoveryCode();
      const r = await mutate(rec.id, x => { x.pw = pw; x.rc = { h: codeHash(x.id, code), t: Date.now() }; x.sv++; });
      return [200, { session: await issue(r), user: pub(r), recoveryCode: code }];
    },
    async update(b, request) {
      const s = await auth(request);
      const r = await mutate(s.rec.id, x => { if (typeof b.name === 'string') x.name = cleanName(b.name); });
      return [200, { user: pub(r) }];
    },
    async password(b, request, ip) {
      const s = await auth(request);
      if (!s.rec.email) throw E(400, 'no_email', 'this account has no email address');
      checkNewPassword(b.password);
      await confirm(s, b.current, ip);
      const pw = await hashPassword(b.password);
      let code = null;
      const r = await mutate(s.rec.id, x => { x.pw = pw; x.sv++; if (!x.rc) { code = newRecoveryCode(); x.rc = { h: codeHash(x.id, code), t: Date.now() }; } });
      return [200, { session: await issue(r), user: pub(r), ...(code ? { recoveryCode: code } : {}) }];
    },
    async 'recovery-code'(b, request, ip) {
      const s = await auth(request);
      if (!s.rec.pw) throw E(400, 'no_password', 'set a password first');
      await confirm(s, b.password, ip);
      const code = newRecoveryCode();
      await mutate(s.rec.id, x => { x.rc = { h: codeHash(x.id, code), t: Date.now() }; });
      return [200, { recoveryCode: code }];
    },
    async 'link-license'(b, request) {
      const s = await auth(request);
      const lic = payer.license(b.license);
      if (!lic?.c) throw E(400, 'bad_license', 'subscription code not valid');
      if (!(await linkStripe(s.rec.id, lic.c, null))) throw E(409, 'already_linked', 'this subscription belongs to another account');
      const r = await getUser(s.rec.id);
      return [200, { user: pub(r), sub: await planOf(r, true) }];
    },
    async 'logout-all'(b, request) {
      const s = await auth(request);
      await mutate(s.rec.id, x => { x.sv++; });
      return [200, { ok: true }];
    },
    async delete(b, request, ip) {
      const s = await auth(request);
      await confirm(s, b.password, ip);
      await lock('u:' + s.rec.id, async () => { const rec = await getUser(s.rec.id); if (rec) await removeAccount(rec); });
      return [200, { ok: true }];
    },
    async 'passkey/register/options'(b, request) {
      const s = await auth(request), rp = rpOf(request), rec = s.rec;
      const { c, token } = await challenge('reg', rp, rec.id);
      return [200, { token, publicKey: {
        challenge: c, rp: { id: rp, name: 'Engram' },
        user: { id: b64u.enc(Buffer.from(rec.id, 'hex')), name: rec.email || rec.name || 'Engram', displayName: rec.name || rec.email || 'Engram' },
        pubKeyCredParams: ALGS.map(alg => ({ type: 'public-key', alg })),
        timeout: CHALLENGE_TTL, attestation: 'none',
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
        excludeCredentials: (rec.passkeys || []).filter(k => k.rpId === rp).map(k => ({ type: 'public-key', id: k.id, ...(k.transports?.length ? { transports: k.transports } : {}) }))
      } }];
    },
    async 'passkey/register/verify'(b, request) {
      const s = await auth(request), rp = rpOf(request);
      if ((s.rec.passkeys || []).length >= MAX_PASSKEYS) throw E(409, 'too_many', 'too many passkeys');
      let entry;
      try {
        const tok = await readChallenge(b.token, 'reg', rp, s.rec.id);
        const resp = b.credential?.response || {};
        clientData(b64u.dec(resp.clientDataJSON), 'webauthn.create', tok.c, rp);
        const att = cborDecode(b64u.dec(resp.attestationObject)).value;
        if (!(att instanceof Map) || !Buffer.isBuffer(att.get('authData'))) throw new Error('attestationObject unreadable');
        const ad = parseAuthData(att.get('authData'));
        if (!safeEq(ad.rpIdHash, sha256(rp))) throw new Error('rpIdHash mismatch');
        if (!ad.up) throw new Error('user not present');
        if (!ad.at || !ad.credId) throw new Error('no credential data');
        const given = b.credential.rawId || b.credential.id;
        if (given && !safeEq(b64u.dec(given), ad.credId)) throw new Error('credential id mismatch');
        const { jwk, alg } = coseToJwk(ad.cose);
        const tr = Array.isArray(resp.transports) ? resp.transports.filter(t => typeof t === 'string' && /^[a-z-]{2,20}$/.test(t)).slice(0, 6) : [];
        entry = { id: b64u.enc(ad.credId), jwk, alg, count: ad.count, rpId: rp, created: Date.now(), lastUsed: null, label: cleanLabel(b.label) || 'Passkey', transports: tr, uv: ad.uv, backup: ad.bs };
      } catch (e) { throw E(400, 'passkey_failed', e.message); }
      if ((s.rec.passkeys || []).some(k => k.id === entry.id) || !(await claimIndex('cred.' + hkey(entry.id), s.rec.id))) throw E(409, 'passkey_exists', 'this passkey is already registered');
      const r = await mutate(s.rec.id, x => { x.passkeys = (x.passkeys || []).filter(k => k.id !== entry.id).concat(entry); });
      return [200, { user: pub(r) }];
    },
    async 'passkey/login/options'(b, request) {
      const rp = rpOf(request), { c, token } = await challenge('auth', rp);
      return [200, { token, publicKey: { challenge: c, rpId: rp, timeout: CHALLENGE_TTL, userVerification: 'preferred', allowCredentials: [] } }];
    },
    async 'passkey/login/verify'(b, request, ip) {
      await rlCheck(['pk:' + ip, LIMITS.passkey]);
      const rp = rpOf(request);
      let rec, pk, count;
      try {
        const tok = await readChallenge(b.token, 'auth', rp);
        const cred = b.credential || {}, resp = cred.response || {};
        const id = b64u.enc(b64u.dec(cred.rawId || cred.id));
        if (!id) throw new Error('no credential id');
        rec = await byIndex('cred.' + hkey(id));
        pk = rec?.passkeys?.find(k => k.id === id);
        if (!pk) throw new Error('unknown credential');
        if (resp.userHandle && !safeEq(b64u.dec(resp.userHandle), Buffer.from(rec.id, 'hex'))) throw new Error('user handle mismatch');
        const cdj = b64u.dec(resp.clientDataJSON);
        clientData(cdj, 'webauthn.get', tok.c, rp);
        const raw = b64u.dec(resp.authenticatorData), ad = parseAuthData(raw);
        if (pk.rpId !== rp || !safeEq(ad.rpIdHash, sha256(pk.rpId))) throw new Error('rpIdHash mismatch');
        if (!ad.up) throw new Error('user not present');
        if (!verifySig(pk.alg, pk.jwk, Buffer.concat([raw, sha256(cdj)]), b64u.dec(resp.signature))) throw new Error('bad signature');
        if ((pk.count > 0 || ad.count > 0) && ad.count <= pk.count) throw new Error('signature counter went backwards (cloned authenticator?)');
        count = ad.count;
      } catch (e) {
        await rlHit('pk:' + ip);
        if (env.ENGRAM_ACCOUNT_DEBUG) console.error('[engram] passkey', e.message);
        throw E(401, 'passkey_failed', 'passkey not accepted');
      }
      const r = await mutate(rec.id, x => { const k = x.passkeys.find(y => y.id === pk.id); if (k) { k.count = Math.max(k.count, count); k.lastUsed = Date.now(); } });
      return [200, { session: await issue(r), user: pub(r) }];
    },
    async 'passkey/delete'(b, request) {
      const s = await auth(request), rec = s.rec;
      const pk = (rec.passkeys || []).find(k => k.id === b.id);
      if (!pk) throw E(404, 'not_found', 'unknown passkey');
      if (!rec.pw && !rec.google && !rec.apple && rec.passkeys.length === 1) throw E(409, 'last_method', 'add another way to sign in first');
      const r = await mutate(rec.id, x => { x.passkeys = x.passkeys.filter(k => k.id !== pk.id); });
      await dropIndex('cred.' + hkey(pk.id), rec.id);
      return [200, { user: pub(r) }];
    },
    async google(b, request, ip) { const o = await federated('google', request, b, ip); return [200, { session: await issue(o.rec), user: pub(o.rec), ...(o.created ? { created: true } : {}), ...(o.linked ? { linked: true } : {}) }]; },
    async apple(b, request, ip) { const o = await federated('apple', request, b, ip); return [200, { session: await issue(o.rec), user: pub(o.rec), ...(o.created ? { created: true } : {}), ...(o.linked ? { linked: true } : {}) }]; }
  };

  function cors(request) {
    if (!CORS) return {};
    const o = request.headers.get('origin') || '', ok = CORS === '*' || list(CORS).includes(o);
    return ok ? { 'access-control-allow-origin': CORS === '*' ? '*' : o, 'access-control-allow-headers': 'content-type, x-engram-session', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
  }

  return {
    QUOTA,
    /** Le compte derrière un jeton de session (ou null) : { id, email, name, stripe, paid, iat }. */
    async sessionUser(token) {
      try {
        const s = await readSession(token);
        if (!s) return null;
        const r = s.rec;
        return { id: r.id, email: r.email || null, name: r.name || '', stripe: r.stripe?.customer ? { customer: r.stripe.customer } : null, paid: paidOf(r), iat: s.iat };
      } catch (e) { console.error('[engram] account session', e.message); return null; }
    },
    linkStripe,
    /** Répond aux routes /api/account… ; renvoie null pour toute autre adresse. */
    async handle(request, { ip = '?' } = {}) {
      const url = new URL(request.url);
      if (!/^\/api\/account(\/|$)/.test(url.pathname)) return null;
      const json = (status, obj, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(request), ...extra } });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      const route = url.pathname.replace(/^\/api\/account\/?/, '').replace(/\/+$/, '');
      try {
        if (request.method === 'GET') {
          if (route === 'config') return json(200, { enabled: true, providers: { password: true, passkey: true, google: CLIENTS.google[0] || null, apple: CLIENTS.apple[0] || null }, rpId: rpOf(request) });
          if (route === 'me') {
            const s = await auth(request);
            const sub = await planOf(s.rec, url.searchParams.get('fresh') === '1');
            return json(200, { user: pub((await getUser(s.rec.id)) || s.rec), sub });
          }
          return json(404, { code: 'not_found' });
        }
        if (request.method !== 'POST') return json(405, { code: 'method' });
        if (!Object.hasOwn(ROUTES, route)) return json(404, { code: 'not_found' });
        const b = await readBody(request);
        const [status, obj] = await ROUTES[route](b, request, String(ip || '?'));
        return json(status, obj);
      } catch (e) {
        if (e.http) return json(e.status, { code: e.code, message: e.message, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) }, e.retryAfter ? { 'retry-after': String(e.retryAfter) } : {});
        console.error('[engram] account', e?.message || e);
        return json(500, { code: 'account_error', message: 'server error' });
      }
    }
  };
}
