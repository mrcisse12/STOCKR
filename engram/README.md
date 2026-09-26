# Engram — flashcards IA, en cinq langues

App de flashcards nouvelle génération, dans l'univers d'une salle de lecture : **photo ou PDF de cours → fiches**, **Mentor**, un assistant IA qui agit dans l'app et construit votre **programme jusqu'au jour de l'examen**, répétition espacée **FSRS-5** visualisée comme une boîte de Leitner, **correction des réponses par l'IA** même quand elles ne sont pas mot pour mot (tapées, dictées ou **écrites à la main au stylet**), **import et export Anki**, jeux, examen blanc noté au barème de chaque pays.

**Français · English · Español · Deutsch · Português** : interface, exemples, consignes de l'IA, dates, nombres et pluriels.

| Fichier | Contenu |
|---|---|
| [`index.html`](index.html) | L'application, en un seul fichier, sans compilation |
| [`server/`](server/) | Le serveur Engram : sert l'app et relaie l'API Claude (clé côté serveur) ; le relais est dans `server/core.mjs` |
| [`netlify.toml`](netlify.toml), [`netlify/`](netlify/) | Mise en ligne sur Netlify, IA comprise (fonction `/api/ai`) |
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

1. Netlify → **Add new site → Import an existing project** → ce dépôt.
2. **Base directory** : `engram` (tout le reste est dans `engram/netlify.toml`).
3. **Environment variables** : `ANTHROPIC_API_KEY`, et `ENGRAM_ACCESS_CODE` (conseillé pour un site public).
4. **Deploy** : l'app trouve seule l'IA à `/api/ai`.

Netlify limite la durée d'une fonction : si une très longue lecture (gros PDF scanné, Mentor Expert) est coupée, hébergez l'image Docker et indiquez son adresse dans **Réglages → IA et Mentor**.

### Installer l'app

Sur iPad ou iPhone : Safari → Partager → **Sur l'écran d'accueil**. Sur Android, ordinateur : **Installer** dans le menu du navigateur. L'app s'ouvre en plein écran et fonctionne hors-ligne (seule l'IA demande le réseau).

L'app détecte seule le serveur qui la sert. Si l'app est hébergée ailleurs (Netlify, GitHub Pages…), indiquez l'adresse du serveur dans **Réglages → IA et Mentor** et autorisez son origine avec `ENGRAM_CORS_ORIGIN`.

| Variable | Défaut | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Clé de l'API Claude |
| `ENGRAM_ACCESS_CODE` | — | Code d'accès à saisir dans Réglages (conseillé pour un serveur public) |
| `ENGRAM_MODEL_QUICK` / `_DEFAULT` / `_COMPLEX` | `claude-opus-5` / `claude-opus-5` / `claude-fable-5-1` | Modèles des niveaux Rapide, Standard et Expert |
| `ENGRAM_EFFORT_QUICK` / `_DEFAULT` / `_COMPLEX` | `low` / `medium` / `high` | Effort de réflexion |
| `ENGRAM_RATE_PER_MIN` | `30` | Requêtes par minute et par adresse |
| `ENGRAM_FALLBACKS` | activé | Repli automatique sur le modèle recommandé si une requête est déclinée (`off` pour couper) |
| `ENGRAM_CORS_ORIGIN` | — | Origines autorisées (`*` ou liste séparée par des virgules) |
| `PORT`, `ENGRAM_MAX_TOKENS`, `ENGRAM_MAX_BODY_MB`, `ENGRAM_TRUST_PROXY`, `ENGRAM_LOG` | `8787`, `32000`, `12`, —, — | Réseau, limites, journal |

Astuce coût : `ENGRAM_MODEL_QUICK=claude-haiku-4-5` rend les corrections de réponses environ cinq fois moins chères.

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
