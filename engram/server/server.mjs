// Serveur d'Engram : sert l'application et relaie l'API Claude.
// La clé d'API reste ici, jamais dans le navigateur.
//
//   ANTHROPIC_API_KEY=... node server.mjs        → http://localhost:8787
//
// Protocole (le même que la capacité « sample » de l'app Claude, côté page) :
//   GET  /api/ai/health → { ok, images, tools, locked, models }
//   POST /api/ai        ← { messages, tools, modelTier, json, final }
//                       → NDJSON : {type:'text',delta} … {type:'done',content,stop_reason}
//                                  ou {type:'error',code,message}
// La boucle d'outils tourne dans la page : le serveur ne fait qu'un tour à la fois,
// et la page renvoie l'historique complet (y compris les blocs de réflexion) au tour suivant.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = +env.PORT || 8787;
const HOST = env.HOST || '0.0.0.0';
const ACCESS_CODE = env.ENGRAM_ACCESS_CODE || '';
const RATE_PER_MIN = +env.ENGRAM_RATE_PER_MIN || 30;
const MAX_BODY = (+env.ENGRAM_MAX_BODY_MB || 12) * 1024 * 1024;
const MAX_TOKENS = +env.ENGRAM_MAX_TOKENS || 32000;
const CORS = env.ENGRAM_CORS_ORIGIN || '';
const ROOT = env.ENGRAM_STATIC_DIR || path.join(here, '..');
// Repli automatique si le modèle demandé décline une requête (classifieurs de sécurité) :
// l'API relance la même requête sur le modèle recommandé, dans le même appel.
const FALLBACKS = env.ENGRAM_FALLBACKS !== 'off';

// Trois niveaux choisis par la page (réglage « Mentor » ou type de tâche).
const TIERS = {
  quick: { model: env.ENGRAM_MODEL_QUICK || 'claude-opus-5', effort: env.ENGRAM_EFFORT_QUICK || 'low' },
  default: { model: env.ENGRAM_MODEL_DEFAULT || 'claude-opus-5', effort: env.ENGRAM_EFFORT_DEFAULT || 'medium' },
  complex: { model: env.ENGRAM_MODEL_COMPLEX || 'claude-fable-5-1', effort: env.ENGRAM_EFFORT_COMPLEX || 'high' }
};

const client = new Anthropic({ maxRetries: 2 });

/* ── Garde-fous ──────────────────────────────────────────────────────── */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = hits.get(ip)?.filter(x => now - x < 60_000) || [];
  win.push(now); hits.set(ip, win);
  return win.length > RATE_PER_MIN;
}
setInterval(() => { const now = Date.now(); for (const [ip, w] of hits) if (!w.some(x => now - x < 60_000)) hits.delete(ip); }, 60_000).unref();

function codeOk(req) {
  if (!ACCESS_CODE) return true;
  const got = Buffer.from(String(req.headers['x-engram-code'] || ''));
  const want = Buffer.from(ACCESS_CODE);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const clientIp = req => (env.ENGRAM_TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 'prompt_too_large' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Vérifie la forme de la requête envoyée par la page ; renvoie un message d'erreur ou null. */
function invalid(b) {
  if (!b || !Array.isArray(b.messages) || !b.messages.length) return 'messages manquants';
  if (b.messages.length > 200) return 'conversation trop longue';
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return 'rôle invalide';
    if (typeof m.content !== 'string' && !Array.isArray(m.content)) return 'contenu invalide';
  }
  if (b.messages[0].role !== 'user') return 'la conversation doit commencer par la personne';
  if (b.tools && (!Array.isArray(b.tools) || b.tools.length > 32)) return 'outils invalides';
  for (const x of b.tools || []) if (!x || typeof x.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(x.name)) return 'nom d\'outil invalide';
  if (b.modelTier && !TIERS[b.modelTier]) return 'niveau de modèle inconnu';
  return null;
}

/**
 * Prépare le contenu renvoyé à la page, qui le renverra tel quel au tour suivant.
 * Après un repli en cours de réponse, les blocs de réflexion et d'appel d'outil
 * situés avant le dernier bloc « fallback » ne doivent pas être renvoyés à l'API ;
 * le bloc « fallback » lui-même n'est qu'un repère.
 */
function sanitize(content, stopReason) {
  let out = content;
  const last = out.map(b => b.type).lastIndexOf('fallback');
  if (last >= 0) {
    const keep = new Set(['text', 'server_tool_result', 'web_search_tool_result', 'web_fetch_tool_result', 'code_execution_tool_result']);
    const paired = new Set(out.filter(b => /_tool_result$/.test(b.type) && b.tool_use_id).map(b => b.tool_use_id));
    out = out.filter((b, i) => i > last || keep.has(b.type) || (b.type === 'server_tool_use' && paired.has(b.id)));
  }
  out = out.filter(b => b.type !== 'fallback');
  // Réponse coupée par la limite de longueur : un appel d'outil inachevé serait exécuté avec des arguments tronqués.
  if (stopReason === 'max_tokens') out = out.filter(b => b.type !== 'tool_use');
  return out;
}

const SYSTEM = 'You are the AI engine inside Engram, a spaced-repetition flashcard app. The page sends you the full instructions for each task inside the conversation; follow them.';
const JSON_RULE = 'Reply with valid JSON only: no prose before or after, no code fences.';

async function handleAI(req, res) {
  const ip = clientIp(req);
  if (!codeOk(req)) return sendJSON(res, 401, { code: 'not_granted', message: 'access code' });
  if (rateLimited(ip)) return sendJSON(res, 429, { code: 'rate_limited', message: 'slow down' });
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch (e) { return sendJSON(res, e.code === 'prompt_too_large' ? 413 : 400, { code: e.code === 'prompt_too_large' ? 'prompt_too_large' : 'upstream_error', message: 'bad body' }); }
  const bad = invalid(body);
  if (bad) return sendJSON(res, 400, { code: 'upstream_error', message: bad });

  const tier = TIERS[body.modelTier || 'default'];
  const tools = (body.tools || []).map(x => ({ name: x.name, description: String(x.description || '').slice(0, 4000), input_schema: x.input_schema || { type: 'object', properties: {} } }));
  const params = {
    model: tier.model,
    max_tokens: MAX_TOKENS,
    system: body.json ? SYSTEM + '\n\n' + JSON_RULE : SYSTEM,
    messages: body.messages,
    // Mise en cache automatique du préfixe : les tours successifs d'une même conversation coûtent moins cher.
    cache_control: { type: 'ephemeral' }
  };
  // Haiku ne prend pas le réglage d'effort : on ne l'envoie qu'aux modèles qui le gèrent.
  if (tier.effort && !/haiku/.test(tier.model)) params.output_config = { effort: tier.effort };
  if (tools.length) {
    params.tools = tools;
    // Dernier tour autorisé : la page demande une réponse sans nouvel appel d'outil.
    if (body.final) params.tool_choice = { type: 'none' };
  }
  const betas = [];
  if (FALLBACKS) { betas.push('server-side-fallback-2026-07-01'); params.fallbacks = 'default'; }
  if (betas.length) params.betas = betas;

  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', ...corsHeaders(req) });
  const write = o => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });

  try {
    const stream = client.beta.messages.stream(params, { signal: ac.signal });
    stream.on('text', delta => write({ type: 'text', delta }));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') {
      // Toute la chaîne (modèle demandé puis repli) a décliné : la réponse partielle est écartée.
      write({ type: 'error', code: 'refused', message: msg.stop_details?.category || '' });
    } else {
      const content = sanitize(msg.content, msg.stop_reason);
      if (!content.length) write({ type: 'error', code: 'empty_completion', message: '' });
      else write({ type: 'done', content, stop_reason: msg.stop_reason, model: msg.model });
      const u = msg.usage || {};
      log(ip, tier.model, msg.model, msg.stop_reason, u.input_tokens, u.cache_read_input_tokens, u.output_tokens);
    }
  } catch (e) {
    if (ac.signal.aborted) return res.end();
    const status = e?.status;
    const code = status === 429 || status === 529 ? 'rate_limited' : status === 413 || /prompt is too long|too many tokens/i.test(e?.message || '') ? 'prompt_too_large' : 'upstream_error';
    console.error('[engram] API error', status || '', e?.message || e);
    write({ type: 'error', code, message: status === 401 ? 'server API key missing or invalid' : String(e?.message || 'error').slice(0, 300) });
  }
  res.end();
}

function log(...a) { if (env.ENGRAM_LOG !== 'off') console.log('[engram]', new Date().toISOString(), ...a); }

/* ── HTTP ────────────────────────────────────────────────────────────── */
function corsHeaders(req) {
  if (!CORS) return {};
  const origin = req.headers.origin || '';
  const allowed = CORS === '*' || CORS.split(',').map(s => s.trim()).includes(origin);
  return allowed ? { 'access-control-allow-origin': CORS === '*' ? '*' : origin, 'access-control-allow-headers': 'content-type, x-engram-code', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
}
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(res.req) });
  res.end(JSON.stringify(obj));
}

// L'application elle-même : index.html (et le dossier de présentation) du dossier parent.
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/dossier.html': 'dossier.html' };
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(self), microphone=(self)' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }
    if (url.pathname === '/api/ai/health' && req.method === 'GET') {
      return sendJSON(res, 200, { ok: true, images: true, tools: true, locked: !!ACCESS_CODE, fallbacks: FALLBACKS, models: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.model])) });
    }
    if (url.pathname === '/api/ai' && req.method === 'POST') return await handleAI(req, res);
    const file = STATIC[url.pathname];
    if (file && req.method === 'GET') {
      const p = path.join(ROOT, file);
      if (fs.existsSync(p)) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', ...SECURITY }); return fs.createReadStream(p).pipe(res); }
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found');
  } catch (e) {
    console.error('[engram]', e);
    if (!res.headersSent) sendJSON(res, 500, { code: 'upstream_error', message: 'server error' }); else res.end();
  }
});
server.requestTimeout = 0; // les réponses longues arrivent en flux
server.listen(PORT, HOST, () => {
  console.log(`Engram → http://localhost:${PORT}`);
  console.log(`  modèles : rapide ${TIERS.quick.model} (${TIERS.quick.effort}) · standard ${TIERS.default.model} (${TIERS.default.effort}) · expert ${TIERS.complex.model} (${TIERS.complex.effort})`);
  console.log(`  repli automatique : ${FALLBACKS ? 'activé' : 'désactivé'} · code d'accès : ${ACCESS_CODE ? 'oui' : 'non'} · ${RATE_PER_MIN} requêtes/min par adresse`);
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) console.warn('  ⚠ ANTHROPIC_API_KEY absente : les appels à l\'IA échoueront.');
});
