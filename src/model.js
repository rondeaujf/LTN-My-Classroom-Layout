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

// Bordures adressées par ligne de grille (pas par cellule) pour qu'un bord
// intérieur partagé entre deux cellules n'ait qu'une seule clé possible.
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
    // Rempli seulement si aucun enseignant n'est fourni en option par l'app
    // hôte (cf. README, "Infos enseignant") : saisie libre sur l'impression,
    // mémorisée pour la prochaine ouverture comme le reste.
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
    throw new Error(`Type de bordure inconnu : ${type}`);
  }
  return touch({
    ...state,
    edges: { ...state.edges, [edgeKey]: { type } },
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

/**
 * Recalcule la grille comme le plus petit rectangle contenant tout le
 * contenu (bureaux + bordures) entouré d'une couronne d'une case vide,
 * et réindexe cells/edges en conséquence. Appelée au chargement d'une
 * configuration existante (jamais pendant l'édition en cours).
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
