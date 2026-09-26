# Engram — flashcards IA

Prototype complet d'une app de flashcards nouvelle génération : **photo de cours → cartes**, répétition espacée **FSRS-5**, **correction des réponses par l'IA** même quand elles ne sont pas mot pour mot, examen blanc noté sur 20, mode écoute, statistiques.

Tout tient dans un seul fichier, sans dépendance ni compilation : [`index.html`](index.html).

## Lancer

Ouvrez `index.html` dans un navigateur, ou servez le dossier :

```bash
npx serve engram
```

Des paquets d'exemple (biologie, histoire, anglais, physique) sont chargés au premier lancement ; le bouton « Effacer les exemples » les retire.

## L'IA

- **Dans l'app Claude** (page publiée comme artefact) : l'IA utilise le compte Claude de la personne. Lecture des photos, génération des cartes, correction sémantique, prof virtuel et détection des légendes pour le masquage d'image fonctionnent directement. Les paquets sont synchronisés sur tous ses appareils.
- **Ouvert tel quel dans un navigateur** : tout fonctionne hors-ligne, avec la génération locale à partir d'un texte collé et la correction locale. Pour brancher votre propre backend, remplacez les méthodes `AI.ask` et `AI.json` (section 6 du script) par un appel à votre serveur, qui détient la clé d'API (voir `FICHE_TECHNIQUE.md`, §5).

## Raccourcis

| Touche | Action |
|---|---|
| Espace | Commencer / retourner la carte / valider la note suggérée |
| 1 2 3 4 | Encore · Difficile · Bien · Facile |
| A–D, V/F | Répondre à un QCM / vrai-faux |
| Z | Annuler la dernière note |
| E | Modifier la carte |
| T | Lire à voix haute |
| Ctrl/⌘ K | Palette de recherche |

## Documentation

La fiche technique complète (analyse d'Anki, architecture cible, pipeline IA, coûts chiffrés, budget, planning, risques) est dans [`FICHE_TECHNIQUE.md`](FICHE_TECHNIQUE.md).
