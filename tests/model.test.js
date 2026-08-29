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
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = rotateDeskAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)].rotation).toBe(90);
    state = rotateDeskAt(rotateDeskAt(rotateDeskAt(state, 0, 0), 0, 0), 0, 0);
    expect(state.cells[cellKey(0, 0)].rotation).toBe(0);
  });

  it("applies a color", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = setDeskColorAt(state, 0, 0, "#ff000080");
    expect(state.cells[cellKey(0, 0)].color).toBe("#ff000080");
  });

  it("toggles stuck, is a no-op on an empty cell", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = toggleDeskStuckAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)].stuck).toBe(true);
    state = toggleDeskStuckAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)].stuck).toBe(false);

    expect(toggleDeskStuckAt(state, 5, 5)).toBe(state);
  });

  it("sets halfShift independently of stuck, picking the same direction again clears it", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = toggleDeskStuckAt(state, 0, 0);
    state = setDeskHalfShiftAt(state, 0, 0, "up");
    expect(state.cells[cellKey(0, 0)]).toMatchObject({
      stuck: true,
      halfShift: "up",
    });

    state = setDeskHalfShiftAt(state, 0, 0, "up"); // same direction -> clears
    expect(state.cells[cellKey(0, 0)]).toMatchObject({
      stuck: true,
      halfShift: null,
    });

    state = setDeskHalfShiftAt(state, 0, 0, "right"); // switches
    expect(state.cells[cellKey(0, 0)].halfShift).toBe("right");

    expect(setDeskHalfShiftAt(state, 5, 5, "up")).toBe(state);
    expect(() => setDeskHalfShiftAt(state, 0, 0, "sideways")).toThrow();
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
    let state = setBorderAt(createEmptyState(), hEdgeKey(0, 2), "porte");
    expect(state.edges[hEdgeKey(0, 2)]).toEqual({
      type: "porte",
      rotation: 0,
      flip: false,
    });
    state = clearBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)]).toBeUndefined();
  });

  it("accepts the mur (plain wall) border type", () => {
    const state = setBorderAt(createEmptyState(), hEdgeKey(0, 2), "mur");
    expect(state.edges[hEdgeKey(0, 2)]).toEqual({
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
    let state = setBorderAt(createEmptyState(), hEdgeKey(0, 2), "porte");
    state = rotateBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)].rotation).toBe(180);
    state = rotateBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)].rotation).toBe(0);

    expect(rotateBorderAt(state, vEdgeKey(9, 9))).toBe(state);
  });

  it("flips a door across the wall (flip), independently of its opening side (rotation)", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(0, 2), "porte");
    state = rotateBorderAt(state, hEdgeKey(0, 2));
    state = flipBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)]).toMatchObject({
      rotation: 180,
      flip: true,
    });
    state = flipBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)]).toMatchObject({
      rotation: 180,
      flip: false,
    });

    expect(flipBorderAt(state, vEdgeKey(9, 9))).toBe(state);
  });

  it("flips a tableau (chalk tray side)", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(0, 2), "tableau");
    state = flipBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)].flip).toBe(true);
    state = flipBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)].flip).toBe(false);
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
  });
});
