// ============================================
// STOCKR — iOS-inspired Web App
// ============================================

// ============================================
// DATA
// ============================================
const now = new Date();
const d = (offset) => new Date(now.getTime() + offset * 1000);
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);

const articles = [
    { id: 1, name: "Farine T55",    quantity: 12, unit: "kg",    threshold: 10, costPrice: 1.20,  lucide: "wheat"      },
    { id: 2, name: "Beurre AOP",    quantity: 3,  unit: "kg",    threshold: 5,  costPrice: 8.50,  lucide: "droplets"   },
    { id: 3, name: "Sucre",         quantity: 25, unit: "kg",    threshold: 8,  costPrice: 0.95,  lucide: "package"    },
    { id: 4, name: "Oeufs bio",     quantity: 0,  unit: "boîte", threshold: 5,  costPrice: 3.20,  lucide: "egg"        },
    { id: 5, name: "Lait entier",   quantity: 8,  unit: "L",     threshold: 6,  costPrice: 1.10,  lucide: "cup-soda"   },
    { id: 6, name: "Chocolat 70%",  quantity: 2,  unit: "kg",    threshold: 3,  costPrice: 12.00, lucide: "square"     },
    { id: 7, name: "Levure",        quantity: 15, unit: "pièce", threshold: 4,  costPrice: 0.45,  lucide: "sparkles"   },
];

const products = [
    { id: 1, name: "Croissant",          salePrice: 1.30, ingredients: [{ id: 1, qty: 0.15 }, { id: 2, qty: 0.08 }] },
    { id: 2, name: "Pain au chocolat",   salePrice: 1.50, ingredients: [{ id: 1, qty: 0.12 }, { id: 6, qty: 0.03 }] },
    { id: 3, name: "Baguette tradition", salePrice: 1.20, ingredients: [{ id: 1, qty: 0.35 }, { id: 7, qty: 1    }] },
    { id: 4, name: "Tarte citron",       salePrice: 3.80, ingredients: [{ id: 1, qty: 0.20 }, { id: 3, qty: 0.10 }, { id: 4, qty: 2 }] },
];

const sales = [
    { id: 1, items: [{ name: "Croissant", qty: 3, price: 1.30 }, { name: "Baguette tradition", qty: 2, price: 1.20 }], date: d(-600),    total: 6.30  },
    { id: 2, items: [{ name: "Pain au chocolat", qty: 5, price: 1.50 }],                                               date: d(-3600),   total: 7.50  },
    { id: 3, items: [{ name: "Tarte citron", qty: 1, price: 3.80 }, { name: "Croissant", qty: 2, price: 1.30 }],      date: d(-7200),   total: 6.40  },
    { id: 4, items: [{ name: "Baguette tradition", qty: 4, price: 1.20 }],                                             date: daysAgo(1), total: 4.80  },
    { id: 5, items: [{ name: "Croissant", qty: 10, price: 1.30 }, { name: "Pain au chocolat", qty: 6, price: 1.50 }], date: daysAgo(2), total: 22.00 },
];

// ============================================
// STATE
// ============================================
let state = {
    isLoggedIn: false,
    view: "home",
    stockFilter: "tous",
    bilanPeriod: "7j",
};

// ============================================
// HELPERS
// ============================================
function articleStatus(a) {
    if (a.quantity <= 0) return "rupture";
    if (a.quantity <= a.threshold) return "seuil";
    return "ok";
}

function badgeLabel(s) {
    return { ok: "OK", seuil: "Seuil", rupture: "Rupture" }[s];
}

function iconBg(s) {
    return { ok: "var(--green-bg)", seuil: "var(--orange-bg)", rupture: "var(--red-bg)" }[s];
}

function iconColor(s) {
    return { ok: "var(--green)", seuil: "var(--orange)", rupture: "var(--red)" }[s];
}

function alertArticles() {
    return articles.filter(a => articleStatus(a) !== "ok");
}

function todaySales() {
    return sales.filter(s => s.date.toDateString() === now.toDateString());
}

function stockValue() {
    return articles.reduce((sum, a) => sum + a.quantity * a.costPrice, 0);
}

function fabricableQty(product) {
    let min = Infinity;
    for (const ing of product.ingredients) {
        const article = articles.find(a => a.id === ing.id);
        if (!article || ing.qty <= 0) return 0;
        min = Math.min(min, Math.floor(article.quantity / ing.qty));
    }
    return min === Infinity ? 0 : min;
}

function saleSummary(sale) {
    return sale.items.map(i => `${i.qty}x ${i.name}`).join(", ");
}

function formatTime(date) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(n) {
    return n.toFixed(2) + "\u202f€";
}

function todayLabel() {
    return now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

// ============================================
// ICON HELPER
// ============================================
function ic(name, cls = "") {
    return `<i data-lucide="${name}" class="lucide ${cls}"></i>`;
}

function articleIcon(a) {
    const st = articleStatus(a);
    return `
        <div class="row-icon" style="background:${iconBg(st)};color:${iconColor(st)}">
            ${ic(a.lucide, "icon-art")}
        </div>`;
}

function renderBadge(status) {
    return `<span class="badge badge-${status}">${badgeLabel(status)}</span>`;
}

// ============================================
// RENDER: LOGIN
// ============================================
function renderLogin() {
    document.getElementById("tab-bar").style.display = "none";
    const screen = document.getElementById("screen");
    screen.className = "login-screen";
    screen.innerHTML = `
        <div class="login-wrap">
            <div class="login-logo">
                <div class="login-logo-icon">${ic("package", "icon-logo")}</div>
                <div class="login-logo-name">STOCKR</div>
                <div class="login-logo-sub">Inventory Management</div>
            </div>

            <div class="login-fields">
                <div class="input-field">
                    <span class="input-icon">${ic("mail", "icon-field")}</span>
                    <input type="email" placeholder="Email" autocomplete="email">
                </div>
                <div class="input-field">
                    <span class="input-icon">${ic("lock", "icon-field")}</span>
                    <input type="password" placeholder="Mot de passe" autocomplete="current-password">
                </div>
            </div>

            <button class="btn-black" onclick="login()">Se connecter</button>
            <button class="btn-link">Créer un compte</button>
        </div>
    `;
    lucide.createIcons();
}

// ============================================
// RENDER: HOME
// ============================================
function renderHome() {
    const alerts = alertArticles();
    const ts = todaySales();
    const ca = ts.reduce((s, x) => s + x.total, 0);

    const alertRows = alerts.length === 0
        ? `<div class="ok-state">${ic("check-circle", "icon-ok")} Tout est en ordre !</div>`
        : alerts.map(a => {
            const st = articleStatus(a);
            return `
            <div class="row">
                <div class="status-dot" style="background:${iconColor(st)}"></div>
                <div class="row-main">
                    <div class="row-name">${a.name}</div>
                    <div class="row-sub">${a.quantity} ${a.unit}</div>
                </div>
                ${renderBadge(st)}
            </div>`;
        }).join("");

    const inventoryRows = articles.map(a => {
        const st = articleStatus(a);
        return `
        <div class="row">
            ${articleIcon(a)}
            <div class="row-main">
                <div class="row-name">${a.name}</div>
                <div class="row-sub">${a.unit}</div>
            </div>
            <span class="row-value">${a.quantity}</span>
            ${renderBadge(st)}
        </div>`;
    }).join("");

    return `
        <div class="nav-bar">
            <div class="nav-home-left">
                <div class="nav-greeting">Bonjour, Marc</div>
                <div class="nav-date">${todayLabel()}</div>
            </div>
            <button class="nav-btn">${ic("bell", "icon-nav")}</button>
        </div>

        <div class="scroll-content">
            <div class="kpi-row">
                <div class="kpi-card" style="background:var(--green-bg)">
                    <div class="kpi-label">CA aujourd'hui</div>
                    <div class="kpi-value" style="color:var(--green)">${formatMoney(ca)}</div>
                </div>
                <div class="kpi-card" style="background:var(--blue-bg)">
                    <div class="kpi-label">Articles</div>
                    <div class="kpi-value" style="color:var(--blue)">${articles.length}</div>
                </div>
                <div class="kpi-card" style="background:var(--red-bg)">
                    <div class="kpi-label">Alertes</div>
                    <div class="kpi-value" style="color:var(--red)">${alerts.length}</div>
                </div>
            </div>

            <div class="ai-banner">
                <div class="ai-icon-wrap">${ic("cpu", "icon-ai")}</div>
                <div>
                    <div class="ai-title">Prédiction IA</div>
                    <div class="ai-text">Réapprovisionnez le Beurre AOP et les Oeufs bio sous 48h pour éviter une rupture.</div>
                </div>
            </div>

            <div class="section-group">
                <div class="section-header">
                    ${ic("alert-triangle", "icon-section orange")}
                    <span class="section-title">Alertes stock</span>
                </div>
                ${alertRows}
            </div>

            <div class="section-group">
                <div class="section-header">
                    ${ic("package", "icon-section blue")}
                    <span class="section-title">Inventaire rapide</span>
                </div>
                ${inventoryRows}
            </div>
        </div>
    `;
}

// ============================================
// RENDER: STOCK
// ============================================
function renderStock() {
    const filters = ["tous", "rupture", "seuil", "ok"];
    const filterLabels = { tous: "Tous", rupture: "En rupture", seuil: "Seuil", ok: "OK" };

    const filtered = state.stockFilter === "tous"
        ? articles
        : articles.filter(a => articleStatus(a) === state.stockFilter);

    const chips = filters.map(f => `
        <button class="chip ${state.stockFilter === f ? "active" : ""}"
                onclick="setStockFilter('${f}')">
            ${filterLabels[f]}
        </button>`).join("");

    const rows = filtered.length === 0
        ? `<div class="empty-state">
               <div class="empty-icon">${ic("package", "icon-empty")}</div>
               <div class="empty-text">Aucun article trouvé</div>
           </div>`
        : filtered.map(a => {
            const st = articleStatus(a);
            return `
            <div class="row">
                ${articleIcon(a)}
                <div class="row-main">
                    <div class="row-name">${a.name}</div>
                    <div class="row-sub">${a.unit}</div>
                </div>
                <span class="row-value">${a.quantity}</span>
                ${renderBadge(st)}
                <span class="row-chevron">${ic("chevron-right", "icon-chevron")}</span>
            </div>`;
        }).join("");

    return `
        <div class="nav-bar">
            <span class="nav-title">Stock</span>
            <button class="nav-btn">${ic("plus", "icon-nav")}</button>
        </div>
        <div class="scroll-content">
            <div class="chips-scroll">
                <div class="chips-row">${chips}</div>
            </div>
            <div class="section-group">${rows}</div>
        </div>
    `;
}

// ============================================
// RENDER: PRODUITS
// ============================================
function renderProduits() {
    const rows = products.map(p => {
        const qty = fabricableQty(p);
        return `
        <div class="row">
            <div class="row-main">
                <div class="row-name">${p.name}</div>
                <div class="row-sub">${p.ingredients.length} ingrédient${p.ingredients.length > 1 ? "s" : ""} · ${formatMoney(p.salePrice)}</div>
            </div>
            <span class="fab-qty ${qty > 0 ? "can" : "cannot"}">${qty}</span>
            <span class="row-sub" style="font-size:12px;flex-shrink:0">fab.</span>
            <span class="row-chevron">${ic("chevron-right", "icon-chevron")}</span>
        </div>`;
    }).join("");

    return `
        <div class="nav-bar">
            <span class="nav-title">Produits</span>
            <button class="nav-btn">${ic("plus", "icon-nav")}</button>
        </div>
        <div class="scroll-content">
            <div class="section-group">${rows}</div>
        </div>
    `;
}

// ============================================
// RENDER: VENTE
// ============================================
function renderVente() {
    const ts = todaySales();
    const ca = ts.reduce((s, x) => s + x.total, 0);
    const nb = ts.length;
    const ticket = nb > 0 ? ca / nb : 0;

    const quickCards = products.map(p => `
        <div class="quick-card">
            <div class="quick-name">${p.name}</div>
            <div class="quick-price">${formatMoney(p.salePrice)}</div>
            <div class="quick-add">${ic("plus-circle", "icon-plus-circle")}</div>
        </div>`).join("");

    const saleRows = sales.slice(0, 5).map(s => `
        <div class="row">
            <div class="status-dot" style="background:var(--green)"></div>
            <div class="row-main">
                <div class="row-name">${saleSummary(s)}</div>
                <div class="row-sub">${s.date.toDateString() === now.toDateString()
                    ? formatTime(s.date)
                    : s.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
            </div>
            <span class="sale-total">${formatMoney(s.total)}</span>
        </div>`).join("");

    return `
        <div class="nav-bar">
            <span class="nav-title">Ventes</span>
            <button class="nav-btn">${ic("plus", "icon-nav")}</button>
        </div>
        <div class="scroll-content">
            <div class="kpi-row">
                <div class="kpi-card" style="background:var(--green-bg)">
                    <div class="kpi-label">CA</div>
                    <div class="kpi-value" style="color:var(--green)">${formatMoney(ca)}</div>
                </div>
                <div class="kpi-card" style="background:var(--blue-bg)">
                    <div class="kpi-label">Transactions</div>
                    <div class="kpi-value" style="color:var(--blue)">${nb}</div>
                </div>
                <div class="kpi-card" style="background:var(--orange-bg)">
                    <div class="kpi-label">Ticket moyen</div>
                    <div class="kpi-value" style="color:var(--orange)">${formatMoney(ticket)}</div>
                </div>
            </div>

            <div class="section-group">
                <div class="section-header">
                    <span class="section-title">Vente rapide</span>
                </div>
                <div class="quick-grid">${quickCards}</div>
            </div>

            <div class="section-group">
                <div class="section-header">
                    <span class="section-title">Historique récent</span>
                </div>
                ${saleRows}
            </div>
        </div>
    `;
}

// ============================================
// RENDER: BILAN
// ============================================
function renderBilan() {
    const total = sales.reduce((s, x) => s + x.total, 0);
    const avg = sales.length > 0 ? total / sales.length : 0;

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const day = daysAgo(i);
        const dayTotal = sales
            .filter(s => s.date.toDateString() === day.toDateString())
            .reduce((s, x) => s + x.total, 0);
        days.push({
            label: day.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3),
            total: dayTotal,
        });
    }

    const maxVal = Math.max(...days.map(d => d.total), 1);

    const bars = days.map(d => {
        const pct = (d.total / maxVal) * 80;
        return `
        <div class="bar-col">
            <div class="bar-fill" style="height:${Math.max(pct, 4)}px"></div>
            <div class="bar-label">${d.label}</div>
        </div>`;
    }).join("");

    const periods = ["7j", "30j", "90j"];
    const chips = periods.map(p => `
        <button class="chip ${state.bilanPeriod === p ? "active" : ""}"
                onclick="setBilanPeriod('${p}')">
            ${p}
        </button>`).join("");

    return `
        <div class="nav-bar">
            <span class="nav-title">Bilan</span>
        </div>
        <div class="scroll-content">
            <div class="chips-row">${chips}</div>

            <div class="kpi-row">
                <div class="kpi-card" style="background:var(--green-bg)">
                    <div class="kpi-label">CA total</div>
                    <div class="kpi-value" style="color:var(--green)">${formatMoney(total)}</div>
                </div>
                <div class="kpi-card" style="background:var(--blue-bg)">
                    <div class="kpi-label">Ticket moyen</div>
                    <div class="kpi-value" style="color:var(--blue)">${formatMoney(avg)}</div>
                </div>
            </div>

            <div class="card">
                <div class="chart-wrap">
                    <div class="chart-title">Ventes / jour</div>
                    <div class="bar-chart">${bars}</div>
                </div>
            </div>

            <div class="stock-value-card">
                <div>
                    <div class="stock-value-label">Valeur du stock</div>
                    <div class="stock-value-amount">${formatMoney(stockValue())}</div>
                </div>
                <div class="stock-value-icon">${ic("bar-chart-2", "icon-chart")}</div>
            </div>
        </div>
    `;
}

// ============================================
// RENDER: TAB BAR
// ============================================
function renderTabBar() {
    const tabs = [
        { id: "stock",    lucide: "package",       label: "Stock"    },
        { id: "produits", lucide: "grid-2x2",       label: "Produits" },
        { id: "home",     lucide: "home",            label: "",  home: true },
        { id: "vente",    lucide: "shopping-cart",  label: "Vente"    },
        { id: "bilan",    lucide: "bar-chart-2",    label: "Bilan"    },
    ];

    return tabs.map(t => {
        if (t.home) {
            return `
            <button class="tab-home" onclick="navigate('home')">
                <div class="tab-home-pill">${ic(t.lucide, "icon-home-tab")}</div>
            </button>`;
        }
        return `
        <button class="tab ${state.view === t.id ? "active" : ""}" onclick="navigate('${t.id}')">
            <span class="tab-icon">${ic(t.lucide, "icon-tab")}</span>
            <span class="tab-label">${t.label}</span>
        </button>`;
    }).join("");
}

// ============================================
// MAIN RENDER
// ============================================
function render() {
    if (!state.isLoggedIn) {
        renderLogin();
        return;
    }

    const tabBar = document.getElementById("tab-bar");
    const screen = document.getElementById("screen");

    tabBar.style.display = "flex";
    screen.className = "";
    tabBar.innerHTML = renderTabBar();

    const views = { home: renderHome, stock: renderStock, produits: renderProduits, vente: renderVente, bilan: renderBilan };
    screen.innerHTML = (views[state.view] || renderHome)();
    screen.scrollTop = 0;

    lucide.createIcons();
}

// ============================================
// ACTIONS
// ============================================
function login() {
    state.isLoggedIn = true;
    state.view = "home";
    render();
}

function navigate(view) {
    if (state.view === view) return;
    state.view = view;
    render();
}

function setStockFilter(f) {
    state.stockFilter = f;
    render();
}

function setBilanPeriod(p) {
    state.bilanPeriod = p;
    render();
}

// ============================================
// INIT
// ============================================
render();
