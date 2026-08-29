import {
  cellKey,
  hEdgeKey,
  vEdgeKey,
  BORDER_TYPES,
  isRoomEnclosed,
} from "./model.js";
import { buildDeskSvg, buildBorderIcon, DESK_TOP_MARGIN } from "./svg.js";

// Screen-absolute — see setDeskHalfShiftAt (src/model.js) and the transform
// composition note in buildCell below.
const HALF_SHIFT_TRANSFORM = {
  up: "translateY(-50%)",
  down: "translateY(50%)",
  left: "translateX(-50%)",
  right: "translateX(50%)",
};

// The desk-top rect's own top-left corner (as currently displayed, reader's
// point of view), in the desk's *local* (pre-rotation) coordinates, given
// the rect's own top edge (`topMargin` — DESK_TOP_MARGIN normally, or 0
// when "stuck", see buildDeskSvg, src/svg.js). The rect is NOT centered in
// the 100×100 desk (chair below takes the rest), so rotating the desk
// doesn't just relabel which of ITS corners is "top-left on screen", it
// also *moves* that corner: at 90°/270° the rect becomes a vertical strip
// only half the desk's width, offset from the desk's own edge. Which local
// corner that is: 0°→the rect's own top-left, 90°→its bottom-left,
// 180°→its bottom-right, 270°→its top-right (each is the one that lands at
// screen-top-left once *that* rotation is applied — verified by rotating
// the rect's actual corners around the desk's center).
//
// Half the desk-top rect's own height (50, see buildDeskSvg, src/svg.js).
// The rect's local *center* — unlike a corner — never moves when the desk
// rotates: rotation pivots on the desk's own center, and any point rigidly
// attached to the desk keeps the same position *relative to that pivot*,
// so anchoring the student name at the rect's true local center (see
// buildCell below) keeps it centered on the plateau at every rotation, no
// per-rotation case-work needed.
const RECT_HALF_HEIGHT = 25;
function plateauTopLeftLocal(rotation, topMargin) {
  const bottom = topMargin + 50;
  switch (rotation) {
    case 90:
      return [0, bottom];
    case 180:
      return [100, bottom];
    case 270:
      return [100, topMargin];
    default:
      return [0, topMargin];
  }
}

/**
 * Positions the level badge so it sits just inside the desk-top rect's own
 * top-left corner (reader's point of view), whatever the desk's rotation —
 * called after the badge is in the DOM (so its real rendered size, which a
 * fixed percentage inset can't account for once a 90°/270° rotation makes
 * the rect only half the desk's width, is known).
 *
 * Method: since plateauTopLeftLocal always names the corner that lands at
 * screen-top-left, "inward" *on screen* from it is always the same fixed
 * direction — right and down — regardless of rotation, so the target
 * offset from that corner to the badge's center (margin + half its own
 * rendered size) is a plain, un-rotated screen-space vector. Rotating that
 * vector *backwards* by the desk's own rotation gives the matching offset
 * in the desk's local axes — added directly to the local corner (no
 * separate forward/inverse round-trip needed: rotating the corner forward
 * and then this whole sum backward is the identity on the corner, leaving
 * just the corner plus the backward-rotated offset).
 */
function positionLevelBadge(levelEl, deskSize, rotation, stuck) {
  const [cornerX, cornerY] = plateauTopLeftLocal(
    rotation,
    stuck ? 0 : DESK_TOP_MARGIN,
  );
  const margin = 4; // px
  const dx = margin + levelEl.offsetWidth / 2;
  const dy = margin + levelEl.offsetHeight / 2;

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Inverse of the desk's own forward rotation matrix [[cos,-sin],[sin,cos]].
  const localDx = cos * dx + sin * dy;
  const localDy = -sin * dx + cos * dy;

  const localCenterX = (cornerX / 100) * deskSize + localDx;
  const localCenterY = (cornerY / 100) * deskSize + localDy;

  const leftPx = localCenterX - levelEl.offsetWidth / 2;
  const topPx = localCenterY - levelEl.offsetHeight / 2;
  levelEl.style.left = `${(leftPx / deskSize) * 100}%`;
  levelEl.style.top = `${(topPx / deskSize) * 100}%`;
}

function el(tag, { className, attrs, text } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

// Shrinks the font size until the name fits — wrapping onto multiple lines
// is fine (see .cll-desk-name, style.css), so it's scrollHeight (against
// max-height) that matters once wrapped, not scrollWidth (bounded by
// max-width, which just controls *where* it wraps) — but a name with no
// wrap opportunity at all (one long word) can still overflow width too.
// `max` is a fixed standard size, not a per-name ceiling to grow into: a
// short name stays at `max`, never rendering larger than a neighboring
// desk's long, shrunk one — only ever shrinks down from it, never up.
function fitText(node, { max = 12, min = 7 } = {}) {
  let size = max;
  node.style.fontSize = `${size}px`;
  while (
    size > min &&
    (node.scrollWidth > node.clientWidth ||
      node.scrollHeight > node.clientHeight)
  ) {
    size -= 1;
    node.style.fontSize = `${size}px`;
  }
}

const LEVEL_FONT_MIN = 7;

function rectsOverlap(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

// The level badge keeps its own default size (.cll-desk-level, style.css)
// whenever there's room — a small or rotated desk can otherwise leave too
// little room for both it and the name at their own default sizes, so it
// only ever shrinks (never grows), down to LEVEL_FONT_MIN, until the two no
// longer overlap. getBoundingClientRect (not the local/percentage geometry
// positionLevelBadge itself works in) because both badge and name
// counter-rotate to stay upright (see buildCell) — their real screen boxes
// are plain axis-aligned rects, whatever the desk's own rotation.
// Re-positioned after each shrink step: positionLevelBadge anchors the
// badge by its own current rendered size, which just changed.
function avoidLevelNameOverlap(levelEl, nameEl, deskSize, rotation, stuck) {
  let size = parseFloat(getComputedStyle(levelEl).fontSize);
  while (
    size > LEVEL_FONT_MIN &&
    rectsOverlap(
      levelEl.getBoundingClientRect(),
      nameEl.getBoundingClientRect(),
    )
  ) {
    size -= 1;
    levelEl.style.fontSize = `${size}px`;
    positionLevelBadge(levelEl, deskSize, rotation, stuck);
  }
}

// nameDisplay: "full" (default) - firstName + lastName, or the roster's own
// pre-joined `name` if that's all it has; "firstName"/"lastName" - just that
// field when the student actually has it (assignStudentAt/studentPicker.js
// preserve firstName/lastName separately for exactly this), falling back to
// "full" behavior otherwise (e.g. a roster entry with only `.name`, no
// split fields, can't be trimmed to just one part of it).
function studentLabel(student, nameDisplay = "full") {
  if (!student) return "";
  if (nameDisplay === "firstName" && student.firstName)
    return student.firstName;
  if (nameDisplay === "lastName" && student.lastName) return student.lastName;
  if (student.name) return student.name;
  const parts = [student.firstName, student.lastName].filter(Boolean);
  return parts.join(" ");
}

function buildCell(row, col, cell, options) {
  const cellEl = el("div", {
    className: "cll-cell",
    attrs: { "data-row": row, "data-col": col },
  });

  if (cell) {
    const desk = el("div", {
      className: cell.stuck ? "cll-desk cll-desk--stuck" : "cll-desk",
    });
    // Rotate first (spins the desk in place, no displacement), *then* — if
    // halfShift is set — a fixed, screen-absolute half-cell translate
    // listed *before* the rotate: applied in the outer/parent frame, so it
    // moves the desk up/down/left/right on screen regardless of the desk's
    // own rotation (see setDeskHalfShiftAt, src/model.js). Independent of
    // `stuck` (a much smaller nudge baked into the drawing itself, see
    // buildDeskSvg in src/svg.js) — both can be on at once.
    const shift = HALF_SHIFT_TRANSFORM[cell.halfShift];
    desk.style.transform = shift
      ? `${shift} rotate(${cell.rotation}deg)`
      : `rotate(${cell.rotation}deg)`;
    // Read back by finalizeLayout below — it runs once the desk is
    // guaranteed to be connected to a live document (unlike here, where a
    // print sheet's grid is still detached, see buildPrintSheet/print.js),
    // when the `cell` object itself is out of scope.
    desk.dataset.rotation = cell.rotation;
    if (cell.stuck) desk.dataset.stuck = "1";
    if (cell.color) desk.style.setProperty("--cll-desk-color", cell.color);
    desk.appendChild(
      buildDeskSvg({ occupied: !!cell.student, stuck: !!cell.stuck }),
    );

    // Name/level are children of the (rotated) desk, not the cell, so their
    // position always tracks the desk's own drawing rather than the grid
    // cell — and each counter-rotates to stay upright and readable whatever
    // the desk's rotation.
    if (cell.student) {
      const level = cell.student.level ?? cell.student.niveau ?? "";
      if (level && options.showLevel !== false) {
        const levelEl = el("div", { className: "cll-desk-level", text: level });
        levelEl.style.transform = `rotate(${-cell.rotation}deg)`;
        desk.appendChild(levelEl);
        // Positioned by finalizeLayout below, not here: it needs the
        // badge's real rendered size (offsetWidth/Height), only available
        // once desk is connected to a live document — not yet the case
        // even for the interactive view (grid is still a detached
        // fragment at this point, see renderGrid).
      }
      const name = studentLabel(cell.student, options.nameDisplay);
      if (name) {
        const nameEl = el("div", { className: "cll-desk-name", text: name });
        const nameCenterY =
          (cell.stuck ? 0 : DESK_TOP_MARGIN) + RECT_HALF_HEIGHT;
        nameEl.style.top = `${nameCenterY}%`;
        nameEl.style.transform = `translate(-50%, -50%) rotate(${-cell.rotation}deg)`;
        desk.appendChild(nameEl);
        // Shrunk to fit by finalizeLayout below — same reason as the level
        // badge above (needs a real clientWidth/Height).
      }
    }
    cellEl.appendChild(desk);
    cellEl.classList.add("cll-cell--desk");
  } else {
    cellEl.classList.add("cll-cell--empty");
  }

  return cellEl;
}

function buildBorderZone(edgeKey, orientation, edge, geometry) {
  const zone = el("div", {
    className: `cll-edge cll-edge--${orientation}${edge ? " cll-edge--set" : ""}`,
    attrs: { "data-edge-key": edgeKey },
  });
  Object.assign(zone.style, geometry);
  if (edge) {
    zone.appendChild(
      buildBorderIcon(edge.type, orientation, edge.rotation, edge.flip),
    );
  }
  return zone;
}

// A border object claims the full width of the cell it's attached to, plus
// a spill of OVERFLOW into each of the two neighboring cells — it reads as
// an actual fixture on the wall, not a small marker on the grid line.
const EDGE_OVERFLOW = 0.05;

// The border icon's own SVG (buildBorderIcon, src/svg.js) is authored at a
// fixed LANE_LEN:LANE_THICK ratio (220:40 = 5.5:1) and stretched to fit its
// zone via preserveAspectRatio="none" — so that zone's own cross-axis size
// (thickness) has to stay a *fraction of the along-axis size* (~22%, i.e.
// close to 1/5.5), not a fixed pixel value: a fixed px thickness keeps the
// same absolute size as the grid (and so each cell) scales up or down, so
// the zone's aspect ratio drifts from 5.5:1 and the icon (door swing arc
// especially) stretches into a diagonal smear. Expressed here as a
// fraction of ONE row's height (h-edges) / one column's width (v-edges),
// matching how the along-axis width/height above are already computed.
const EDGE_THICKNESS = 0.22;

/**
 * Fully (re)builds the grid inside `container` from `state`. Rewrites the
 * whole DOM on every call: the grid stays small (a few dozen cells), so a
 * full re-render is simpler than diffing and still plenty fast.
 */
export function renderGrid(container, state, options = {}) {
  container.replaceChildren();

  const { cols, rows } = state.grid;
  const grid = el("div", { className: "cll-grid" });
  grid.classList.toggle("cll-grid--closed", isRoomEnclosed(state));
  grid.style.setProperty("--cll-cols", cols);
  grid.style.setProperty("--cll-rows", rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid.appendChild(buildCell(r, c, state.cells[cellKey(r, c)], options));
    }
  }

  for (let line = 0; line <= rows; line++) {
    for (let col = 0; col < cols; col++) {
      const key = hEdgeKey(line, col);
      grid.appendChild(
        buildBorderZone(key, "h", state.edges[key], {
          top: `${(line / rows) * 100}%`,
          left: `${((col - EDGE_OVERFLOW) / cols) * 100}%`,
          width: `${((1 + 2 * EDGE_OVERFLOW) / cols) * 100}%`,
          height: `${(EDGE_THICKNESS / rows) * 100}%`,
        }),
      );
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let line = 0; line <= cols; line++) {
      const key = vEdgeKey(row, line);
      grid.appendChild(
        buildBorderZone(key, "v", state.edges[key], {
          top: `${((row - EDGE_OVERFLOW) / rows) * 100}%`,
          left: `${(line / cols) * 100}%`,
          height: `${((1 + 2 * EDGE_OVERFLOW) / rows) * 100}%`,
          width: `${(EDGE_THICKNESS / cols) * 100}%`,
        }),
      );
    }
  }

  container.appendChild(grid);
  fitGridToHost(container, grid);
  finalizeLayout(grid, options);
  return grid;
}

/**
 * Explicitly sizes the grid, in pixels, to the largest square-celled box
 * that fits `container`'s own current box — CSS alone (width:100% +
 * aspect-ratio) only reliably keeps cells square when the container's own
 * rendered shape already happens to match cols:rows; a host app's own
 * layout (a dialog resized to some other shape, e.g.) can leave container
 * with an aspect ratio that doesn't, and aspect-ratio has no reliable
 * cross-browser way to "give way" on whichever axis turns out to be the
 * scarcer one once the other is otherwise constrained (verified against a
 * real reproduction of exactly that host layout, not guessed). A no-op
 * when container's own size doesn't add real information yet (e.g. a
 * detached node, or 0×0 before the browser has laid it out).
 *
 * Safe to call unconditionally, including with no real external
 * constraint (container sized by its own content, e.g. the module's own
 * demo, normal document flow): container's height there already comes
 * from the grid's own CSS-computed (already square) size, so the
 * recomputed cellSize matches what's already there — a harmless no-op.
 */
export function fitGridToHost(container, grid) {
  const cols = Number(grid.style.getPropertyValue("--cll-cols"));
  const rows = Number(grid.style.getPropertyValue("--cll-rows"));
  const hostWidth = container.clientWidth;
  const hostHeight = container.clientHeight;
  if (!cols || !rows || !hostWidth || !hostHeight) return;

  const cellSize = Math.min(hostWidth / cols, hostHeight / rows);
  grid.style.width = `${cellSize * cols}px`;
  grid.style.height = `${cellSize * rows}px`;
}

/**
 * Finishes desk-label positioning that needs each element's real rendered
 * size (positionLevelBadge, fitText) — meaningless on a node not connected
 * to a live document (offsetWidth/clientWidth read 0), so a no-op there.
 * renderGrid above already calls this once, which is everything the
 * interactive view (ClassroomLayout) needs: its container is attached to
 * the page *before* renderGrid ever runs (see #buildDom/#render,
 * src/index.js), so this first pass already measures correctly.
 *
 * A host app rendering its own print/PDF sheet (buildPrintSheet, not yet
 * attached anywhere when renderGrid runs inside it — see src/print.js)
 * must call this a second time itself, once it has attached that sheet to
 * a live document at its own final size: printLayout() below does exactly
 * that before window.print(), and any host app driving e.g. html2canvas
 * off buildPrintSheet() directly needs to do the same before capturing
 * (see README, "Printing your own way").
 */
export function finalizeLayout(root, options = {}) {
  for (const desk of root.querySelectorAll(".cll-desk")) {
    const rotation = Number(desk.dataset.rotation ?? 0);
    const stuck = desk.dataset.stuck === "1";
    const levelEl = desk.querySelector(".cll-desk-level");
    if (levelEl) positionLevelBadge(levelEl, desk.clientWidth, rotation, stuck);
    const nameEl = desk.querySelector(".cll-desk-name");
    if (nameEl) fitText(nameEl, options.nameFit);
    if (levelEl && nameEl) {
      avoidLevelNameOverlap(levelEl, nameEl, desk.clientWidth, rotation, stuck);
    }
  }
}

// plateauTopLeftLocal/rectsOverlap are exported for unit testing (see
// tests/render.test.js) — the geometry they compute is otherwise only
// observable through actual browser layout (levelEl.offsetWidth/Height,
// getBoundingClientRect), which jsdom doesn't provide.
export {
  BORDER_TYPES,
  plateauTopLeftLocal,
  positionLevelBadge,
  rectsOverlap,
  studentLabel,
};
