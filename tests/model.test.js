import { describe, it, expect } from "vitest";
import {
  createEmptyState,
  toggleDeskAt,
  removeDeskAt,
  rotateDeskAt,
  toggleDeskStuckAt,
  setDeskHalfShiftAt,
  setDeskColorAt,
  assignStudentAt,
  unassignStudentAt,
  setBorderAt,
  clearBorderAt,
  rotateBorderAt,
  flipBorderAt,
  isRoomEnclosed,
  fitGridToContentWithRing,
  serializeState,
  deserializeState,
  cellKey,
  hEdgeKey,
  vEdgeKey,
  createTableAt,
  removeTableAt,
  setTableColorAt,
  setTableStudentAt,
  tableAtCell,
  cellOccupied,
} from "../src/model.js";

describe("toggleDeskAt", () => {
  it("places an empty desk on an empty cell", () => {
    const state = toggleDeskAt(createEmptyState(), 2, 3);
    expect(state.cells[cellKey(2, 3)]).toEqual({
      type: "desk",
      rotation: 0,
      color: null,
      student: null,
      stuck: false,
      halfShift: null,
    });
  });

  it("removes the student first, then the desk on the second click", () => {
    let state = toggleDeskAt(createEmptyState(), 1, 1);
    state = assignStudentAt(state, 1, 1, { name: "Ada" });
    state = toggleDeskAt(state, 1, 1); // 1st click on an occupied desk
    expect(state.cells[cellKey(1, 1)].student).toBeNull();
    expect(state.cells[cellKey(1, 1)]).toBeDefined();

    state = toggleDeskAt(state, 1, 1); // 2nd click: empty desk -> removed
    expect(state.cells[cellKey(1, 1)]).toBeUndefined();
  });
});

describe("removeDeskAt / rotateDeskAt / setDeskColorAt", () => {
  it("removes an existing desk, is a no-op on an empty cell", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = removeDeskAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)]).toBeUndefined();
    expect(removeDeskAt(state, 5, 5)).toBe(state); // no-op, same reference
  });

  it("rotates the desk in 90° steps, wraps at 360", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 2);
    state = rotateDeskAt(state, 2, 2);
    expect(state.cells[cellKey(2, 2)].rotation).toBe(90);
    state = rotateDeskAt(rotateDeskAt(rotateDeskAt(state, 2, 2), 2, 2), 2, 2);
    expect(state.cells[cellKey(2, 2)].rotation).toBe(0);
  });

  it("applies a color", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 2);
    state = setDeskColorAt(state, 2, 2, "#ff000080");
    expect(state.cells[cellKey(2, 2)].color).toBe("#ff000080");
  });

  it("toggles stuck, is a no-op on an empty cell", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 2);
    state = toggleDeskStuckAt(state, 2, 2);
    expect(state.cells[cellKey(2, 2)].stuck).toBe(true);
    state = toggleDeskStuckAt(state, 2, 2);
    expect(state.cells[cellKey(2, 2)].stuck).toBe(false);

    expect(toggleDeskStuckAt(state, 5, 5)).toBe(state);
  });

  it("sets halfShift independently of stuck, picking the same direction again clears it", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 2);
    state = toggleDeskStuckAt(state, 2, 2);
    state = setDeskHalfShiftAt(state, 2, 2, "up");
    expect(state.cells[cellKey(2, 2)]).toMatchObject({
      stuck: true,
      halfShift: "up",
    });

    state = setDeskHalfShiftAt(state, 2, 2, "up"); // same direction -> clears
    expect(state.cells[cellKey(2, 2)]).toMatchObject({
      stuck: true,
      halfShift: null,
    });

    state = setDeskHalfShiftAt(state, 2, 2, "right"); // switches
    expect(state.cells[cellKey(2, 2)].halfShift).toBe("right");

    expect(setDeskHalfShiftAt(state, 8, 8, "up")).toBe(state);
    expect(() => setDeskHalfShiftAt(state, 2, 2, "sideways")).toThrow();
  });
});

describe("growGridToKeepFreeRing (via toggleDeskAt / setBorderAt)", () => {
  it("leaves the grid untouched when nothing reaches the boundary", () => {
    const state = toggleDeskAt(createEmptyState(), 2, 3);
    expect(state.grid).toEqual({ cols: 5, rows: 6 });
  });

  it("grows the grid by one ring on the side(s) a desk lands flush against, and reindexes it", () => {
    // Default grid: cols 0-4, rows 0-5 -> (0,0) is the top-left corner.
    const state = toggleDeskAt(createEmptyState(), 0, 0);
    expect(state.grid).toEqual({ cols: 6, rows: 7 });
    expect(state.cells[cellKey(1, 1)]).toBeDefined();
    expect(state.cells[cellKey(0, 0)]).toBeUndefined();
  });

  it("only grows the side(s) actually touched, not all four", () => {
    // Bottom-right corner: only rows/cols grow, no offset needed.
    const state = toggleDeskAt(createEmptyState(), 5, 4);
    expect(state.grid).toEqual({ cols: 6, rows: 7 });
    expect(state.cells[cellKey(5, 4)]).toBeDefined();
  });

  it("grows for a border placed flush against the boundary too, reindexing existing content", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 3); // interior, no growth yet
    state = setBorderAt(state, hEdgeKey(0, 2), "tableau"); // top wall, line 0
    expect(state.grid).toEqual({ cols: 5, rows: 7 });
    // both the border and the earlier desk shift down by one row
    expect(state.edges[hEdgeKey(1, 2)]).toBeDefined();
    expect(state.cells[cellKey(3, 3)]).toBeDefined();
  });

  it("keeps growing ring after ring as content keeps reaching the new edge", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0); // grid -> 6x7, desk at (1,1)
    state = toggleDeskAt(state, 0, 1); // still on the new top row (line 0)
    expect(state.grid).toEqual({ cols: 6, rows: 8 });
    expect(Object.keys(state.cells)).toHaveLength(2);
  });
});

describe("assignStudentAt / unassignStudentAt", () => {
  it("creates the desk if needed when assigning a student", () => {
    const state = assignStudentAt(createEmptyState(), 4, 4, {
      name: "Zoe",
      level: "Grade 3",
    });
    expect(state.cells[cellKey(4, 4)].student).toEqual({
      name: "Zoe",
      level: "Grade 3",
    });
  });

  it("unassigns without removing the desk", () => {
    let state = assignStudentAt(createEmptyState(), 0, 0, { name: "X" });
    state = unassignStudentAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)].student).toBeNull();
    expect(state.cells[cellKey(0, 0)]).toBeDefined();
  });
});

describe("borders", () => {
  it("places then removes a border", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(2, 2), "porte");
    expect(state.edges[hEdgeKey(2, 2)]).toEqual({
      type: "porte",
      rotation: 0,
      flip: false,
    });
    state = clearBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)]).toBeUndefined();
  });

  it("accepts the mur (plain wall) border type", () => {
    const state = setBorderAt(createEmptyState(), hEdgeKey(2, 2), "mur");
    expect(state.edges[hEdgeKey(2, 2)]).toEqual({
      type: "mur",
      rotation: 0,
      flip: false,
    });
  });

  it("rejects an unknown border type", () => {
    expect(() =>
      setBorderAt(createEmptyState(), vEdgeKey(0, 0), "sofa"),
    ).toThrow();
  });

  it("flips a door's opening side (rotation 0 <-> 180), is a no-op without a border", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(2, 2), "porte");
    state = rotateBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)].rotation).toBe(180);
    state = rotateBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)].rotation).toBe(0);

    expect(rotateBorderAt(state, vEdgeKey(9, 9))).toBe(state);
  });

  it("flips a door across the wall (flip), independently of its opening side (rotation)", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(2, 2), "porte");
    state = rotateBorderAt(state, hEdgeKey(2, 2));
    state = flipBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)]).toMatchObject({
      rotation: 180,
      flip: true,
    });
    state = flipBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)]).toMatchObject({
      rotation: 180,
      flip: false,
    });

    expect(flipBorderAt(state, vEdgeKey(9, 9))).toBe(state);
  });

  it("flips a tableau (chalk tray side)", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(2, 2), "tableau");
    state = flipBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)].flip).toBe(true);
    state = flipBorderAt(state, hEdgeKey(2, 2));
    expect(state.edges[hEdgeKey(2, 2)].flip).toBe(false);
  });
});

describe("isRoomEnclosed", () => {
  it("is false with no desks", () => {
    expect(isRoomEnclosed(createEmptyState())).toBe(false);
  });

  it("is false when a desk's bounding rectangle is only partly bordered", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 3);
    state = setBorderAt(state, hEdgeKey(2, 3), "tableau");
    expect(isRoomEnclosed(state)).toBe(false);
  });

  it("is true once every edge around the desks' bounding rectangle is set", () => {
    let state = toggleDeskAt(createEmptyState(), 2, 3);
    state = setBorderAt(state, hEdgeKey(2, 3), "tableau"); // top
    state = setBorderAt(state, hEdgeKey(3, 3), "fenetre"); // bottom
    state = setBorderAt(state, vEdgeKey(2, 3), "porte"); // left
    state = setBorderAt(state, vEdgeKey(2, 4), "fenetre"); // right
    expect(isRoomEnclosed(state)).toBe(true);
  });
});

describe("fitGridToContentWithRing", () => {
  it("keeps the default grid when nothing is placed", () => {
    const state = fitGridToContentWithRing(createEmptyState(), {
      cols: 5,
      rows: 6,
    });
    expect(state.grid).toEqual({ cols: 5, rows: 6 });
  });

  it("shrinks the grid to content + one ring, and reindexes", () => {
    let state = createEmptyState({ cols: 5, rows: 6 });
    state = toggleDeskAt(state, 2, 3); // the plan's only desk
    const fitted = fitGridToContentWithRing(state);

    // bounding box = {2,3}..{2,3} -> +1 ring on every side = 3x3
    expect(fitted.grid).toEqual({ cols: 3, rows: 3 });
    // the desk should now sit at the center (1,1) of the new grid
    expect(fitted.cells[cellKey(1, 1)]).toBeDefined();
    expect(fitted.cells[cellKey(2, 3)]).toBeUndefined();
  });

  it("includes borders in the bounding-box computation", () => {
    let state = createEmptyState({ cols: 5, rows: 6 });
    state = setBorderAt(state, vEdgeKey(4, 4), "fenetre"); // right edge, line 4 = outside the base grid
    const fitted = fitGridToContentWithRing(state);
    // row 4, col line 4 -> col extent [3,4], row extent [4,4]; +ring -> the border is covered
    const remapped = Object.keys(fitted.edges)[0];
    expect(remapped).toBeDefined();
  });

  it("accepts a ringSize of 0 (used for print/export, see buildPrintSheet) — content only, no margin", () => {
    let state = createEmptyState({ cols: 5, rows: 6 });
    state = toggleDeskAt(state, 2, 3);
    const fitted = fitGridToContentWithRing(state, undefined, 0);

    expect(fitted.grid).toEqual({ cols: 1, rows: 1 });
    expect(fitted.cells[cellKey(0, 0)]).toBeDefined();
  });
});

describe("serialize / deserialize", () => {
  it("round-trips", () => {
    let state = toggleDeskAt(createEmptyState(), 1, 1);
    state = assignStudentAt(state, 1, 1, { name: "Leo", level: "Grade 1" });
    const json = serializeState(state);
    const back = deserializeState(json);
    expect(back).toEqual(state);
  });

  it("fills in missing fields from an incomplete JSON", () => {
    const back = deserializeState("{}");
    expect(back.grid).toEqual({ cols: 5, rows: 6 });
    expect(back.cells).toEqual({});
    expect(back.edges).toEqual({});
    expect(back.tables).toEqual({});
  });

  it("round-trips a table", () => {
    let state = createTableAt(createEmptyState(), 1, 1, 2, 3);
    state = setTableStudentAt(state, "1_1", { name: "Groupe A", level: "CE1" });
    const back = deserializeState(serializeState(state));
    expect(back).toEqual(state);
    expect(back.tables["1_1"]).toMatchObject({ w: 2, h: 3, shape: "oval" });
  });
});

describe("tables", () => {
  it("createTableAt: shape is round when w === h, oval otherwise", () => {
    // Placed at (1,1) so the footprint doesn't touch an edge (no grow/reindex).
    const shapeOf = (w, h) =>
      createTableAt(createEmptyState(), 1, 1, w, h).tables["1_1"].shape;
    expect(shapeOf(2, 2)).toBe("round");
    expect(shapeOf(1, 2)).toBe("oval");
    expect(shapeOf(3, 2)).toBe("oval");
  });

  it("createTableAt: no-op if the footprint falls outside the grid", () => {
    const s0 = createEmptyState({ cols: 3, rows: 3 });
    const s1 = createTableAt(s0, 2, 2, 2, 2); // would reach col/row 3
    expect(s1).toBe(s0);
  });

  it("createTableAt: no-op if the footprint overlaps a desk or another table", () => {
    let s = toggleDeskAt(createEmptyState(), 2, 2);
    expect(createTableAt(s, 1, 1, 2, 2)).toBe(s); // covers (2,2) desk

    s = createTableAt(createEmptyState(), 1, 1, 2, 2);
    expect(createTableAt(s, 2, 2, 2, 2)).toBe(s); // overlaps the first table
  });

  it("createTableAt: grows the grid when the table touches the outer edge", () => {
    // 2x2 at (0,0) touches top + left only -> +1 row, +1 col (5x6 -> 6x7).
    const s = createTableAt(createEmptyState(), 0, 0, 2, 2);
    expect(s.grid).toEqual({ cols: 6, rows: 7 });
    // reindexed one ring in from the new top-left
    expect(s.tables["1_1"]).toBeDefined();
    expect(s.tables["0_0"]).toBeUndefined();
  });

  it("removeTableAt / setTableColorAt / setTableStudentAt", () => {
    let s = createTableAt(createEmptyState(), 2, 2, 2, 2);
    s = setTableColorAt(s, "2_2", "#e07a5f");
    expect(s.tables["2_2"].color).toBe("#e07a5f");
    expect(s.recentColors).toContain("#e07a5f");

    s = setTableStudentAt(s, "2_2", { id: "7", firstName: "Ada" });
    expect(s.tables["2_2"].student).toEqual({ id: "7", firstName: "Ada" });
    s = setTableStudentAt(s, "2_2", null);
    expect(s.tables["2_2"].student).toBeNull();

    s = removeTableAt(s, "2_2");
    expect(s.tables["2_2"]).toBeUndefined();
  });

  it("tableAtCell / cellOccupied cover the whole footprint", () => {
    const s = createTableAt(createEmptyState(), 1, 1, 2, 3); // rows 1..3, cols 1..2
    expect(tableAtCell(s, 3, 2)?.key).toBe("1_1");
    expect(tableAtCell(s, 0, 1)).toBeNull();
    expect(cellOccupied(s, 2, 2)).toBe(true);
    expect(cellOccupied(s, 4, 4)).toBe(false);
  });

  it("fitGridToContentWithRing includes tables and reindexes their key", () => {
    let s = createEmptyState({ cols: 10, rows: 10 });
    s.tables = {
      "6_7": { w: 2, h: 2, shape: "round", color: null, student: null },
    };
    const fit = fitGridToContentWithRing(s, s.grid, 0);
    // bbox = (6,7)..(7,8), ring 0 -> 2x2 grid, table reanchored at (0,0)
    expect(fit.grid).toEqual({ cols: 2, rows: 2 });
    expect(fit.tables["0_0"]).toBeDefined();
  });
});
