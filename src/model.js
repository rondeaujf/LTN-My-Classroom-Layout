export const SCHEMA_VERSION = 1;
export const DEFAULT_GRID = { cols: 5, rows: 6 };
export const BORDER_TYPES = ["tableau", "porte", "fenetre", "mur"];

export function cellKey(row, col) {
  return `${row}_${col}`;
}

export function parseCellKey(key) {
  const [row, col] = key.split("_").map(Number);
  return { row, col };
}

// Borders are addressed by grid line (not by cell), so an interior border
// shared by two cells only ever has one possible key.
export function hEdgeKey(line, col) {
  return `h_${line}_${col}`;
}

export function vEdgeKey(row, line) {
  return `v_${row}_${line}`;
}

const MAX_RECENT_COLORS = 8;

export function createEmptyState(grid = DEFAULT_GRID) {
  return {
    version: SCHEMA_VERSION,
    grid: { cols: grid.cols, rows: grid.rows },
    cells: {},
    edges: {},
    // Round / oval tables spanning a rectangular block of cells — keyed by the
    // `row_col` of their top-left cell (cf. the `tables` helpers below).
    tables: {},
    recentColors: [],
    subtitle: "",
    // Only used when the host app doesn't supply `options.teacher` (see
    // README, "Teacher info"): free text entered at print time, remembered
    // for next time like everything else.
    teacherOverride: null,
    meta: { updatedAt: new Date().toISOString() },
  };
}

export function addRecentColor(state, color) {
  if (!color) return state;
  const recentColors = [
    color,
    ...(state.recentColors ?? []).filter((c) => c !== color),
  ].slice(0, MAX_RECENT_COLORS);
  return { ...state, recentColors };
}

function touch(state) {
  return { ...state, meta: { updatedAt: new Date().toISOString() } };
}

// Grows the grid by one ring on whichever side(s) content (a desk or a
// border edge) now sits flush against the current outer boundary — called
// after every edit that can newly reach the edge (toggleDeskAt, setBorderAt
// below), so there's always at least one free cell beyond anything just
// placed and the room can keep being extended outward. Mirrors
// fitGridToContentWithRing's "1-cell ring" rule, but incrementally and only
// on the side(s) actually touched (never shrinks, never grows a side
// nothing reaches) — otherwise a border placed right at the edge (the only
// place the fixed default grid offers) would permanently block adding
// anything further out on that side.
function growGridToKeepFreeRing(state) {
  const { rows, cols } = state.grid;
  let touchesTop = false;
  let touchesBottom = false;
  let touchesLeft = false;
  let touchesRight = false;

  for (const key of Object.keys(state.cells)) {
    const { row, col } = parseCellKey(key);
    if (row === 0) touchesTop = true;
    if (row === rows - 1) touchesBottom = true;
    if (col === 0) touchesLeft = true;
    if (col === cols - 1) touchesRight = true;
  }
  for (const key of Object.keys(state.edges)) {
    const [kind, a, b] = key
      .split("_")
      .map((v, i) => (i === 0 ? v : Number(v)));
    if (kind === "h") {
      const line = a;
      const col = b;
      if (line === 0) touchesTop = true;
      if (line === rows) touchesBottom = true;
      if (col === 0) touchesLeft = true;
      if (col === cols - 1) touchesRight = true;
    } else {
      const row = a;
      const line = b;
      if (row === 0) touchesTop = true;
      if (row === rows - 1) touchesBottom = true;
      if (line === 0) touchesLeft = true;
      if (line === cols) touchesRight = true;
    }
  }
  for (const [key, table] of Object.entries(state.tables ?? {})) {
    const { row, col } = parseCellKey(key);
    if (row === 0) touchesTop = true;
    if (row + table.h - 1 === rows - 1) touchesBottom = true;
    if (col === 0) touchesLeft = true;
    if (col + table.w - 1 === cols - 1) touchesRight = true;
  }

  if (!touchesTop && !touchesBottom && !touchesLeft && !touchesRight) {
    return state;
  }

  const rowOffset = touchesTop ? 1 : 0;
  const colOffset = touchesLeft ? 1 : 0;
  const newRows = rows + (touchesTop ? 1 : 0) + (touchesBottom ? 1 : 0);
  const newCols = cols + (touchesLeft ? 1 : 0) + (touchesRight ? 1 : 0);

  const cells = {};
  for (const [key, cell] of Object.entries(state.cells)) {
    const { row, col } = parseCellKey(key);
    cells[cellKey(row + rowOffset, col + colOffset)] = cell;
  }
  const edges = {};
  for (const [key, edge] of Object.entries(state.edges)) {
    const [kind, a, b] = key
      .split("_")
      .map((v, i) => (i === 0 ? v : Number(v)));
    if (kind === "h") {
      edges[hEdgeKey(a + rowOffset, b + colOffset)] = edge;
    } else {
      edges[vEdgeKey(a + rowOffset, b + colOffset)] = edge;
    }
  }
  const tables = {};
  for (const [key, table] of Object.entries(state.tables ?? {})) {
    const { row, col } = parseCellKey(key);
    tables[cellKey(row + rowOffset, col + colOffset)] = table;
  }

  return {
    ...state,
    grid: { cols: newCols, rows: newRows },
    cells,
    edges,
    tables,
  };
}

// --- Tables (round / oval) -------------------------------------------------
//
// A table spans a w×h rectangular block of cells, keyed in `state.tables` by
// the `row_col` of its top-left cell. Round when w === h, oval otherwise.
// Like a desk it carries a single `student` (one label + one level badge) and
// an optional `color`; its footprint cells hold no desk and no other table.

/** The `row_col` keys of every cell a w×h table anchored at (row,col) covers. */
export function tableFootprintKeys(row, col, w, h) {
  const keys = [];
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) keys.push(cellKey(r, c));
  }
  return keys;
}

/** The table covering cell (row,col), as `{ key, table }`, or null. */
export function tableAtCell(state, row, col) {
  for (const [key, table] of Object.entries(state.tables ?? {})) {
    const { row: tr, col: tc } = parseCellKey(key);
    if (row >= tr && row < tr + table.h && col >= tc && col < tc + table.w) {
      return { key, table };
    }
  }
  return null;
}

/** True if cell (row,col) holds a desk or is covered by a table. */
export function cellOccupied(state, row, col) {
  return !!state.cells[cellKey(row, col)] || !!tableAtCell(state, row, col);
}

/**
 * Adds a round (w === h) / oval table over the w×h block anchored at
 * (row,col). No-op if the block falls outside the grid or any of its cells
 * already holds a desk or another table.
 */
export function createTableAt(state, row, col, w, h) {
  if (w < 1 || h < 1) return state;
  const { rows, cols } = state.grid;
  if (row < 0 || col < 0 || row + h > rows || col + w > cols) return state;
  for (const fk of tableFootprintKeys(row, col, w, h)) {
    const { row: r, col: c } = parseCellKey(fk);
    if (cellOccupied(state, r, c)) return state;
  }
  const key = cellKey(row, col);
  return touch(
    growGridToKeepFreeRing({
      ...state,
      tables: {
        ...(state.tables ?? {}),
        [key]: {
          w,
          h,
          shape: w === h ? "round" : "oval",
          color: null,
          student: null,
        },
      },
    }),
  );
}

export function removeTableAt(state, key) {
  if (!state.tables?.[key]) return state;
  const tables = { ...state.tables };
  delete tables[key];
  return touch({ ...state, tables });
}

export function setTableColorAt(state, key, color) {
  const table = state.tables?.[key];
  if (!table) return state;
  return touch(
    addRecentColor(
      { ...state, tables: { ...state.tables, [key]: { ...table, color } } },
      color,
    ),
  );
}

export function setTableStudentAt(state, key, student) {
  const table = state.tables?.[key];
  if (!table) return state;
  return touch({
    ...state,
    tables: { ...state.tables, [key]: { ...table, student } },
  });
}

export function toggleDeskAt(state, row, col) {
  const key = cellKey(row, col);
  const cell = state.cells[key];
  const cells = { ...state.cells };
  if (!cell) {
    cells[key] = {
      type: "desk",
      rotation: 0,
      color: null,
      student: null,
      stuck: false,
      halfShift: null,
    };
  } else if (cell.student) {
    cells[key] = { ...cell, student: null };
  } else {
    delete cells[key];
  }
  return touch(growGridToKeepFreeRing({ ...state, cells }));
}

export function removeDeskAt(state, row, col) {
  const key = cellKey(row, col);
  if (!state.cells[key]) return state;
  const cells = { ...state.cells };
  delete cells[key];
  return touch({ ...state, cells });
}

export function rotateDeskAt(state, row, col) {
  const key = cellKey(row, col);
  const cell = state.cells[key];
  if (!cell) return state;
  const rotation = (cell.rotation + 90) % 360;
  return touch({
    ...state,
    cells: { ...state.cells, [key]: { ...cell, rotation } },
  });
}

/**
 * Toggles whether the desk is pushed flush against its own "head" edge —
 * the side opposite the chair — instead of sitting with a small margin on
 * every side. Which screen edge that is follows the desk's current rotation
 * (0° → top, 90° → right, 180° → bottom, 270° → left) for free, since it's
 * drawn in the desk's own local (pre-rotation) frame — see buildDeskSvg in
 * src/svg.js. Independent of setDeskHalfShiftAt below (a much bigger,
 * container-level shift) — both can be on at once.
 */
export function toggleDeskStuckAt(state, row, col) {
  const key = cellKey(row, col);
  const cell = state.cells[key];
  if (!cell) return state;
  return touch({
    ...state,
    cells: { ...state.cells, [key]: { ...cell, stuck: !cell.stuck } },
  });
}

// The 4 directions a desk can be half-shifted in — screen-absolute, chosen
// directly by the user (not derived from the desk's rotation).
export const HALF_SHIFT_DIRECTIONS = ["up", "down", "left", "right"];

/**
 * Sets (or, picking the same direction again, clears) a half-cell shift on
 * the desk — moved half a cell up/down/left/right, out of its own cell and
 * into the neighboring one, so two desks in adjacent cells can meet in the
 * middle. Screen-absolute: unlike toggleDeskStuckAt above, this does NOT
 * follow the desk's rotation — the direction is whatever the caller (the
 * UI) picked, cf. src/interactions.js.
 */
export function setDeskHalfShiftAt(state, row, col, direction) {
  if (!HALF_SHIFT_DIRECTIONS.includes(direction)) {
    throw new Error(`Unknown half-shift direction: ${direction}`);
  }
  const key = cellKey(row, col);
  const cell = state.cells[key];
  if (!cell) return state;
  const halfShift = cell.halfShift === direction ? null : direction;
  return touch({
    ...state,
    cells: { ...state.cells, [key]: { ...cell, halfShift } },
  });
}

export function setDeskColorAt(state, row, col, color) {
  const key = cellKey(row, col);
  const cell = state.cells[key];
  if (!cell) return state;
  return touch(
    addRecentColor(
      { ...state, cells: { ...state.cells, [key]: { ...cell, color } } },
      color,
    ),
  );
}

export function assignStudentAt(state, row, col, student) {
  const key = cellKey(row, col);
  const cell = state.cells[key] ?? {
    type: "desk",
    rotation: 0,
    color: null,
    student: null,
    stuck: false,
    halfShift: null,
  };
  return touch({
    ...state,
    cells: { ...state.cells, [key]: { ...cell, student } },
  });
}

export function unassignStudentAt(state, row, col) {
  return assignStudentAt(state, row, col, null);
}

export function setBorderAt(state, edgeKey, type) {
  if (!BORDER_TYPES.includes(type)) {
    throw new Error(`Unknown border type: ${type}`);
  }
  return touch(
    growGridToKeepFreeRing({
      ...state,
      edges: { ...state.edges, [edgeKey]: { type, rotation: 0, flip: false } },
    }),
  );
}

export function setSubtitle(state, subtitle) {
  return touch({ ...state, subtitle });
}

export function setTeacherOverride(state, teacherOverride) {
  return touch({ ...state, teacherOverride });
}

export function clearBorderAt(state, edgeKey) {
  if (!state.edges[edgeKey]) return state;
  const edges = { ...state.edges };
  delete edges[edgeKey];
  return touch({ ...state, edges });
}

// Only meaningful for "porte" (door): flips which side it swings open from
// (mirrors the symbol lengthwise, along the wall). Harmless no-op-looking
// toggle for other types — the UI only offers it for doors, cf.
// src/interactions.js.
export function rotateBorderAt(state, edgeKey) {
  const edge = state.edges[edgeKey];
  if (!edge) return state;
  const rotation = ((edge.rotation ?? 0) + 180) % 360;
  return touch({
    ...state,
    edges: { ...state.edges, [edgeKey]: { ...edge, rotation } },
  });
}

// Flips the symbol across the wall's thickness — which face it's drawn on.
// For "tableau" ("retourner le tableau"), moves the chalk tray to the other
// side; for "porte" ("retourner la porte"), swings it into the other room.
// Independent of rotateBorderAt above (that one flips lengthwise, along the
// wall — this one flips across it), so a door can combine both. Harmless
// no-op-looking toggle for other types — the UI only offers it for
// tableau/porte, cf. src/interactions.js.
export function flipBorderAt(state, edgeKey) {
  const edge = state.edges[edgeKey];
  if (!edge) return state;
  return touch({
    ...state,
    edges: { ...state.edges, [edgeKey]: { ...edge, flip: !edge.flip } },
  });
}

/**
 * A room reads as "enclosed" once every edge around the desks' bounding
 * rectangle carries a border object (tableau/porte/fenetre) — walls all the
 * way round, whatever their type. Exposed so the host app/UI can react to it
 * (e.g. a "cll-grid--closed" class, see render.js).
 */
export function isRoomEnclosed(state) {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const key of Object.keys(state.cells)) {
    const { row, col } = parseCellKey(key);
    minR = Math.min(minR, row);
    maxR = Math.max(maxR, row);
    minC = Math.min(minC, col);
    maxC = Math.max(maxC, col);
  }
  for (const [key, table] of Object.entries(state.tables ?? {})) {
    const { row, col } = parseCellKey(key);
    minR = Math.min(minR, row);
    maxR = Math.max(maxR, row + table.h - 1);
    minC = Math.min(minC, col);
    maxC = Math.max(maxC, col + table.w - 1);
  }
  if (!Number.isFinite(minR)) return false;

  for (let col = minC; col <= maxC; col++) {
    if (!state.edges[hEdgeKey(minR, col)]) return false;
    if (!state.edges[hEdgeKey(maxR + 1, col)]) return false;
  }
  for (let row = minR; row <= maxR; row++) {
    if (!state.edges[vEdgeKey(row, minC)]) return false;
    if (!state.edges[vEdgeKey(row, maxC + 1)]) return false;
  }
  return true;
}

/**
 * Recomputes the grid as the smallest rectangle containing all content
 * (desks + borders) surrounded by a `ringSize`-cell empty ring (default 1),
 * and reindexes cells/edges accordingly. Called when loading an existing
 * configuration (never during live editing) with the default ring, and by
 * buildPrintSheet (src/print.js) with `ringSize: 0` — a wall already sits
 * flush against the content's own bounding box (it's included in it, see
 * the edges loop below), so print/export doesn't need the *extra* ring
 * load-time fitting keeps for further live editing (growGridToKeepFreeRing
 * above relies on it) — that ring, kept on a narrow room, can waste a good
 * fraction of the printed page's width on empty margin for nothing.
 */
export function fitGridToContentWithRing(
  state,
  fallbackGrid = DEFAULT_GRID,
  ringSize = 1,
) {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;

  for (const key of Object.keys(state.cells)) {
    const { row, col } = parseCellKey(key);
    minR = Math.min(minR, row);
    maxR = Math.max(maxR, row);
    minC = Math.min(minC, col);
    maxC = Math.max(maxC, col);
  }
  for (const key of Object.keys(state.edges)) {
    const [kind, a, b] = key
      .split("_")
      .map((v, i) => (i === 0 ? v : Number(v)));
    if (kind === "h") {
      const line = a;
      const col = b;
      minR = Math.min(minR, line - 1, line);
      maxR = Math.max(maxR, line - 1, line);
      minC = Math.min(minC, col);
      maxC = Math.max(maxC, col);
    } else {
      const row = a;
      const line = b;
      minR = Math.min(minR, row);
      maxR = Math.max(maxR, row);
      minC = Math.min(minC, line - 1, line);
      maxC = Math.max(maxC, line - 1, line);
    }
  }
  for (const [key, table] of Object.entries(state.tables ?? {})) {
    const { row, col } = parseCellKey(key);
    minR = Math.min(minR, row);
    maxR = Math.max(maxR, row + table.h - 1);
    minC = Math.min(minC, col);
    maxC = Math.max(maxC, col + table.w - 1);
  }

  if (!Number.isFinite(minR)) {
    return { ...state, grid: { ...fallbackGrid } };
  }

  const rowOffset = ringSize - minR;
  const colOffset = ringSize - minC;
  const rows = maxR - minR + 1 + 2 * ringSize;
  const cols = maxC - minC + 1 + 2 * ringSize;

  const cells = {};
  for (const [key, cell] of Object.entries(state.cells)) {
    const { row, col } = parseCellKey(key);
    cells[cellKey(row + rowOffset, col + colOffset)] = cell;
  }

  const edges = {};
  for (const [key, edge] of Object.entries(state.edges)) {
    const [kind, a, b] = key
      .split("_")
      .map((v, i) => (i === 0 ? v : Number(v)));
    if (kind === "h") {
      edges[hEdgeKey(a + rowOffset, b + colOffset)] = edge;
    } else {
      edges[vEdgeKey(a + rowOffset, b + colOffset)] = edge;
    }
  }

  const tables = {};
  for (const [key, table] of Object.entries(state.tables ?? {})) {
    const { row, col } = parseCellKey(key);
    tables[cellKey(row + rowOffset, col + colOffset)] = table;
  }

  return { ...state, grid: { cols, rows }, cells, edges, tables };
}

export function serializeState(state) {
  return JSON.stringify(state);
}

export function deserializeState(json) {
  const parsed = JSON.parse(json);
  return {
    version: parsed.version ?? SCHEMA_VERSION,
    grid: parsed.grid ?? { ...DEFAULT_GRID },
    cells: parsed.cells ?? {},
    edges: parsed.edges ?? {},
    tables: parsed.tables ?? {},
    recentColors: parsed.recentColors ?? [],
    subtitle: parsed.subtitle ?? "",
    teacherOverride: parsed.teacherOverride ?? null,
    meta: parsed.meta ?? { updatedAt: null },
  };
}
