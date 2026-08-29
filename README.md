# LTN-My-Classroom-Layout

Standalone JavaScript module (vanilla, no framework dependency) for building
an **interactive classroom seating chart**: desk grid, rotation and color on
right-click, student assignment, border objects (board, door, window),
print / PDF export via the browser.

Shipped as plain ESM (no build step required to use it): any app (with or
without a bundler) can import it directly.

## Installation

```bash
npm install ltn-classroom-layout
```

```js
import { ClassroomLayout } from "ltn-classroom-layout";
import "ltn-classroom-layout/style.css"; // or a <link> tag if you have no CSS bundler
```

## Quick start

```js
const layout = new ClassroomLayout(document.getElementById("app"), {
  students: [
    { id: "1", firstName: "Ada", lastName: "Lovelace", level: "Grade 5" },
  ],
  colors: [{ label: "Site blue", value: "#2f6f9e" }],
  teacher: {
    firstName: "J.",
    lastName: "Doe",
    className: "Grade 5",
    school: "School X",
    year: "2026-2027",
  },
  persistence: {
    load: () => JSON.parse(localStorage.getItem("my-classroom") ?? "null"),
    save: (state) =>
      localStorage.setItem("my-classroom", JSON.stringify(state)),
  },
});

await layout.ready; // resolves once the configuration is loaded and rendered
```

See `demo/index.html` for a full runnable example (serve the folder with a
static server, e.g. `npx serve .` — ES modules don't load from `file://`).

## Interactions

- **Click an empty cell**: adds a desk (empty chair, top-down view).
- **Click an occupied desk**: removes the student (the desk stays).
- **Click an empty desk**: removes the desk.
- **Right-click a cell** (empty or occupied): context menu — assign / change
  / remove a student, rotate the desk a quarter turn, change its color,
  remove the desk, or add a desk on an empty cell (so every left-click
  action is also reachable here).
- **Click a cell border**: offers a choice (board / door / window) if the
  border is empty; a second click on a border that already has an object
  removes it. Right-clicking a border offers the same choice when empty; on
  an existing door it offers "change opening side" (flips which side it
  swings from, drawn as an ajar door with a swing arc) in addition to
  removing it.
- **Assign a student**: list of students without a desk yet (if
  `options.students` is supplied), with search, or free-text entry of a
  name. If `options.teacher` is documented, the teacher also appears in that
  list and — unlike roster students — can be assigned to more than one desk
  (the one exception to the "each student appears once" rule).
- **Color**: preferred colors shown first (`options.colors`), then colors
  the user recently picked, then a free picker (hue + opacity).
- **Subtitle** (above the grid): free text field, always editable, printed
  under the header.
- **Print / PDF export**: opens the browser's print dialog ("Save as PDF" is
  one of its destinations) on a dedicated A4 layout — school/teacher/year
  header (or blank fields to fill in by hand if `options.teacher` isn't
  supplied) and the subtitle. The editing grid's dashed guide lines are not
  printed, only the placed desks and border objects are.

Every change is applied immediately to the state and triggers
`options.persistence.save` (lightly debounced, then always flushed on
`destroy()`, so it doesn't save on every keystroke/pixel while never losing
anything on close).

## Loading and the empty "ring"

On creation, with no existing configuration, the grid is 5 columns × 6 rows
(`options.gridDefault` to change that default). When loading an already
saved configuration, the grid is recomputed as the smallest rectangle
containing all the content (desks + borders), surrounded by a one-cell empty
ring — not pinned to 5×6.

## API

### `new ClassroomLayout(container, options?)`

| Option        | Type                                                         | Description                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gridDefault` | `{cols, rows}`                                               | Initial grid when no configuration is loaded (default `{cols:5, rows:6}`).                                                                                                                       |
| `students`    | `Array<{id?, firstName?, lastName?, name?, level?, group?}>` | Optional list offered when assigning a student.                                                                                                                                                  |
| `colors`      | `Array<string \| {label?, value}>`                           | Optional preferred colors (site colors, subject colors…).                                                                                                                                        |
| `teacher`     | `{firstName?, lastName?, className?, school?, year?}`        | Optional teacher info, shown in the print header. If absent, the print header fields are left blank for the teacher to fill in by hand, and the teacher entry above the roster doesn't appear.   |
| `persistence` | `{load(), save(state)}`                                      | Persistence adapter supplied by the host app (`load` can be async; `save` receives the full state). Without it, nothing is loaded/saved — the host app manages `getState()`/`setState()` itself. |
| `onChange`    | `(state) => void`                                            | Optional callback invoked after every change.                                                                                                                                                    |
| `nameFit`     | `{max?, min?}`                                               | Bounds (px) for the automatic size-down of the student name shown on the desk.                                                                                                                   |

### Methods

- `layout.ready` — `Promise` resolved once the initial load/render is done.
- `layout.getState()` — returns the current state (JSON-serializable object, see schema below).
- `layout.setState(state)` — replaces the state (object or JSON string) and re-renders.
- `layout.applyChange(fn)` — applies a pure `(state) => newState` transform (used internally, exposed for advanced use).
- `layout.print()` — opens the print / PDF export.
- `layout.destroy()` — detaches listeners, flushes any pending save, empties the container.

Pure model functions are also exported (`toggleDeskAt`, `rotateDeskAt`,
`setDeskColorAt`, `assignStudentAt`, `unassignStudentAt`, `setBorderAt`,
`clearBorderAt`, `rotateBorderAt`, `fitGridToContentWithRing`,
`serializeState`, `deserializeState`, …) — see `src/model.js`.

## State JSON schema

```jsonc
{
  "version": 1,
  "grid": { "cols": 5, "rows": 6 },
  "cells": {
    // key "row_col"
    "2_3": {
      "type": "desk",
      "rotation": 90, // 0 | 90 | 180 | 270
      "color": "#e07a5f", // or "rgba(r,g,b,a)", or null
      "student": { "id": "1", "name": "Ada Lovelace", "level": "Grade 5" }, // or null
    },
  },
  "edges": {
    // horizontal borders: "h_{line 0..rows}_{col 0..cols-1}"
    // vertical borders:   "v_{row 0..rows-1}_{line 0..cols}"
    "h_0_2": { "type": "tableau", "rotation": 0 }, // "tableau" | "porte" | "fenetre"; rotation 0|180 (only meaningful for "porte")
    "v_3_5": { "type": "fenetre", "rotation": 0 },
  },
  "recentColors": ["#e07a5f"], // custom colors the user recently picked
  "subtitle": "Back to school 2026",
  "teacherOverride": null, // hand-typed teacher info when no `options.teacher` was supplied
  "meta": { "updatedAt": "2026-08-29T12:00:00.000Z" },
}
```

## Scope of this module

This module has no backend dependency: persistence is entirely delegated to
`options.persistence`, supplied by the host application (file, API,
`localStorage`…). It doesn't make any network calls of its own either.

## Development

```bash
npm install
npm test        # vitest
npm run lint
npm run format
```
