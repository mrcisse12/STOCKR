# Engram — flashcards IA, en cinq langues

App de flashcards nouvelle génération, dans l'univers d'une salle de lecture : **photo ou PDF de cours → fiches**, **Mentor**, un assistant IA qui agit dans l'app et construit votre **programme jusqu'au jour de l'examen**, répétition espacée **FSRS-5** visualisée comme une boîte de Leitner, **correction des réponses par l'IA** même quand elles ne sont pas mot pour mot (tapées, dictées ou **écrites à la main au stylet**), **import et export Anki**, jeux, examen blanc noté au barème de chaque pays.

**Français · English · Español · Deutsch · Português** : interface, exemples, consignes de l'IA, dates, nombres et pluriels.

| Fichier | Contenu |
|---|---|
| [`index.html`](index.html) | L'application, en un seul fichier, sans compilation |
| [`server/`](server/) | Le serveur Engram : sert l'app et relaie l'API Claude (clé côté serveur) ; le relais est dans `server/core.mjs` |
| [`netlify.toml`](netlify.toml), [`netlify/`](netlify/), [`package.json`](package.json) | Mise en ligne sur Netlify, IA comprise (fonction `/api/ai`, qui emporte le SDK Claude déclaré dans `package.json`) |
| `manifest.webmanifest`, `sw.js`, [`icons/`](icons/) | App installable (iPad, iPhone, Android, ordinateur) et hors-ligne |
| [`FICHE_TECHNIQUE.md`](FICHE_TECHNIQUE.md) | Fiche technique complète : fonctionnalités, architecture, coûts, budget, planning |
| [`dossier.html`](dossier.html) | La page de présentation du projet |

## Lancer

**Sans IA** : ouvrez `index.html` dans un navigateur. Tout fonctionne hors-ligne, avec la génération locale de fiches (texte collé ou PDF) et la correction locale.

**Avec l'IA** :

- **Dans l'app Claude** (page publiée comme artefact) : rien à configurer, l'IA utilise le compte Claude de la personne, et les paquets sont synchronisés sur tous ses appareils.
- **Partout ailleurs** : lancez le serveur, qui garde votre clé d'API.

```bash
cd engram/server
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start        # → http://localhost:8787
```

Ou avec Docker, depuis `engram/` :

```bash
docker build -f server/Dockerfile -t engram .
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... -e ENGRAM_ACCESS_CODE=un-code engram
```

### Sur Netlify

Le site de STOCKR n'est pas touché : Engram a son propre site.

1. Netlify → **Add new site → Import an existing project** → ce dépôt, branche `main`.
2. **Base directory** : `engram` (tout le reste est dans `engram/netlify.toml` ; `engram/package.json` fournit le SDK Claude à la fonction `/api/ai`).
3. **Environment variables** : `ANTHROPIC_API_KEY`, et `ENGRAM_ACCESS_CODE` (fortement conseillé pour un site public).
4. **Deploy** : l'app trouve seule l'IA à `/api/ai`.
5. Ouvrez l'adresse du site suivie de `#bilan` : le bilan de l'installation vérifie l'IA (un appel d'essai), le hors ligne, l'installation et la mémoire, et dit quoi corriger.

Netlify limite la durée d'une fonction : si une très longue lecture (gros PDF scanné, Mentor Expert) est coupée, hébergez l'image Docker et indiquez son adresse dans **Réglages → IA et Mentor**.

### Paiements (Stripe)

Les formules **Pro** (7,99 €/mois ou 79,90 €/an) et **Élite** (14,99 €/mois ou 149,90 €/an) se paient par Stripe.

1. Stripe → **Développeurs → Clés API** : copiez la **clé secrète** (`sk_test_…` pour essayer, `sk_live_…` pour de vrai).
2. Netlify → **Environment variables** : ajoutez `STRIPE_SECRET_KEY` avec cette clé. Ne la mettez jamais dans le code ni dans un message.
3. Redéployez. Au premier passage sur la page Pro, le serveur crée seul dans Stripe les produits « Engram Pro » et « Engram Élite », leurs quatre prix et le portail client. Rien à créer à la main.
4. Essayez en mode test avec la carte `4242 4242 4242 4242`, une date future et n'importe quel code.

Comment ça marche : après le paiement, le serveur vérifie la session Stripe et remet à l'app un **code d'abonnement** signé, joint ensuite à chaque appel à l'IA. Les abonnés n'ont pas besoin du code d'accès ; les autres ont `ENGRAM_FREE_DAILY` appels d'IA gratuits par jour (60 par défaut) ; le modèle le plus puissant est réservé à Élite. « Gérer mon abonnement » ouvre le portail Stripe (changer de formule ou de carte, factures, arrêt en fin de période). Sur un autre appareil, on colle son code d'abonnement dans la page Pro.

| Variable | Rôle |
|---|---|
| `STRIPE_SECRET_KEY` | Active les paiements |
| `ENGRAM_FREE_DAILY` | Appels d'IA gratuits par jour et par adresse (60) |
| `ENGRAM_PRICE_PRO_MONTH`, `_PRO_YEAR`, `_ELITE_MONTH`, `_ELITE_YEAR` | Prix créés au premier lancement, en euros (7.99, 79.90, 14.99, 149.90) |
| `STRIPE_TAX` | `on` : Stripe calcule la TVA (Stripe Tax doit être activé) |
| `ENGRAM_LICENSE_SECRET` | Facultatif : secret des codes d'abonnement (sinon dérivé de la clé Stripe ; changer de clé Stripe invalide alors les anciens codes, qui se renouvellent seuls) |

### Installer l'app

Sur iPad ou iPhone : Safari → Partager → **Sur l'écran d'accueil**. Sur Android, ordinateur : **Installer** dans le menu du navigateur. L'app s'ouvre en plein écran et fonctionne hors-ligne (seule l'IA demande le réseau).

L'app détecte seule le serveur qui la sert. Si l'app est hébergée ailleurs (Netlify, GitHub Pages…), indiquez l'adresse du serveur dans **Réglages → IA et Mentor** et autorisez son origine avec `ENGRAM_CORS_ORIGIN`.

| Variable | Défaut | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Clé de l'API Claude |
| `ENGRAM_ACCESS_CODE` | — | Code d'accès à saisir dans Réglages (conseillé pour un serveur public) |
| `ENGRAM_MODEL_QUICK` / `_DEFAULT` / `_COMPLEX` | `claude-sonnet-5-5` / `claude-opus-5-5` / `claude-fable-5-1` | Modèles des niveaux Rapide, Standard et Expert |
| `ENGRAM_EFFORT_QUICK` / `_DEFAULT` / `_COMPLEX` | `low` / `medium` / `high` | Effort de réflexion |
| `ENGRAM_RATE_PER_MIN` | `30` | Requêtes par minute et par adresse |
| `ENGRAM_FALLBACKS` | activé | Repli automatique sur le modèle recommandé si une requête est déclinée (`off` pour couper) |
| `ENGRAM_CORS_ORIGIN` | — | Origines autorisées (`*` ou liste séparée par des virgules) |
| `PORT`, `ENGRAM_MAX_TOKENS`, `ENGRAM_MAX_BODY_MB`, `ENGRAM_TRUST_PROXY`, `ENGRAM_LOG` | `8787`, `32000`, `12`, —, — | Réseau, limites, journal |

Coûts : environ 0,002 $ par correction, 0,06 $ par page scannée, 0,04 $ par message à Mentor ; environ 5,45 $ par mois pour un abonné Pro normal (détail dans la fiche technique, §11). Astuce : `ENGRAM_MODEL_DEFAULT=claude-sonnet-5-5` divise encore par deux le prix des scans et de Mentor, à valider sur de vraies photos de cours.

Obtenir la clé : créez un compte sur [platform.claude.com](https://platform.claude.com/), ajoutez une carte et une limite de dépense dans **Settings → Billing**, puis **Settings → API keys → Create key** (la clé commence par `sk-ant-` et ne s'affiche qu'une fois). Si la clé manque ou si le budget du mois est atteint, l'app le dit clairement au lieu d'un simple « connexion interrompue ».

## Mentor

Bouton en bas à droite, **Ctrl/⌘ J** ou **/**. Exemples : « Prépare-moi pour mon bac de SVT du 17 juin », « Crée 15 fiches sur la Révolution française », « Reformule mes cartes les plus oubliées », « Je n'ai que 10 minutes le mardi ». Chaque action laisse un reçu et peut être annulée d'un clic ; les suppressions demandent confirmation.

## Au stylet (iPad, Android, Surface)

- **Répondre à la main** : en séance, touchez la plume, écrivez, puis **Faire corriger**. L'IA lit l'écriture, affiche ce qu'elle a lu et corrige selon la sévérité choisie. Sur iPad en paysage, la fiche est à gauche, la feuille à droite.
- **Brouillon** : une feuille transparente sur la fiche pour calculer ou schématiser.
- **Schémas** : dans l'éditeur, « Ajouter un schéma dessiné » au recto ou au verso.
- **Notes → fiches** : dans le scanner, « Écrire mes notes à la main ».

Pression du stylet, paume posée sans effet, gomme au bout du stylet, pointe visible au survol sur les iPad Pro récents.

## Importer, exporter

Glissez un fichier n'importe où sur la page, ou passez par **Le fichier → Importer** : paquet Anki (`.apkg`, `.colpkg`, anciens et nouveaux formats, avec images et progression), liste copiée depuis Quizlet / Excel / Google Sheets / Notion, CSV / TSV / TXT, sauvegarde Engram, PDF de cours. Chaque paquet s'exporte en `.apkg` (Anki, AnkiDroid, AnkiMobile), en fiches à imprimer (PDF recto-verso), en CSV ou en JSON. Le programme s'ajoute à Google Agenda, Apple Calendar ou Outlook.

## Raccourcis

| Touche | Action |
|---|---|
| Espace | Ouvrir la séance / retourner la fiche / valider la note suggérée |
| 1 2 3 4 | À revoir · Difficile · Acquis · Facile |
| A–D, V/F | Répondre à un QCM / vrai-faux |
| Z | Annuler la dernière note |
| E | Modifier la fiche |
| T | Lire à voix haute |
| Ctrl/⌘ K | Palette de recherche |
| Ctrl/⌘ J ou / | Mentor |
