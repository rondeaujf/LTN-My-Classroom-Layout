# LTN-My-Classroom-Layout

Module JavaScript autonome (vanilla, sans dépendance à un framework) pour
construire un **plan de classe interactif** : grille de bureaux, rotation et
couleur au clic droit, affectation d'élèves, objets de bordure (tableau,
porte, fenêtre), impression / export PDF via le navigateur.

Livré en ESM pur (pas d'étape de build requise pour l'utiliser) : n'importe
quelle app (avec ou sans bundler) peut l'importer directement.

## Installation

```bash
npm install ltn-classroom-layout
```

```js
import { ClassroomLayout } from "ltn-classroom-layout";
import "ltn-classroom-layout/style.css"; // ou <link> si pas de bundler CSS
```

## Démarrage rapide

```js
const layout = new ClassroomLayout(document.getElementById("app"), {
  students: [{ id: "1", firstName: "Ada", lastName: "Lovelace", level: "CM1" }],
  colors: [{ label: "Bleu du site", value: "#2f6f9e" }],
  teacher: {
    firstName: "J.",
    lastName: "Rondeau",
    className: "CM1",
    school: "École X",
    year: "2026-2027",
  },
  persistence: {
    load: () => JSON.parse(localStorage.getItem("ma-classe") ?? "null"),
    save: (state) => localStorage.setItem("ma-classe", JSON.stringify(state)),
  },
});

await layout.ready; // résolu une fois la configuration chargée et rendue
```

Voir `demo/index.html` pour un exemple complet exécutable (servir le dossier
avec un serveur statique, ex. `npx serve .`, car les modules ES ne se
chargent pas depuis `file://`).

## Interactions

- **Clic sur une case vide** : ajoute un bureau (chaise vide, vue de dessus).
- **Clic sur un bureau occupé** : retire l'élève (le bureau reste).
- **Clic sur un bureau vide** : retire le bureau.
- **Clic droit sur une case** (vide ou occupée) : menu contextuel — affecter
  / changer / retirer un élève, faire pivoter le bureau par quart de tour,
  changer sa couleur, supprimer le bureau, ou ajouter un bureau sur une case
  vide (les mêmes actions qu'au clic gauche sont donc aussi accessibles ici).
- **Clic sur une bordure de case** : propose un choix (tableau / porte /
  fenêtre) si la bordure est vide ; un second clic sur une bordure déjà
  posée la supprime.
- **Affecter un élève** : liste des élèves sans bureau (si `options.students`
  fourni), recherche incluse, ou saisie libre d'un nom.
- **Couleur** : couleurs préférées proposées en premier (`options.colors`),
  puis les couleurs récemment choisies par l'utilisateur, puis un
  sélecteur libre (teinte + opacité).
- **Sous-titre** (au-dessus de la grille) : champ libre, toujours éditable,
  imprimé sous l'en-tête.
- **Imprimer / Export PDF** : ouvre la boîte d'impression du navigateur
  (le choix "Enregistrer en PDF" y figure) sur une mise en page A4 dédiée,
  avec en-tête enseignant/école/année (ou champs à renseigner à la main si
  `options.teacher` n'est pas fourni) et le sous-titre.

Chaque modification est appliquée immédiatement à l'état et déclenche
`options.persistence.save` (légèrement différé puis systématiquement flushé
à `destroy()`, pour ne pas sauvegarder à chaque frappe/pixel tout en ne
perdant rien à la fermeture).

## Chargement et "couronne" de cases

À la création, sans configuration existante, la grille est 5 colonnes × 6
lignes (`options.gridDefault` pour changer ce défaut). Au chargement d'une
configuration déjà enregistrée, la grille est recalculée comme le plus petit
rectangle contenant tout le contenu (bureaux + bordures), entouré d'une
couronne d'une case vide de chaque côté — pas figée à 5×6.

## API

### `new ClassroomLayout(container, options?)`

| Option        | Type                                                         | Description                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gridDefault` | `{cols, rows}`                                               | Grille initiale si aucune configuration n'est chargée (défaut `{cols:5, rows:6}`).                                                                                                                           |
| `students`    | `Array<{id?, firstName?, lastName?, name?, level?, group?}>` | Liste optionnelle proposée à l'affectation.                                                                                                                                                                  |
| `colors`      | `Array<string \| {label?, value}>`                           | Couleurs préférées optionnelles (couleurs du site, des matières…).                                                                                                                                           |
| `teacher`     | `{firstName?, lastName?, className?, school?, year?}`        | Infos enseignant optionnelles, affichées en en-tête d'impression. Si absent, les champs sont laissés éditables à l'impression.                                                                               |
| `persistence` | `{load(), save(state)}`                                      | Adaptateur de persistance fourni par l'app hôte (`load` peut être async ; `save` reçoit l'état complet). Sans cet objet, rien n'est chargé/sauvegardé — l'app hôte gère elle-même `getState()`/`setState()`. |
| `onChange`    | `(state) => void`                                            | Rappel optionnel appelé après chaque modification.                                                                                                                                                           |
| `nameFit`     | `{max?, min?}`                                               | Bornes (px) de l'ajustement automatique de la taille du nom affiché sur le bureau.                                                                                                                           |

### Méthodes

- `layout.ready` — `Promise` résolue une fois le chargement/rendu initial terminé.
- `layout.getState()` — renvoie l'état courant (objet JSON-sérialisable, cf. schéma ci-dessous).
- `layout.setState(state)` — remplace l'état (objet ou JSON string) et re-rend.
- `layout.applyChange(fn)` — applique une transformation pure `(state) => newState` (utilisé en interne, exposé pour des besoins avancés).
- `layout.print()` — ouvre l'impression / export PDF.
- `layout.destroy()` — détache les écouteurs, flush la sauvegarde en attente, vide le conteneur.

Fonctions pures du modèle également exportées (`toggleDeskAt`, `rotateDeskAt`,
`setDeskColorAt`, `assignStudentAt`, `unassignStudentAt`, `setBorderAt`,
`clearBorderAt`, `fitGridToContentWithRing`, `serializeState`,
`deserializeState`, …) — voir `src/model.js`.

## Schéma JSON de l'état

```jsonc
{
  "version": 1,
  "grid": { "cols": 5, "rows": 6 },
  "cells": {
    // clé "row_col"
    "2_3": {
      "type": "desk",
      "rotation": 90, // 0 | 90 | 180 | 270
      "color": "#e07a5f", // ou "rgba(r,g,b,a)", ou null
      "student": { "id": "1", "name": "Ada Lovelace", "level": "CM1" }, // ou null
    },
  },
  "edges": {
    // bordures horizontales : "h_{ligne 0..rows}_{colonne 0..cols-1}"
    // bordures verticales   : "v_{ligne 0..rows-1}_{colonne 0..cols}"
    "h_0_2": { "type": "tableau" }, // "tableau" | "porte" | "fenetre"
    "v_3_5": { "type": "fenetre" },
  },
  "recentColors": ["#e07a5f"], // couleurs personnalisées récemment choisies
  "subtitle": "Rentrée 2026",
  "teacherOverride": null, // saisie manuelle si aucun `options.teacher` fourni
  "meta": { "updatedAt": "2026-08-29T12:00:00.000Z" },
}
```

## Portée de ce module

Ce module ne dépend d'aucun backend : la persistance est entièrement confiée
à `options.persistence`, fournie par l'application hôte (fichier, API,
`localStorage`…). Il ne fait pas non plus d'appel réseau lui-même.

## Développement

```bash
npm install
npm test        # vitest
npm run lint
npm run format
```
