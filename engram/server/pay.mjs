// Abonnements d'Engram avec Stripe : paiement, code d'abonnement signé, portail client.
// Écrit avec les objets standard du Web (Request, Response, fetch), comme core.mjs, pour tourner
// à l'identique dans le serveur Node et dans une fonction Netlify (netlify/functions/pay.mjs).
//
// Après le paiement, le serveur remet à l'app un « code d'abonnement » signé (formule, client Stripe,
// date de fin). L'app le présente à chaque appel à l'IA ; seul ce serveur sait le fabriquer.
// Avec un compte (account.mjs, en-tête x-engram-session), l'abonnement suit le compte : le paiement part
// avec l'e-mail du compte (client_reference_id = son identifiant), le client Stripe est rangé dans le compte
// au retour, et /api/account/me redonne un code neuf sur chaque appareil. Sans compte, on recopie le code.
//
//   GET  /api/pay/config   → { enabled, mode, prices: { pro: { month, year }, elite: { month, year } } }
//   POST /api/pay/checkout ← { plan, bill, email?, ref? }  → { url }  (page de paiement Stripe)
//   POST /api/pay/claim    ← { session }                   → { license, plan, bill, until, email }
//   POST /api/pay/status   ← { license }                   → { license, plan, until, ends } ou { plan: 'free', reason }
//   POST /api/pay/portal   ← { license }                   → { url }  (portail client Stripe)
//
// Variables : STRIPE_SECRET_KEY (obligatoire). Les prix sont trouvés par leur « clé de recherche »
// (engram_pro_month, engram_pro_year, engram_elite_month, engram_elite_year) ; STRIPE_PRICE_PRO_MONTH…
// les remplacent si besoin. ENGRAM_LICENSE_SECRET est facultatif (sinon dérivé de la clé Stripe).
//
// Mise en place automatique : au premier appel, s'ils manquent, le serveur crée lui-même dans Stripe les
// produits « Engram Pro » et « Engram Élite » (identifiants engram_pro, engram_elite), leurs quatre prix
// (ENGRAM_PRICE_PRO_MONTH=7.99, _PRO_YEAR=79.90, _ELITE_MONTH=14.99, _ELITE_YEAR=149.90 par défaut, en euros)
// et le portail client (annulation en fin de période, changement de formule, carte, factures).
// Rien à créer à la main dans le tableau de bord. ENGRAM_STRIPE_SETUP=off coupe cette mise en place.

import crypto from 'node:crypto';

export const PLAN_KEYS = ['pro', 'elite'];
const BILLS = ['month', 'year'];
export const GRACE = 3 * 864e5; // trois jours de marge après la fin de période (paiement en cours de relance)
const OK_STATUS = new Set(['active', 'trialing', 'past_due']);
const PRODUCTS = {
  pro: { name: 'Engram Pro', description: 'Scans, corrections et assistants IA sans limite.', month: 7.99, year: 79.9 },
  elite: { name: 'Engram Élite', description: "Tout Pro, le modèle d'IA le plus puissant et l'atelier de personnalisation.", month: 14.99, year: 149.9 }
};

/* ── Code d'abonnement : v1.<données>.<signature> ─────────────────── */
const b64u = {
  enc: b => Buffer.from(b).toString('base64url'),
  dec: s => Buffer.from(String(s), 'base64url')
};
export function licenseSecret(env) {
  if (env.ENGRAM_LICENSE_SECRET) return Buffer.from(env.ENGRAM_LICENSE_SECRET);
  if (env.STRIPE_SECRET_KEY) return crypto.createHmac('sha256', env.STRIPE_SECRET_KEY).update('engram-license-v1').digest();
  return null;
}
export function signLicense(secret, data) {
  const body = b64u.enc(JSON.stringify(data));
  const sig = b64u.enc(crypto.createHmac('sha256', secret).update(body).digest());
  return `v1.${body}.${sig}`;
}
/** Renvoie les données du code s'il est authentique (même expiré : o.expired le dit), sinon null. */
export function readLicense(secret, token) {
  if (!secret || typeof token !== 'string' || token.length > 2000) return null;
  const [v, body, sig] = token.trim().split('.');
  if (v !== 'v1' || !body || !sig) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest(), got = b64u.dec(sig);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const d = JSON.parse(b64u.dec(body).toString('utf8')); return { ...d, expired: !(d.e > Date.now()) }; } catch { return null; }
}

export function createPay(env = process.env, { fetchImpl = fetch, accounts = null } = {}) {
  const KEY = env.STRIPE_SECRET_KEY || '';
  /** Les comptes (account.mjs), s'ils sont branchés : un objet, ou une fonction qui le renvoie. */
  const acc = () => (typeof accounts === 'function' ? accounts() : accounts) || null;
  async function who(request) { const t = request.headers.get('x-engram-session'), a = acc(); return t && a ? a.sessionUser(t) : null; }
  const SECRET = licenseSecret(env);
  const enabled = !!KEY && !!SECRET;
  const mode = /^(sk|rk)_live_/.test(KEY) ? 'live' : 'test';
  const CORS = env.ENGRAM_CORS_ORIGIN || '';

  /* ── API Stripe (formulaire encodé, sans dépendance) ──────────────── */
  function form(obj, prefix = '', out = new URLSearchParams()) {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || v === '') continue;
      const key = prefix ? `${prefix}[${k}]` : k;
      if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[]`, String(x)));
      else if (typeof v === 'object') form(v, key, out);
      else out.append(key, String(v));
    }
    return out;
  }
  async function stripe(method, path, params) {
    const qs = method === 'GET' && params ? '?' + form(params).toString() : '';
    const r = await fetchImpl('https://api.stripe.com/v1' + path + qs, {
      method, headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/x-www-form-urlencoded' },
      body: method === 'GET' ? undefined : form(params || {}).toString()
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j?.error?.message || 'stripe ' + r.status), { status: r.status, stripe: j?.error });
    return j;
  }

  /* ── Les quatre prix, trouvés une fois puis gardés 10 minutes ─────── */
  let priceCache = null;
  async function prices() {
    if (priceCache && priceCache.at > Date.now() - 600_000) return priceCache.v;
    const want = {};
    for (const p of PLAN_KEYS) for (const b of BILLS) want[`${p}_${b}`] = env[`STRIPE_PRICE_${p.toUpperCase()}_${b.toUpperCase()}`] || '';
    const v = { pro: {}, elite: {} }, byId = {};
    const put = (k, pr) => { const [p, b] = k.split('_'); v[p][b] = { id: pr.id, amount: pr.unit_amount / 100, currency: pr.currency }; byId[pr.id] = { plan: p, bill: b }; };
    const lookups = Object.keys(want).filter(k => !want[k]).map(k => 'engram_' + k);
    if (lookups.length) {
      const r = await stripe('GET', '/prices', { active: 'true', lookup_keys: lookups, limit: 10 });
      for (const pr of r.data || []) put(pr.lookup_key.replace(/^engram_/, ''), pr);
    }
    for (const [k, id] of Object.entries(want)) if (id) put(k, await stripe('GET', '/prices/' + encodeURIComponent(id)));
    // Mise en place : chaque prix manquant est créé, sous son produit (créé lui aussi au besoin).
    if (env.ENGRAM_STRIPE_SETUP !== 'off') for (const p of PLAN_KEYS) for (const b of BILLS) {
      if (v[p][b]) continue;
      const P = PRODUCTS[p], prod = 'engram_' + p;
      try { await stripe('GET', '/products/' + prod); }
      catch (e) { if (e.status !== 404) throw e; await stripe('POST', '/products', { id: prod, name: P.name, description: P.description, metadata: { app: 'engram' } }); }
      const amount = +env[`ENGRAM_PRICE_${p.toUpperCase()}_${b.toUpperCase()}`] || P[b];
      const pr = await stripe('POST', '/prices', { product: prod, currency: 'eur', unit_amount: Math.round(amount * 100), recurring: { interval: b }, lookup_key: `engram_${p}_${b}`, transfer_lookup_key: 'true', nickname: `${P.name} · ${b === 'year' ? 'annuel' : 'mensuel'}`, metadata: { app: 'engram', plan: p, bill: b } });
      put(`${p}_${b}`, pr);
    }
    priceCache = { at: Date.now(), v: { v, byId } };
    return priceCache.v;
  }

  /* ── HTTP ─────────────────────────────────────────────────────────── */
  function corsHeaders(request) {
    if (!CORS) return {};
    const origin = request.headers.get('origin') || '';
    const allowed = CORS === '*' || CORS.split(',').map(s => s.trim()).includes(origin);
    return allowed ? { 'access-control-allow-origin': CORS === '*' ? '*' : origin, 'access-control-allow-headers': 'content-type, x-engram-session', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
  }
  const json = (request, status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(request) } });

  /** Adresse publique de l'app, pour les retours de Stripe : celle de la page qui appelle, si elle est autorisée. */
  function siteOrigin(request) {
    const h = request.headers, host = h.get('x-forwarded-host') || h.get('host') || new URL(request.url).host;
    const proto = (h.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')).split(',')[0].trim();
    const own = `${proto}://${host}`, origin = h.get('origin') || '';
    if (!origin || origin === own) return env.ENGRAM_SITE_URL?.replace(/\/+$/, '') || own;
    if (CORS === '*' || CORS.split(',').map(s => s.trim()).includes(origin)) return origin;
    return env.ENGRAM_SITE_URL?.replace(/\/+$/, '') || own;
  }

  /** Portail client d'Engram : retrouvé (metadata app=engram) ou créé une fois, avec le changement de formule entre Pro et Élite. */
  let portalId = env.STRIPE_PORTAL_CONFIGURATION || '';
  async function portalConfig() {
    if (portalId) return portalId;
    const list = await stripe('GET', '/billing_portal/configurations', { active: 'true', limit: 50 });
    const mine = (list.data || []).find(c => c.metadata?.app === 'engram');
    if (mine) return (portalId = mine.id);
    if (env.ENGRAM_STRIPE_SETUP === 'off') return '';
    const { v } = await prices();
    const c = await stripe('POST', '/billing_portal/configurations', {
      business_profile: { headline: 'Engram : gérez votre abonnement' },
      features: {
        customer_update: { enabled: 'true', allowed_updates: ['email', 'address'] },
        invoice_history: { enabled: 'true' },
        payment_method_update: { enabled: 'true' },
        subscription_cancel: { enabled: 'true', mode: 'at_period_end', cancellation_reason: { enabled: 'true', options: ['too_expensive', 'missing_features', 'unused', 'other'] } },
        subscription_update: { enabled: 'true', default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products: PLAN_KEYS.map(p => ({ product: 'engram_' + p, prices: BILLS.map(b => v[p][b]?.id).filter(Boolean) })) }
      },
      metadata: { app: 'engram' }
    });
    return (portalId = c.id);
  }

  function periodEnd(sub) {
    const s = sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0;
    return s * 1000;
  }
  function issue(sub, map) {
    const item = sub.items?.data?.[0], pr = item?.price || {};
    const found = map.byId[pr.id] || { plan: /elite/.test(pr.lookup_key || '') ? 'elite' : 'pro', bill: pr.recurring?.interval === 'year' ? 'year' : 'month' };
    const until = periodEnd(sub);
    const data = { c: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id, s: sub.id, p: found.plan, b: found.bill, e: until + GRACE, m: mode };
    return { license: signLicense(SECRET, data), plan: found.plan, bill: found.bill, until, ends: !!sub.cancel_at_period_end, status: sub.status };
  }

  async function read(request) { try { return await request.json(); } catch { return {}; } }

  return {
    enabled, mode,
    /** Vérifie un code d'abonnement présenté par l'app (appels à l'IA). */
    license(token) { const d = readLicense(SECRET, token); return d && !d.expired && PLAN_KEYS.includes(d.p) ? d : null; },
    /** L'abonnement Engram en cours d'un client Stripe (le meilleur s'il y en a plusieurs), avec un code neuf ; sinon null. */
    async subscriptionFor(customer) {
      if (!enabled || !customer) return null;
      const r = await stripe('GET', '/subscriptions', { customer, status: 'all', limit: 20 });
      const map = await prices();
      const mine = (r.data || []).filter(s => OK_STATUS.has(s.status) && (s.metadata?.app === 'engram' || map.byId[s.items?.data?.[0]?.price?.id]));
      return mine.map(s => ({ ...issue(s, map), sub: s.id })).sort((a, b) => (b.plan === 'elite') - (a.plan === 'elite') || b.until - a.until)[0] || null;
    },
    /** Un code d'abonnement signé à partir d'un abonnement déjà vérifié auprès de Stripe (account.mjs le garde 10 minutes). */
    licenseFrom({ c, s, p, b, until }) { return SECRET && PLAN_KEYS.includes(p) && c ? signLicense(SECRET, { c, s, p, b, e: until + GRACE, m: mode }) : null; },
    /** Répond aux routes /api/pay… ; renvoie null pour toute autre adresse. */
    async handle(request) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith('/api/pay')) return null;
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
      const route = pathname.replace(/^\/api\/pay\/?/, '');
      if (route === 'config' && request.method === 'GET') {
        if (!enabled) return json(request, 200, { enabled: false });
        try { const { v } = await prices(); return json(request, 200, { enabled: true, mode, prices: v }); }
        catch (e) { console.error('[engram] Stripe', e.message); return json(request, 200, { enabled: false, error: 'prices' }); }
      }
      if (request.method !== 'POST') return json(request, 404, { code: 'not_found' });
      if (!enabled) return json(request, 503, { code: 'pay_off', message: 'payments are not configured' });
      const b = await read(request);
      try {
        if (route === 'checkout') {
          const plan = PLAN_KEYS.includes(b.plan) ? b.plan : 'pro', bill = BILLS.includes(b.bill) ? b.bill : 'month';
          const { v } = await prices(), price = v[plan]?.[bill];
          if (!price) return json(request, 400, { code: 'no_price', message: `engram_${plan}_${bill}` });
          const site = siteOrigin(request);
          const user = await who(request), ref = /^[2-9A-HJKMNP-Z]{6}$/.test(b.ref || '') ? b.ref : '';
          const params = {
            mode: 'subscription',
            line_items: [{ price: price.id, quantity: 1 }],
            success_url: `${site}/#paid={CHECKOUT_SESSION_ID}`,
            cancel_url: `${site}/#pro`,
            allow_promotion_codes: 'true',
            // Connecté : le client Stripe du compte s'il existe, sinon l'e-mail du compte ; l'identifiant du compte revient au retour.
            customer: user?.stripe?.customer || '',
            customer_email: user?.stripe?.customer ? '' : user?.email || (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '') ? b.email : ''),
            client_reference_id: user ? user.id : ref,
            locale: 'auto',
            metadata: { app: 'engram', plan, bill, uid: user?.id || '', ref: user ? ref : '' },
            subscription_data: { metadata: { app: 'engram', plan, bill, uid: user?.id || '' } },
            ...(env.STRIPE_TAX === 'on' ? { automatic_tax: { enabled: 'true' } } : {})
          };
          // Page de paiement aux couleurs d'Engram (papier, laiton) ; si l'API du compte ne connaît pas ce réglage, sans.
          const brand = { branding_settings: { display_name: 'Engram', background_color: '#F6F1E6', button_color: '#9A7432', border_style: 'rounded' } };
          let s, p = { ...params, ...brand };
          for (let i = 0; !s; i++) {
            try { s = await stripe('POST', '/checkout/sessions', p); }
            catch (e) {
              if (e.status !== 400 || i > 2) throw e;
              if (/branding/i.test(e.message) && p.branding_settings) { const { branding_settings, ...rest } = p; p = rest; }
              else if (/customer/i.test(e.message) && p.customer) p = { ...p, customer: '', customer_email: user?.email || '' }; // client Stripe effacé : on repart de l'e-mail
              else throw e;
            }
          }
          return json(request, 200, { url: s.url });
        }
        if (route === 'claim') {
          if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(b.session || '')) return json(request, 400, { code: 'bad_session' });
          const s = await stripe('GET', '/checkout/sessions/' + b.session, { expand: ['subscription'] });
          const sub = s.subscription;
          if (s.status !== 'complete' || !sub || !OK_STATUS.has(sub.status)) return json(request, 402, { code: 'not_paid', message: s.status || 'open' });
          const out = issue(sub, await prices());
          // Payé depuis un compte (client_reference_id = son identifiant), ou réclamé connecté : l'abonnement suit le compte.
          const a = acc(), ref = String(s.client_reference_id || '');
          const uid = /^[0-9a-f]{24}$/.test(ref) ? ref : a ? (await who(request))?.id || '' : '';
          const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
          const account = !!(a && uid && customer) && await a.linkStripe(uid, customer, { sub: sub.id, ...out });
          return json(request, 200, { ...out, email: s.customer_details?.email || '', account });
        }
        const lic = readLicense(SECRET, b.license);
        if (!lic) return json(request, 401, { code: 'bad_license' });
        if (route === 'status') {
          let sub;
          try { sub = await stripe('GET', '/subscriptions/' + encodeURIComponent(lic.s)); }
          catch (e) { if (e.status === 404) return json(request, 200, { plan: 'free', reason: 'missing' }); throw e; }
          if (!OK_STATUS.has(sub.status)) return json(request, 200, { plan: 'free', reason: sub.status });
          return json(request, 200, issue(sub, await prices()));
        }
        if (route === 'portal') {
          const p = await stripe('POST', '/billing_portal/sessions', { customer: lic.c, return_url: `${siteOrigin(request)}/#pro`, configuration: await portalConfig() });
          return json(request, 200, { url: p.url });
        }
        return json(request, 404, { code: 'not_found' });
      } catch (e) {
        console.error('[engram] Stripe', e.status || '', e.message);
        return json(request, 502, { code: 'pay_error', message: String(e.message || 'stripe').slice(0, 200) });
      }
    }
  };
}
