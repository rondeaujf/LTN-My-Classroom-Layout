const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Bureau vu de dessus, chaise contre le bord "sud" (avant rotation). La
// rotation du bureau tourne ce SVG entier via CSS ; le texte élève est
// rendu séparément par-dessus pour rester toujours lisible (cf. render.js).
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

const BORDER_ICON_PATHS = {
  tableau: "M6 8h20v12H6zM10 20v3M22 20v3M8 23h16", // tableau + pieds
  porte: "M6 4h16v24H6zM6 16h2", // porte + poignée
  fenetre: "M4 4h24v24H4zM16 4v24M4 16h24", // fenêtre à croisillons
};

export function buildBorderIcon(type) {
  const svg = el("svg", {
    viewBox: "0 0 32 32",
    class: `cll-border-icon cll-border-icon--${type}`,
    "aria-hidden": "true",
  });
  svg.appendChild(
    el("path", { d: BORDER_ICON_PATHS[type], class: "cll-border-icon-path" }),
  );
  return svg;
}
