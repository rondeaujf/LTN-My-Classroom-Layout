export const SCHEMA_VERSION = 1;
export const DEFAULT_GRID = { cols: 5, rows: 6 };
export const BORDER_TYPES = ["tableau", "porte", "fenetre"];

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

export function toggleDeskAt(state, row, col) {
  const key = cellKey(row, col);
  const cell = state.cells[key];
  const cells = { ...state.cells };
  if (!cell) {
    cells[key] = { type: "desk", rotation: 0, color: null, student: null };
  } else if (cell.student) {
    cells[key] = { ...cell, student: null };
  } else {
    delete cells[key];
  }
  return touch({ ...state, cells });
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
  return touch({
    ...state,
    edges: { ...state.edges, [edgeKey]: { type, rotation: 0 } },
  });
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

// Only meaningful for "porte" (door): flips which side it swings open from.
// Harmless no-op-looking toggle for symmetric icons (tableau/fenetre) —
// the UI only offers it for doors, cf. src/interactions.js.
export function rotateBorderAt(state, edgeKey) {
  const edge = state.edges[edgeKey];
  if (!edge) return state;
  const rotation = ((edge.rotation ?? 0) + 180) % 360;
  return touch({
    ...state,
    edges: { ...state.edges, [edgeKey]: { ...edge, rotation } },
  });
}

/**
 * Recomputes the grid as the smallest rectangle containing all content
 * (desks + borders) surrounded by a one-cell empty ring, and reindexes
 * cells/edges accordingly. Called when loading an existing configuration
 * (never during live editing).
 */
export function fitGridToContentWithRing(state, fallbackGrid = DEFAULT_GRID) {
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

  if (!Number.isFinite(minR)) {
    return { ...state, grid: { ...fallbackGrid } };
  }

  const rowOffset = 1 - minR;
  const colOffset = 1 - minC;
  const rows = maxR - minR + 1 + 2;
  const cols = maxC - minC + 1 + 2;

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

  return { ...state, grid: { cols, rows }, cells, edges };
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
    recentColors: parsed.recentColors ?? [],
    subtitle: parsed.subtitle ?? "",
    teacherOverride: parsed.teacherOverride ?? null,
    meta: parsed.meta ?? { updatedAt: null },
  };
}
