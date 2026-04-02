'use strict';
// =============================================
// STOCKR www2 — Monochrome / Init à zéro
// =============================================

// ── SVG Icons ─────────────────────────────────
const IC = {
  home:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  box:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  tag:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  dollar:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  bar:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  plus:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  left:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  search:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  alert:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  check:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  xmark:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warn:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  chevron:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  minus:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  inbox:    `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  tagLg:    `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  dollarLg: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  download: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  upload:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  trending: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  settings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  user:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  moon:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  logout:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  info:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  truck:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
};

// ── State ─────────────────────────────────────
const S = {
  view:       'home',
  articles:   [],
  products:   [],
  sales:      [],
  selectedId: null,
  qty:        1,
  action:     'add',
  search:     '',
  filter:     'all',
  period:     'all',   // pour le bilan
  darkMode:   false,
  user:       { name: 'Mon Boutique', email: 'contact@monboutique.com' },
  form: { name: '', stock: 0, min: 5, unit: 'pcs', price: 0, demand: 1, lead: 7 },
};

// ── Helpers ───────────────────────────────────
const $ = id => document.getElementById(id);

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
  return Math.round(n).toLocaleString('fr-FR');
}

function fmtDate(iso) {
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000)    return "À l'instant";
  if (diff < 3600000)  return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function stockStatus(stock, min) {
  if (stock === 0) return { label: 'Rupture', cls: 'st-out', icon: IC.xmark, bar: 'out' };
  if (stock < min) return { label: 'Faible',  cls: 'st-low', icon: IC.warn,  bar: 'low' };
  return                  { label: 'OK',       cls: 'st-ok',  icon: IC.check, bar: ''    };
}

function productMaxMake(product) {
  if (!product.composition.length) return 99;
  return Math.floor(Math.min(...product.composition.map(c => {
    const a = S.articles.find(x => x.id === c.id);
    return a ? a.stock / c.qty : 0;
  })));
}

function salesForPeriod() {
  const now = new Date();
  if (S.period === 'today') {
    const t = now.toDateString();
    return S.sales.filter(s => new Date(s.date).toDateString() === t);
  }
  if (S.period === '7d')  return S.sales.filter(s => new Date(s.date) >= new Date(now - 7 * 86400000));
  if (S.period === '30d') return S.sales.filter(s => new Date(s.date) >= new Date(now - 30 * 86400000));
  return S.sales;
}

// ── Toast ──────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

// ── Actions ───────────────────────────────────
function applyStock() {
  const art = S.articles.find(a => a.id === S.selectedId);
  if (!art) return;
  if (S.action === 'add') {
    art.stock = Math.round((art.stock + S.qty) * 10) / 10;
    showToast(`+${S.qty} ${art.unit} ajouté`);
  } else {
    if (art.stock < S.qty) { showToast('Stock insuffisant', 'error'); return; }
    art.stock = Math.round((art.stock - S.qty) * 10) / 10;
    showToast(`-${S.qty} ${art.unit} retiré`);
  }
  S.qty = 1;
  render();
}

function recordSale() {
  const sel   = $('sale-product');
  const qtyEl = $('sale-qty');
  if (!sel || !sel.value) { showToast('Choisis un produit', 'error'); return; }
  const product = S.products.find(p => p.id === parseInt(sel.value));
  if (!product) return;
  const qty = Math.max(1, parseInt(qtyEl.value) || 1);
  for (const comp of product.composition) {
    const art = S.articles.find(a => a.id === comp.id);
    if (!art || art.stock < comp.qty * qty) {
      showToast(`Stock insuffisant : ${art ? art.name : '?'}`, 'error');
      return;
    }
  }
  product.composition.forEach(comp => {
    const art = S.articles.find(a => a.id === comp.id);
    if (art) art.stock = Math.round((art.stock - comp.qty * qty) * 10) / 10;
  });
  S.sales.unshift({ id: Date.now(), productId: product.id, productName: product.name, qty, total: product.price * qty, date: new Date().toISOString() });
  showToast(`Vente enregistrée — ${fmt(product.price * qty)} FCFA`);
  render();
}

function saveArticle() {
  const f = S.form;
  if (!f.name.trim()) { showToast('Nom requis', 'error'); return; }
  S.articles.push({
    id: Date.now(), name: f.name.trim(),
    stock: parseFloat(f.stock) || 0, min: parseFloat(f.min) || 5,
    unit: f.unit || 'pcs', price: parseFloat(f.price) || 0,
    demand: parseFloat(f.demand) || 1, lead: parseInt(f.lead) || 7,
  });
  showToast(`"${f.name}" ajouté`);
  S.form = { name: '', stock: 0, min: 5, unit: 'pcs', price: 0, demand: 1, lead: 7 };
  nav('pantry');
}

function saveProduct() {
  const nameEl  = $('prod-name');
  const priceEl = $('prod-price');
  if (!nameEl || !nameEl.value.trim()) { showToast('Nom requis', 'error'); return; }
  const composition = [];
  document.querySelectorAll('.comp-input').forEach(row => {
    const artId = parseInt(row.dataset.id);
    const qtyEl = row.querySelector('.comp-qty');
    if (qtyEl && parseFloat(qtyEl.value) > 0)
      composition.push({ id: artId, qty: parseFloat(qtyEl.value) });
  });
  S.products.push({ id: Date.now(), name: nameEl.value.trim(), price: parseFloat(priceEl.value) || 0, composition });
  showToast(`Produit "${nameEl.value}" créé`);
  nav('products');
}

function toggleDark() {
  S.darkMode = !S.darkMode;
  document.body.classList.toggle('dark', S.darkMode);
  render();
}

// ── Navigate ──────────────────────────────────
function nav(view, extra = {}) {
  Object.assign(S, extra);
  S.view = view;
  render();
}

// ── Render ────────────────────────────────────
function render() {
  const viewEl = $('view');
  const map = {
    home: vHome, pantry: vPantry, products: vProducts,
    sales: vSales, financial: vFinancial,
    detail: vDetail, add: vAdd, 'add-product': vAddProduct,
    settings: vSettings,
  };
  viewEl.innerHTML = (map[S.view] || vHome)();
  viewEl.scrollTop = 0;
}

// ── HOME ──────────────────────────────────────
function vHome() {
  const low     = S.articles.filter(a => a.stock < a.min);
  const totalCA = S.sales.reduce((s, v) => s + v.total, 0);
  const today   = new Date().toDateString();
  const todayCA = S.sales.filter(s => new Date(s.date).toDateString() === today).reduce((s, v) => s + v.total, 0);

  return `
  <div class="hero anim">
    <div class="hero-top">
      <div>
        <div class="hero-greeting">Tableau de bord</div>
        <div class="hero-name">${S.user.name}</div>
      </div>
      <button class="hero-btn" onclick="nav('settings')">${IC.settings}</button>
    </div>
    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-val">${S.articles.length}</div>
        <div class="hero-stat-lbl">Articles</div>
      </div>
      <div class="hero-stat ${low.length > 0 ? 'warn' : ''}">
        <div class="hero-stat-val">${low.length}</div>
        <div class="hero-stat-lbl">Alertes</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val">${fmt(todayCA)}</div>
        <div class="hero-stat-lbl">CA Auj.</div>
      </div>
    </div>
  </div>

  <div class="container">
    ${low.length > 0 ? `
    <div class="alert-banner" onclick="nav('pantry',{filter:'low'})">
      <div class="alert-ico">${IC.alert}</div>
      <div style="flex:1">
        <div class="alert-title">${low.length} article${low.length > 1 ? 's' : ''} à réapprovisionner</div>
        <div class="alert-sub">${low.slice(0, 3).map(a => a.name).join(' · ')}</div>
      </div>
      <div class="alert-arrow">${IC.chevron}</div>
    </div>` : ''}

    <div class="section-hd"><div class="section-lbl">Navigation</div></div>
    <div class="quick-grid">
      <button class="quick-btn" onclick="nav('pantry')">
        <span class="quick-ico">${IC.box}</span>
        <div class="quick-label">Stock</div>
        <div class="quick-sub">${S.articles.length} article${S.articles.length !== 1 ? 's' : ''}</div>
      </button>
      <button class="quick-btn" onclick="nav('products')">
        <span class="quick-ico">${IC.tag}</span>
        <div class="quick-label">Produits</div>
        <div class="quick-sub">${S.products.length} produit${S.products.length !== 1 ? 's' : ''}</div>
      </button>
      <button class="quick-btn" onclick="nav('sales')">
        <span class="quick-ico">${IC.dollar}</span>
        <div class="quick-label">Ventes</div>
        <div class="quick-sub">${fmt(totalCA)} FCFA total</div>
      </button>
      <button class="quick-btn" onclick="nav('financial')">
        <span class="quick-ico">${IC.trending}</span>
        <div class="quick-label">Bilan</div>
        <div class="quick-sub">${S.sales.length} vente${S.sales.length !== 1 ? 's' : ''}</div>
      </button>
    </div>

    ${S.articles.length > 0 ? `
    <div class="section-hd">
      <div class="section-lbl">Articles récents</div>
      <button class="section-act" onclick="nav('pantry')">Voir tout</button>
    </div>
    ${S.articles.slice(0, 4).map((a, i) => {
      const st = stockStatus(a.stock, a.min);
      return `
      <div class="card card-tap anim" style="animation-delay:${i * 0.04}s" onclick="nav('detail',{selectedId:${a.id}})">
        <div class="article-row">
          <div class="article-avatar">${initials(a.name)}</div>
          <div class="article-info">
            <div class="article-name">${a.name}</div>
            <div class="article-meta">${a.stock} ${a.unit}</div>
          </div>
          <div class="article-right">
            <span class="status ${st.cls}">${st.icon} ${st.label}</span>
          </div>
        </div>
      </div>`;
    }).join('')}` : ''}
  </div>`;
}

// ── PANTRY ────────────────────────────────────
function vPantry() {
  const q = S.search.toLowerCase();
  let list = S.articles.filter(a => a.name.toLowerCase().includes(q));
  if (S.filter === 'out') list = list.filter(a => a.stock === 0);
  else if (S.filter === 'low') list = list.filter(a => a.stock > 0 && a.stock < a.min);
  else if (S.filter === 'ok')  list = list.filter(a => a.stock >= a.min);

  return `
  <div class="page-header">
    <div class="page-header-row">
      <button class="back-btn" onclick="nav('home')">${IC.left}</button>
      <div class="page-title">Stock</div>
      <button class="fab" onclick="nav('add')">${IC.plus}</button>
    </div>
    <div class="search-wrap">
      <span class="search-ico">${IC.search}</span>
      <input class="input input-search" type="text" placeholder="Rechercher…" value="${S.search.replace(/"/g,'&quot;')}" oninput="S.search=this.value;render()">
    </div>
    <div class="filter-row">
      <button class="filter-chip ${S.filter==='all'?'active':''}" onclick="S.filter='all';render()">Tout (${S.articles.length})</button>
      <button class="filter-chip ${S.filter==='out'?'active':''}" onclick="S.filter='out';render()">Rupture</button>
      <button class="filter-chip ${S.filter==='low'?'active':''}" onclick="S.filter='low';render()">Faible</button>
      <button class="filter-chip ${S.filter==='ok'?'active':''}"  onclick="S.filter='ok';render()">OK</button>
    </div>
  </div>

  <div class="container">
    ${list.length === 0 ? `
    <div class="empty">
      <div class="empty-ico">${IC.inbox}</div>
      <div class="empty-title">${S.articles.length === 0 ? 'Aucun article' : 'Aucun résultat'}</div>
      <div class="empty-text">${S.articles.length === 0 ? 'Ajoute ton premier article de stock.' : 'Essaie un autre terme de recherche.'}</div>
      ${S.articles.length === 0 ? `<button class="btn btn-primary" style="width:auto;padding:11px 24px" onclick="nav('add')">Ajouter un article</button>` : ''}
    </div>` : list.map((a, i) => {
      const st  = stockStatus(a.stock, a.min);
      const pct = Math.min(100, Math.round((a.stock / Math.max(a.min * 2, 1)) * 100));
      return `
      <div class="card card-tap anim" style="animation-delay:${i * 0.04}s" onclick="nav('detail',{selectedId:${a.id}})">
        <div class="article-row">
          <div class="article-avatar">${initials(a.name)}</div>
          <div class="article-info">
            <div class="article-name">${a.name}</div>
            <div class="article-meta">${a.stock} ${a.unit} · seuil ${a.min}</div>
            <div class="progress"><div class="progress-bar ${st.bar}" style="width:${pct}%"></div></div>
          </div>
          <div class="article-right">
            <span class="status ${st.cls}">${st.icon} ${st.label}</span>
            <div style="color:var(--gray-4)">${IC.chevron}</div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── PRODUCTS ──────────────────────────────────
function vProducts() {
  return `
  <div class="page-header">
    <div class="page-header-row">
      <button class="back-btn" onclick="nav('home')">${IC.left}</button>
      <div class="page-title">Produits finis</div>
      <button class="fab" onclick="nav('add-product')">${IC.plus}</button>
    </div>
  </div>

  <div class="container">
    ${S.products.length === 0 ? `
    <div class="empty">
      <div class="empty-ico">${IC.tagLg}</div>
      <div class="empty-title">Aucun produit</div>
      <div class="empty-text">Crée un produit fini à partir de tes articles en stock.</div>
      <button class="btn btn-primary" style="width:auto;padding:11px 24px" onclick="nav('add-product')">Créer un produit</button>
    </div>` : S.products.map((p, i) => {
      const avail   = productMaxMake(p);
      const canMake = avail > 0;
      return `
      <div class="card anim" style="animation-delay:${i * 0.05}s">
        <div class="article-row" style="margin-bottom:${p.composition.length ? '12px' : '0'}">
          <div class="article-avatar">${initials(p.name)}</div>
          <div class="article-info">
            <div class="article-name">${p.name}</div>
            <div class="article-meta" style="font-weight:700;color:var(--text-2)">${fmt(p.price)} FCFA</div>
          </div>
          <span class="status ${canMake ? 'st-ok' : 'st-out'}">${canMake ? IC.check : IC.xmark} ${canMake ? avail + ' fab.' : 'Indispo'}</span>
        </div>
        ${p.composition.length ? `
        <div style="border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Composition</div>
          ${p.composition.map(c => {
            const art = S.articles.find(a => a.id === c.id);
            if (!art) return '';
            const ok = art.stock >= c.qty;
            return `<div class="comp-row"><span class="comp-lbl">${art.name}</span><span class="${ok ? 'comp-ok' : 'comp-fail'}">${art.stock} / ${c.qty} ${art.unit}</span></div>`;
          }).join('')}
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── SALES ─────────────────────────────────────
function vSales() {
  const today   = new Date().toDateString();
  const todayCA = S.sales.filter(s => new Date(s.date).toDateString() === today).reduce((s, v) => s + v.total, 0);
  const avail   = S.products.filter(p => productMaxMake(p) > 0);

  return `
  <div class="sub-hero">
    <button class="back-btn-dark" style="margin-bottom:14px" onclick="nav('home')">${IC.left}</button>
    <div class="sub-hero-title">Ventes</div>
    <div class="sub-hero-big">${fmt(todayCA)} <span style="font-size:16px;color:var(--gray-5)">FCFA</span></div>
    <div class="sub-hero-sub">Aujourd'hui · ${S.sales.filter(s => new Date(s.date).toDateString() === new Date().toDateString()).length} vente(s)</div>
  </div>

  <div class="container">
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Nouvelle vente</div>
      <div class="form-group">
        <label class="form-label">Produit</label>
        <select class="input" id="sale-product">
          <option value="">— Sélectionner —</option>
          ${avail.map(p => `<option value="${p.id}">${p.name} — ${fmt(p.price)} FCFA (${productMaxMake(p)} fab.)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantité</label>
        <input type="number" class="input" id="sale-qty" value="1" min="1">
      </div>
      <button class="btn btn-primary" onclick="recordSale()">Confirmer la vente</button>
    </div>

    <div class="section-hd">
      <div class="section-lbl">Historique</div>
      <div style="font-size:12px;color:var(--text-3)">${S.sales.length} vente(s)</div>
    </div>

    ${S.sales.length === 0 ? `
    <div class="empty">
      <div class="empty-ico">${IC.dollarLg}</div>
      <div class="empty-title">Aucune vente</div>
      <div class="empty-text">Les ventes apparaîtront ici.</div>
    </div>` : S.sales.map(s => `
    <div class="sale-item">
      <div class="sale-dot"></div>
      <div class="sale-info">
        <div class="sale-prod">${s.productName}</div>
        <div class="sale-date">${fmtDate(s.date)}</div>
      </div>
      <div class="sale-right">
        <div class="sale-total">${fmt(s.total)} FCFA</div>
        <div class="sale-qty">×${s.qty}</div>
      </div>
    </div>`).join('')}
  </div>`;
}

// ── FINANCIAL ─────────────────────────────────
function vFinancial() {
  const filtered = salesForPeriod();
  const totalCA  = filtered.reduce((s, v) => s + v.total, 0);
  const avg      = filtered.length ? Math.round(totalCA / filtered.length) : 0;
  const stockVal = S.articles.reduce((s, a) => s + a.stock * a.price, 0);

  const stats = {};
  filtered.forEach(s => {
    if (!stats[s.productName]) stats[s.productName] = { qty: 0, rev: 0 };
    stats[s.productName].qty += s.qty;
    stats[s.productName].rev += s.total;
  });
  const top = Object.entries(stats).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5);

  // Recommandations : articles dont stock < min
  const recos = S.articles
    .filter(a => a.stock < a.min && a.demand > 0)
    .map(a => {
      const daysLeft     = a.demand > 0 ? Math.floor(a.stock / a.demand) : 999;
      const toOrder      = Math.ceil((a.demand * a.lead * 2) - a.stock);
      return { ...a, daysLeft, toOrder: Math.max(0, toOrder) };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const periods = [
    { key: 'today', label: "Auj." },
    { key: '7d',    label: "7 j"  },
    { key: '30d',   label: "30 j" },
    { key: 'all',   label: "Tout" },
  ];

  return `
  <div class="sub-hero">
    <button class="back-btn-dark" style="margin-bottom:14px" onclick="nav('home')">${IC.left}</button>
    <div class="sub-hero-title">Bilan financier</div>
    <div class="sub-hero-big">${fmt(totalCA)} <span style="font-size:16px;color:var(--gray-5)">FCFA</span></div>
    <div class="sub-hero-sub">${filtered.length} vente(s) · période sélectionnée</div>
  </div>

  <div class="container">
    <div class="period-tabs">
      ${periods.map(p => `<button class="period-tab ${S.period === p.key ? 'active' : ''}" onclick="S.period='${p.key}';render()">${p.label}</button>`).join('')}
    </div>

    <div class="metric-grid">
      <div class="metric-card"><div class="metric-val">${fmt(totalCA)}</div><div class="metric-lbl">CA</div></div>
      <div class="metric-card"><div class="metric-val">${filtered.length}</div><div class="metric-lbl">Ventes</div></div>
      <div class="metric-card"><div class="metric-val">${fmt(avg)}</div><div class="metric-lbl">Ticket moy.</div></div>
    </div>
    <div class="metric-grid">
      <div class="metric-card"><div class="metric-val">${S.articles.length}</div><div class="metric-lbl">Articles</div></div>
      <div class="metric-card"><div class="metric-val">${S.articles.filter(a => a.stock < a.min).length}</div><div class="metric-lbl">Alertes</div></div>
      <div class="metric-card"><div class="metric-val">${fmt(stockVal)}</div><div class="metric-lbl">Val. stock</div></div>
    </div>

    <div class="card">
      <div class="card-title">Top produits</div>
      ${top.length === 0
        ? `<div style="font-size:13px;color:var(--text-3)">Aucune vente sur cette période.</div>`
        : top.map(([name, d], i) => `
          <div class="rank-item">
            <div class="rank-num ${i === 0 ? 'r1' : ''}">${i + 1}</div>
            <div class="rank-name">${name}</div>
            <div class="rank-rev">${fmt(d.rev)} FCFA</div>
          </div>`).join('')}
    </div>

    ${recos.length > 0 ? `
    <div class="section-hd"><div class="section-lbl">Recommandations</div></div>
    ${recos.map(a => `
    <div class="reco-card">
      <div class="reco-dot"></div>
      <div class="reco-info">
        <div class="reco-main">Commander ${a.toOrder} ${a.unit} de ${a.name}</div>
        <div class="reco-sub">${IC.truck} Livraison dans ${a.lead} j · ${a.daysLeft <= 0 ? 'rupture imminente' : `épuisement dans ~${a.daysLeft} j`}</div>
      </div>
      <div class="reco-val">${a.stock}/${a.min}</div>
    </div>`).join('')}` : ''}
  </div>`;
}

// ── DETAIL ────────────────────────────────────
function vDetail() {
  const art = S.articles.find(a => a.id === S.selectedId);
  if (!art) { nav('pantry'); return ''; }
  const st  = stockStatus(art.stock, art.min);
  const pct = Math.min(100, Math.round((art.stock / Math.max(art.min * 2, 1)) * 100));
  const reorderPt = art.demand * art.lead;

  return `
  <div class="sub-hero">
    <button class="back-btn-dark" style="margin-bottom:14px" onclick="nav('pantry')">${IC.left}</button>
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:56px;height:56px;border-radius:14px;background:var(--gray-8);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:var(--white);flex-shrink:0">${initials(art.name)}</div>
      <div>
        <div style="font-size:22px;font-weight:800;color:var(--white)">${art.name}</div>
        <span class="status ${st.cls}" style="margin-top:6px;display:inline-flex">${st.icon} ${st.label}</span>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="card">
      <div class="gauge">
        <div class="gauge-val">${art.stock}</div>
        <div class="gauge-unit">${art.unit} en stock</div>
        <div class="progress" style="margin:14px 0 6px;height:6px">
          <div class="progress-bar ${st.bar}" style="width:${pct}%"></div>
        </div>
        <div class="gauge-lbl">Seuil minimum : ${art.min} ${art.unit}</div>
      </div>
    </div>

    <div class="card" style="margin-top:8px">
      <div class="card-title">Modifier le stock</div>
      <div class="action-toggle">
        <button class="toggle-btn ${S.action==='add'?'t-active':''}" onclick="S.action='add';render()">
          <div class="toggle-ico">${IC.download}</div>
          <div class="toggle-label">Réception</div>
        </button>
        <button class="toggle-btn ${S.action==='remove'?'t-active':''}" onclick="S.action='remove';render()">
          <div class="toggle-ico">${IC.upload}</div>
          <div class="toggle-label">Retrait</div>
        </button>
      </div>
      <div class="qty-row">
        <button class="qty-ctrl" onclick="S.qty=Math.max(1,S.qty-1);render()">${IC.minus}</button>
        <div class="qty-val">${S.qty}</div>
        <button class="qty-ctrl" onclick="S.qty++;render()">${IC.plus}</button>
      </div>
      <div class="chip-row">
        ${[1,5,10,25,50,100].map(n => `<button class="chip ${S.qty===n?'active':''}" onclick="S.qty=${n};render()">${n}</button>`).join('')}
      </div>
      <div style="height:10px"></div>
      <button class="btn btn-primary" onclick="applyStock()">
        ${S.action === 'add' ? `Ajouter ${S.qty} ${art.unit}` : `Retirer ${S.qty} ${art.unit}`}
      </button>
    </div>

    <div class="card" style="margin-top:8px">
      <div class="card-title">Informations</div>
      <div class="info-row">
        <span class="info-lbl">${IC.dollar} Prix unitaire</span>
        <span class="info-val">${fmt(art.price)} FCFA</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">${IC.trending} Demande / jour</span>
        <span class="info-val">${art.demand} ${art.unit}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">${IC.truck} Délai livraison</span>
        <span class="info-val">${art.lead} jours</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">${IC.alert} Point de commande</span>
        <span class="info-val" style="${art.stock <= reorderPt ? 'color:var(--gray-6)' : ''}">${reorderPt} ${art.unit}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">${IC.bar} Valeur en stock</span>
        <span class="info-val">${fmt(art.stock * art.price)} FCFA</span>
      </div>
    </div>
  </div>`;
}

// ── ADD ARTICLE ───────────────────────────────
function vAdd() {
  const f = S.form;
  return `
  <div class="sub-hero">
    <button class="back-btn-dark" style="margin-bottom:14px" onclick="nav('pantry')">${IC.left}</button>
    <div class="sub-hero-title">Nouvel article</div>
    <div class="sub-hero-sub">Ajouter un article à ton stock</div>
  </div>
  <div class="container">
    <div class="card">
      <div class="form-group">
        <label class="form-label">Nom de l'article *</label>
        <input class="input" type="text" placeholder="ex: Farine, Tissu, Bouteilles…" value="${f.name.replace(/"/g,'&quot;')}" oninput="S.form.name=this.value">
      </div>
      <div class="form-group">
        <label class="form-label">Unité de mesure</label>
        <input class="input" type="text" placeholder="pcs, m, kg, litre…" value="${f.unit}" oninput="S.form.unit=this.value">
      </div>
      <div class="input-row form-group">
        <div>
          <label class="form-label">Quantité initiale</label>
          <input class="input" type="number" placeholder="0" step="0.5" value="${f.stock}" oninput="S.form.stock=this.value">
        </div>
        <div>
          <label class="form-label">Seuil d'alerte</label>
          <input class="input" type="number" placeholder="5" step="0.5" value="${f.min}" oninput="S.form.min=this.value">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Prix de vente (FCFA)</label>
        <input class="input" type="number" placeholder="0" step="100" value="${f.price}" oninput="S.form.price=this.value">
      </div>
      <div class="input-row form-group">
        <div>
          <label class="form-label">Demande / jour</label>
          <input class="input" type="number" placeholder="1" step="0.5" value="${f.demand}" oninput="S.form.demand=this.value">
        </div>
        <div>
          <label class="form-label">Délai livraison (j)</label>
          <input class="input" type="number" placeholder="7" value="${f.lead}" oninput="S.form.lead=this.value">
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveArticle()">Ajouter cet article</button>
    </div>
  </div>`;
}

// ── ADD PRODUCT ───────────────────────────────
function vAddProduct() {
  return `
  <div class="sub-hero">
    <button class="back-btn-dark" style="margin-bottom:14px" onclick="nav('products')">${IC.left}</button>
    <div class="sub-hero-title">Nouveau produit</div>
    <div class="sub-hero-sub">Produit fini composé d'articles</div>
  </div>
  <div class="container">
    <div class="card">
      <div class="form-group">
        <label class="form-label">Nom du produit *</label>
        <input class="input" id="prod-name" type="text" placeholder="ex: Boubou, Robe, Jupe…">
      </div>
      <div class="form-group">
        <label class="form-label">Prix de vente (FCFA)</label>
        <input class="input" id="prod-price" type="number" placeholder="0" step="100">
      </div>
      ${S.articles.length > 0 ? `
      <div class="form-group">
        <label class="form-label">Composition (quantité par unité produite)</label>
        ${S.articles.map(a => `
        <div class="comp-input" data-id="${a.id}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="flex:1;font-size:13px;font-weight:600;color:var(--text-2)">${a.name}
            <span style="color:var(--text-3);font-weight:400;font-size:11px">(${a.stock} ${a.unit})</span>
          </div>
          <input type="number" class="input comp-qty" placeholder="0" step="0.5" min="0" style="width:76px;text-align:center">
          <span style="font-size:11px;color:var(--text-3);white-space:nowrap">${a.unit}</span>
        </div>`).join('')}
      </div>` : `
      <div style="padding:14px;background:var(--gray-1);border-radius:var(--r-md);border:1px solid var(--border);font-size:13px;color:var(--text-3);text-align:center;margin-bottom:14px">
        Ajoute d'abord des articles au stock pour définir une composition.
      </div>`}
      <button class="btn btn-primary" onclick="saveProduct()">Créer ce produit</button>
    </div>
  </div>`;
}

// ── SETTINGS ──────────────────────────────────
function vSettings() {
  return `
  <div class="sub-hero">
    <button class="back-btn-dark" style="margin-bottom:14px" onclick="nav('home')">${IC.left}</button>
    <div class="sub-hero-title">Paramètres</div>
    <div class="sub-hero-sub">${S.user.email}</div>
  </div>

  <div class="container">

    <div class="settings-section">
      <div class="settings-label">Mon compte</div>
      <div class="settings-row-block">
        <div class="settings-row" style="cursor:default">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${IC.user}</span>
            <div>
              <div class="settings-row-lbl">${S.user.name}</div>
              <div class="settings-row-sub">Nom du commerce</div>
            </div>
          </div>
        </div>
        <div class="settings-row" style="cursor:default">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${IC.info}</span>
            <div>
              <div class="settings-row-lbl">${S.user.email}</div>
              <div class="settings-row-sub">Adresse email</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-label">Apparence</div>
      <div class="settings-row-block">
        <div class="settings-row" style="cursor:default">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${S.darkMode ? IC.moon : IC.sun}</span>
            <div>
              <div class="settings-row-lbl">Mode ${S.darkMode ? 'sombre' : 'clair'}</div>
              <div class="settings-row-sub">Apparence de l'interface</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${S.darkMode ? 'checked' : ''} onchange="toggleDark()">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-label">Données</div>
      <div class="settings-row-block">
        <div class="settings-row" style="cursor:default">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${IC.box}</span>
            <div>
              <div class="settings-row-lbl">${S.articles.length} article${S.articles.length !== 1 ? 's' : ''} en stock</div>
            </div>
          </div>
        </div>
        <div class="settings-row" style="cursor:default">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${IC.tag}</span>
            <div>
              <div class="settings-row-lbl">${S.products.length} produit${S.products.length !== 1 ? 's' : ''} finis</div>
            </div>
          </div>
        </div>
        <div class="settings-row" style="cursor:default">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${IC.dollar}</span>
            <div>
              <div class="settings-row-lbl">${S.sales.length} vente${S.sales.length !== 1 ? 's' : ''} enregistrées</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-label">Session</div>
      <div class="settings-row-block">
        <div class="settings-row" onclick="showToast('Déconnexion…')">
          <div class="settings-row-inner">
            <span class="settings-row-ico">${IC.logout}</span>
            <div class="settings-row-lbl" style="color:var(--black)">Se déconnecter</div>
          </div>
          ${IC.chevron}
        </div>
      </div>
    </div>

    <div style="text-align:center;padding:24px 0 8px;font-size:11px;color:var(--text-3)">
      STOCKR · v0.2.0 · 2026
    </div>

  </div>`;
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.S           = S;
  window.nav         = nav;
  window.render      = render;
  window.applyStock  = applyStock;
  window.recordSale  = recordSale;
  window.saveArticle = saveArticle;
  window.saveProduct = saveProduct;
  window.toggleDark  = toggleDark;
  window.showToast   = showToast;
  render();
});
