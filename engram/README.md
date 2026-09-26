# Engram — flashcards IA

Prototype complet d'une app de flashcards nouvelle génération, dans l'univers d'une salle de lecture : **photo de cours → fiches**, répétition espacée **FSRS-5** visualisée comme une boîte de Leitner, **correction des réponses par l'IA** même quand elles ne sont pas mot pour mot, jeux, examen blanc noté sur 20, prof virtuel, fiches de synthèse.

| Fichier | Contenu |
|---|---|
| [`index.html`](index.html) | L'application, en un seul fichier, sans dépendance ni compilation |
| [`dossier.html`](dossier.html) | La page de présentation du projet (produit, science, fiche technique, coûts, budget, planning) |
| [`FICHE_TECHNIQUE.md`](FICHE_TECHNIQUE.md) | La fiche technique complète en texte |

## Lancer

Ouvrez `index.html` dans un navigateur, ou servez le dossier :

```bash
npx serve engram
```

Au premier lancement, un accueil en trois étapes demande le niveau, le rythme quotidien et un éventuel examen. Des paquets d'exemple sont chargés ; « Effacer les exemples » les retire.

## L'IA

- **Dans l'app Claude** (page publiée comme artefact) : l'IA utilise le compte Claude de la personne. Lecture des photos, génération des fiches (photo, texte ou sujet), correction sémantique, prof virtuel, discussion par paquet, fiche de synthèse et détection des légendes pour le masquage d'image fonctionnent directement. Les paquets sont synchronisés sur tous ses appareils.
- **Ouvert tel quel dans un navigateur** : tout fonctionne hors-ligne, avec la génération locale à partir d'un texte collé et la correction locale. Pour brancher votre propre backend, remplacez `AI.ask` et `AI.json` (section 6 du script) par un appel à votre serveur, qui détient la clé d'API (voir `FICHE_TECHNIQUE.md`, §5).

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
