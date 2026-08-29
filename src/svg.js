const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Desk seen from above, chair against the "south" edge (before rotation).
// Desk rotation spins this whole SVG via CSS; the student label is rendered
// separately on top so it stays readable at any rotation (see render.js).
export function buildDeskSvg({ occupied }) {
  const svg = el("svg", {
    viewBox: "0 0 100 100",
    class: "cll-desk-svg",
    "aria-hidden": "true",
  });

  svg.appendChild(
    el("rect", {
      x: 8,
      y: 8,
      width: 84,
      height: 58,
      rx: 5,
      class: "cll-desk-top",
    }),
  );

  svg.appendChild(
    el("rect", {
      x: 33,
      y: 68,
      width: 34,
      height: 22,
      rx: 8,
      class: "cll-desk-chair",
    }),
  );

  if (occupied) {
    svg.appendChild(
      el("ellipse", { cx: 50, cy: 84, rx: 15, ry: 10, class: "cll-figure" }),
    );
    svg.appendChild(
      el("circle", { cx: 50, cy: 74, r: 9, class: "cll-figure" }),
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
// viewBox-fitting). `mirror` (only used by the door) additionally flips the
// lane along its length, for "change opening side".
const LANE_LEN = 220;
const LANE_THICK = 40;

function localPoint(orientation, mirror, x, y) {
  const lx = mirror ? LANE_LEN - x : x;
  return orientation === "v" ? [y, lx] : [lx, y];
}

function laneLine(orientation, mirror, x1, y1, x2, y2, className) {
  const [ax, ay] = localPoint(orientation, mirror, x1, y1);
  const [bx, by] = localPoint(orientation, mirror, x2, y2);
  return el("line", { x1: ax, y1: ay, x2: bx, y2: by, class: className });
}

function laneCircle(orientation, mirror, cx, cy, r, className) {
  const [x, y] = localPoint(orientation, mirror, cx, cy);
  return el("circle", { cx: x, cy: y, r, class: className });
}

// A quarter-circle-ish arc between two local points, radius r. Both a
// mirror and a 'v' transpose are reflections, so each independently flips
// which way the arc bulges — sweep is toggled once per reflection to keep
// it curving the correct way in every combination.
function laneArc(orientation, mirror, x1, y1, x2, y2, r, className) {
  const [sx, sy] = localPoint(orientation, mirror, x1, y1);
  const [ex, ey] = localPoint(orientation, mirror, x2, y2);
  const flips = (mirror ? 1 : 0) + (orientation === "v" ? 1 : 0);
  const sweep = flips % 2;
  return el("path", {
    d: `M${sx} ${sy} A${r} ${r} 0 0 ${sweep} ${ex} ${ey}`,
    class: className,
  });
}

function laneRectOutline(orientation, x, y, w, h, className) {
  const isV = orientation === "v";
  return el("rect", {
    x: isV ? y : x,
    y: isV ? x : y,
    width: isV ? h : w,
    height: isV ? w : h,
    class: className,
  });
}

// Board: just a solid line (seen edge-on, from above) with a small outlined
// rectangle for the chalk tray — per spec, no color fill, kept minimal.
function buildTableauIcon(g, orientation) {
  g.appendChild(
    laneLine(orientation, false, 6, 20, 214, 20, "cll-border-icon-board"),
  );
  g.appendChild(
    laneRectOutline(orientation, 98, 22, 24, 7, "cll-border-icon-path"),
  );
}

// Window: a set of parallel lines across the wall gap — the standard
// top-down "glazed opening" pictogram.
function buildFenetreIcon(g, orientation) {
  [8, 20, 32].forEach((y) => {
    g.appendChild(
      laneLine(orientation, false, 6, y, 214, y, "cll-border-icon-path"),
    );
  });
}

// Door ajar: a threshold line spanning the opening, a hinge dot near one
// end, the leaf swung open at ~55°, and a dashed arc tracing its sweep.
// `rotation` (0/180, see rotateBorderAt in src/model.js) mirrors the whole
// symbol along the wall to flip which side it opens from.
function buildPorteIcon(g, orientation, rotation) {
  const mirror = rotation === 180;
  g.appendChild(
    laneLine(orientation, false, 6, 34, 214, 34, "cll-border-icon-path"),
  );
  g.appendChild(
    laneArc(orientation, mirror, 50, 34, 37, 9, 30, "cll-border-icon-arc"),
  );
  g.appendChild(
    laneLine(orientation, mirror, 20, 34, 37, 9, "cll-border-icon-leaf"),
  );
  g.appendChild(
    laneCircle(orientation, mirror, 20, 34, 2.2, "cll-border-icon-hinge"),
  );
}

export function buildBorderIcon(type, orientation = "h", rotation = 0) {
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
  if (type === "tableau") buildTableauIcon(svg, orientation);
  else if (type === "fenetre") buildFenetreIcon(svg, orientation);
  else buildPorteIcon(svg, orientation, rotation);
  return svg;
}
