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
  rotateBorderAt,
} from "./model.js";
import { openContextMenu } from "./menu.js";
import { openColorPicker } from "./colorPicker.js";
import { openStudentPicker } from "./studentPicker.js";
import { openBorderPicker } from "./borderPicker.js";

// Stable id for the "teacher" entry synthesized from `options.teacher` (see
// teacherStudentEntry below). Never collides with a real roster id.
const TEACHER_STUDENT_ID = "__teacher__";

function assignedStudentIds(state) {
  const ids = new Set();
  for (const cell of Object.values(state.cells)) {
    if (cell.student?.id) ids.add(cell.student.id);
  }
  return ids;
}

// If the host app documented a teacher (options.teacher), the teacher can
// also be assigned to a desk — one or several, that's the one exception to
// the "each roster student appears once" rule (cf. isTeacher handling in
// studentPicker.js).
function teacherStudentEntry(teacher) {
  if (!teacher) return null;
  const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(" ");
  if (!name) return null;
  return { id: TEACHER_STUDENT_ID, name, isTeacher: true };
}

function handleCellClick(row, col, ctx) {
  ctx.applyChange((state) => toggleDeskAt(state, row, col));
}

function openAssignPopup(x, y, row, col, ctx) {
  const state = ctx.getState();
  const cell = state.cells[cellKey(row, col)];
  const teacherEntry = teacherStudentEntry(ctx.options.teacher);
  const students = teacherEntry
    ? [teacherEntry, ...(ctx.options.students ?? [])]
    : (ctx.options.students ?? []);
  openStudentPicker(x, y, {
    students,
    assignedIds: assignedStudentIds(state),
    currentStudent: cell?.student ?? null,
    onAssign: (student) =>
      ctx.applyChange((s) => assignStudentAt(s, row, col, student)),
    onUnassign: () => ctx.applyChange((s) => unassignStudentAt(s, row, col)),
    anchorEl: ctx.hostEl,
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
    anchorEl: ctx.hostEl,
  });
}

function openCellContextMenu(x, y, row, col, ctx) {
  const state = ctx.getState();
  const cell = state.cells[cellKey(row, col)];
  const items = [];

  if (!cell) {
    items.push({
      label: "Ajouter un bureau",
      icon: "plus",
      onSelect: () => ctx.applyChange((s) => toggleDeskAt(s, row, col)),
    });
  } else {
    items.push({
      label: cell.student ? "Changer l'élève…" : "Affecter un élève…",
      icon: "personPlus",
      onSelect: () => openAssignPopup(x, y, row, col, ctx),
    });
    if (cell.student) {
      items.push({
        label: "Retirer l'élève",
        icon: "trash",
        onSelect: () => ctx.applyChange((s) => unassignStudentAt(s, row, col)),
      });
    }
    items.push({ separator: true });
    items.push({
      label: "Faire pivoter (90°)",
      icon: "rotate",
      onSelect: () => ctx.applyChange((s) => rotateDeskAt(s, row, col)),
    });
    items.push({
      label: "Couleur…",
      icon: "palette",
      onSelect: () => openColorPopup(x, y, row, col, ctx),
    });
    items.push({ separator: true });
    items.push({
      label: "Supprimer le bureau",
      icon: "trash",
      onSelect: () => ctx.applyChange((s) => removeDeskAt(s, row, col)),
    });
  }

  openContextMenu(x, y, items, ctx.hostEl);
}

function handleEdgeClick(x, y, edgeKey, ctx) {
  const state = ctx.getState();
  if (state.edges[edgeKey]) {
    ctx.applyChange((s) => clearBorderAt(s, edgeKey));
    return;
  }
  openBorderPicker(x, y, {
    onPick: (type) => ctx.applyChange((s) => setBorderAt(s, edgeKey, type)),
    anchorEl: ctx.hostEl,
  });
}

function openEdgeContextMenu(x, y, edgeKey, ctx) {
  const state = ctx.getState();
  const edge = state.edges[edgeKey];

  if (!edge) {
    openBorderPicker(x, y, {
      onPick: (type) => ctx.applyChange((s) => setBorderAt(s, edgeKey, type)),
      anchorEl: ctx.hostEl,
    });
    return;
  }

  const items = [];
  // Rotation only makes a visible difference for a door (which side it
  // swings open from) — tableau/fenetre icons are symmetric under 180°.
  if (edge.type === "porte") {
    items.push({
      label: "Changer le sens d'ouverture",
      icon: "rotate",
      onSelect: () => ctx.applyChange((s) => rotateBorderAt(s, edgeKey)),
    });
  }
  items.push({
    label: "Supprimer",
    icon: "trash",
    onSelect: () => ctx.applyChange((s) => clearBorderAt(s, edgeKey)),
  });
  openContextMenu(x, y, items, ctx.hostEl);
}

/**
 * Wires up interactions on an already-rendered grid. `ctx.applyChange(fn)`
 * must apply `fn` to the current state, re-render and persist; `ctx.hostEl`
 * is any element inside the module's own root, used to find an enclosing
 * open <dialog> (if any) so popups get appended inside it instead of
 * document.body — supplied by the ClassroomLayout instance (src/index.js).
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
    const edge = e.target.closest(".cll-edge");
    if (edge) {
      e.preventDefault();
      openEdgeContextMenu(e.clientX, e.clientY, edge.dataset.edgeKey, ctx);
      return;
    }
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
