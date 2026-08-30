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
  flipBorderAt,
  toggleDeskStuckAt,
  setDeskHalfShiftAt,
  HALF_SHIFT_DIRECTIONS,
  createTableAt,
  removeTableAt,
  setTableColorAt,
  setTableStudentAt,
  tableFootprintKeys,
  cellOccupied,
} from "./model.js";
import { openContextMenu } from "./menu.js";
import { openColorPicker } from "./colorPicker.js";
import { openStudentPicker } from "./studentPicker.js";
import { openBorderPicker } from "./borderPicker.js";

// Stable id for the "teacher" entry synthesized from `options.teacher` (see
// teacherStudentEntry below). Never collides with a real roster id.
const TEACHER_STUDENT_ID = "__teacher__";

const HALF_SHIFT_LABELS = {
  up: "Décaler vers le haut",
  down: "Décaler vers le bas",
  left: "Décaler vers la gauche",
  right: "Décaler vers la droite",
};
const HALF_SHIFT_ICONS = {
  up: "arrowUp",
  down: "arrowDown",
  left: "arrowLeft",
  right: "arrowRight",
};

function assignedStudentIds(state) {
  const ids = new Set();
  for (const cell of Object.values(state.cells)) {
    if (cell.student?.id) ids.add(cell.student.id);
  }
  for (const table of Object.values(state.tables ?? {})) {
    if (table.student?.id) ids.add(table.student.id);
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
  // firstName/lastName kept separate (not pre-joined into `name`) so a desk
  // can be shown as first-name-only/last-name-only (options.nameDisplay,
  // src/render.js) once assigned — same reason studentPicker.js's own
  // roster assignment preserves them instead of collapsing to one string.
  return {
    id: TEACHER_STUDENT_ID,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    isTeacher: true,
  };
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
    // Table 1 case : le seul chemin (un cliquer-glisser d'une seule cellule =
    // pas de glissé = bureau, cf. attachInteractions). Plus grande : glisser
    // un rectangle.
    items.push({
      label: "Créer une table ronde",
      icon: "plus",
      onSelect: () => ctx.applyChange((s) => createTableAt(s, row, col, 1, 1)),
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
      label: cell.stuck ? "Détacher du bord" : "Coller au bord",
      icon: "dock",
      onSelect: () => ctx.applyChange((s) => toggleDeskStuckAt(s, row, col)),
    });
    for (const direction of HALF_SHIFT_DIRECTIONS) {
      const active = cell.halfShift === direction;
      items.push({
        label: active
          ? `${HALF_SHIFT_LABELS[direction]} ✓`
          : HALF_SHIFT_LABELS[direction],
        icon: HALF_SHIFT_ICONS[direction],
        onSelect: () =>
          ctx.applyChange((s) => setDeskHalfShiftAt(s, row, col, direction)),
      });
    }
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
  // fenetre's icon is symmetric either way; mur has no orientation at all.
  if (edge.type === "porte") {
    items.push({
      label: "Changer le sens d'ouverture",
      icon: "rotate",
      onSelect: () => ctx.applyChange((s) => rotateBorderAt(s, edgeKey)),
    });
    items.push({
      label: "Retourner la porte",
      icon: "rotate",
      onSelect: () => ctx.applyChange((s) => flipBorderAt(s, edgeKey)),
    });
  } else if (edge.type === "tableau") {
    items.push({
      label: "Retourner le tableau",
      icon: "rotate",
      onSelect: () => ctx.applyChange((s) => flipBorderAt(s, edgeKey)),
    });
  }
  items.push({
    label: "Supprimer",
    icon: "trash",
    onSelect: () => ctx.applyChange((s) => clearBorderAt(s, edgeKey)),
  });
  openContextMenu(x, y, items, ctx.hostEl);
}

// --- Tables --------------------------------------------------------------

// Confirmation minimale après un cliquer-glisser : un menu à une entrée
// (annulé par un clic à l'extérieur, cf. popup.js). Forme déduite du
// rectangle (carré -> ronde, sinon ovale).
function openTablePrompt(x, y, row, col, w, h, ctx) {
  const shape = w === h ? "ronde" : "ovale";
  openContextMenu(
    x,
    y,
    [
      {
        label: `Créer une table ${shape} (${w}×${h})`,
        icon: "plus",
        onSelect: () =>
          ctx.applyChange((s) => createTableAt(s, row, col, w, h)),
      },
    ],
    ctx.hostEl,
  );
}

function openTableContextMenu(x, y, key, ctx) {
  const state = ctx.getState();
  const table = state.tables?.[key];
  if (!table) return;

  const teacherEntry = teacherStudentEntry(ctx.options.teacher);
  const students = teacherEntry
    ? [teacherEntry, ...(ctx.options.students ?? [])]
    : (ctx.options.students ?? []);

  const items = [
    {
      label: table.student ? "Changer l'élève…" : "Affecter un élève…",
      icon: "personPlus",
      onSelect: () =>
        openStudentPicker(x, y, {
          students,
          assignedIds: assignedStudentIds(state),
          currentStudent: table.student ?? null,
          onAssign: (student) =>
            ctx.applyChange((s) => setTableStudentAt(s, key, student)),
          onUnassign: () =>
            ctx.applyChange((s) => setTableStudentAt(s, key, null)),
          anchorEl: ctx.hostEl,
        }),
    },
  ];
  if (table.student) {
    items.push({
      label: "Retirer l'élève",
      icon: "trash",
      onSelect: () => ctx.applyChange((s) => setTableStudentAt(s, key, null)),
    });
  }
  items.push({ separator: true });
  items.push({
    label: "Couleur…",
    icon: "palette",
    onSelect: () =>
      openColorPicker(x, y, {
        preferred: [
          ...(state.recentColors ?? []),
          ...(ctx.options.colors ?? []),
        ],
        current: table.color,
        onPick: (color) =>
          ctx.applyChange((s) => setTableColorAt(s, key, color)),
        anchorEl: ctx.hostEl,
      }),
  });
  items.push({ separator: true });
  items.push({
    label: "Supprimer la table",
    icon: "trash",
    onSelect: () => ctx.applyChange((s) => removeTableAt(s, key)),
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
  // false : bords (mur/tableau/porte/fenêtre) verrouillés. La classe
  // .cll-root--borders-locked coupe déjà pointer-events sur les .cll-edge
  // (cf. style.css) — ce garde-fou couvre le cas où l'hôte gère le CSS
  // autrement. Les bureaux restent pleinement éditables.
  const bordersEditable = () => ctx.options.editableBorders !== false;

  // Pendant un drag, le listener est sur `document` : `e.target` est l'élément
  // sous le pointeur (une `.cll-cell` ou un de ses enfants quand on glisse sur
  // des cellules vides). elementFromPoint en repli.
  const cellFromEvent = (e) =>
    e.target?.closest?.(".cll-cell") ??
    document.elementFromPoint?.(e.clientX, e.clientY)?.closest?.(".cll-cell") ??
    null;

  const clearDragSel = () => {
    gridEl
      .querySelectorAll(".cll-cell--drag-sel")
      .forEach((c) => c.classList.remove("cll-cell--drag-sel"));
  };

  const paintDragSel = (r0, c0, r1, c1) => {
    clearDragSel();
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
        gridEl
          .querySelector(`[data-row="${r}"][data-col="${c}"]`)
          ?.classList.add("cll-cell--drag-sel");
      }
    }
  };

  // Cliquer-glisser un rectangle de cellules vides -> grande table. Un simple
  // clic (départ == arrivée) ne fait rien ici : l'event `click` qui suit
  // déclenche toggleDeskAt (bureau), comportement inchangé.
  let drag = null;
  let swallowNextClick = false;

  const onMouseMove = (e) => {
    if (!drag) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    drag.r1 = Number(cell.dataset.row);
    drag.c1 = Number(cell.dataset.col);
    if (drag.r1 !== drag.r0 || drag.c1 !== drag.c0) drag.moved = true;
    paintDragSel(drag.r0, drag.c0, drag.r1, drag.c1);
  };

  const endDrag = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  const onMouseUp = (e) => {
    if (!drag) return endDrag();
    const { r0, c0, r1, c1, moved } = drag;
    drag = null;
    endDrag();
    clearDragSel();
    if (!moved) return; // simple clic -> laisser `click` gérer le bureau

    swallowNextClick = true; // le `click` qui suit ne doit pas poser un bureau
    const row = Math.min(r0, r1);
    const col = Math.min(c0, c1);
    const w = Math.abs(c1 - c0) + 1;
    const h = Math.abs(r1 - r0) + 1;

    const state = ctx.getState();
    const free = tableFootprintKeys(row, col, w, h).every((k) => {
      const [r, c] = k.split("_").map(Number);
      return !cellOccupied(state, r, c);
    });
    if (free) openTablePrompt(e.clientX, e.clientY, row, col, w, h, ctx);
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    // Un clic sur une table ne démarre pas de sélection (géré par onClick).
    if (e.target.closest(".cll-table")) return;
    const cell = e.target.closest(".cll-cell");
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    // On ne démarre une sélection que sur une cellule vide et non couverte —
    // sinon on laisse le clic agir sur le bureau existant.
    if (cellOccupied(ctx.getState(), row, col)) return;
    drag = { r0: row, c0: col, r1: row, c1: col, moved: false };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const onClick = (e) => {
    if (swallowNextClick) {
      swallowNextClick = false;
      return;
    }
    const tableEl = e.target.closest(".cll-table");
    if (tableEl) {
      const key = tableEl.dataset.tableKey;
      const table = ctx.getState().tables?.[key];
      if (table?.student) {
        ctx.applyChange((s) => setTableStudentAt(s, key, null));
      } else {
        ctx.applyChange((s) => removeTableAt(s, key));
      }
      return;
    }
    const edge = e.target.closest(".cll-edge");
    if (edge && bordersEditable()) {
      handleEdgeClick(e.clientX, e.clientY, edge.dataset.edgeKey, ctx);
      return;
    }
    const cell = e.target.closest(".cll-cell");
    if (cell) {
      handleCellClick(Number(cell.dataset.row), Number(cell.dataset.col), ctx);
    }
  };

  const onContextMenu = (e) => {
    const tableEl = e.target.closest(".cll-table");
    if (tableEl) {
      e.preventDefault();
      openTableContextMenu(e.clientX, e.clientY, tableEl.dataset.tableKey, ctx);
      return;
    }
    const edge = e.target.closest(".cll-edge");
    if (edge && bordersEditable()) {
      e.preventDefault();
      openEdgeContextMenu(e.clientX, e.clientY, edge.dataset.edgeKey, ctx);
      return;
    }
    const cell = e.target.closest(".cll-cell");
    if (!cell) return;
    e.preventDefault();
    // Cellule couverte par une table : le clic droit atterrit sur la <div.cll-table>
    // (au-dessus), traité plus haut. Ici la cellule est donc bien nue.
    openCellContextMenu(
      e.clientX,
      e.clientY,
      Number(cell.dataset.row),
      Number(cell.dataset.col),
      ctx,
    );
  };

  gridEl.addEventListener("mousedown", onMouseDown);
  gridEl.addEventListener("click", onClick);
  gridEl.addEventListener("contextmenu", onContextMenu);

  return () => {
    gridEl.removeEventListener("mousedown", onMouseDown);
    gridEl.removeEventListener("click", onClick);
    gridEl.removeEventListener("contextmenu", onContextMenu);
    endDrag();
    clearDragSel();
  };
}
