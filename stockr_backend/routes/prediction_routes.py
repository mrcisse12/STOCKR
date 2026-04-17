from flask import Blueprint, jsonify
from sqlalchemy import select
from models import db, Article, Sale, Product, product_articles, token_required
from datetime import datetime, timedelta
import math
import statistics

prediction_bp = Blueprint('prediction', __name__)

WEEKDAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']


# ── Algorithmes ──────────────────────────────────────────────────────────────

def holt_smooth(series, alpha=0.3, beta=0.1):
    if not series or len(series) < 2:
        avg = sum(series) / len(series) if series else 0
        return avg, 0
    L = series[0]
    T = series[1] - series[0]
    for y in series[1:]:
        L_prev, T_prev = L, T
        L = alpha * y + (1 - alpha) * (L_prev + T_prev)
        T = beta * (L - L_prev) + (1 - beta) * T_prev
    return L, T


def norm_cdf(z):
    if z < -6:
        return 0.0
    if z > 6:
        return 1.0
    t = 1 / (1 + 0.2316419 * abs(z))
    d = 0.3989423 * math.exp(-z * z / 2)
    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
    return 1 - p if z > 0 else p


def rupture_probability(stock, daily_demand, sigma, lead_time):
    if daily_demand <= 0:
        return 0.0
    demand_lead = daily_demand * lead_time
    sigma_lead = sigma * math.sqrt(lead_time) if lead_time > 0 else sigma
    if sigma_lead == 0:
        return 1.0 if stock < demand_lead else 0.0
    z = (stock - demand_lead) / sigma_lead
    return max(0.0, min(1.0, 1 - norm_cdf(z)))


# ── Endpoint principal ────────────────────────────────────────────────────────

@prediction_bp.route('/', methods=['GET'])
@token_required
def get_predictions(current_user):
    now = datetime.utcnow()
    today = now.date()
    tomorrow = today + timedelta(days=1)

    # ── Ventes 30 derniers jours ──
    cutoff_30 = now - timedelta(days=30)
    sales_30d = Sale.query.filter(
        Sale.user_id == current_user.id,
        Sale.timestamp >= cutoff_30
    ).all()

    # ── Compositions ──
    rows = db.session.execute(
        select(product_articles).join(
            Product, product_articles.c.product_id == Product.id
        ).where(Product.user_id == current_user.id)
    ).fetchall()

    comp_map = {}
    for row in rows:
        comp_map.setdefault(row.product_id, {})[row.article_id] = row.quantity_used

    # ── Produits de l'utilisateur ──
    products = Product.query.filter_by(user_id=current_user.id).all()
    products_by_id = {p.id: p for p in products}

    # ── Articles ──
    articles = Article.query.filter_by(user_id=current_user.id).all()
    articles_by_id = {a.id: a for a in articles}

    # ── Série journalière par article (30 jours) ──
    def build_daily_series(article_id):
        series = []
        for i in range(29, -1, -1):
            day_start = now - timedelta(days=i + 1)
            day_end = now - timedelta(days=i)
            day_sales = [s for s in sales_30d if day_start <= s.timestamp < day_end]
            total = sum(
                comp_map.get(s.product_id, {}).get(article_id, 0) * s.quantity
                for s in day_sales
            )
            series.append(total)
        return series

    # ── Ventes journalières par produit (30 jours) ──
    def build_product_daily_sales(product_id):
        series = []
        for i in range(29, -1, -1):
            day_start = now - timedelta(days=i + 1)
            day_end = now - timedelta(days=i)
            qty = sum(
                s.quantity for s in sales_30d
                if s.product_id == product_id and day_start <= s.timestamp < day_end
            )
            series.append(qty)
        return series

    # ── Calcul des prédictions par article ──
    predictions = []
    n_critical = 0
    n_warning = 0
    n_no_data = 0
    positive_trends = 0
    total_trend_articles = 0

    for article in articles:
        daily_series = build_daily_series(article.id)
        total_30 = sum(daily_series)
        days_with_sales = sum(1 for v in daily_series if v > 0)
        lead = article.lead_time_days or 7

        if total_30 == 0:
            n_no_data += 1
            predictions.append({
                'article_id': article.id,
                'article_name': article.name,
                'unit': article.unit,
                'current_stock': article.quantity,
                'status': 'no_data',
                'days_remaining': None,
                'daily_demand': 0,
                'trend': 0,
                'trend_pct': 0,
                'safety_stock': 0,
                'reorder_point': 0,
                'order_quantity': 0,
                'rupture_probability': 0,
                'confidence': 0,
                'action': None,
            })
            continue

        # Holt smoothing sur la série chronologique
        level, trend = holt_smooth(daily_series, alpha=0.3, beta=0.1)
        daily_demand = max(0.0, level)
        trend_val = trend

        # Statistiques
        nonzero = [v for v in daily_series if v > 0]
        mean_nonzero = sum(nonzero) / len(nonzero) if nonzero else 0
        sigma = statistics.stdev(daily_series) if len(set(daily_series)) > 1 else daily_demand * 0.2
        trend_pct = round((trend_val / daily_demand * 100), 1) if daily_demand > 0 else 0

        # Safety stock (Z=1.65 pour 95%)
        safety_stock = 1.65 * sigma * math.sqrt(lead)

        # Reorder point
        reorder_point = daily_demand * lead + safety_stock

        # Quantité à commander
        target_days = lead * 2 + 7
        order_quantity = max(0.0, daily_demand * target_days - article.quantity)

        # Jours restants
        days_remaining = article.quantity / daily_demand if daily_demand > 0 else None

        # Probabilité de rupture
        rupt_prob = rupture_probability(article.quantity, daily_demand, sigma, lead)
        rupt_prob_pct = round(rupt_prob * 100, 1)

        # Confiance
        coverage = days_with_sales / 30 * 50
        cv = sigma / mean_nonzero if mean_nonzero > 0 else 1
        stability = max(0, 1 - cv) * 30
        recent_sales_7d = sum(daily_series[-7:])
        recent_bonus = 20 if recent_sales_7d > 0 else 0
        confidence = round(min(100, coverage + stability + recent_bonus))

        # Statut
        if days_remaining is not None and days_remaining <= lead:
            status = 'critical'
            n_critical += 1
        elif article.quantity <= reorder_point:
            status = 'warning'
            n_warning += 1
        else:
            status = 'ok'

        if trend_val > 0:
            positive_trends += 1
        total_trend_articles += 1

        # Action recommandée
        if status == 'critical':
            order_date = today + timedelta(days=max(1, int(days_remaining or 0)))
            order_date_fr = f"{order_date.day} {['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][order_date.month - 1]}"
            action = {
                'verb': 'Commander maintenant',
                'quantity': round(order_quantity, 2),
                'unit': article.unit,
                'before': order_date_fr,
                'urgency': 'critical',
            }
        elif status == 'warning':
            order_date = today + timedelta(days=3)
            order_date_fr = f"{order_date.day} {['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][order_date.month - 1]}"
            action = {
                'verb': 'Commander bientôt',
                'quantity': round(order_quantity, 2),
                'unit': article.unit,
                'before': order_date_fr,
                'urgency': 'warning',
            }
        else:
            action = None

        predictions.append({
            'article_id': article.id,
            'article_name': article.name,
            'unit': article.unit,
            'current_stock': round(article.quantity, 3),
            'status': status,
            'days_remaining': round(days_remaining, 1) if days_remaining is not None else None,
            'daily_demand': round(daily_demand, 4),
            'trend': round(trend_val, 4),
            'trend_pct': trend_pct,
            'safety_stock': round(safety_stock, 2),
            'reorder_point': round(reorder_point, 2),
            'order_quantity': round(order_quantity, 2),
            'rupture_probability': rupt_prob_pct,
            'confidence': confidence,
            'action': action,
        })

    # ── SOVA Score ──
    score = 100
    score -= min(45, n_critical * 15)
    score -= min(24, n_warning * 8)
    score -= n_no_data * 1
    if total_trend_articles > 0 and positive_trends > total_trend_articles / 2:
        score += 5
    score = max(0, min(100, score))

    # ── Intro key ──
    if score >= 90 and n_critical == 0 and n_warning == 0:
        intro_key = 'excellent'
    elif score >= 75 and n_critical == 0:
        intro_key = 'good'
    elif n_critical == 0 and n_warning == 1:
        intro_key = 'warning_one'
    elif n_critical == 0 and n_warning >= 2:
        intro_key = 'warning_multi'
    elif n_critical == 1:
        intro_key = 'critical_one'
    elif n_critical >= 2:
        intro_key = 'critical_multi'
    else:
        intro_key = 'neutral'

    # ── Revenue at risk ──
    revenue_at_risk = 0.0
    revenue_at_risk_articles = []

    article_to_products = {}
    for pid, ingredients in comp_map.items():
        for aid in ingredients:
            article_to_products.setdefault(aid, []).append(pid)

    for pred in predictions:
        if pred['status'] != 'critical' or pred['days_remaining'] is None:
            continue
        article_id = pred['article_id']
        lead = articles_by_id[article_id].lead_time_days or 7
        shortfall_days = max(0.0, lead - pred['days_remaining'])
        if shortfall_days <= 0:
            continue

        related_pids = article_to_products.get(article_id, [])
        daily_rev = 0.0
        for pid in related_pids:
            product = products_by_id.get(pid)
            if not product:
                continue
            total_qty = sum(s.quantity for s in sales_30d if s.product_id == pid)
            daily_qty = total_qty / 30
            daily_rev += daily_qty * (product.price or 0)

        rev_risk = round(daily_rev * shortfall_days, 2)
        if rev_risk > 0:
            revenue_at_risk += rev_risk
            revenue_at_risk_articles.append({
                'article_name': pred['article_name'],
                'amount': rev_risk,
                'shortfall_days': round(shortfall_days, 1),
            })

    revenue_at_risk = round(revenue_at_risk, 2)

    # ── Producible / Blocked ──
    producible = []
    blocked = []

    for product in products:
        ingredients = comp_map.get(product.id, {})
        if not ingredients:
            continue
        max_units = float('inf')
        for aid, qty_used in ingredients.items():
            article = articles_by_id.get(aid)
            if not article or qty_used <= 0:
                continue
            max_units = min(max_units, article.quantity / qty_used)
        max_units = int(math.floor(max_units)) if max_units != float('inf') else 0

        entry = {'id': product.id, 'name': product.name, 'max_units': max_units}
        if max_units == 0:
            blocked.append(entry)
        else:
            producible.append(entry)

    producible.sort(key=lambda x: -x['max_units'])

    # ── Planning demain ──
    tomorrow_weekday = WEEKDAYS_FR[tomorrow.weekday()]
    tomorrow_plan = []

    for product in products:
        prod_series = build_product_daily_sales(product.id)
        total_prod = sum(prod_series)
        if total_prod == 0:
            continue

        daily_avg = total_prod / 30

        # Saisonnalité : moyenne du même weekday vs daily_avg global
        target_wd = tomorrow.weekday()
        wd_values = []
        for i in range(30):
            day = today - timedelta(days=i)
            if day.weekday() == target_wd:
                idx = 29 - i
                if 0 <= idx < 30:
                    wd_values.append(prod_series[idx])

        if wd_values and daily_avg > 0:
            seasonality = (sum(wd_values) / len(wd_values)) / daily_avg
        else:
            seasonality = 1.0
        seasonality = round(max(0.1, min(3.0, seasonality)), 2)

        expected_qty = round(daily_avg * seasonality)

        # Ingrédients nécessaires
        ingredients_plan = []
        stock_ok = True
        for aid, qty_used in comp_map.get(product.id, {}).items():
            article = articles_by_id.get(aid)
            if not article:
                continue
            needed = round(qty_used * expected_qty, 3)
            sufficient = article.quantity >= needed
            if not sufficient:
                stock_ok = False
            ingredients_plan.append({
                'article_id': aid,
                'article_name': article.name,
                'unit': article.unit,
                'needed': needed,
                'available': round(article.quantity, 3),
                'sufficient': sufficient,
            })

        tomorrow_plan.append({
            'product_id': product.id,
            'product_name': product.name,
            'expected_qty': expected_qty,
            'seasonality_factor': seasonality,
            'stock_ok': stock_ok,
            'ingredients': ingredients_plan,
        })

    # ── Tri final ──
    status_order = {'critical': 0, 'warning': 1, 'ok': 2, 'no_data': 3}
    predictions.sort(key=lambda x: status_order.get(x['status'], 3))

    return jsonify({
        'score': score,
        'score_detail': {'n_critical': n_critical, 'n_warning': n_warning},
        'intro_key': intro_key,
        'revenue_at_risk': revenue_at_risk,
        'revenue_at_risk_articles': revenue_at_risk_articles,
        'producible': producible,
        'blocked': blocked,
        'tomorrow': {
            'weekday': tomorrow_weekday,
            'plan': tomorrow_plan,
        },
        'predictions': predictions,
    })
