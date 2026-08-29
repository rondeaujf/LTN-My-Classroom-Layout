import { cellKey, hEdgeKey, vEdgeKey, BORDER_TYPES } from "./model.js";
import { buildDeskSvg, buildBorderIcon } from "./svg.js";

function el(tag, { className, attrs, text } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

// Réduit la taille de police jusqu'à ce que le nom tienne sur une ligne
// sans déborder du bureau (contrainte du cahier des charges : "taille max
// sans dépasser").
function fitText(node, { max = 15, min = 7 } = {}) {
  let size = max;
  node.style.fontSize = `${size}px`;
  while (size > min && node.scrollWidth > node.clientWidth) {
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
    const desk = el("div", { className: "cll-desk" });
    desk.style.transform = `rotate(${cell.rotation}deg)`;
    if (cell.color) desk.style.setProperty("--cll-desk-color", cell.color);
    desk.appendChild(buildDeskSvg({ occupied: !!cell.student }));
    cellEl.appendChild(desk);

    if (cell.student) {
      const level = cell.student.level ?? cell.student.niveau ?? "";
      if (level) {
        cellEl.appendChild(
          el("div", { className: "cll-desk-level", text: level }),
        );
      }
      const name = studentLabel(cell.student);
      if (name) {
        const nameEl = el("div", { className: "cll-desk-name", text: name });
        cellEl.appendChild(nameEl);
        // Mesure différée : le nœud doit être dans le DOM (clientWidth réel).
        requestAnimationFrame(() => fitText(nameEl, options.nameFit));
      }
    }
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
  if (edge) zone.appendChild(buildBorderIcon(edge.type));
  return zone;
}

/**
 * (Re)construit entièrement la grille dans `container` à partir de `state`.
 * Ré-écrit tout le DOM à chaque appel : la grille reste petite (quelques
 * dizaines de cases), un re-render complet est plus simple qu'un diff et
 * reste largement assez rapide.
 */
export function renderGrid(container, state, options = {}) {
  container.replaceChildren();

  const { cols, rows } = state.grid;
  const grid = el("div", { className: "cll-grid" });
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
          left: `${(col / cols) * 100}%`,
          width: `${(1 / cols) * 100}%`,
        }),
      );
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let line = 0; line <= cols; line++) {
      const key = vEdgeKey(row, line);
      grid.appendChild(
        buildBorderZone(key, "v", state.edges[key], {
          top: `${(row / rows) * 100}%`,
          left: `${(line / cols) * 100}%`,
          height: `${(1 / rows) * 100}%`,
        }),
      );
    }
  }

  container.appendChild(grid);
  return grid;
}

export { BORDER_TYPES };
