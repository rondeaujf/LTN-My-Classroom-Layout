# LTN-My-Classroom-Layout

Standalone JavaScript module (vanilla, no framework dependency) for building
an **interactive classroom seating chart**: desk grid, rotation and color on
right-click, student assignment, border objects (wall, board, door, window),
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
  / remove a student, rotate the desk a quarter turn, two independent ways
  to move it out of its default centered position: "stick to the edge" (a
  small nudge, flush against its own cell's edge — follows the desk's
  rotation, toward its own "head", the side opposite the chair) and 4
  direction entries (↑/↓/←/→, one active at a time — picking the active one
  again clears it) to shift it half a cell up/down/left/right, screen-
  absolute regardless of rotation, so two desks in adjacent cells can meet
  in the middle, head to head — change its color, remove the desk, or add a
  desk on an empty cell (so every left-click action is also reachable
  here). Both can be combined. A desk's drawing is exactly 2:1
  (width:depth), so it keeps a clean half-cell alignment when rotated 90°.
  When a student's `level` is shown, its badge always sits in the desk's
  top-left corner _from the viewer's point of view_ — not whichever local
  corner "top-left" happens to rotate to — so it stays legible and
  consistently placed at any rotation. It keeps its own default size unless
  a small or rotated desk would otherwise make it overlap the name, in
  which case it (only it, never the name) shrinks just enough to clear it.
- **Click a cell border**: offers a choice (wall / board / door / window) if
  the border is empty; a second click on a border that already has an object
  removes it. Right-clicking a border offers the same choice when empty; on
  an existing door it offers "change opening side" (mirrors which end the
  hinge is on, i.e. which side it swings from) AND "flip the door" (mirrors
  it across the wall, i.e. which room it swings into) — independent of each
  other, drawn as an ajar door with a swing arc; on an existing board, "flip
  the board" (moves the chalk tray to the other face of the wall, same
  mirror-across-the-wall as the door's flip). A board or a door is drawn as
  set into a wall (same wall line, so they align with a plain wall segment
  placed next to them); a window is a gap in the wall, no wall line of its
  own.
  Once every edge around the desks' bounding rectangle carries a border
  object (any type), the grid gets a `cll-grid--closed` class (see
  `isRoomEnclosed()` in `src/model.js`). Border editing can be turned off
  entirely with `options.editableBorders: false` — existing borders still
  show, but they can't be added/changed/removed and clicks pass through to
  the desk underneath.
- **Assign a student**: list of students without a desk yet (if
  `options.students` is supplied), with search, or "Ajouter un label" — a
  dialog (styled after the host site's own, not the picker's small anchored
  panel) for a manual first/last name and level, for anyone not in the
  roster. If `options.teacher` is documented, the teacher also appears in
  that list and — unlike roster students — can be assigned to more than one
  desk
  (the one exception to the "each student appears once" rule).
- **Color**: preferred colors shown first (`options.colors`), then colors
  the user recently picked, then a free picker (hue + opacity).
- **Subtitle** (above the grid): free text field, always editable, printed
  under the header.
- **Print / PDF export**: opens the browser's print dialog ("Save as PDF" is
  one of its destinations) on a dedicated sheet — A4 portrait by default,
  `options.printOrientation` / `options.printPaper` to change it —
  school/teacher/year
  header (or blank fields to fill in by hand if `options.teacher` isn't
  supplied), the subtitle, and (if `options.logoUrl` is supplied) the host
  app's logo centered at the bottom, mirroring the site's other PDF
  exports. The editing grid's dashed guide lines are not printed, only the
  placed desks and border objects are, and the grid itself is cropped to
  content with no padding ring (unlike the load-time fit, see "Loading and
  the empty ring" below, which keeps one so live editing can still extend
  the room) — the live editing grid can be much bigger than its actual
  content, and printing all of it would waste most of the page on empty
  margin instead of a bigger room plan; the editing state itself is
  untouched. A host app can take over entirely with `options.onPrint` (e.g.
  to render its own PDF from `buildPrintSheet()` instead of the browser
  dialog).

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

## Sizing (always-square cells)

The grid is sized in JS, not just CSS (`fitGridToHost`, `src/render.js`): on
every render, and on every resize of its own container (`.cll-grid-host`,
a `ResizeObserver`), it's set to the largest square-celled box that fits
that container — CSS `aspect-ratio` alone can't reliably give way on
whichever axis turns out to be the scarcer one once a host app's own layout
reshapes the container to something other than the grid's own cols:rows
ratio (a resized dialog, e.g.), and a non-square cell distorts the SVG
icons drawn into it (`preserveAspectRatio="none"`, see `buildBorderIcon`,
`src/svg.js`) — most visibly a door's swing arc.

A host app just needs to give `.cll-grid-host` a real box to fit into (e.g.
`flex: 1; min-height: 0;` down a height-constrained flex column, for a
dialog whose height is the scarce dimension) — nothing else, no
width/height/aspect-ratio tricks of its own.

## API

### `new ClassroomLayout(container, options?)`

| Option             | Type                                                                                                           | Description                                                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gridDefault`      | `{cols, rows}`                                                                                                 | Initial grid when no configuration is loaded (default `{cols:5, rows:6}`).                                                                                                                                                                                                                                    |
| `students`         | `Array<{id?, firstName?, lastName?, name?, level?, group?}>`                                                   | Optional list offered when assigning a student.                                                                                                                                                                                                                                                               |
| `colors`           | `Array<string \| {label?, value}>`                                                                             | Optional preferred colors (site colors, subject colors…).                                                                                                                                                                                                                                                     |
| `teacher`          | `{firstName?, lastName?, className?, school?, year?}`                                                          | Optional teacher info, shown in the print header. If absent, the print header fields are left blank for the teacher to fill in by hand, and the teacher entry above the roster doesn't appear.                                                                                                                |
| `persistence`      | `{load(), save(state)}`                                                                                        | Persistence adapter supplied by the host app (`load` can be async; `save` receives the full state). Without it, nothing is loaded/saved — the host app manages `getState()`/`setState()` itself.                                                                                                              |
| `onChange`         | `(state) => void`                                                                                              | Optional callback invoked after every change.                                                                                                                                                                                                                                                                 |
| `onPrint`          | `(state, {teacher, logoUrl, showLevel, nameDisplay, nameFit, levelFit, printOrientation, printPaper}) => void` | Optional override for `layout.print()` — if supplied, called instead of opening the browser's print dialog (e.g. to render a PDF from `buildPrintSheet()` and show it however the host app displays PDFs). The print settings are passed straight through so the host can apply them in its own PDF renderer. |
| `logoUrl`          | `string`                                                                                                       | Optional host-app logo URL, shown centered at the bottom of the print/PDF sheet (mirrors the site's other PDF exports).                                                                                                                                                                                       |
| `nameFit`          | `{max?, min?}`                                                                                                 | Bounds (px) for the automatic size-down of the student name shown on the desk. `max` (default `12`) is a fixed standard size, not a per-name ceiling — a short name never renders larger than it, only ever shrinking below it (down to `min`, default `7`) when it wouldn't otherwise fit.                   |
| `levelFit`         | `{max?, min?}`                                                                                                 | Bounds (px) for the level badge's font. `max` (default `8`) is the standard size; the badge only ever shrinks from it (down to `min`, default `7`) when it would otherwise overlap the name.                                                                                                                  |
| `printOrientation` | `"portrait" \| "landscape"`                                                                                    | Page orientation for print / PDF export (default `"portrait"`). Drives the built-in print dialog's `@page`; also handed to `onPrint` for a host doing its own PDF.                                                                                                                                            |
| `printPaper`       | `string`                                                                                                       | Paper size for print / PDF export (default `"A4"`; e.g. `"A3"`, `"letter"`). Same wiring as `printOrientation`.                                                                                                                                                                                               |
| `editableBorders`  | `boolean`                                                                                                      | Whether wall / board / door / window border objects can be added, changed or removed (default `true`). `false` locks them — existing borders stay visible, clicks fall through to the desk underneath; desks stay fully editable.                                                                             |
| `showLevel`        | `boolean`                                                                                                      | Whether to show the student's level badge on the desk (default `true`).                                                                                                                                                                                                                                       |
| `nameDisplay`      | `"full" \| "firstName" \| "lastName"`                                                                          | Which part of the student's name to show on the desk (default `"full"`). Falls back to the full name for a roster entry that only has a pre-joined `name` (no `firstName`/`lastName` split to draw just one part from).                                                                                       |

### Methods

- `layout.ready` — `Promise` resolved once the initial load/render is done.
- `layout.getState()` — returns the current state (JSON-serializable object, see schema below).
- `layout.setState(state)` — replaces the state (object or JSON string) and re-renders.
- `layout.applyChange(fn)` — applies a pure `(state) => newState` transform (used internally, exposed for advanced use).
- `layout.print()` — opens the print / PDF export.
- `layout.destroy()` — detaches listeners, flushes any pending save, empties the container.

Pure model functions are also exported (`toggleDeskAt`, `rotateDeskAt`,
`toggleDeskStuckAt`, `setDeskHalfShiftAt`, `setDeskColorAt`, `assignStudentAt`, `unassignStudentAt`, `setBorderAt`,
`clearBorderAt`, `rotateBorderAt`, `flipBorderAt`, `isRoomEnclosed`, `fitGridToContentWithRing`,
`serializeState`, `deserializeState`, …) — see `src/model.js` — as is
`buildPrintSheet(state, {teacher, editableTeacherInputs, logoUrl, showLevel, nameDisplay, nameFit, levelFit, printOrientation, printPaper})`,
the detached DOM node used by `options.onPrint` (see `src/print.js`) — it
carries the resolved `printOrientation`/`printPaper` back on
`sheet.dataset` for a host driving its own PDF renderer — fully
styled outside of an actual browser print too (e.g. for `html2canvas`),
not just under `@media print`.

Desk name/level positioning needs each element's real rendered size
(offsetWidth/clientWidth), which only exists once it's connected to a live
document — `buildPrintSheet()`'s sheet is still detached when it's built, so
a host app driving its own capture off it (e.g. `html2canvas`, instead of
`printLayout()`/`options.onPrint`'s default) must call
`finalizeLayout(sheet)` itself, once the sheet is attached to the document
at its real final size, before capturing — otherwise names/badges are left
at their default, unpositioned spot. `printLayout()` already does this
internally.

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
      "stuck": false, // flush against its own "head" edge instead of the usual margin
      "halfShift": null, // "up" | "down" | "left" | "right" | null — shifted half a cell that direction, screen-absolute
      "color": "#e07a5f", // or "rgba(r,g,b,a)", or null
      "student": { "id": "1", "name": "Ada Lovelace", "level": "Grade 5" }, // or null
    },
  },
  "edges": {
    // horizontal borders: "h_{line 0..rows}_{col 0..cols-1}"
    // vertical borders:   "v_{row 0..rows-1}_{line 0..cols}"
    "h_0_2": {
      "type": "tableau", // "tableau" | "porte" | "fenetre" | "mur"
      "rotation": 0, // 0 | 180 — "changer le sens d'ouverture" (door only)
      "flip": false, // "retourner" — door or tableau, across the wall (independent of rotation)
    },
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
