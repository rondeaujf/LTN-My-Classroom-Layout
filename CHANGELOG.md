# Changelog

All notable changes to `ltn-classroom-layout`. Versions ≤ 1.2.0 were consumed
via a GitHub tag (`github:rondeaujf/LTN-My-Classroom-Layout#vX.Y.Z`); 1.2.1 is
the first release on the npm registry.

## 1.3.1

- Docs only: `homepage` now points to the live demo
  (<https://jfrondeau.fr/projects/classroom-layout/>); README gains a
  demo / repository link line. No runtime change.

## 1.3.0

- `options.pdfChrome` (default `true`) / `buildPrintSheet(state, { chrome })`
  — set `false` to drop the module's own school/teacher/meta banner and logo
  footer, so a host can wrap the bare captured grid in its own
  header/footer (e.g. a server-side PDF pipeline). The `onPrint` payload
  gains a `chrome` key. No change to the default standalone export.

## 1.2.1

- First public npm release. Added `LICENSE`, this changelog, and package
  metadata (`repository`, `homepage`, `bugs`, `engines`, `publishConfig`,
  `sideEffects`, `prepublishOnly`). No runtime change.

## 1.2.0

- `options.toolbar` — `true` (default) | `false` (no toolbar) |
  `{subtitle?, settings?, print?}` to hide only some parts.
- Full API parity with the built-in toolbar: `settings` getter,
  `setSettings(patch)`, `setZoom(z)` / `resetZoom()`, `setSubtitle(text)`,
  `unassignAllStudents()`, `clearLayout()`.

## 1.1.1

- "Paramètres" panel gains an **Actions** row: JSON export/import with a
  scope (`both` / `students` / `layout`) via `exportJsonPayload(scope)` /
  `importJson(input, scope)`; "Désaffecter les élèves"; "Effacer tout".
- New model function `unassignAllStudents`.
- Demo roster: the 1927 Solvay Conference participants.

## 1.1.0

- **Round / oval tables** (`state.tables`): 1-cell table from a cell's
  right-click menu, bigger tables by click-dragging a rectangle of empty
  cells (square footprint → round, elongated → oval). One label + one level
  badge per table, like a desk. `createTableAt` / `removeTableAt` /
  `setTableColorAt` / `setTableStudentAt` model functions.

## 1.0.8

- **Wheel zoom** over the grid, toward the cell under the pointer; zoom-out
  floors at the fitted "empty ring" view. `layout.zoom` getter.
- **"Paramètres" panel** in the toolbar (session-only, not persisted):
  print orientation, name display, level-badge toggle, editable-borders
  toggle, desk-name font size.
- Desk/badge font floor lowered from 7 to 5.
- `studentLabel` now whitespace-splits a pre-joined `name` when there is no
  explicit `firstName`/`lastName`.

## 1.0.7

- Five print / layout options: `levelFit`, `printOrientation`, `printPaper`,
  `editableBorders`; `nameFit` now also reaches the print path. `onPrint`
  payload carries the print settings.

## 1.0.6

- Level badges hidden by default option, first-name-only display option,
  guaranteed square cells.

## ≤ 1.0.5

- Initial module: desk grid, rotation/color/stick/half-shift, student
  assignment, border objects (wall/board/door/window), print / PDF export,
  persistence adapter.
