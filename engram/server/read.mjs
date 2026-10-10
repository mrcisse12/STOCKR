// Lecture d'une page web pour en faire des fiches : GET /api/read?url=… → { title, text, url }.
// Le navigateur ne peut pas lire une autre page (CORS) : le serveur la télécharge et n'en renvoie que le texte.
// Garde-fous : http(s) seulement, ports 80/443, aucune adresse privée ou interne (vérifiée à chaque
// redirection, et de nouveau au moment de la connexion : un DNS qui change de réponse entre les deux ne
// mène pas à une adresse interne), 2,5 Mo et 8 s au plus, 20 lectures par minute et par adresse.
// Wikipédia : l'article est lu par l'API de Wikipédia (texte propre, sections, sans renvois ni bandeaux).
// Élite (code d'abonnement présenté) : jusqu'à 150 000 signes, pour que l'IA lise l'article en entier.

import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';
import { licenseSecret, readLicense, stripeMode } from './pay.mjs';
import { ipKey } from './net.mjs';

const MAX_BYTES = 2.5 * 1024 * 1024, TIMEOUT = 8000, MAX_REDIRECTS = 4, MAX_TEXT = 60000, MAX_TEXT_ELITE = 150000;
const WIKI = /^([a-z][a-z-]{1,15})\.(?:m\.)?wikipedia\.org$/i;
const WIKI_TAIL = /\n#+ (Notes et références|Références|Notes|Voir aussi|Liens externes|Bibliographie|Articles connexes|References|Notes and references|See also|External links|Further reading|Bibliography|Einzelnachweise|Anmerkungen|Weblinks|Literatur|Siehe auch|Referencias|Notas|Véase también|Enlaces externos|Bibliografía|Referências|Ligações externas|Ver também|Bibliografia)\s*\n/;

/** Un article de Wikipédia par son API : { title, text, url, source } ; null si ce n'en est pas un. */
async function wikipedia(u, fetchImpl, signal) {
  const m = u.hostname.match(WIKI);
  if (!m || !u.pathname.startsWith('/wiki/')) return null;
  let title; try { title = decodeURIComponent(u.pathname.slice(6)).replace(/_/g, ' ').trim(); } catch { return null; }
  if (!title || /^(Special|Spécial|Spezial|Especial|Fichier|File|Datei|Archivo|Ficheiro|Arquivo|Category|Catégorie|Kategorie|Categoría|Categoria):/i.test(title)) return null;
  const lang = m[1].toLowerCase();
  const api = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const r = await fetchImpl(api, { signal, headers: { 'user-agent': 'EngramReader/1.0 (flashcards; https://github.com/mrcisse12/STOCKR)', accept: 'application/json' } });
  if (!r.ok) return null;
  const pg = (await r.json().catch(() => null))?.query?.pages?.[0];
  if (!pg || pg.missing || pg.invalid || typeof pg.extract !== 'string' || pg.extract.length < 80) return null;
  let text = pg.extract.replace(/^(={2,6})\s*(.+?)\s*\1\s*$/gm, (x, eq, h) => '\n' + '#'.repeat(Math.min(eq.length, 4)) + ' ' + h).replace(/\n{3,}/g, '\n\n').trim();
  const cut = text.search(WIKI_TAIL);
  if (cut > 400) text = text.slice(0, cut).trim();
  return { title: pg.title, text, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}`, source: 'wikipedia' };
}

/** Les 16 octets d'une adresse IPv6 (« ::ffff:7f00:1 », « ::ffff:127.0.0.1 »…) ; null si elle est mal formée. */
function v6bytes(ip) {
  let s = String(ip).toLowerCase().split('%')[0];
  const m = s.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const p = m.slice(2).map(Number); if (p.some(x => x > 255)) return null; s = m[1] + (p[0] << 8 | p[1]).toString(16) + ':' + (p[2] << 8 | p[3]).toString(16); }
  const parts = s.split('::'); if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [], tail = parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0; if (fill < 0) return null;
  const words = [...head, ...Array(fill).fill('0'), ...tail];
  if (words.length !== 8 || words.some(w => !/^[0-9a-f]{1,4}$/.test(w))) return null;
  return words.flatMap(w => { const n = parseInt(w, 16); return [n >> 8, n & 255]; });
}

/** Adresse privée, locale, réservée ou de métadonnées : jamais lue. Une adresse IPv4 cachée dans une IPv6
 *  (::ffff:a.b.c.d sous toutes ses écritures, NAT64, 6to4) est jugée comme l'IPv4 qu'elle désigne. */
export function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const b = v6bytes(ip); if (!b) return true; // illisible : refusée
  const zero = n => b.slice(0, n).every(x => x === 0), v4 = i => b.slice(i, i + 4).join('.');
  if (zero(10) && b[10] === 255 && b[11] === 255) return privateIp(v4(12)); // ::ffff:a.b.c.d
  if (zero(12)) return true; // ::, ::1 et l'ancienne forme ::a.b.c.d
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return privateIp(v4(12)); // NAT64, 64:ff9b::/96
  if (b[0] === 0x20 && b[1] === 0x02) return privateIp(v4(2)); // 6to4, 2002::/16
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true; // Teredo, 2001::/32
  return (b[0] & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1] & 0x80) === 0x80) || b[0] === 0xff; // fc00::/7, fe80::/9 (lien local, ancien site local), multicast
}

/** Résolution au moment même de la connexion : une adresse interne est refusée là aussi (DNS « rebinding »). */
function safeLookup(host, opts, cb) {
  dns.lookup(host, { ...opts, all: true }).then(list => {
    if (!list.length || list.some(a => privateIp(a.address))) return cb(Object.assign(new Error('private address'), { code: 'EPRIVATE' }));
    if (opts.all) cb(null, list); else cb(null, list[0].address, list[0].family);
  }, cb);
}

/** GET minimal (statut, en-têtes, corps en flux) dont chaque connexion passe par safeLookup. */
export function pinnedFetch(url, { signal, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: 'GET', headers, signal, lookup: safeLookup }, res => {
      const h = new Headers(); for (const [k, v] of Object.entries(res.headers)) if (v != null) h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: h, body: Readable.toWeb(res) });
    });
    req.on('error', reject); req.end();
  });
}

async function safeUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) return null;
  const ips = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!ips.length || ips.some(i => privateIp(i.address))) return null;
  return u;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ugrave: 'ù', ocirc: 'ô', icirc: 'î', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', deg: '°' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);

/** Le texte lisible d'une page : l'article s'il y en a un, sans menus, scripts ni pieds de page. */
export function htmlToReadable(html) {
  const title = decode((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  let body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<sup\b[^>]*class=["'][^"']*reference[^"']*["'][^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<article\b[\s\S]*?<\/article>/i) || body.match(/<main\b[\s\S]*?<\/main>/i);
  if (main && main[0].length > 800) body = main[0];
  const text = decode(body
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n').replace(/<\/(h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(p|div|section|li|tr|table|blockquote|pre|dd|dt|figure)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text: text.replace(/ \| \n/g, '\n') };
}

export function createReader(env = process.env, { fetchImpl = fetch, pageFetch = fetchImpl === fetch ? pinnedFetch : fetchImpl, resolve = safeUrl } = {}) {
  const hits = new Map(), PER_MIN = +env.ENGRAM_READ_PER_MIN || 20, LIC = licenseSecret(env), MODE = stripeMode(env);
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  return {
    async handle(request, { ip = '?' } = {}) {
      const u = new URL(request.url);
      if (u.pathname !== '/api/read') return null;
      if (request.method !== 'GET') return json(405, { code: 'method' });
      ip = ipKey(String(ip));
      const now = Date.now(), win = (hits.get(ip) || []).filter(x => now - x < 60_000); win.push(now); hits.set(ip, win);
      if (hits.size > 5000) hits.clear();
      if (win.length > PER_MIN) return json(429, { code: 'rate_limited' });
      let target = await resolve(u.searchParams.get('url') || '');
      if (!target) return json(400, { code: 'bad_url' });
      const lic = LIC && readLicense(LIC, request.headers.get('x-engram-license') || '', MODE);
      const max = lic && !lic.expired && lic.p === 'elite' ? MAX_TEXT_ELITE : MAX_TEXT;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
      try {
        const wiki = await wikipedia(target, fetchImpl, ctl.signal).catch(() => null);
        if (wiki) return json(200, { ...wiki, text: wiki.text.slice(0, max), full: wiki.text.length <= max });
        let res;
        for (let i = 0; ; i++) {
          res = await pageFetch(target.href, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; EngramReader/1.0)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' } });
          if (res.status < 300 || res.status >= 400) break;
          const next = res.headers.get('location'); if (!next || i >= MAX_REDIRECTS) return json(400, { code: 'bad_url' });
          target = await resolve(new URL(next, target).href); if (!target) return json(400, { code: 'bad_url' });
        }
        if (!res.ok) return json(502, { code: 'unreachable', status: res.status });
        const type = res.headers.get('content-type') || '';
        if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return json(415, { code: 'not_text' });
        const reader = res.body.getReader(), chunks = []; let size = 0;
        for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { ctl.abort(); break; } chunks.push(value); }
        const raw = Buffer.concat(chunks).toString('utf8');
        const out = /text\/plain/i.test(type) ? { title: '', text: raw } : htmlToReadable(raw);
        if (out.text.length < 80) return json(422, { code: 'empty' });
        return json(200, { ...out, text: out.text.slice(0, max), full: out.text.length <= max, url: target.href });
      } catch { return json(504, { code: 'unreachable' }); }
      finally { clearTimeout(timer); }
    }
  };
}
