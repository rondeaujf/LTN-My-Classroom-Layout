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

// Board (whiteboard on an easel), viewed face-on.
function buildTableauIcon(g) {
  g.appendChild(
    el("rect", {
      x: 4,
      y: 6,
      width: 24,
      height: 15,
      rx: 1.5,
      class: "cll-border-icon-fill",
    }),
  );
  g.appendChild(
    el("line", { x1: 9, y1: 21, x2: 6, y2: 27, class: "cll-border-icon-path" }),
  );
  g.appendChild(
    el("line", {
      x1: 23,
      y1: 21,
      x2: 26,
      y2: 27,
      class: "cll-border-icon-path",
    }),
  );
  g.appendChild(
    el("line", {
      x1: 6,
      y1: 27,
      x2: 26,
      y2: 27,
      class: "cll-border-icon-path",
    }),
  );
}

// Window with a 4-pane cross divider.
function buildFenetreIcon(g) {
  g.appendChild(
    el("rect", {
      x: 4,
      y: 4,
      width: 24,
      height: 24,
      rx: 1,
      class: "cll-border-icon-fill",
    }),
  );
  g.appendChild(
    el("line", {
      x1: 16,
      y1: 4,
      x2: 16,
      y2: 28,
      class: "cll-border-icon-path",
    }),
  );
  g.appendChild(
    el("line", {
      x1: 4,
      y1: 16,
      x2: 28,
      y2: 16,
      class: "cll-border-icon-path",
    }),
  );
}

// Door ajar (standard architectural swing symbol): a baseline for the wall
// opening, a hinge dot at one end, the leaf swung open at ~55°, and a
// dashed arc tracing its sweep from the closed (flat) position to the open
// one. Rotation (0/180, cf. rotateBorderAt in src/model.js) flips which
// side it opens from.
function buildPorteIcon(g) {
  g.appendChild(
    el("line", {
      x1: 4,
      y1: 26,
      x2: 28,
      y2: 26,
      class: "cll-border-icon-path",
    }),
  );
  g.appendChild(
    el("path", {
      d: "M26 26 A20 20 0 0 0 17.5 9.6",
      class: "cll-border-icon-arc",
    }),
  );
  g.appendChild(
    el("line", {
      x1: 6,
      y1: 26,
      x2: 17.5,
      y2: 9.6,
      class: "cll-border-icon-leaf",
    }),
  );
  g.appendChild(
    el("circle", { cx: 6, cy: 26, r: 1.8, class: "cll-border-icon-hinge" }),
  );
}

const ICON_BUILDERS = {
  tableau: buildTableauIcon,
  porte: buildPorteIcon,
  fenetre: buildFenetreIcon,
};

export function buildBorderIcon(type) {
  const svg = el("svg", {
    viewBox: "0 0 32 32",
    class: `cll-border-icon cll-border-icon--${type}`,
    "aria-hidden": "true",
  });
  ICON_BUILDERS[type](svg);
  return svg;
}
