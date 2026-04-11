# /up — Mise à jour du CDC STOCKR

Tu vas mettre à jour le fichier `cahier-des-charges.html` pour refléter l'état réel du projet.

## Étape 1 — Audit rapide du code

Lis ces fichiers pour connaître l'état actuel :
- `/Users/MacdeElisam/STOCKR/stockr_frontend/www2/app.js` (grep sur : Chart, PDF, manifest, serviceWorker, vSpectra)
- `/Users/MacdeElisam/STOCKR/stockr_backend/app.py` (blueprints enregistrés)
- `/Users/MacdeElisam/STOCKR/stockr_frontend/www2/` (ls pour manifest.json, sw.js)

Détermine le statut de chaque fonctionnalité :
- **Terminé** (`status-done`) : implémenté ET visible dans le code
- **En cours** (`status-wip`) : partiellement implémenté
- **Planifié** (`status-todo`) : absent du code

## Étape 2 — Lis le CDC actuel

Lis `/Users/MacdeElisam/STOCKR/cahier-des-charges.html` en entier.

## Étape 3 — Mets à jour le CDC

Applique uniquement ces changements :

### A. Statuts des feature-cards (section Fonctionnalités)
Met à jour les classes CSS selon l'état réel :
- `status-done` → terminé
- `status-wip` → en cours  
- `status-todo` → planifié

### B. Timeline (section Planning)
- Les phases terminées : `tl-dot done`
- La phase en cours : `tl-dot active`
- Les phases futures : `tl-dot` (sans classe)

### C. Date de mise à jour
Dans le script JS, mets à jour la constante :
```js
const LAST_UPDATED = 'JJ mois YYYY';
```
Utilise la date d'aujourd'hui (fournie dans le contexte système).

### D. JJ dans le hero
Ne touche pas au calcul JJ — il est déjà dynamique.

## Étape 4 — Rapport

Affiche un résumé concis :
- Ce qui a changé de statut dans le CDC
- La nouvelle date LAST_UPDATED
- Confirmation que le fichier est sauvegardé

**Ne change rien d'autre** — pas le texte des descriptions, pas les sections, pas les couleurs.
