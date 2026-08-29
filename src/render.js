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
function fitText(node, { max = 15, min = 7 } = {}) {
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

function studentLabel(student) {
  if (!student) return "";
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
      if (level) {
        const levelEl = el("div", { className: "cll-desk-level", text: level });
        levelEl.style.transform = `rotate(${-cell.rotation}deg)`;
        desk.appendChild(levelEl);
        // Deferred: needs the badge's real rendered size (offsetWidth/
        // Height), only available once it's actually laid out in the DOM.
        requestAnimationFrame(() =>
          positionLevelBadge(
            levelEl,
            desk.clientWidth,
            cell.rotation,
            !!cell.stuck,
          ),
        );
      }
      const name = studentLabel(cell.student);
      if (name) {
        const nameEl = el("div", { className: "cll-desk-name", text: name });
        const nameCenterY =
          (cell.stuck ? 0 : DESK_TOP_MARGIN) + RECT_HALF_HEIGHT;
        nameEl.style.top = `${nameCenterY}%`;
        nameEl.style.transform = `translate(-50%, -50%) rotate(${-cell.rotation}deg)`;
        desk.appendChild(nameEl);
        // Deferred measurement: the node must be in the DOM for a real
        // clientWidth.
        requestAnimationFrame(() => fitText(nameEl, options.nameFit));
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
  return grid;
}

// plateauTopLeftLocal is exported for unit testing (see tests/render.test.js)
// — the geometry they compute is otherwise only observable through actual
// browser layout (levelEl.offsetWidth/Height), which jsdom doesn't provide.
export { BORDER_TYPES, plateauTopLeftLocal, positionLevelBadge };
