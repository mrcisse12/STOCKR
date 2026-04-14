from flask import Blueprint, request, jsonify
from models import db, Article, token_required
import base64
import numpy as np

spectra_bp = Blueprint('spectra', __name__)

# Lazy-load du moteur pour ne pas bloquer le démarrage si ultralytics est absent
_engine = None

def get_engine():
    global _engine
    if _engine is None:
        try:
            import cv2
            import sys
            import os
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'spectra'))
            from spectra_core import SpectraVisionEngine
            _engine = SpectraVisionEngine()
        except Exception as e:
            return None, str(e)
    return _engine, None


def fuzzy_match(detected_name, user_articles):
    """
    Tente de faire correspondre un nom détecté par YOLO
    à un article existant de l'utilisateur (matching souple).
    Retourne (article, score) ou (None, 0).
    """
    detected_lower = detected_name.lower()
    best, best_score = None, 0

    for art in user_articles:
        art_lower = art.name.lower()
        # Correspondance exacte
        if detected_lower == art_lower:
            return art, 100
        # Sous-chaîne dans l'un ou l'autre sens
        if detected_lower in art_lower or art_lower in detected_lower:
            score = 80
            if score > best_score:
                best, best_score = art, score
        # Mots en commun
        detected_words = set(detected_lower.split())
        art_words = set(art_lower.split())
        common = detected_words & art_words
        if common:
            score = int(60 * len(common) / max(len(detected_words), len(art_words)))
            if score > best_score:
                best, best_score = art, score

    return best, best_score


@spectra_bp.route('/scan', methods=['POST'])
@token_required
def scan(current_user):
    """
    Reçoit une image base64, lance YOLO, retourne les détections
    avec correspondance aux articles de l'utilisateur.
    """
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({"error": "Image manquante"}), 400

    engine, err = get_engine()
    if engine is None:
        return jsonify({"error": f"Moteur Spectra indisponible : {err}"}), 503

    # Décodage image base64
    try:
        import cv2
        raw = data['image']
        if ',' in raw:
            raw = raw.split(',')[1]
        img_bytes = base64.b64decode(raw)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"error": "Image illisible"}), 400
    except Exception as e:
        return jsonify({"error": f"Décodage échoué : {str(e)}"}), 400

    # Inférence YOLO
    engine.process_frame(frame)

    # Articles de l'utilisateur (pour le matching)
    user_articles = Article.query.filter_by(user_id=current_user.id).all()

    # Construction de la liste de détections enrichies
    detections = []
    for detected_name, info in engine.current_inventory.items():
        matched_art, score = fuzzy_match(detected_name, user_articles)
        detections.append({
            "detected_name": detected_name,
            "quantity":      info['count'],
            "confidence":    round(info['avg_conf'] * 100, 1),
            "matched_id":    matched_art.id   if matched_art and score >= 60 else None,
            "matched_name":  matched_art.name if matched_art and score >= 60 else None,
            "matched_unit":  matched_art.unit if matched_art and score >= 60 else "pce",
            "match_score":   score,
        })

    # Trier par confiance décroissante
    detections.sort(key=lambda x: x['confidence'], reverse=True)

    return jsonify({"detections": detections, "inference_ms": round(engine.inference_time, 1)})


@spectra_bp.route('/confirm', methods=['POST'])
@token_required
def confirm(current_user):
    """
    Reçoit la liste des articles confirmés par l'utilisateur.
    - Si article_id fourni → ajoute la quantité à l'article existant
    - Sinon → crée un nouvel article
    Retourne le résumé des modifications.
    """
    data = request.get_json()
    items = data.get('items', [])
    if not items:
        return jsonify({"error": "Aucun article confirmé"}), 400

    results = []

    for item in items:
        qty      = float(item.get('quantity', 1))
        art_id   = item.get('article_id')
        name     = item.get('name', '').strip()
        unit     = item.get('unit', 'pce')

        if art_id:
            # Mise à jour d'un article existant
            art = Article.query.filter_by(id=art_id, user_id=current_user.id).first()
            if art:
                art.quantity += qty
                db.session.commit()
                results.append({
                    "action": "updated",
                    "id":     art.id,
                    "name":   art.name,
                    "new_qty": art.quantity,
                    "unit":   art.unit,
                })
        elif name:
            # Création d'un nouvel article
            art = Article(
                name=name,
                quantity=qty,
                unit=unit,
                user_id=current_user.id,
                alert_threshold=0,
                lead_time_days=1,
            )
            db.session.add(art)
            db.session.commit()
            results.append({
                "action": "created",
                "id":     art.id,
                "name":   art.name,
                "new_qty": art.quantity,
                "unit":   art.unit,
            })

    return jsonify({"results": results, "count": len(results)})
