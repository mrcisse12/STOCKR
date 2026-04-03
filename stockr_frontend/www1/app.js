'use strict';
// =============================================
// STOCKR — App (proposal)
// =============================================

// ── State ─────────────────────────────────────
const S = {
  view: 'home',
  articles: [
    { id: 1, name: 'Tissu Wax', emoji: '🧵', stock: 4.5, min: 10, unit: 'm',   price: 2500, demand: 2, lead: 7  },
    { id: 2, name: 'Fil à coudre', emoji: '🪡', stock: 12,  min: 5,  unit: 'pcs', price: 500,  demand: 1, lead: 5  },
    { id: 3, name: 'Boutons dorés', emoji: '🔘', stock: 45,  min: 20, unit: 'pcs', price: 50,   demand: 3, lead: 10 },
    { id: 4, name: 'Pagne simple', emoji: '👗', stock: 0,   min: 3,  unit: 'pcs', price: 5000, demand: 2, lead: 14 },
    { id: 5, name: 'Dentelle blanche', emoji: '🤍', stock: 8, min: 5, unit: 'm',  price: 1800, demand: 1, lead: 10 },
    { id: 6, name: 'Fermeture éclair', emoji: '🔗', stock: 30, min: 15, unit: 'pcs', price: 200, demand: 4, lead: 7 },
  ],
  products: [
    { id: 10, name: 'Boubou Premium',   emoji: '👘', price: 25000, composition: [{ id: 1, qty: 3 }, { id: 2, qty: 2 }] },
    { id: 11, name: 'Robe Wax Courte',  emoji: '👗', price: 15000, composition: [{ id: 1, qty: 2 }, { id: 3, qty: 4 }] },
    { id: 12, name: 'Jupe Plissée',     emoji: '🌈', price: 8000,  composition: [{ id: 1, qty: 1.5 }, { id: 2, qty: 1 }] },
    { id: 13, name: 'Ensemble Festif',  emoji: '✨', price: 35000, composition: [{ id: 1, qty: 4 }, { id: 4, qty: 1 }] },
  ],
  sales: [
    { id: 1, productId: 10, productName: 'Boubou Premium',  qty: 1, total: 25000, date: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, productId: 11, productName: 'Robe Wax Courte', qty: 2, total: 30000, date: new Date(Date.now() - 7200000).toISOString() },
    { id: 3, productId: 12, productName: 'Jupe Plissée',    qty: 3, total: 24000, date: new Date(Date.now() - 86400000).toISOString() },
    { id: 4, productId: 10, productName: 'Boubou Premium',  qty: 1, total: 25000, date: new Date(Date.now() - 172800000).toISOString() },
  ],
  selectedId: null,
  qty: 1,
  action: 'add',
  search: '',
  filter: 'all',
  form: { name: '', emoji: '📦', stock: 0, min: 5, unit: 'pcs', price: 0, demand: 1, lead: 7 },
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

function stockStatus(stock, min) {
  if (stock === 0)  return { label: 'Rupture',      cls: 'badge-out', color: '#B91C1C', bg: '#FEE2E2' };
  if (stock < min)  return { label: 'Stock faible', cls: 'badge-low', color: '#C97C06', bg: '#FFFBEB' };
  return                   { label: 'En stock',     cls: 'badge-ok',  color: '#1A6B3A', bg: '#EAFAF1' };
}

function productMaxMake(product) {
  if (!product.composition.length) return 99;
  return Math.floor(Math.min(...product.composition.map(c => {
    const a = S.articles.find(x => x.id === c.id);
    return a ? a.stock / c.qty : 0;
  })));
}

// ── Toast ──────────────────────────────────────
function showToast(msg, type = 'success') {
  const c = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2700);
}

// ── Actions ───────────────────────────────────
function applyStock() {
  const art = S.articles.find(a => a.id === S.selectedId);
  if (!art) return;
  if (S.action === 'add') {
    art.stock = Math.round((art.stock + S.qty) * 10) / 10;
    showToast(`✅ +${S.qty} ${art.unit} ajouté au stock`);
  } else {
    if (art.stock < S.qty) { showToast('Stock insuffisant !', 'error'); return; }
    art.stock = Math.round((art.stock - S.qty) * 10) / 10;
    showToast(`✅ −${S.qty} ${art.unit} retiré du stock`);
  }
  S.qty = 1;
  render();
}

function recordSale() {
  const sel = $('sale-product');
  const qtyEl = $('sale-qty');
  if (!sel || !sel.value) { showToast('Choisis un produit', 'error'); return; }

  const product = S.products.find(p => p.id === parseInt(sel.value));
  if (!product) return;
  const qty = Math.max(1, parseInt(qtyEl.value) || 1);

  // Check stock for each component
  for (const comp of product.composition) {
    const art = S.articles.find(a => a.id === comp.id);
    if (!art || art.stock < comp.qty * qty) {
      showToast(`Stock insuffisant : ${art ? art.name : '?'}`, 'error');
      return;
    }
  }

  // Consume
  product.composition.forEach(comp => {
    const art = S.articles.find(a => a.id === comp.id);
    if (art) art.stock = Math.round((art.stock - comp.qty * qty) * 10) / 10;
  });

  S.sales.unshift({ id: Date.now(), productId: product.id, productName: product.name, qty, total: product.price * qty, date: new Date().toISOString() });
  showToast(`💰 Vente de ${qty} × ${product.name} enregistrée !`);
  render();
}

function saveArticle() {
  const f = S.form;
  if (!f.name.trim()) { showToast('Donne un nom à cet article', 'error'); return; }
  S.articles.push({
    id: Date.now(),
    name: f.name.trim(), emoji: f.emoji,
    stock: parseFloat(f.stock) || 0, min: parseFloat(f.min) || 5,
    unit: f.unit || 'pcs', price: parseFloat(f.price) || 0,
    demand: parseFloat(f.demand) || 1, lead: parseInt(f.lead) || 7,
  });
  showToast(`✅ "${f.name}" ajouté !`);
  S.form = { name: '', emoji: '📦', stock: 0, min: 5, unit: 'pcs', price: 0, demand: 1, lead: 7 };
  nav('pantry');
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
  const navEl  = $('nav');
  const hiddenNav = ['detail', 'add'].includes(S.view);

  navEl.style.display = hiddenNav ? 'none' : '';
  if (!hiddenNav) navEl.innerHTML = renderNav();

  const map = { home: vHome, pantry: vPantry, products: vProducts, sales: vSales, financial: vFinancial, detail: vDetail, add: vAdd };
  viewEl.innerHTML = (map[S.view] || vHome)();
  viewEl.scrollTop = 0;
}

// ── Bottom Nav ────────────────────────────────
function renderNav() {
  const tabs = [
    { id: 'home',      icon: '🏠', label: 'Accueil'  },
    { id: 'pantry',    icon: '📦', label: 'Stock'    },
    { id: 'products',  icon: '🏷️', label: 'Produits' },
    { id: 'sales',     icon: '💰', label: 'Ventes'   },
    { id: 'financial', icon: '📊', label: 'Bilan'    },
  ];
  return tabs.map(t => `
    <button class="nav-tab ${S.view === t.id ? 'active' : ''}" onclick="nav('${t.id}')">
      <span class="nav-icon">${t.icon}</span>
      <span class="nav-label">${t.label}</span>
    </button>`).join('');
}

// ── HOME ──────────────────────────────────────
function vHome() {
  const low   = S.articles.filter(a => a.stock < a.min);
  const totalCA = S.sales.reduce((s, v) => s + v.total, 0);
  const today   = new Date().toDateString();
  const todayCA = S.sales.filter(s => new Date(s.date).toDateString() === today).reduce((s, v) => s + v.total, 0);

  return `
  <div class="hero anim-up">
    <div class="hero-top">
      <div>
        <div class="hero-greeting">Bonjour 👋</div>
        <div class="hero-name">Mon Boutique</div>
      </div>
      <div class="hero-avatar">🏪</div>
    </div>
    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-value">${S.articles.length}</div>
        <div class="hero-stat-label">Articles</div>
      </div>
      <div class="hero-stat ${low.length > 0 ? 'warn' : ''}">
        <div class="hero-stat-value">${low.length}</div>
        <div class="hero-stat-label">Alertes</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-value">${fmt(todayCA)}</div>
        <div class="hero-stat-label">CA Auj.</div>
      </div>
    </div>
  </div>

  <div class="container">
    ${low.length > 0 ? `
    <div class="alert-banner" onclick="nav('pantry', {filter:'low'})">
      <div class="alert-icon">⚠️</div>
      <div style="flex:1">
        <div class="alert-title">${low.length} article${low.length > 1 ? 's' : ''} à réapprovisionner</div>
        <div class="alert-sub">${low.slice(0, 3).map(a => a.name).join(' · ')}${low.length > 3 ? '…' : ''}</div>
      </div>
      <div class="alert-caret">›</div>
    </div>` : ''}

    <div class="section-hd">
      <div class="section-label">Actions rapides</div>
    </div>
    <div class="quick-grid">
      <button class="quick-btn q-teal" onclick="nav('pantry')">
        <span class="quick-icon">📋</span>
        <div class="quick-label">Mon stock</div>
        <div class="quick-sub">${S.articles.length} articles</div>
      </button>
      <button class="quick-btn q-green" onclick="nav('products')">
        <span class="quick-icon">🏷️</span>
        <div class="quick-label">Produits</div>
        <div class="quick-sub">${S.products.length} produits finis</div>
      </button>
      <button class="quick-btn q-orange" onclick="nav('sales')">
        <span class="quick-icon">💰</span>
        <div class="quick-label">Ventes</div>
        <div class="quick-sub">Enregistrer une vente</div>
      </button>
      <button class="quick-btn q-red" onclick="nav('financial')">
        <span class="quick-icon">📊</span>
        <div class="quick-label">Bilan</div>
        <div class="quick-sub">${fmt(totalCA)} FCFA total</div>
      </button>
    </div>

    <div class="section-hd">
      <div class="section-label">Articles récents</div>
      <button class="section-action" onclick="nav('pantry')">Voir tout →</button>
    </div>
    ${S.articles.slice(0, 4).map((a, i) => {
      const st = stockStatus(a.stock, a.min);
      return `
      <div class="card card-tap anim-up" style="animation-delay:${i * 0.05}s" onclick="nav('detail',{selectedId:${a.id}})">
        <div class="article-row">
          <div class="article-icon" style="background:${st.bg}">${a.emoji}</div>
          <div class="article-info">
            <div class="article-name">${a.name}</div>
            <div class="article-meta">${a.stock} ${a.unit} · min ${a.min}</div>
          </div>
          <div class="article-right">
            <span class="badge ${st.cls}">${st.label}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
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
      <div class="page-title">Mon stock</div>
      <button class="fab" onclick="nav('add')">+</button>
    </div>
    <div class="search-wrap" style="margin-top:12px">
      <span class="search-ico">🔍</span>
      <input class="input input-search" type="text" placeholder="Rechercher un article…" value="${S.search.replace(/"/g,'&quot;')}" oninput="S.search=this.value;render()">
    </div>
    <div class="filter-row">
      <button class="filter-chip fc-all ${S.filter==='all'?'active':''}" onclick="S.filter='all';render()">Tout (${S.articles.length})</button>
      <button class="filter-chip fc-out ${S.filter==='out'?'active':''}" onclick="S.filter='out';render()">🔴 Rupture</button>
      <button class="filter-chip fc-low ${S.filter==='low'?'active':''}" onclick="S.filter='low';render()">🟡 Faible</button>
      <button class="filter-chip fc-ok  ${S.filter==='ok'?'active':''}" onclick="S.filter='ok';render()">🟢 En stock</button>
    </div>
  </div>

  <div class="container">
    ${list.length === 0 ? `
    <div class="empty">
      <div class="empty-ico">📦</div>
      <div class="empty-title">Aucun article trouvé</div>
      <div class="empty-text">Essaie un autre terme ou ajoute un nouvel article.</div>
      <button class="btn btn-primary" style="width:auto;padding:12px 24px" onclick="nav('add')">+ Ajouter</button>
    </div>` : list.map((a, i) => {
      const st = stockStatus(a.stock, a.min);
      const pct = Math.min(100, Math.round((a.stock / Math.max(a.min * 2, 1)) * 100));
      return `
      <div class="card card-tap anim-up" style="animation-delay:${i * 0.04}s" onclick="nav('detail',{selectedId:${a.id}})">
        <div class="article-row">
          <div class="article-icon" style="background:${st.bg}">${a.emoji}</div>
          <div class="article-info">
            <div class="article-name">${a.name}</div>
            <div class="article-meta">${a.stock} ${a.unit} · seuil ${a.min}</div>
            <div class="progress">
              <div class="progress-bar" style="width:${pct}%;background:${st.color}"></div>
            </div>
          </div>
          <div class="article-right">
            <span class="badge ${st.cls}">${st.label}</span>
            <div style="font-size:18px;color:#ccc;margin-top:4px">›</div>
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
      <div class="page-title">Produits finis</div>
      <button class="fab" onclick="nav('add')">+</button>
    </div>
  </div>

  <div class="container">
    ${S.products.length === 0 ? `
    <div class="empty">
      <div class="empty-ico">🏷️</div>
      <div class="empty-title">Aucun produit</div>
      <div class="empty-text">Crée tes premiers produits à vendre.</div>
      <button class="btn btn-primary" style="width:auto;padding:12px 24px" onclick="nav('add')">+ Ajouter</button>
    </div>` : S.products.map((p, i) => {
      const avail  = productMaxMake(p);
      const canMake = avail > 0;
      const st = canMake
        ? { cls: 'badge-ok',  color: '#1A6B3A', bg: '#EAFAF1', label: `${avail} fab.` }
        : { cls: 'badge-out', color: '#B91C1C', bg: '#FEE2E2', label: 'Indisponible' };

      return `
      <div class="card anim-up" style="animation-delay:${i * 0.05}s">
        <div class="article-row" style="margin-bottom:${p.composition.length ? 12 : 0}px">
          <div class="article-icon" style="background:${st.bg};font-size:26px">${p.emoji}</div>
          <div class="article-info">
            <div class="article-name">${p.name}</div>
            <div class="article-meta" style="color:#1A6B3A;font-weight:700">${fmt(p.price)} FCFA</div>
          </div>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        ${p.composition.length ? `
        <div style="border-top:1px solid var(--border-light);padding-top:10px">
          <div style="font-size:11px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Composition</div>
          ${p.composition.map(c => {
            const art = S.articles.find(a => a.id === c.id);
            if (!art) return '';
            const ok = art.stock >= c.qty;
            return `<div class="comp-row"><span class="comp-label">${art.emoji} ${art.name}</span><span class="${ok ? 'comp-ok' : 'comp-fail'}">${art.stock} / ${c.qty} ${art.unit}</span></div>`;
          }).join('')}
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── SALES ─────────────────────────────────────
function vSales() {
  const today    = new Date().toDateString();
  const todayCA  = S.sales.filter(s => new Date(s.date).toDateString() === today).reduce((s, v) => s + v.total, 0);
  const available = S.products.filter(p => productMaxMake(p) > 0);

  return `
  <div class="sales-hero">
    <div style="font-family:var(--font-d);font-size:26px;font-weight:800;color:white">Enregistrer une vente</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:4px">Aujourd'hui · <strong style="color:white">${fmt(todayCA)} FCFA</strong></div>
  </div>

  <div class="container">
    <div class="card" style="margin-bottom:16px">
      <div class="form-group">
        <label class="form-label">Produit</label>
        <select class="input" id="sale-product">
          <option value="">— Choisir un produit —</option>
          ${available.map(p => `<option value="${p.id}">${p.emoji} ${p.name} — ${fmt(p.price)} FCFA (${productMaxMake(p)} fab.)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantité</label>
        <input type="number" class="input" id="sale-qty" value="1" min="1">
      </div>
      <button class="btn btn-primary" onclick="recordSale()">✅ Confirmer la vente</button>
    </div>

    <div class="section-hd">
      <div class="section-label">Historique</div>
      <div style="font-size:13px;font-weight:600;color:var(--text-3)">${S.sales.length} vente${S.sales.length !== 1 ? 's' : ''}</div>
    </div>

    ${S.sales.length === 0 ? `
    <div class="empty">
      <div class="empty-ico">💰</div>
      <div class="empty-title">Aucune vente</div>
      <div class="empty-text">Tes premières ventes apparaîtront ici.</div>
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
  const now = new Date();
  const today    = now.toDateString();
  const weekAgo  = new Date(now - 7 * 86400000);
  const monthAgo = new Date(now - 30 * 86400000);

  const totalCA = S.sales.reduce((s, v) => s + v.total, 0);
  const todayCA = S.sales.filter(s => new Date(s.date).toDateString() === today).reduce((s, v) => s + v.total, 0);
  const weekCA  = S.sales.filter(s => new Date(s.date) >= weekAgo).reduce((s, v) => s + v.total, 0);
  const monthCA = S.sales.filter(s => new Date(s.date) >= monthAgo).reduce((s, v) => s + v.total, 0);
  const avg     = S.sales.length ? Math.round(totalCA / S.sales.length) : 0;
  const stockVal = S.articles.reduce((s, a) => s + a.stock * a.price, 0);

  const stats = {};
  S.sales.forEach(s => {
    if (!stats[s.productName]) stats[s.productName] = { qty: 0, rev: 0 };
    stats[s.productName].qty += s.qty;
    stats[s.productName].rev += s.total;
  });
  const top = Object.entries(stats).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5);
  const lowArt = S.articles.filter(a => a.stock < a.min);

  return `
  <div class="fin-hero">
    <div class="fin-title">Bilan financier</div>
    <div class="fin-total">${fmt(totalCA)} <span style="font-size:18px;opacity:.6">FCFA</span></div>
    <div class="fin-total-sub">Chiffre d'affaires total · ${S.sales.length} ventes</div>
  </div>

  <div class="container">
    <div class="metric-grid" style="margin-top:4px">
      <div class="metric-card">
        <div class="metric-val" style="color:var(--accent)">${fmt(todayCA)}</div>
        <div class="metric-lbl">Aujourd'hui</div>
      </div>
      <div class="metric-card">
        <div class="metric-val" style="color:var(--primary)">${fmt(weekCA)}</div>
        <div class="metric-lbl">7 jours</div>
      </div>
      <div class="metric-card">
        <div class="metric-val" style="color:var(--success)">${fmt(monthCA)}</div>
        <div class="metric-lbl">30 jours</div>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-val">${fmt(avg)}</div>
        <div class="metric-lbl">Ticket moyen</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${S.sales.length}</div>
        <div class="metric-lbl">Nb ventes</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${fmt(stockVal)}</div>
        <div class="metric-lbl">Val. stock</div>
      </div>
    </div>

    <div class="card">
      <div style="font-size:15px;font-weight:800;margin-bottom:12px">🏆 Top produits</div>
      ${top.length === 0 ? '<div style="color:var(--text-3);font-size:14px">Aucune vente enregistrée</div>' :
        top.map(([name, d], i) => {
          const medals = ['g1','g2','g3'];
          return `<div class="rank-item">
            <div class="rank-num ${medals[i] || ''}">${i+1}</div>
            <div class="rank-name">${name}</div>
            <div class="rank-val">${fmt(d.rev)} F</div>
          </div>`;
        }).join('')}
    </div>

    ${lowArt.length > 0 ? `
    <div class="card" style="margin-top:10px">
      <div style="font-size:15px;font-weight:800;margin-bottom:12px">⚠️ Articles à commander</div>
      ${lowArt.map(a => `
      <div class="info-row">
        <span class="info-lbl">${a.emoji} ${a.name}</span>
        <span class="info-val" style="color:var(--danger)">${a.stock} / ${a.min} ${a.unit}</span>
      </div>`).join('')}
    </div>` : ''}
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
  <div class="detail-hero" style="background:linear-gradient(155deg,${st.color}DD,${st.color}88)">
    <div class="detail-hero-inner">
      <button class="back-btn" style="background:rgba(255,255,255,0.2);color:white;margin-bottom:14px" onclick="nav('pantry')">←</button>
      <div class="detail-emoji-wrap">${art.emoji}</div>
      <div class="detail-name">${art.name}</div>
      <span class="detail-badge">${st.label}</span>
    </div>
  </div>

  <div class="container">
    <!-- Stock gauge -->
    <div class="card">
      <div class="gauge">
        <div class="gauge-val" style="color:${st.color}">${art.stock}</div>
        <div class="gauge-unit">${art.unit} en stock</div>
        <div class="progress" style="margin-top:16px;height:8px">
          <div class="progress-bar" style="width:${pct}%;background:${st.color}"></div>
        </div>
        <div class="gauge-min">Seuil minimum : ${art.min} ${art.unit}</div>
      </div>
    </div>

    <!-- Modifier stock -->
    <div class="card" style="margin-top:10px">
      <div style="font-size:13px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">Modifier le stock</div>
      <div class="action-toggle">
        <button class="toggle-btn ${S.action==='add'?'toggle-add':''}" onclick="S.action='add';render()">
          <span class="toggle-icon">📥</span>
          <div class="toggle-label">J'ai reçu</div>
        </button>
        <button class="toggle-btn ${S.action==='remove'?'toggle-remove':''}" onclick="S.action='remove';render()">
          <span class="toggle-icon">📤</span>
          <div class="toggle-label">J'ai retiré</div>
        </button>
      </div>

      <div class="qty-row">
        <button class="qty-ctrl" onclick="S.qty=Math.max(1,S.qty-1);render()">−</button>
        <div class="qty-val">${S.qty}</div>
        <button class="qty-ctrl" onclick="S.qty++;render()">+</button>
      </div>

      <div class="chip-row">
        ${[1,5,10,25,50,100].map(n => `<button class="chip ${S.qty===n?'active':''}" onclick="S.qty=${n};render()">${n}</button>`).join('')}
      </div>

      <div style="margin-top:10px"></div>
      <button class="btn btn-primary" onclick="applyStock()">
        ${S.action==='add' ? `📥 Ajouter ${S.qty} ${art.unit}` : `📤 Retirer ${S.qty} ${art.unit}`}
      </button>
    </div>

    <!-- Infos -->
    <div class="card" style="margin-top:10px">
      <div style="font-size:13px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Informations</div>
      <div class="info-row">
        <span class="info-lbl">💰 Prix unitaire</span>
        <span class="info-val" style="color:var(--success)">${fmt(art.price)} FCFA</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">📈 Demande / jour</span>
        <span class="info-val">${art.demand} ${art.unit}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">🚚 Délai livraison</span>
        <span class="info-val">${art.lead} jours</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">📦 Point de commande</span>
        <span class="info-val ${art.stock <= reorderPt ? 'info-val' : ''}" style="${art.stock <= reorderPt ? 'color:var(--danger)' : ''}">${reorderPt} ${art.unit}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">💎 Valeur en stock</span>
        <span class="info-val">${fmt(art.stock * art.price)} FCFA</span>
      </div>
    </div>
  </div>`;
}

// ── ADD ───────────────────────────────────────
function vAdd() {
  const emojis = ['📦','🧵','🪡','🔘','👗','🧥','👕','👖','🧣','🧤','🧦','👜','👛','🧢','👒','💍','🪢','🎀','🏮','🫙','🥛','🍶','🪣','⚗️','🧴','🧹','🌿','🌾','🪨','🪵'];
  const f = S.form;

  return `
  <div style="background:linear-gradient(155deg,var(--accent) 0%,var(--accent-dark) 100%);padding:52px 20px 24px;border-radius:0 0 28px 28px">
    <button class="back-btn" style="background:rgba(255,255,255,0.2);color:white;margin-bottom:14px" onclick="nav('pantry')">←</button>
    <div style="font-family:var(--font-d);font-size:26px;font-weight:800;color:white">Nouvel article</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px">Ajoute un article à ton stock</div>
  </div>

  <div class="container">
    <div class="card">
      <div class="form-group">
        <label class="form-label">Icône</label>
        <div class="emoji-grid">
          ${emojis.map(e => `<button class="emoji-btn ${f.emoji===e?'selected':''}" onclick="S.form.emoji='${e}';render()">${e}</button>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Nom de l'article *</label>
        <input class="input" type="text" placeholder="ex: Tissu wax, Farine, Bouteilles…" value="${f.name.replace(/"/g,'&quot;')}" oninput="S.form.name=this.value">
      </div>

      <div class="form-group">
        <label class="form-label">Unité de mesure</label>
        <input class="input" type="text" placeholder="pcs, m, kg, litre, sac…" value="${f.unit}" oninput="S.form.unit=this.value">
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

      <button class="btn btn-primary" onclick="saveArticle()">✅ Ajouter cet article</button>
    </div>
  </div>`;
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.S          = S;
  window.nav        = nav;
  window.render     = render;
  window.applyStock = applyStock;
  window.recordSale = recordSale;
  window.saveArticle = saveArticle;
  window.showToast  = showToast;
  render();
});
