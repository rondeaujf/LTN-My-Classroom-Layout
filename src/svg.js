const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// How far the whole desk (top + chair + figure) sits from the cell's own
// top edge by default — also how far it shifts up when "stuck" to it.
// Exported so render.js can shift the level badge by the same amount, in
// the same local (pre-rotation) direction, when the desk is stuck.
export const DESK_TOP_MARGIN = 8;

// Desk seen from above, chair against the "south" edge (before rotation).
// Desk rotation spins this whole SVG via CSS; the student label is rendered
// separately on top so it stays readable at any rotation (see render.js).
// `stuck` pushes the whole desk flush against its own "head" edge (see
// toggleDeskStuckAt in src/model.js) instead of leaving the usual margin —
// rotation (a CSS transform on the container, not this drawing) then takes
// that local "up" edge to whichever screen edge the desk currently faces.
export function buildDeskSvg({ occupied, stuck }) {
  const svg = el("svg", {
    viewBox: "0 0 100 100",
    class: "cll-desk-svg",
    "aria-hidden": "true",
  });
  const dy = stuck ? -DESK_TOP_MARGIN : 0;

  // Full width (x:0, width:100), edge-to-edge with the cell: desks placed
  // side by side butt up against each other with no gap, to read as one
  // large table. Width:height is exactly 2:1 (100:50) — a desk rotated 90°
  // then keeps that same clean half-cell proportion, so alignment (edge to
  // edge, or the half-cell shift, see setDeskHalfShiftAt) still lines up.
  svg.appendChild(
    el("rect", {
      x: 0,
      y: DESK_TOP_MARGIN + dy,
      width: 100,
      height: 50,
      rx: 5,
      class: "cll-desk-top",
    }),
  );

  svg.appendChild(
    el("rect", {
      x: 33,
      y: 68 + dy,
      width: 34,
      height: 22,
      rx: 8,
      class: "cll-desk-chair",
    }),
  );

  if (occupied) {
    svg.appendChild(
      el("ellipse", {
        cx: 50,
        cy: 84 + dy,
        rx: 15,
        ry: 10,
        class: "cll-figure",
      }),
    );
    svg.appendChild(
      el("circle", { cx: 50, cy: 74 + dy, r: 9, class: "cll-figure" }),
    );
  }

  return svg;
}

// Round / oval table seen from above. Authored in a 0..100 square; the host
// element (see renderGrid, src/render.js) is sized to the table's cell
// footprint and stretches this via preserveAspectRatio="none" — so a square
// footprint stays a circle and a w≠h footprint becomes the matching oval,
// no per-shape geometry needed here. `shape` only drives the class. Unlike a
// desk it has no chair — a single seated figure marks it when occupied.
export function buildTableSvg({ occupied, shape }) {
  const svg = el("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    class: `cll-table-svg cll-table-svg--${shape === "round" ? "round" : "oval"}`,
    "aria-hidden": "true",
  });
  svg.appendChild(
    el("ellipse", { cx: 50, cy: 50, rx: 47, ry: 47, class: "cll-table-top" }),
  );
  svg.appendChild(
    el("ellipse", { cx: 50, cy: 50, rx: 41, ry: 41, class: "cll-table-inner" }),
  );
  if (occupied) {
    svg.appendChild(
      el("ellipse", { cx: 50, cy: 56, rx: 13, ry: 9, class: "cll-figure" }),
    );
    svg.appendChild(
      el("circle", { cx: 50, cy: 46, r: 8, class: "cll-figure" }),
    );
  }
  return svg;
}

// Border objects (tableau/porte/fenetre) are drawn on a wide "lane" — the
// full width of the border segment they occupy (see render.js: the edge
// zone itself is widened to spill ~5% into each neighboring cell) — always
// authored in this local, horizontal-lane coordinate system:
//   x: 0 (left) .. LANE_LEN (right), along the wall
//   y: 0 (top)  .. LANE_THICK (bottom), across the wall's thickness
// `localPoint` maps a local (x, y) to actual SVG coordinates: unchanged for
// a horizontal border, transposed (x<->y, a reflection) for a vertical one
// — so the same authored coordinates work for both orientations without
// needing a runtime CSS rotation (which would fight the SVG's own
// viewBox-fitting). `mirrorX` (door: "change opening side") flips the lane
// along its length; `mirrorY` (tableau: "retourner") flips it across its
// thickness, i.e. which face of the wall the detail sits on.
const LANE_LEN = 220;
const LANE_THICK = 40;
// Dead center of the lane: the actual cell border the wall line must sit on
// so every border type (and the door's own threshold) lines up with it.
const WALL_Y = LANE_THICK / 2;

function localPoint(
  orientation,
  { mirrorX = false, mirrorY = false } = {},
  x,
  y,
) {
  const lx = mirrorX ? LANE_LEN - x : x;
  const ly = mirrorY ? LANE_THICK - y : y;
  return orientation === "v" ? [ly, lx] : [lx, ly];
}

function laneLine(orientation, xform, x1, y1, x2, y2, className) {
  const [ax, ay] = localPoint(orientation, xform, x1, y1);
  const [bx, by] = localPoint(orientation, xform, x2, y2);
  return el("line", { x1: ax, y1: ay, x2: bx, y2: by, class: className });
}

function laneCircle(orientation, xform, cx, cy, r, className) {
  const [x, y] = localPoint(orientation, xform, cx, cy);
  return el("circle", { cx: x, cy: y, r, class: className });
}

// A quarter-circle-ish arc between two local points, radius r. Each
// reflection (mirrorX, mirrorY, or the 'v' transpose) independently flips
// which way the arc bulges — sweep is toggled once per reflection to keep
// it curving the correct way in every combination.
function laneArc(orientation, xform, x1, y1, x2, y2, r, className) {
  const [sx, sy] = localPoint(orientation, xform, x1, y1);
  const [ex, ey] = localPoint(orientation, xform, x2, y2);
  const flips =
    (xform.mirrorX ? 1 : 0) +
    (xform.mirrorY ? 1 : 0) +
    (orientation === "v" ? 1 : 0);
  const sweep = flips % 2;
  return el("path", {
    d: `M${sx} ${sy} A${r} ${r} 0 0 ${sweep} ${ex} ${ey}`,
    class: className,
  });
}

// The wall line itself: a solid line, seen edge-on from above, dead-center
// on the cell border (WALL_Y). Used standalone as the "mur" border object,
// and as the base tableau/porte draw their own detail on top of (a board or
// a door is set INTO a wall, so its own line sits at the same position).
function buildWallLine(g, orientation) {
  g.appendChild(
    laneLine(orientation, {}, 6, WALL_Y, 214, WALL_Y, "cll-border-icon-wall"),
  );
}

// Plain wall segment: just the wall line, no further detail.
function buildMurIcon(g, orientation) {
  buildWallLine(g, orientation);
}

// Board: the wall line itself, plus a thinner line offset to one side for
// the chalk tray — no color fill. `flip` ("retourner le tableau") moves the
// tray to the other face of the wall.
function buildTableauIcon(g, orientation, flip) {
  buildWallLine(g, orientation);
  const mirrorY = !!flip;
  g.appendChild(
    laneLine(
      orientation,
      { mirrorY },
      6,
      WALL_Y + 9,
      214,
      WALL_Y + 9,
      "cll-border-icon-path",
    ),
  );
}

// Window: the same width as the wall, but translucent (the glazed opening),
// with a thin solid line down the middle (the frame's center mullion).
function buildFenetreIcon(g, orientation) {
  g.appendChild(
    laneLine(orientation, {}, 6, WALL_Y, 214, WALL_Y, "cll-border-icon-window"),
  );
  g.appendChild(
    laneLine(
      orientation,
      {},
      6,
      WALL_Y,
      214,
      WALL_Y,
      "cll-border-icon-window-mullion",
    ),
  );
}

// Door ajar: the standard architectural symbol — leaf hinged near one end,
// spanning most of the opening's width, swung open with the swept arc
// tracing its path back to the closed position (flat along the wall). A
// real door swung this wide reaches well beyond the wall's own thickness —
// the icon is allowed to overflow its lane for that (see
// .cll-border-icon, style.css) rather than being squashed to fit it.
// `rotation` (0/180, see rotateBorderAt in src/model.js) mirrors the whole
// symbol along the wall — "changer le sens d'ouverture", which end the
// hinge is on. `flip` (see flipBorderAt) mirrors it across the wall's
// thickness — "retourner la porte" (like the tableau), which room it swings
// into. The two are independent and combine freely.
function buildPorteIcon(g, orientation, rotation, flip) {
  buildWallLine(g, orientation);
  const xform = { mirrorX: rotation === 180, mirrorY: !!flip };
  const hinge = [10, WALL_Y];
  // Leaf length fixes the swing radius; closed (flat along the wall) and
  // open (30° from the wall) are both that same distance from the hinge, so
  // the leaf and the arc tracing its sweep stay geometrically consistent.
  // Sized to span nearly the full wall segment lengthwise (x stays within
  // the lane, 10..~202 of 0..220) — only the swing itself (y) overflows the
  // lane's thickness, which is expected: a real door open this wide reaches
  // well past the wall into the room.
  const leafLength = 192;
  const openAngleDeg = 30;
  const rad = (openAngleDeg * Math.PI) / 180;
  const closed = [hinge[0] + leafLength, WALL_Y];
  const open = [
    hinge[0] + leafLength * Math.cos(rad),
    WALL_Y - leafLength * Math.sin(rad),
  ];
  g.appendChild(
    laneArc(
      orientation,
      xform,
      ...closed,
      ...open,
      leafLength,
      "cll-border-icon-arc",
    ),
  );
  g.appendChild(
    laneLine(orientation, xform, ...hinge, ...open, "cll-border-icon-leaf"),
  );
  g.appendChild(
    laneCircle(orientation, xform, ...hinge, 2.5, "cll-border-icon-hinge"),
  );
}

export function buildBorderIcon(
  type,
  orientation = "h",
  rotation = 0,
  flip = false,
) {
  const viewBox =
    orientation === "v"
      ? `0 0 ${LANE_THICK} ${LANE_LEN}`
      : `0 0 ${LANE_LEN} ${LANE_THICK}`;
  const svg = el("svg", {
    viewBox,
    preserveAspectRatio: "none",
    class: `cll-border-icon cll-border-icon--${type}`,
    "aria-hidden": "true",
  });
  if (type === "tableau") buildTableauIcon(svg, orientation, flip);
  else if (type === "fenetre") buildFenetreIcon(svg, orientation);
  else if (type === "mur") buildMurIcon(svg, orientation);
  else buildPorteIcon(svg, orientation, rotation, flip);
  return svg;
}

// Small line-icons for context menu entries (one icon per menu item, cf.
// src/interactions.js) — sober glyphs in the same spirit as the rest of the
// module, so the menus feel consistent with a host site's own icon set
// without the module actually depending on any of its assets.
const MENU_ICON_PATHS = {
  plus: [
    { tag: "line", attrs: { x1: 8, y1: 3, x2: 8, y2: 13 } },
    { tag: "line", attrs: { x1: 3, y1: 8, x2: 13, y2: 8 } },
  ],
  rotate: [
    {
      tag: "path",
      attrs: { d: "M12.8 5.2A5.5 5.5 0 1 0 13.4 10.2", fill: "none" },
    },
    { tag: "polygon", attrs: { points: "12,2.3 15.3,4.6 11.7,6.6" } },
  ],
  palette: [
    { tag: "circle", attrs: { cx: 8, cy: 8.5, r: 5.5, fill: "none" } },
    { tag: "circle", attrs: { cx: 6, cy: 6.7, r: 1.1 } },
    { tag: "circle", attrs: { cx: 10.3, cy: 6.7, r: 1.1 } },
    { tag: "circle", attrs: { cx: 8, cy: 11, r: 1.1 } },
  ],
  personPlus: [
    { tag: "circle", attrs: { cx: 6, cy: 5.3, r: 2.3, fill: "none" } },
    {
      tag: "path",
      attrs: { d: "M1.5 13.5c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5", fill: "none" },
    },
    { tag: "line", attrs: { x1: 12.5, y1: 4.5, x2: 12.5, y2: 9.5 } },
    { tag: "line", attrs: { x1: 10, y1: 7, x2: 15, y2: 7 } },
  ],
  dock: [
    { tag: "line", attrs: { x1: 2, y1: 3, x2: 14, y2: 3 } },
    {
      tag: "rect",
      attrs: { x: 5, y: 4, width: 6, height: 7, rx: 1, fill: "none" },
    },
  ],
  arrowUp: [
    { tag: "line", attrs: { x1: 8, y1: 13, x2: 8, y2: 4 } },
    { tag: "polygon", attrs: { points: "8,2 4.5,7 11.5,7" } },
  ],
  arrowDown: [
    { tag: "line", attrs: { x1: 8, y1: 3, x2: 8, y2: 12 } },
    { tag: "polygon", attrs: { points: "8,14 4.5,9 11.5,9" } },
  ],
  arrowLeft: [
    { tag: "line", attrs: { x1: 13, y1: 8, x2: 4, y2: 8 } },
    { tag: "polygon", attrs: { points: "2,8 7,4.5 7,11.5" } },
  ],
  arrowRight: [
    { tag: "line", attrs: { x1: 3, y1: 8, x2: 12, y2: 8 } },
    { tag: "polygon", attrs: { points: "14,8 9,4.5 9,11.5" } },
  ],
  trash: [
    { tag: "line", attrs: { x1: 3.5, y1: 4.5, x2: 12.5, y2: 4.5 } },
    { tag: "path", attrs: { d: "M6 4.5V2.5h4v2", fill: "none" } },
    {
      tag: "path",
      attrs: { d: "M4.5 4.5 5.1 13.5h5.8l0.6-9", fill: "none" },
    },
    { tag: "line", attrs: { x1: 6.5, y1: 6.5, x2: 6.5, y2: 11.5 } },
    { tag: "line", attrs: { x1: 9.5, y1: 6.5, x2: 9.5, y2: 11.5 } },
  ],
};

export function buildMenuIcon(name) {
  const shapes = MENU_ICON_PATHS[name];
  if (!shapes) return null;
  const svg = el("svg", {
    viewBox: "0 0 16 16",
    class: `cll-menu-icon cll-menu-icon--${name}`,
    "aria-hidden": "true",
  });
  shapes.forEach(({ tag, attrs }) => svg.appendChild(el(tag, attrs)));
  return svg;
}
