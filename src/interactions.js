import {
  cellKey,
  toggleDeskAt,
  removeDeskAt,
  rotateDeskAt,
  setDeskColorAt,
  assignStudentAt,
  unassignStudentAt,
  setBorderAt,
  clearBorderAt,
} from "./model.js";
import { openContextMenu } from "./menu.js";
import { openColorPicker } from "./colorPicker.js";
import { openStudentPicker } from "./studentPicker.js";
import { openBorderPicker } from "./borderPicker.js";

function assignedStudentIds(state) {
  const ids = new Set();
  for (const cell of Object.values(state.cells)) {
    if (cell.student?.id) ids.add(cell.student.id);
  }
  return ids;
}

function handleCellClick(row, col, ctx) {
  ctx.applyChange((state) => toggleDeskAt(state, row, col));
}

function openAssignPopup(x, y, row, col, ctx) {
  const state = ctx.getState();
  const cell = state.cells[cellKey(row, col)];
  openStudentPicker(x, y, {
    students: ctx.options.students ?? [],
    assignedIds: assignedStudentIds(state),
    currentStudent: cell?.student ?? null,
    onAssign: (student) =>
      ctx.applyChange((s) => assignStudentAt(s, row, col, student)),
    onUnassign: () => ctx.applyChange((s) => unassignStudentAt(s, row, col)),
  });
}

function openColorPopup(x, y, row, col, ctx) {
  const state = ctx.getState();
  const cell = state.cells[cellKey(row, col)];
  const preferred = [
    ...(state.recentColors ?? []),
    ...(ctx.options.colors ?? []),
  ];
  openColorPicker(x, y, {
    preferred,
    current: cell?.color,
    onPick: (color) =>
      ctx.applyChange((s) => setDeskColorAt(s, row, col, color)),
  });
}

function openCellContextMenu(x, y, row, col, ctx) {
  const state = ctx.getState();
  const cell = state.cells[cellKey(row, col)];
  const items = [];

  if (!cell) {
    items.push({
      label: "Ajouter un bureau",
      onSelect: () => ctx.applyChange((s) => toggleDeskAt(s, row, col)),
    });
  } else {
    items.push({
      label: cell.student ? "Changer l'élève…" : "Affecter un élève…",
      onSelect: () => openAssignPopup(x, y, row, col, ctx),
    });
    if (cell.student) {
      items.push({
        label: "Retirer l'élève",
        onSelect: () => ctx.applyChange((s) => unassignStudentAt(s, row, col)),
      });
    }
    items.push({ separator: true });
    items.push({
      label: "Faire pivoter (90°)",
      onSelect: () => ctx.applyChange((s) => rotateDeskAt(s, row, col)),
    });
    items.push({
      label: "Couleur…",
      onSelect: () => openColorPopup(x, y, row, col, ctx),
    });
    items.push({ separator: true });
    items.push({
      label: "Supprimer le bureau",
      onSelect: () => ctx.applyChange((s) => removeDeskAt(s, row, col)),
    });
  }

  openContextMenu(x, y, items);
}

function handleEdgeClick(x, y, edgeKey, ctx) {
  const state = ctx.getState();
  if (state.edges[edgeKey]) {
    ctx.applyChange((s) => clearBorderAt(s, edgeKey));
    return;
  }
  openBorderPicker(x, y, {
    onPick: (type) => ctx.applyChange((s) => setBorderAt(s, edgeKey, type)),
  });
}

/**
 * Câble les interactions sur la grille déjà rendue. `ctx.applyChange(fn)`
 * doit appliquer `fn` à l'état courant, re-rendre et persister — fourni par
 * l'instance ClassroomLayout (src/index.js).
 */
export function attachInteractions(gridEl, ctx) {
  const onClick = (e) => {
    const edge = e.target.closest(".cll-edge");
    if (edge) {
      handleEdgeClick(e.clientX, e.clientY, edge.dataset.edgeKey, ctx);
      return;
    }
    const cell = e.target.closest(".cll-cell");
    if (cell) {
      handleCellClick(Number(cell.dataset.row), Number(cell.dataset.col), ctx);
    }
  };

  const onContextMenu = (e) => {
    const cell = e.target.closest(".cll-cell");
    if (!cell) return;
    e.preventDefault();
    openCellContextMenu(
      e.clientX,
      e.clientY,
      Number(cell.dataset.row),
      Number(cell.dataset.col),
      ctx,
    );
  };

  gridEl.addEventListener("click", onClick);
  gridEl.addEventListener("contextmenu", onContextMenu);

  return () => {
    gridEl.removeEventListener("click", onClick);
    gridEl.removeEventListener("contextmenu", onContextMenu);
  };
}
