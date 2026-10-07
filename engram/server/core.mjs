// Cœur du serveur d'Engram : relaie l'API Claude, la clé d'API reste côté serveur.
// Écrit avec les objets standard du Web (Request, Response, ReadableStream) pour tourner
// à l'identique dans le serveur Node (server.mjs) et dans une fonction Netlify
// (netlify/functions/ai.mjs).
//
// Protocole (le même que la capacité « sample » de l'app Claude, côté page) :
//   GET  /api/ai/health → { ok, images, tools, locked, models }
//   POST /api/ai        ← { messages, tools, modelTier, json, final }
//                       → NDJSON : {type:'text',delta} … {type:'done',content,stop_reason}
//                                  ou {type:'error',code,message}
//                         ({type:'ping'} toutes les 10 s pendant que le modèle réfléchit,
//                          pour que les hébergeurs ne coupent pas une connexion muette)
// La boucle d'outils tourne dans la page : le serveur ne fait qu'un tour à la fois,
// et la page renvoie l'historique complet (y compris les blocs de réflexion) au tour suivant.

import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { licenseSecret, readLicense } from './pay.mjs';

const SYSTEM = 'You are the AI engine inside Engram, a spaced-repetition flashcard app. The page sends you the full instructions for each task inside the conversation; follow them.';
const JSON_RULE = 'Reply with valid JSON only: no prose before or after, no code fences.';

/**
 * Prépare le contenu renvoyé à la page, qui le renverra tel quel au tour suivant.
 * Après un repli en cours de réponse, les blocs de réflexion et d'appel d'outil
 * situés avant le dernier bloc « fallback » ne doivent pas être renvoyés à l'API ;
 * le bloc « fallback » lui-même n'est qu'un repère.
 */
export function sanitize(content, stopReason) {
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

/**
 * Crée le relais. `env` : les variables d'environnement (process.env en général).
 * `client` : un client Anthropic déjà construit (pour les tests).
 */
export function createEngram(env = process.env, { client, log = (...a) => { if (env.ENGRAM_LOG !== 'off') console.log('[engram]', new Date().toISOString(), ...a); } } = {}) {
  const ACCESS_CODE = env.ENGRAM_ACCESS_CODE || '';
  const RATE_PER_MIN = +env.ENGRAM_RATE_PER_MIN || 30;
  const MAX_BODY = (+env.ENGRAM_MAX_BODY_MB || 12) * 1024 * 1024;
  const MAX_TOKENS = +env.ENGRAM_MAX_TOKENS || 32000;
  const MAX_TOKENS_FREE = +env.ENGRAM_MAX_TOKENS_FREE || 8000, MAX_TOKENS_ELITE = +env.ENGRAM_MAX_TOKENS_ELITE || 64000;
  const CORS = env.ENGRAM_CORS_ORIGIN || '';
  const HEARTBEAT = +env.ENGRAM_HEARTBEAT_MS || 10_000;
  // Repli automatique si le modèle demandé décline une requête (classifieurs de sécurité) :
  // l'API relance la même requête sur le modèle recommandé, dans le même appel.
  const FALLBACKS = env.ENGRAM_FALLBACKS !== 'off';

  // Trois niveaux choisis par la page (réglage « Mentor » ou type de tâche).
  const TIERS = {
    quick: { model: env.ENGRAM_MODEL_QUICK || 'claude-sonnet-5-5', effort: env.ENGRAM_EFFORT_QUICK || 'low' },
    default: { model: env.ENGRAM_MODEL_DEFAULT || 'claude-opus-5-5', effort: env.ENGRAM_EFFORT_DEFAULT || 'medium' },
    complex: { model: env.ENGRAM_MODEL_COMPLEX || 'claude-fable-5-1', effort: env.ENGRAM_EFFORT_COMPLEX || 'high' }
  };

  // Ce que chaque formule peut demander (avec STRIPE_SECRET_KEY) : niveaux de modèle, effort de réflexion le plus haut,
  // longueur de réponse, images par requête. Le gratuit n'a pas le scan (plusieurs photos ou pages) : une image à la fois,
  // pour corriger une réponse écrite au stylet. Élite peut demander l'effort « max » (ENGRAM_EFFORT_TOP pour le changer).
  const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
  const TOP = EFFORTS.includes(env.ENGRAM_EFFORT_TOP) ? env.ENGRAM_EFFORT_TOP : 'max';
  const CAPS = {
    free: { tiers: ['quick'], effort: 'low', maxTokens: MAX_TOKENS_FREE, images: 1, scan: false },
    pro: { tiers: ['quick', 'default'], effort: 'high', maxTokens: MAX_TOKENS, images: 20, scan: true },
    elite: { tiers: ['quick', 'default', 'complex'], effort: TOP, maxTokens: Math.max(MAX_TOKENS, MAX_TOKENS_ELITE), images: 20, scan: true }
  };
  const countImages = msgs => msgs.reduce((n, m) => n + (Array.isArray(m.content) ? m.content.filter(b => b?.type === 'image' || b?.type === 'document').length : 0), 0);

  // Sans clé, le serveur répond quand même à /health pour que l'app puisse dire ce qui manque.
  const HAS_KEY = !!(client || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const api = client || new Anthropic({
    maxRetries: 2,
    apiKey: env.ANTHROPIC_API_KEY || null,
    authToken: env.ANTHROPIC_AUTH_TOKEN || null,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {})
  });

  /* ── Abonnements (Stripe) ────────────────────────────────────────── */
  // Avec STRIPE_SECRET_KEY, l'IA s'ouvre à tous : les abonnés (code d'abonnement signé par pay.mjs) sans limite,
  // les autres dans la limite gratuite du jour. Le modèle le plus puissant est réservé à Élite (et au code d'accès).
  const PAY = !!env.STRIPE_SECRET_KEY, LIC = licenseSecret(env);
  const FREE_DAILY = +env.ENGRAM_FREE_DAILY || 60;
  const freeDays = new Map();
  function licenseOf(headers) {
    const d = readLicense(LIC, headers.get('x-engram-license') || '');
    return d && !d.expired && (d.p === 'pro' || d.p === 'elite') ? d : null;
  }
  function overFree(ip) {
    const day = new Date().toISOString().slice(0, 10), u = freeDays.get(ip);
    if (!u || u.day !== day) { freeDays.set(ip, { day, n: 1 }); if (freeDays.size > 20000) freeDays.clear(); return false; }
    return ++u.n > FREE_DAILY;
  }

  /* ── Garde-fous ──────────────────────────────────────────────────── */
  const hits = new Map();
  function rateLimited(ip) {
    const now = Date.now(), win = hits.get(ip)?.filter(x => now - x < 60_000) || [];
    win.push(now); hits.set(ip, win);
    // Ménage paresseux (pas de minuterie : une fonction serverless peut être gelée entre deux appels).
    if (hits.size > 5000) for (const [k, w] of hits) if (!w.some(x => now - x < 60_000)) hits.delete(k);
    return win.length > RATE_PER_MIN;
  }
  function codeOk(headers) {
    if (!ACCESS_CODE) return true;
    const got = Buffer.from(String(headers.get('x-engram-code') || ''));
    const want = Buffer.from(ACCESS_CODE);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
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
    if (b.effort != null && !EFFORTS.includes(b.effort)) return 'effort inconnu';
    return null;
  }

  /* ── HTTP ────────────────────────────────────────────────────────── */
  function corsHeaders(request) {
    if (!CORS) return {};
    const origin = request.headers.get('origin') || '';
    const allowed = CORS === '*' || CORS.split(',').map(s => s.trim()).includes(origin);
    return allowed ? { 'access-control-allow-origin': CORS === '*' ? '*' : origin, 'access-control-allow-headers': 'content-type, x-engram-code, x-engram-license', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
  }
  const json = (request, status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(request) } });

  async function handleAI(request, ip) {
    const lic = PAY ? licenseOf(request.headers) : null, owner = !!ACCESS_CODE && codeOk(request.headers);
    if (!lic && !owner) {
      if (PAY) { if (overFree(ip)) return json(request, 429, { code: 'quota', message: 'free daily limit' }); }
      else if (ACCESS_CODE) return json(request, 401, { code: 'not_granted', message: 'access code' });
    }
    if (rateLimited(ip)) return json(request, 429, { code: 'rate_limited', message: 'slow down' });
    if (+(request.headers.get('content-length') || 0) > MAX_BODY) return json(request, 413, { code: 'prompt_too_large', message: 'too large' });
    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json(request, 413, { code: 'prompt_too_large', message: 'too large' });
      body = JSON.parse(raw);
    } catch { return json(request, 400, { code: 'upstream_error', message: 'bad body' }); }
    const bad = invalid(body);
    if (bad) return json(request, 400, { code: 'upstream_error', message: bad });

    // La formule fixe le plafond : niveau de modèle, effort, longueur, images. Le propriétaire (code d'accès) a tout,
    // comme un serveur sans paiements. Le modèle le plus puissant (« complex ») reste réservé à Élite.
    const plan = !PAY || owner ? 'elite' : lic?.p === 'elite' ? 'elite' : lic ? 'pro' : 'free', cap = CAPS[plan];
    if (!cap.scan && (body.purpose === 'scan' || countImages(body.messages) > cap.images)) return json(request, 402, { code: 'plan_required', message: 'scan is part of Pro' });
    let want = body.modelTier || 'default';
    if (!cap.tiers.includes(want)) want = cap.tiers.at(-1);
    const tier = TIERS[want];
    const effort = body.effort && EFFORTS.indexOf(body.effort) <= EFFORTS.indexOf(cap.effort) ? body.effort
      : body.effort ? cap.effort : EFFORTS.indexOf(tier.effort) > EFFORTS.indexOf(cap.effort) ? cap.effort : tier.effort;
    const tools = (body.tools || []).map(x => ({ name: x.name, description: String(x.description || '').slice(0, 4000), input_schema: x.input_schema || { type: 'object', properties: {} } }));
    const params = {
      model: tier.model,
      max_tokens: cap.maxTokens,
      system: body.json ? SYSTEM + '\n\n' + JSON_RULE : SYSTEM,
      messages: body.messages,
      // Mise en cache automatique du préfixe : les tours successifs d'une même conversation coûtent moins cher.
      cache_control: { type: 'ephemeral' }
    };
    // Haiku ne prend pas le réglage d'effort : on ne l'envoie qu'aux modèles qui le gèrent.
    if (effort && !/haiku/.test(tier.model)) params.output_config = { effort };
    if (tools.length) {
      params.tools = tools;
      // Dernier tour autorisé : la page demande une réponse sans nouvel appel d'outil.
      if (body.final) params.tool_choice = { type: 'none' };
    }
    const betas = [];
    if (FALLBACKS) { betas.push('server-side-fallback-2026-07-01'); params.fallbacks = 'default'; }
    if (betas.length) params.betas = betas;

    const ac = new AbortController();
    request.signal?.addEventListener?.('abort', () => ac.abort());
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let open = true;
        const write = o => { if (open) try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { open = false; } };
        const beat = setInterval(() => write({ type: 'ping' }), HEARTBEAT);
        try {
          let msg, sent = false;
          for (let attempt = 0; ; attempt++) {
            try {
              const s = api.beta.messages.stream(params, { signal: ac.signal });
              s.on('text', delta => { sent = true; write({ type: 'text', delta }); });
              msg = await s.finalMessage();
              break;
            } catch (e) {
              // Un modèle qui ne connaît pas cet effort (« max », « xhigh ») : on redescend d'un cran, tant que rien n'est parti.
              const lower = EFFORTS[EFFORTS.indexOf(params.output_config?.effort) - 1];
              if (sent || attempt > 2 || e?.status !== 400 || !/effort/i.test(String(e?.message || '')) || !lower || EFFORTS.indexOf(lower) < 2) throw e;
              params.output_config = { effort: lower };
            }
          }
          if (msg.stop_reason === 'refusal') {
            // Toute la chaîne (modèle demandé puis repli) a décliné : la réponse partielle est écartée.
            write({ type: 'error', code: 'refused', message: msg.stop_details?.category || '' });
          } else {
            const content = sanitize(msg.content, msg.stop_reason);
            if (!content.length) write({ type: 'error', code: 'empty_completion', message: '' });
            else write({ type: 'done', content, stop_reason: msg.stop_reason, model: msg.model });
            const u = msg.usage || {};
            log(ip, plan, tier.model, params.output_config?.effort || '', msg.model, msg.stop_reason, u.input_tokens, u.cache_read_input_tokens, u.output_tokens);
          }
        } catch (e) {
          if (!ac.signal.aborted) {
            const status = e?.status, text = String(e?.message || '');
            // Plafond mensuel atteint (429 sans délai) ou limite fixée dans la console, crédit épuisé : ce n'est pas un simple « trop vite ».
            // Carte refusée (402, billing_error) : même effet pour la personne qu'un crédit épuisé.
            const budget = status === 402 || e?.error?.error?.details?.error_code === 'enforced_spend_limit_reached' || /enforced_spend_limit_reached|specified (workspace )?API usage limits|credit balance|billing_error/i.test(text);
            // Une surcharge peut aussi arriver au milieu du flux, sans statut HTTP : seul le texte de l'erreur le dit.
            const code = budget ? 'budget'
              : status === 401 || status === 403 || /authentication|x-api-key/i.test(text) ? 'server_key'
              : status === 429 || status === 529 || /overloaded_error|rate_limit_error/i.test(text) ? 'rate_limited'
              : status === 413 || /prompt is too long|too many tokens/i.test(text) ? 'prompt_too_large'
              : /image exceeds|image\.source|invalid image|could not process image/i.test(text) ? 'image_rejected' : 'upstream_error';
            console.error('[engram] API error', status || '', text || e);
            write({ type: 'error', code, message: code === 'server_key' ? 'server API key missing or invalid' : text.slice(0, 300) || 'error' });
          }
        } finally {
          clearInterval(beat); open = false;
          try { controller.close(); } catch { }
        }
      },
      cancel() { ac.abort(); }
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', ...corsHeaders(request) } });
  }

  return {
    TIERS, CAPS, FALLBACKS, locked: !!ACCESS_CODE, RATE_PER_MIN, MAX_BODY,
    /** Répond aux routes /api/ai… ; renvoie null pour toute autre adresse. */
    async handle(request, { ip = '?' } = {}) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith('/api/ai')) return null;
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
      if (pathname === '/api/ai/health' && request.method === 'GET') {
        return json(request, 200, { ok: true, key: HAS_KEY, images: true, tools: true, locked: !!ACCESS_CODE && !PAY, pay: PAY, plan: PAY ? licenseOf(request.headers)?.p || 'free' : null, caps: (() => { const c = CAPS[!PAY || codeOk(request.headers) && ACCESS_CODE ? 'elite' : licenseOf(request.headers)?.p || 'free']; return { tiers: c.tiers, effort: c.effort, scan: c.scan }; })(), fallbacks: FALLBACKS, models: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.model])) });
      }
      if (pathname === '/api/ai' && request.method === 'POST') return handleAI(request, ip);
      return json(request, 404, { code: 'upstream_error', message: 'not found' });
    }
  };
}
