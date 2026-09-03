# Changelog

All notable changes to `ltn-classroom-layout`. Versions ≤ 1.2.0 were consumed
via a GitHub tag (`github:rondeaujf/LTN-My-Classroom-Layout#vX.Y.Z`); 1.2.1 is
the first release on the npm registry.

## 1.4.4

- Fix: the toolbar's "Paramètres" panel actions **Importer (JSON)**,
  **Désaffecter les élèves** and **Effacer tout** applied immediately —
  irreversible, and auto-saved to the host's persistence within ~300ms
  (`applyChange` → debounced `save`) — with no confirmation. A stray click,
  or importing the wrong file, silently overwrote the host's saved layout.
  All three now ask `window.confirm()` first (new i18n keys
  `confirmImportJson`/`confirmUnassignAll`/`confirmClearAll`, all locales) and
  no-op if declined. The public API (`importJson`/`unassignAllStudents`/
  `clearLayout`, used when `options.toolbar` is customized) is unchanged — a
  host driving its own UI keeps full control over confirmation.

## 1.4.3

- Fix: `printLayout()` (the built-in browser-print path, no host `onPrint`)
  produced a grid far bigger than one page on a large screen — a
  content-cropped plan (few desks → e.g. a 1×1 grid) rendered at
  `width: 100%` of the viewport, and `aspect-ratio` then overflowed the page
  height, so one desk ≈ one page. `printLayout()` now sizes the grid to the
  page's printable area (paper + orientation − `@page` margin) via
  `fitGridToHost`, exactly like the interactive view does for its host box —
  the plan always fits one page. Host-driven capture (`options.onPrint` /
  `buildPrintSheet()` + html2canvas) is unchanged. `printableAreaPx()` is
  exported.

## 1.4.2

- Fix (follow-up to 1.4.1): the toolbar also grew/shifted **sideways** on
  wheel zoom. `.cll-root` and `.cll-grid-host` now set `min-width: 0` (not
  just `min-height: 0`), so a `.cll-grid` sized past its box by
  `fitGridToHost * zoom` is clipped/panned by `.cll-grid-host` instead of
  forcing its intrinsic width onto `.cll-root` (flexbox `min-*: auto`). The
  toolbar keeps `.cll-root`'s stable width.

## 1.4.1

- Fix: the toolbar (subtitle / "Settings" / print) could scroll out of view
  when the mouse-wheel zoom grew the grid past its box. `.cll-root` is now a
  flex column owned by the module — toolbar pinned (`flex: 0 0 auto`), only
  `.cll-grid-host` scrolls/pans. Hosts that already wrapped the module in
  their own height-constrained flex column are unaffected; the print sheet
  (`.cll-print-grid-host`) opts back out to plain block flow.

## 1.4.0

- `options.locale` (`"fr"` default — unchanged behaviour for existing hosts).
  Localizes every built-in UI string: the toolbar and its "Settings" panel,
  the desk / border / table context menus, the student and colour pickers,
  the "add a label" dialog, and the blank school / teacher lines of the
  print sheet. Bundled locales: `fr`, `en`, `de`, `es`, `it`, `zh`; an
  unknown locale (or a missing key) falls back to French.
  `new ClassroomLayout(el, { locale: "en" })`; `buildPrintSheet(state, { locale })`
  for a host driving its own PDF. No new dependency.

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
